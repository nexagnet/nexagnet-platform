// AUTOPILOT V4 / Phase 2 — hang so + ham thuan dung chung cho Reviewer, Repair va Autonomy.
//
// Moi quyet dinh o day la HAM THUAN (khong doc mang, khong doc env) de test duoc khong can GitHub.
// Cac CLI (`reviewer-preflight`, `review-report`, `repair-preflight`, `merge-evaluate`, ...) chi lam
// viec lay bang chung moi qua API roi goi cac ham nay: payload cua event KHONG BAO GIO la bang chung.

import { isAgentBranch } from './validate-diff.mjs';

export const GENERATED_LABEL = 'autopilot:generated';
export const NEEDS_HUMAN_LABEL = 'needs-human';
export const DEFAULT_BRANCH = 'main';

/** Danh tinh DUY NHAT duoc tin khi doc comment may-doc-duoc (App V4). */
export const TRUSTED_BOT_LOGIN = 'nexagnet-autopilot-v4[bot]';

/** Workflow ma Reviewer lang nghe, va workflow cua chinh Reviewer (de kiem run-id trong comment). */
export const CI_WORKFLOW_NAME = 'ci';
export const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
export const REVIEWER_WORKFLOW_PATH = '.github/workflows/autopilot-reviewer.yml';
/** `run-name` cua Reviewer: `<REVIEWER_RUN_NAME_PREFIX> <head sha>` — chi workflow tren main viet duoc. */
export const REVIEWER_RUN_NAME_PREFIX = 'autopilot-reviewer';

/** Dung 7 check bat buoc cua ruleset `main-protection` (ten job trong ci.yml). */
export const REQUIRED_CHECKS = Object.freeze([
  'verify',
  'integration',
  'workflow-integration',
  'tenant-packs',
  'e2e',
  'audit',
  'images',
]);

/** Tran so vong Repair tu dong tren MOT PR. Vuot -> NEEDS_HUMAN, dung, khong dispatch tiep. */
export const MAX_REPAIR_ROUNDS = 2;

export const DISPATCH_EVENTS = Object.freeze({
  repair: 'autopilot-repair',
  mergeEvaluate: 'autopilot-merge-evaluate',
});

export const RISKS = Object.freeze(['R0', 'R1', 'R2', 'R3']);
const RISK_LABEL = /^risk:(R[0-3])$/;
const FULL_SHA = /^[0-9a-f]{40}$/;

export const isFullSha = (value) => typeof value === 'string' && FULL_SHA.test(value);

export const labelNames = (labels) =>
  (labels ?? []).map((label) => (typeof label === 'string' ? label : label?.name)).filter(Boolean);

export const sameRepository = (a, b) =>
  typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

