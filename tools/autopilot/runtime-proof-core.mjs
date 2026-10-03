// AUTOPILOT V4 / Phase 3 — RUNTIME PROOF: ham thuan (khong doc mang, khong doc env).
//
// Sau khi Autonomy tu merge R0/R1 va CI chinh xac tren commit merge xanh, workflow
// `autopilot-runtime-proof.yml` co the deploy DUNG commit do len preview platform
// `transport-preview/gd1-test`. Moi quyet dinh nam o day de test duoc khong can GitHub; CLI
// (`runtime-preflight.mjs`, `runtime-report.mjs`) chi lay bang chung moi roi goi cac ham nay.
//
// Mac dinh la KHONG deploy: thieu mot manh bang chung la SKIP/BLOCK, khong bao gio doan.

import {
  CI_WORKFLOW_NAME,
  CI_WORKFLOW_PATH,
  GENERATED_LABEL,
  isFullSha,
  labelNames,
  sameRepository,
} from './autopilot-core.mjs';
import { isAgentBranch } from './validate-diff.mjs';

/**
 * Allowlist DUY NHAT cua Phase 3. Tenant/moi truong o day la hang so, khong doc tu Issue: Issue chi
 * CHON mot muc trong danh sach nay (hoac `none`), khong bao gio dat ten tenant/moi truong.
 */
export const RUNTIME_TARGETS = Object.freeze({
  'transport-preview/gd1-test': Object.freeze({
    tenant: 'transport-preview',
    environment: 'gd1-test',
  }),
});
export const TARGET_NONE = 'none';
export const RUNTIME_PROOF_SECTION = 'RUNTIME PROOF';

/** Chi R0/R1 duoc runtime auto-deploy. R2 cho nguoi, R3 block tuyet doi. */
export const RUNTIME_DEPLOY_RISKS = Object.freeze(['R0', 'R1']);

/** Ten artifact `deploy-signals.json` do `reusable-deploy-tenant.yml` upload. */
export const deploySignalsArtifactName = ({ tenant, environment }) =>
  `deploy-signals-${tenant}-${environment}`;

// ---------------------------------------------------------------------------------------------
// TARGET: doc chi thi may-doc-duoc trong section `RUNTIME PROOF` cua Issue.
// ---------------------------------------------------------------------------------------------

