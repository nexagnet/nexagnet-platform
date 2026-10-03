#!/usr/bin/env node
// AUTOPILOT V4 / Autonomy — workflow tat dinh tren nhanh mac dinh, danh gia MERGE sau Reviewer PASS.
//
// Event la `repository_dispatch` do Reviewer gui. Payload (so PR, head_sha) chi la goi y: TOAN BO bang
// chung duoc lay lai —
//   PR mo + nhan generated + nhanh autopilot/* + cung repo + dung HEAD da review
//   Issue lien ket + dung mot nhan rui ro (R3 = BLOCK)
//   7/7 check bat buoc cua CHINH HEAD hien tai thanh cong
//   ket qua Reviewer MOI NHAT cua bot tin cay cho dung HEAD la PASS (va run cua no la run Reviewer that)
//   khong co duong dan mat phang dieu khien trong diff
// R0/R1 -> merge bang endpoint merge (kem `sha` = HEAD, GitHub tu choi neu HEAD da doi; ruleset van
// ap dung, KHONG bypass). R2 -> khong merge, cho nguoi. Khong deploy.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addNeedsHumanLabel, escalateToHuman, postMarkedComment } from './actions.mjs';
import { MARKER_KINDS, NEEDS_HUMAN_LABEL, isFullSha, labelNames } from './autopilot-core.mjs';
import { loadComments, loadPullEvidence, loadPullFiles, parsePrNumber } from './evidence.mjs';
import { GitHubError, createClient, writeOutputs, writeSummary } from './github-api.mjs';
import { decideAutonomy, evaluateRequiredChecks, protectedPathsInPullFiles } from './policy.mjs';
import { latestTrustedReview, verifyReviewRun } from './review-result.mjs';

const MARK_READY = `mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }`;

const blocked = (reason, extra = {}) => ({ action: 'BLOCK', reason, ...extra });

/**
 * Lay lai mot-manh-cung-khong-thieu bang chung va quyet dinh. KHONG ghi gi.
 * @returns {Promise<{ action: 'MERGE' | 'WAIT_HUMAN' | 'BLOCK', reason: string, pr?: any, risk?: string, headSha?: string, comments?: any[] }>}
 */
export async function gatherAndDecide({ read, repository, payload }) {
  const prNumber = parsePrNumber(payload?.pr);
  const headSha = payload?.head_sha;
  if (!prNumber || !isFullSha(headSha)) return blocked('PAYLOAD_INVALID');

  const { pr, evaluation } = await loadPullEvidence({
    read,
    repository,
    prNumber,
    expectedHeadSha: headSha,
  });
  if (evaluation.decision !== 'OK')
    return blocked(evaluation.reason, { risk: evaluation.risk ?? undefined });

  const comments = await loadComments(read, repository, prNumber);
  const review = latestTrustedReview(comments, headSha);
  if (!review) return blocked('REVIEW_MISSING');
  if (review.risk !== evaluation.risk) return blocked('REVIEW_RISK_MISMATCH');

  const run = await read.get(`/repos/${repository}/actions/runs/${review.runId}`).catch((error) => {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  });
  const runCheck = verifyReviewRun({ run, review });
  if (!runCheck.ok) return blocked(runCheck.reason);

  const checkRuns = await read.paginate(
    `/repos/${repository}/commits/${headSha}/check-runs`,
    'check_runs',
  );
  const ci = evaluateRequiredChecks(checkRuns, headSha);

  const { files, complete } = await loadPullFiles({ read, repository, pr });
  if (!complete) return blocked('DIFF_INCOMPLETE');

  const decision = decideAutonomy({
    risk: evaluation.risk,
    ci,
    review,
    protectedPaths: protectedPathsInPullFiles(files),
    humanHold: labelNames(pr.labels).includes(NEEDS_HUMAN_LABEL),
  });
  return { ...decision, pr, risk: evaluation.risk, headSha, comments, ci };
}

export async function runMergeEvaluate({ read, write, repository, payload, runUrl }) {
  const decision = await gatherAndDecide({ read, repository, payload });
  if (decision.action === 'BLOCK') return decision;

  const { pr, risk, headSha, comments } = decision;
  if (decision.action === 'WAIT_HUMAN') {
    await addNeedsHumanLabel(write, repository, pr.number);
    await postMarkedComment({
      write,
      repository,
      prNumber: pr.number,
      comments,
      kind: MARKER_KINDS.waiting,
      fields: { head: headSha, risk },
      dedupe: ['head'],
      text: `**Autopilot V4: REVIEW_PASS_WAITING_HUMAN** — Reviewer PASS + CI 7/7 tai \`${headSha}\`, nhung \`risk:${risk}\` KHONG tu merge. Cho nguoi duyet va merge.\n\nRun: ${runUrl}`,
    });
    return decision;
  }

  // MERGE (R0/R1). Endpoint merge KHONG nhan PR nhap: dua PR ra khoi draft truoc (CI khong chay lai vi
  // ci.yml chi nghe opened/synchronize/reopened).
  try {
    if (pr.draft) await write.graphql(MARK_READY, { id: pr.node_id });
    const merged = await write.put(`/repos/${repository}/pulls/${pr.number}/merge`, {
      sha: headSha,
      merge_method: 'merge',
    });
    await postMarkedComment({
      write,
      repository,
      prNumber: pr.number,
      comments,
      kind: MARKER_KINDS.merged,
      fields: { head: headSha, risk, merge: merged?.sha ?? 'unknown' },
      dedupe: ['head'],
      text: `**Autopilot V4: AUTO_MERGED** — \`risk:${risk}\`, Reviewer PASS + CI 7/7 tai \`${headSha}\`.\n\nRun: ${runUrl}`,
    });
    return { ...decision, merged: true, mergeSha: merged?.sha };
  } catch (error) {
    // Ruleset/branch cu/HEAD da doi: khong ep, khong bypass — chuyen cho nguoi.
    if (error instanceof GitHubError && [403, 405, 409, 422].includes(error.status)) {
      await escalateToHuman({
        write,
        repository,
        prNumber: pr.number,
        comments,
        headSha,
        reason: `MERGE_REJECTED_${error.status}`,
        runUrl,
      });
    }
    throw error;
  }
}

async function main() {
  const {
    GITHUB_EVENT_PATH,
    GITHUB_REPOSITORY,
    GITHUB_TOKEN,
    APP_TOKEN,
    GITHUB_RUN_ID,
    GITHUB_SERVER_URL,
  } = process.env;
  const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
  const result = await runMergeEvaluate({
    read: createClient({ token: GITHUB_TOKEN }),
    write: createClient({ token: APP_TOKEN }),
    repository: GITHUB_REPOSITORY,
    payload: event.client_payload,
    runUrl: `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`,
  });
  const line = `MERGE_EVALUATE ${result.action} reason=${result.reason} risk=${result.risk ?? '-'} pr=${event.client_payload?.pr ?? '-'}${result.merged ? ` merged=${result.mergeSha}` : ''}`;
  console.log(line);
  if (result.action === 'BLOCK') console.log(`::warning::${line}`);
  writeSummary(`\`${line}\``);
  writeOutputs({ action: result.action, reason: result.reason });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`::error::MERGE_EVALUATE_ERROR ${error.message}`);
    process.exit(2);
  });
}
