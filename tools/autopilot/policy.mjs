// AUTOPILOT V4 / Phase 2 — chinh sach tat dinh: du bang chung CI, vong Repair, tu dong merge.
//
// Ba ham o day la TOAN BO quyen quyet dinh cua Autopilot sau Builder. Chung khong goi mang; CLI lay
// bang chung moi qua API roi truyen vao. Mac dinh la BLOCK: thieu mot manh bang chung la khong merge.

import {
  MARKER_KINDS,
  MAX_REPAIR_ROUNDS,
  REQUIRED_CHECKS,
  RISKS,
  trustedMarkers,
} from './autopilot-core.mjs';
import { isProtectedPath } from './validate-diff.mjs';

const GITHUB_ACTIONS_APP = 'github-actions';

/**
 * Dung 7 check bat buoc cua CHINH `headSha`: check-run moi nhat theo tung ten, do GitHub Actions tao
 * (mot App khac tao check cung ten `verify` khong duoc tinh), phai `completed` + `success`.
 * `skipped`/`neutral` KHONG phai success — ruleset coi la dat, nhung Autopilot thi khong.
 *
 * @param {Array<any>} checkRuns phan `check_runs` cua `GET /commits/{sha}/check-runs`
 */
export function evaluateRequiredChecks(checkRuns, headSha) {
  const missing = [];
  const pending = [];
  const failing = [];
  for (const name of REQUIRED_CHECKS) {
    const candidates = (checkRuns ?? []).filter(
      (run) =>
        run?.name === name && run.head_sha === headSha && run.app?.slug === GITHUB_ACTIONS_APP,
    );
    const latest = candidates.reduce((a, b) => (a && a.id > b.id ? a : b), null);
    if (!latest) missing.push(name);
    else if (latest.status !== 'completed') pending.push(name);
    else if (latest.conclusion !== 'success') failing.push(`${name}=${latest.conclusion}`);
  }
  const ok = missing.length + pending.length + failing.length === 0;
  return {
    ok,
    passed: REQUIRED_CHECKS.length - missing.length - pending.length - failing.length,
    missing,
    pending,
    failing,
  };
}

/** Cac duong dan cham mat phang dieu khien trong diff cua PR (ke ca ten cu cua rename). */
export function protectedPathsInPullFiles(files) {
  const paths = [];
  for (const file of files ?? []) {
    for (const path of [file?.filename, file?.previous_filename]) {
      if (typeof path === 'string' && isProtectedPath(path)) paths.push(path);
    }
  }
  return [...new Set(paths)];
}

/**
 * Reviewer tra REQUEST_CHANGES -> dispatch Repair hay dung.
 *
 * `attemptsUsed` = so comment marker `autopilot-repair` cua bot tin cay tren PR (moi lan dispatch
 * viet marker TRUOC khi goi dispatch, nen dispatch loi cung ton mot luot — bao thu co chu y).
 */
export function decideRepair({ risk, comments, headSha }) {
  if (!RISKS.includes(risk) || risk === 'R3') return { action: 'BLOCK', reason: 'RISK_R3_BLOCKED' };
  const markers = trustedMarkers(comments, MARKER_KINDS.repair);
  if (markers.some(({ fields }) => fields.head === headSha))
    return { action: 'SKIP', reason: 'ALREADY_DISPATCHED_FOR_HEAD' };
  const attemptsUsed = markers.length;
  if (attemptsUsed >= MAX_REPAIR_ROUNDS)
    return { action: 'NEEDS_HUMAN', reason: 'REPAIR_CEILING', attemptsUsed };
  return { action: 'DISPATCH', reason: 'OK', attemptsUsed, attempt: attemptsUsed + 1 };
}

/**
 * Repair chi chay khi co mot dispatch THAT cua Reviewer: marker `autopilot-repair` cua bot tin cay cho
 * dung HEAD, voi `attempt` trong tran. Payload cua event chi la goi y de tim marker nay.
 */
export function authorizeRepair({ comments, headSha, attempt }) {
  const marker = trustedMarkers(comments, MARKER_KINDS.repair).find(
    ({ fields }) => fields.head === headSha,
  );
  if (!marker) return { ok: false, reason: 'REPAIR_NOT_AUTHORIZED' };
  const n = Number(marker.fields.attempt);
  if (!Number.isInteger(n) || n < 1 || n > MAX_REPAIR_ROUNDS)
    return { ok: false, reason: 'REPAIR_ATTEMPT_OUT_OF_RANGE' };
  if (attempt !== undefined && Number(attempt) !== n)
    return { ok: false, reason: 'REPAIR_ATTEMPT_MISMATCH' };
  return { ok: true, reason: 'OK', attempt: n };
}

/**
 * Chinh sach tu tri sau khi Reviewer PASS. Thu tu kiem la co chu y: R3 truoc het, roi toan bo bang
 * chung, va chi KHI bang chung du moi phan R2 (cho nguoi) / R0-R1 (merge).
 *
 * @param {{
 *   risk: string | null,
 *   ci: { ok: boolean } | null,
 *   review: { verdict: string } | null,
 *   protectedPaths: string[],
 *   humanHold: boolean,
 * }} input
 * @returns {{ action: 'MERGE' | 'WAIT_HUMAN' | 'BLOCK', reason: string }}
 */
export function decideAutonomy({ risk, ci, review, protectedPaths, humanHold }) {
  if (risk === 'R3') return { action: 'BLOCK', reason: 'RISK_R3_BLOCKED' };
  if (!RISKS.includes(risk)) return { action: 'BLOCK', reason: 'RISK_INVALID' };
  if (!review || review.verdict !== 'PASS') return { action: 'BLOCK', reason: 'REVIEW_NOT_PASS' };
  if (!ci || ci.ok !== true) return { action: 'BLOCK', reason: 'CI_NOT_GREEN' };
  if ((protectedPaths ?? []).length > 0) return { action: 'BLOCK', reason: 'PROTECTED_PATH' };
  if (risk === 'R2') return { action: 'WAIT_HUMAN', reason: 'REVIEW_PASS_WAITING_HUMAN' };
  if (humanHold) return { action: 'BLOCK', reason: 'NEEDS_HUMAN_LABEL' };
  return { action: 'MERGE', reason: 'OK' };
}
