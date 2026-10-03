#!/usr/bin/env node
// AUTOPILOT V4 / Repair — preflight tat dinh, chay TRUOC khi Claude va bat ky secret nao duoc dung.
//
// Event la `repository_dispatch` do Reviewer gui. Payload chi la goi y: ta lay lai PR, Issue, ket qua
// Reviewer tin cay cho DUNG head da review, va marker `autopilot-repair` (luot Repair duoc cap phep).
// HEAD hien tai phai CHINH LA head da review; sai mot dieu kien -> BLOCK, Claude khong chay.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_REPAIR_ROUNDS, TRUSTED_BOT_LOGIN, isFullSha } from './autopilot-core.mjs';
import { loadComments, loadPullEvidence, parsePrNumber } from './evidence.mjs';
import {
  GitHubError,
  createClient,
  formatContract,
  writeOutputs,
  writeSummary,
} from './github-api.mjs';
import { authorizeRepair } from './policy.mjs';
import { latestTrustedReview, verifyReviewRun } from './review-result.mjs';

const block = (reason, extra = {}) => ({ decision: 'BLOCK', reason, ...extra });

/** Nhiem vu cho Repair: hop dong + phat hien cua Reviewer. Ca hai la DU LIEU, khong phai quyen. */
export function buildRepairTask({ contract, review, attempt, prNumber, branch }) {
  const findings = review.findings.length
    ? review.findings.map((f) => `- [${f.severity}] ${f.path}:${f.line} — ${f.message}`).join('\n')
    : '(none)';
  return [
    `Autopilot V4 repair round ${attempt} of ${MAX_REPAIR_ROUNDS} for PR #${prNumber} (branch ${branch}).`,
    `The reviewer requested changes at head ${review.head_sha}. Fix ONLY what the findings below require, inside the scope of the task contract. Commit locally on the current checkout; a later deterministic job validates and pushes. Do not push.`,
    '',
    '## Reviewer summary (data)',
    review.summary,
    '',
    '## Reviewer findings (data)',
    findings,
    '',
    '## Task contract (data)',
    contract,
  ].join('\n');
}

/**
 * @returns {Promise<{ decision: 'RUN' | 'BLOCK', reason: string, pr?: number, headSha?: string, branch?: string, risk?: string, attempt?: number, task?: string }>}
 */
export async function evaluateRepair({ read, repository, payload }) {
  const prNumber = parsePrNumber(payload?.pr);
  const headSha = payload?.head_sha;
  if (!prNumber || !isFullSha(headSha)) return block('PAYLOAD_INVALID');

  const { pr, issue, evaluation } = await loadPullEvidence({
    read,
    repository,
    prNumber,
    expectedHeadSha: headSha,
  });
  if (evaluation.decision !== 'OK') return block(evaluation.reason);

  const comments = await loadComments(read, repository, prNumber);
  const review = latestTrustedReview(comments, headSha);
  if (!review) return block('REVIEW_MISSING');
  if (review.verdict !== 'REQUEST_CHANGES') return block('REVIEW_NOT_REQUEST_CHANGES');
  if (review.risk !== evaluation.risk) return block('REVIEW_RISK_MISMATCH');

  const run = await read.get(`/repos/${repository}/actions/runs/${review.runId}`).catch((error) => {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  });
  const runCheck = verifyReviewRun({ run, review });
  if (!runCheck.ok) return block(runCheck.reason);

  const authorization = authorizeRepair({ comments, headSha, attempt: payload.attempt });
  if (!authorization.ok) return block(authorization.reason);

  return {
    decision: 'RUN',
    reason: 'OK',
    pr: prNumber,
    headSha,
    branch: pr.head.ref,
    risk: evaluation.risk,
    attempt: authorization.attempt,
    task: buildRepairTask({
      contract: formatContract(issue),
      review: review.result,
      attempt: authorization.attempt,
      prNumber,
      branch: pr.head.ref,
    }),
  };
}

async function main() {
  const { GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN } = process.env;
  const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
  const read = createClient({ token: GITHUB_TOKEN });
  const result = await evaluateRepair({
    read,
    repository: GITHUB_REPOSITORY,
    payload: event.client_payload,
  });

  // Danh tinh tac gia commit: id so cua `<slug>[bot]` (public, khong can token ghi).
  let botId = '';
  if (result.decision === 'RUN') {
    botId = String((await read.get(`/users/${encodeURIComponent(TRUSTED_BOT_LOGIN)}`)).id);
  }

  const line = `REPAIR_PREFLIGHT ${result.decision} reason=${result.reason} pr=${result.pr ?? event.client_payload?.pr ?? '-'} risk=${result.risk ?? '-'} attempt=${result.attempt ?? '-'}`;
  console.log(line);
  if (result.decision !== 'RUN') console.log(`::warning::${line}`);
  writeSummary(`\`${line}\``);
  writeOutputs({
    decision: result.decision,
    reason: result.reason,
    pr: result.pr ?? '',
    head_sha: result.headSha ?? '',
    branch: result.branch ?? '',
    risk: result.risk ?? '',
    attempt: result.attempt ?? '',
    bot_id: botId,
    task: result.task ?? '',
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`::error::REPAIR_PREFLIGHT_ERROR ${error.message}`);
    process.exit(2);
  });
}