/** `Closes #N` do Builder viet; DUNG MOT so Issue — nhieu hon thi mo ho, khong doan. */
export function linkedIssueNumbers(body) {
  const numbers = [...String(body ?? '').matchAll(/^Closes #(\d+)[ \t]*$/gm)].map((m) =>
    Number(m[1]),
  );
  return [...new Set(numbers)];
}

/**
 * Nhan rui ro cua Issue: dung MOT `risk:R0..R3`.
 * @returns {{ ok: true, risk: string } | { ok: false, reason: string, risk: string | null }}
 */
export function riskOfIssue(issue) {
  const risks = [
    ...new Set(
      labelNames(issue?.labels)
        .map((name) => RISK_LABEL.exec(name)?.[1])
        .filter(Boolean),
    ),
  ];
  if (risks.length === 0) return { ok: false, reason: 'RISK_MISSING', risk: null };
  if (risks.length > 1) return { ok: false, reason: 'RISK_MULTIPLE', risk: null };
  if (risks[0] === 'R3') return { ok: false, reason: 'RISK_R3_BLOCKED', risk: 'R3' };
  return { ok: true, risk: risks[0] };
}

const block = (reason, extra = {}) => ({
  decision: 'BLOCK',
  reason,
  risk: null,
  issueNumber: null,
  ...extra,
});

/**
 * Cong chung cua ca ba workflow: PR nay co phai PR do Builder V4 tao, cung repo, dang mo hay khong,
 * va Issue ma no dong co dung mot nhan rui ro khong phai R3 hay khong.
 *
 * `issue` la Issue da duoc re-fetch theo `linkedIssueNumbers(pr.body)`; chua fetch thi truyen null
 * de lay duoc ma `ISSUE_NOT_FETCHED` (CLI goi hai pha: PR -> Issue -> ham nay).
 *
 * @param {{ pr: any, issue: any, repository: string, expectedHeadSha?: string }} input
 * @returns {{ decision: 'OK' | 'BLOCK', reason: string, risk: string | null, issueNumber: number | null }}
 */
export function evaluatePullRequest({ pr, issue, repository, expectedHeadSha }) {
  if (!pr || String(pr.state).toLowerCase() !== 'open' || pr.merged === true)
    return block('PR_NOT_OPEN');
  if (!labelNames(pr.labels).includes(GENERATED_LABEL)) return block('PR_NOT_GENERATED');
  if (!isAgentBranch(pr.head?.ref)) return block('BRANCH_NOT_AUTOPILOT');
  if (!sameRepository(pr.head?.repo?.full_name, repository)) return block('HEAD_REPO_MISMATCH');
  if (!sameRepository(pr.base?.repo?.full_name, repository)) return block('BASE_REPO_MISMATCH');
  if (pr.base?.ref !== DEFAULT_BRANCH) return block('BASE_NOT_DEFAULT_BRANCH');
  if (!isFullSha(pr.head?.sha)) return block('HEAD_SHA_INVALID');
  if (expectedHeadSha !== undefined && pr.head.sha !== expectedHeadSha) return block('HEAD_MOVED');

  const numbers = linkedIssueNumbers(pr.body);
  if (numbers.length === 0) return block('ISSUE_NOT_LINKED');
  if (numbers.length > 1) return block('ISSUE_LINK_AMBIGUOUS');
  const [issueNumber] = numbers;
  if (!issue) return block('ISSUE_NOT_FETCHED', { issueNumber });
  if (issue.number !== issueNumber || issue.pull_request)
    return block('ISSUE_MISMATCH', { issueNumber });
  if (String(issue.state).toLowerCase() !== 'open') return block('ISSUE_NOT_OPEN', { issueNumber });

  const risk = riskOfIssue(issue);
  if (!risk.ok) return block(risk.reason, { risk: risk.risk, issueNumber });
  return { decision: 'OK', reason: 'OK', risk: risk.risk, issueNumber };
}

// ---------------------------------------------------------------------------------------------
// Comment may-doc-duoc. Dong DAU cua comment la marker: `<!-- <kind>:v1 k=v k=v -->`.
// ---------------------------------------------------------------------------------------------

export const MARKER_VERSION = 'v1';
export const MARKER_KINDS = Object.freeze({
  review: 'autopilot-review',
  repair: 'autopilot-repair',
  needsHuman: 'autopilot-needs-human',
  waiting: 'autopilot-waiting-human',
  merged: 'autopilot-merged',
});

const MARKER_VALUE = /^[A-Za-z0-9_.+/=-]*$/;

export function encodeMarker(kind, fields) {
  const parts = Object.entries(fields).map(([key, value]) => {
    const text = String(value);
    if (!/^[a-z_]+$/.test(key) || !MARKER_VALUE.test(text))
      throw new Error(`marker khong hop le: ${key}=${text}`);
    return `${key}=${text}`;
  });
  return `<!-- ${kind}:${MARKER_VERSION} ${parts.join(' ')} -->`;
}

/** Chi tinh marker o DONG DAU: mot comment khac dan marker o giua van ban khong co gia tri. */
export function parseMarker(body, kind) {
  const first = String(body ?? '')
    .split('\n', 1)[0]
    .trimEnd();
  const match = new RegExp(`^<!-- ${kind}:${MARKER_VERSION} ([^>]*?) -->$`).exec(first);
  if (!match) return null;
  const fields = {};
  for (const part of match[1].split(' ').filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq <= 0) return null;
    const value = part.slice(eq + 1);
    if (!MARKER_VALUE.test(value)) return null;
    fields[part.slice(0, eq)] = value;
  }
  return fields;
}

/** Comment do CHINH bot App V4 tao (login + type), khong phai nguoi dung hay bot khac. */
export const isTrustedBotComment = (comment) =>
  comment?.user?.login === TRUSTED_BOT_LOGIN && comment?.user?.type === 'Bot';

/** Cac comment tin cay mang marker `kind`, theo thu tu cu -> moi. */
export function trustedMarkers(comments, kind) {
  return (comments ?? [])
    .filter(isTrustedBotComment)
    .map((comment) => ({ comment, fields: parseMarker(comment.body, kind) }))
    .filter((entry) => entry.fields !== null)
    .sort((a, b) => a.comment.id - b.comment.id);
}
