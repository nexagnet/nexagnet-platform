#!/usr/bin/env node
// AUTOPILOT V4 / Reviewer — buoc BAO CAO tat dinh, chay tu ma cua `main` sau job Claude.
//
//   structured_output cua Reviewer -> parse + BAT head_sha khop HEAD hien tai
//     -> comment may-doc-duoc do bot App V4 dang
//     -> PASS: dispatch `autopilot-merge-evaluate`
//     -> REQUEST_CHANGES: dispatch `autopilot-repair` (toi da MAX_REPAIR_ROUNDS), vuot tran -> NEEDS_HUMAN
//
// Doc bang chung bang GITHUB_TOKEN (chi doc); chi GHI bang token App (APP_TOKEN).

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escalateToHuman, postMarkedComment } from './actions.mjs';
import { DISPATCH_EVENTS, MARKER_KINDS } from './autopilot-core.mjs';
import { loadComments, loadPullEvidence, parsePrNumber } from './evidence.mjs';
import { createClient, writeOutputs, writeSummary } from './github-api.mjs';
import { decideRepair } from './policy.mjs';
import { buildReviewComment, latestTrustedReview, parseReviewResult } from './review-result.mjs';

export class ReviewOutputError extends Error {
  constructor(reason) {
    super(`REVIEW_OUTPUT_INVALID ${reason}`);
    this.reason = reason;
  }
}

/**
 * @returns {Promise<{ status: string, reason?: string, verdict?: string }>}
 */
export async function reportReview({
  read,
  write,
  repository,
  prNumber,
  headSha,
  risk,
  rawOutput,
  runId,
  runUrl,
}) {
  // HEAD da doi hoac PR het hop le giua luc review va luc bao cao -> bo, CI cua HEAD moi se goi review moi.
  const { evaluation } = await loadPullEvidence({
    read,
    repository,
    prNumber,
    expectedHeadSha: headSha,
  });
  if (evaluation.decision !== 'OK') return { status: 'DISCARDED', reason: evaluation.reason };
  if (evaluation.risk !== risk) return { status: 'DISCARDED', reason: 'RISK_CHANGED' };

  const comments = await loadComments(read, repository, prNumber);
  let review = latestTrustedReview(comments, headSha);
  if (!review) {
    const parsed = parseReviewResult(rawOutput, { expectedHeadSha: headSha });
    if (!parsed.ok) throw new ReviewOutputError(parsed.reason);
    const body = buildReviewComment({ result: parsed.result, risk, runId, runUrl });
    await write.post(`/repos/${repository}/issues/${prNumber}/comments`, { body });
    review = { verdict: parsed.result.verdict };
  }

  if (review.verdict === 'PASS') {
    await write.post(`/repos/${repository}/dispatches`, {
      event_type: DISPATCH_EVENTS.mergeEvaluate,
      client_payload: { pr: prNumber, head_sha: headSha },
    });
    return { status: 'DISPATCHED_MERGE_EVALUATE', verdict: 'PASS' };
  }

  const decision = decideRepair({ risk, comments, headSha });
  if (decision.action === 'DISPATCH') {
    // Marker TRUOC dispatch: dem luot dua tren comment cua bot, va Repair doi chieu lai marker nay.
    await postMarkedComment({
      write,
      repository,
      prNumber,
      comments,
      kind: MARKER_KINDS.repair,
      fields: { head: headSha, attempt: decision.attempt },
      dedupe: ['head'],
      text: `**Autopilot V4: REPAIR ${decision.attempt}** — Reviewer REQUEST_CHANGES tai \`${headSha}\`. Repair agent se sua tren chinh nhanh cua PR.\n\nRun: ${runUrl}`,
    });
    await write.post(`/repos/${repository}/dispatches`, {
      event_type: DISPATCH_EVENTS.repair,
      client_payload: { pr: prNumber, head_sha: headSha, attempt: decision.attempt },
    });
    return {
      status: 'DISPATCHED_REPAIR',
      verdict: 'REQUEST_CHANGES',
      reason: `attempt=${decision.attempt}`,
    };
  }
  if (decision.action === 'NEEDS_HUMAN') {
    await escalateToHuman({
      write,
      repository,
      prNumber,
      comments,
      headSha,
      reason: decision.reason,
      runUrl,
    });
    return { status: 'NEEDS_HUMAN', verdict: 'REQUEST_CHANGES', reason: decision.reason };
  }
  return { status: decision.action, verdict: 'REQUEST_CHANGES', reason: decision.reason };
}

async function main() {
  const { GITHUB_REPOSITORY, GITHUB_TOKEN, APP_TOKEN, GITHUB_RUN_ID, GITHUB_SERVER_URL } =
    process.env;
  const prNumber = parsePrNumber(process.env.PR_NUMBER);
  if (!prNumber) throw new Error('PR_NUMBER khong hop le');

  const result = await reportReview({
    read: createClient({ token: GITHUB_TOKEN }),
    write: createClient({ token: APP_TOKEN }),
    repository: GITHUB_REPOSITORY,
    prNumber,
    headSha: process.env.HEAD_SHA,
    risk: process.env.RISK,
    rawOutput: process.env.REVIEW_OUTPUT,
    runId: GITHUB_RUN_ID,
    runUrl: `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`,
  });
  const line = `REVIEW_REPORT ${result.status} reason=${result.reason ?? '-'} verdict=${result.verdict ?? '-'} pr=${prNumber}`;
  console.log(line);
  writeSummary(`\`${line}\``);
  writeOutputs({ status: result.status, verdict: result.verdict ?? '' });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`::error::REVIEW_REPORT_ERROR ${error.message}`);
    process.exit(error instanceof ReviewOutputError ? 3 : 2);
  });
}