const SECTION_HEADER = /^(?:#{1,6}\s+)?(?:\*\*)?RUNTIME PROOF(?:\*\*)?:?$/;
// Tieu de section khac: markdown heading, in dam tron dong, hoac dong CHU HOA (OBJECTIVE, WHY, ...).
const ANY_HEADING = /^(?:#{1,6}\s+\S.*|\*\*[^*]+\*\*:?|[A-Z][A-Z0-9 /&()-]{2,}:?)$/;
const STRICT_DIRECTIVE = /^TARGET: (\S+)$/;
// Dong "co ve la" chi thi TARGET du bi trang tri (`- `, backtick, in dam, khac hoa/thuong): khong
// khop STRICT_DIRECTIVE thi la CHI THI HONG -> fail closed, khong doan y nguoi viet.
const LOOKS_LIKE_DIRECTIVE = /^[\s>*_`-]*target[\s*_`]*:/i;

function stripNonContent(body) {
  return String(body ?? '')
    .replaceAll('\r\n', '\n')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * @param {string | null | undefined} body than Issue
 * @returns {{ ok: true, target: string } | { ok: false, reason: string }}
 *   `target` la `none` hoac mot khoa trong RUNTIME_TARGETS. Moi truong hop con lai fail closed.
 */
export function parseRuntimeProofTarget(body) {
  const sections = [];
  let current = null;
  let inFence = false;
  for (const raw of stripNonContent(body).split('\n')) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (SECTION_HEADER.test(line)) {
      current = [];
      sections.push(current);
    } else if (ANY_HEADING.test(line)) {
      current = null;
    } else if (current) {
      current.push(line);
    }
  }
  if (sections.length === 0) return { ok: false, reason: 'RUNTIME_PROOF_SECTION_MISSING' };
  if (sections.length > 1) return { ok: false, reason: 'RUNTIME_PROOF_SECTION_MULTIPLE' };

  const directives = sections[0].filter((line) => LOOKS_LIKE_DIRECTIVE.test(line));
  if (directives.length === 0) return { ok: false, reason: 'TARGET_MISSING' };
  if (directives.length > 1) return { ok: false, reason: 'TARGET_MULTIPLE' };
  const strict = STRICT_DIRECTIVE.exec(directives[0]);
  if (!strict) return { ok: false, reason: 'TARGET_MALFORMED' };
  const [, target] = strict;
  if (target !== TARGET_NONE && !Object.hasOwn(RUNTIME_TARGETS, target))
    return { ok: false, reason: 'TARGET_UNKNOWN' };
  return { ok: true, target };
}

// ---------------------------------------------------------------------------------------------
// CI run kich hoat: dung push len main, xong, thanh cong, cua chinh repo nay.
// ---------------------------------------------------------------------------------------------

const skip = (reason, extra = {}) => ({ decision: 'SKIP', reason, ...extra });
const block = (reason, extra = {}) => ({ decision: 'BLOCK', reason, ...extra });

/**
 * Chay lai tren run da re-fetch (khong tin payload). `eventHeadSha` la `workflow_run.head_sha` cua
 * event: run re-fetch phai trung, vi moi buoc sau bam vao SHA do chu khong bam vao `main` hien tai.
 */
export function evaluateTriggerRun({ run, repository, eventHeadSha }) {
  if (!run) return block('CI_RUN_NOT_FOUND');
  if (run.name !== CI_WORKFLOW_NAME || !String(run.path ?? '').startsWith(CI_WORKFLOW_PATH))
    return block('CI_RUN_WRONG_WORKFLOW');
  if (run.event !== 'push') return skip('CI_RUN_NOT_PUSH');
  if (run.head_branch !== 'main') return skip('CI_RUN_NOT_MAIN');
  if (run.status !== 'completed' || run.conclusion !== 'success') return skip('CI_NOT_SUCCESS');
  if (
    !sameRepository(run.repository?.full_name, repository) ||
    !sameRepository(run.head_repository?.full_name, repository)
  )
    return block('CI_RUN_REPO_MISMATCH');
  if (!isFullSha(run.head_sha) || run.head_sha !== eventHeadSha)
    return block('CI_HEAD_SHA_MISMATCH');
  return { decision: 'OK', reason: 'OK', headSha: run.head_sha };
}

// ---------------------------------------------------------------------------------------------
// PR da merge: dung MOT PR merge ra chinh commit nay, mang nhan generated.
// ---------------------------------------------------------------------------------------------

/**
 * @param {Array<any>} pulls cac PR da re-fetch day du (`GET /pulls/{n}`), ung vien cho commit `headSha`
 * @returns {{ decision: 'OK', pr: any } | { decision: 'SKIP' | 'BLOCK', reason: string }}
 *   Commit khong den tu PR autopilot (nguoi tu merge, push truc tiep) la SKIP sach.
 */
export function selectMergedPull({ pulls, headSha, repository }) {
  const merged = (pulls ?? []).filter(
    (pr) =>
      pr?.merged === true &&
      pr.merge_commit_sha === headSha &&
      pr.base?.ref === 'main' &&
      sameRepository(pr.base?.repo?.full_name, repository),
  );
  if (merged.length === 0) return skip('NO_MERGED_PR_FOR_COMMIT');
  const generated = merged.filter((pr) => labelNames(pr.labels).includes(GENERATED_LABEL));
  if (generated.length === 0) return skip('NOT_AUTOPILOT_MERGE');
  if (merged.length > 1) return block('MERGED_PR_AMBIGUOUS');
  const [pr] = generated;
  if (!isAgentBranch(pr.head?.ref)) return block('BRANCH_NOT_AUTOPILOT');
  if (!sameRepository(pr.head?.repo?.full_name, repository)) return block('HEAD_REPO_MISMATCH');
  if (!isFullSha(pr.head?.sha)) return block('HEAD_SHA_INVALID');
  return { decision: 'OK', pr };
}

/**
 * Marker `autopilot-merged` cua bot tin cay phai khop commit nay, HEAD cua PR va rui ro cua Issue.
 * `markers` = ket qua `trustedMarkers(comments, MARKER_KINDS.merged)`.
 */
export function verifyMergeMarker({ markers, mergeSha, prHeadSha, risk }) {
  const mine = (markers ?? []).filter(({ fields }) => fields.merge === mergeSha);
  if (mine.length === 0) return { ok: false, reason: 'MERGE_MARKER_MISSING' };
  if (mine.length > 1) return { ok: false, reason: 'MERGE_MARKER_AMBIGUOUS' };
  const [{ fields }] = mine;
  if (fields.head !== prHeadSha) return { ok: false, reason: 'MERGE_MARKER_HEAD_MISMATCH' };
  if (fields.risk !== risk) return { ok: false, reason: 'MERGE_MARKER_RISK_MISMATCH' };
  return { ok: true, reason: 'OK' };
}

/** Rui ro cua Issue -> co duoc runtime auto-deploy khong (R3 da bi `riskOfIssue` chan truoc). */
export function decideRisk(risk) {
  if (RUNTIME_DEPLOY_RISKS.includes(risk)) return { ok: true, reason: 'OK' };
  if (risk === 'R3') return { ok: false, decision: 'BLOCK', reason: 'RISK_R3_BLOCKED' };
  return { ok: false, decision: 'SKIP', reason: 'RISK_NOT_AUTO_DEPLOY' };
}

// ---------------------------------------------------------------------------------------------
// Bang chung SAU deploy: `deploy-signals.json` phai noi ve DUNG commit merge.
// ---------------------------------------------------------------------------------------------

const HARD_PASS_LAYERS = Object.freeze(['rollout', 'health', 'deterministicSmoke']);

/**
 * `deploy-signals/v1` (xem `deploy/netviet/deploy-signals.mjs#toMachineResult`). Chi tang ha tang/hop
 * dong (rollout, health, deterministic smoke) bat buoc `pass`; live AI/quan sat la tin hieu mem va
 * co chu y khong nam trong dieu kien — dung nhu chinh sach deploy hien co.
 */
export function evaluateDeploySignals({ signals, mergeSha, target }) {
  if (!signals || typeof signals !== 'object') return { ok: false, reason: 'SIGNALS_MISSING' };
  if (signals.schema !== 'deploy-signals/v1')
    return { ok: false, reason: 'SIGNALS_SCHEMA_UNKNOWN' };
  const release = signals.release;
  if (!release || release.gitSha !== mergeSha) return { ok: false, reason: 'SIGNALS_SHA_MISMATCH' };
  const expected = RUNTIME_TARGETS[target];
  // Ca CAP (tenant, environment) phai khop TARGET: dung tenant nhung sai moi truong van la false-positive.
  if (
    !expected ||
    release.tenant !== expected.tenant ||
    release.environment !== expected.environment
  )
    return { ok: false, reason: 'SIGNALS_TARGET_MISMATCH' };
  const notPassing = HARD_PASS_LAYERS.filter((layer) => signals[layer] !== 'pass');
  if (notPassing.length > 0 || signals.hardFailure !== false)
    return { ok: false, reason: 'SIGNALS_NOT_PASSING', layers: notPassing };
  return { ok: true, reason: 'OK' };
}

/**
 * Ket qua chung cuoc. `deployResult` la `needs.deploy.result` cua workflow goi. THANH CONG khi va chi
 * khi workflow deploy duoc goi da `success` VA tin hieu doc duoc khop dung commit.
 */
export function decideRuntimeResult({ deployResult, signalCheck }) {
  if (deployResult !== 'success')
    return {
      result: 'failure',
      reason: `DEPLOY_${String(deployResult || 'unknown').toUpperCase()}`,
    };
  if (!signalCheck?.ok)
    return { result: 'failure', reason: signalCheck?.reason ?? 'SIGNALS_MISSING' };
  return { result: 'success', reason: 'OK' };
}
