#!/usr/bin/env node
// AUTOPILOT V4 / Reviewer — preflight tat dinh, chay TRUOC khi bat ky secret nao duoc dung.
//
// Event la `workflow_run` cua workflow `ci`. Payload chi la GOI Y (so run, so PR): moi bang chung duoc
// lay lai bang `GITHUB_TOKEN` chi doc, va BAT KY mot manh nao sai -> BLOCK (fail closed).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CI_WORKFLOW_NAME,
  CI_WORKFLOW_PATH,
  isFullSha,
  sameRepository,
} from './autopilot-core.mjs';
import { loadComments, loadPullEvidence } from './evidence.mjs';
import { createClient, formatContract, writeOutputs, writeSummary } from './github-api.mjs';
import { latestTrustedReview } from './review-result.mjs';

const block = (reason, extra = {}) => ({ decision: 'BLOCK', reason, ...extra });

/** CI run do PR kich hoat, xong va THANH CONG, cua chinh repo nay, tro toi dung mot PR. */
export function evaluateCiRun({ run, repository }) {
  if (!run) return block('CI_RUN_NOT_FOUND');
  if (run.name !== CI_WORKFLOW_NAME || !String(run.path ?? '').startsWith(CI_WORKFLOW_PATH))
    return block('CI_RUN_WRONG_WORKFLOW');
  if (run.event !== 'pull_request') return block('CI_RUN_NOT_PULL_REQUEST');
  if (run.status !== 'completed' || run.conclusion !== 'success') return block('CI_NOT_SUCCESS');
  if (
    !sameRepository(run.repository?.full_name, repository) ||
    !sameRepository(run.head_repository?.full_name, repository)
  )
    return block('CI_RUN_REPO_MISMATCH');
  if (!isFullSha(run.head_sha)) return block('CI_HEAD_SHA_INVALID');
  const pulls = run.pull_requests ?? [];
  if (pulls.length !== 1) return block(pulls.length === 0 ? 'CI_RUN_NO_PR' : 'CI_RUN_MANY_PRS');
  return { decision: 'OK', reason: 'OK', prNumber: pulls[0].number, headSha: run.head_sha };
}

async function main() {
  const { GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN } = process.env;
  const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
  const runId = event.workflow_run?.id;
  if (!Number.isInteger(runId)) throw new Error('event khong mang workflow_run.id');
  const read = createClient({ token: GITHUB_TOKEN });

  const finish = (decision, reason, extra = {}) => {
    const line = `REVIEWER_PREFLIGHT ${decision} reason=${reason} pr=${extra.pr ?? '-'} risk=${extra.risk ?? '-'}`;
    console.log(line);
    if (decision !== 'RUN') console.log(`::notice::${line}`);
    writeSummary(`\`${line}\``);
    writeOutputs({
      decision,
      reason,
      pr: extra.pr ?? '',
      head_sha: extra.head_sha ?? '',
      risk: extra.risk ?? '',
      issue: extra.issue ?? '',
      contract: extra.contract ?? '',
    });
  };

  const ci = evaluateCiRun({
    run: await read.get(`/repos/${GITHUB_REPOSITORY}/actions/runs/${runId}`),
    repository: GITHUB_REPOSITORY,
  });
  if (ci.decision !== 'OK') return finish('BLOCK', ci.reason);

  const { issue, evaluation } = await loadPullEvidence({
    read,
    repository: GITHUB_REPOSITORY,
    prNumber: ci.prNumber,
    expectedHeadSha: ci.headSha,
  });
  if (evaluation.decision !== 'OK')
    return finish('BLOCK', evaluation.reason, { pr: ci.prNumber, risk: evaluation.risk });

  // Mot HEAD chi duoc review MOT lan: CI chay lai (rerun, ready_for_review) khong dot them luot Claude.
  const comments = await loadComments(read, GITHUB_REPOSITORY, ci.prNumber);
  if (latestTrustedReview(comments, ci.headSha)) {
    return finish('SKIP', 'ALREADY_REVIEWED', { pr: ci.prNumber, risk: evaluation.risk });
  }

  return finish('RUN', 'OK', {
    pr: ci.prNumber,
    head_sha: ci.headSha,
    risk: evaluation.risk,
    issue: evaluation.issueNumber,
    contract: formatContract(issue),
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`::error::REVIEWER_PREFLIGHT_ERROR ${error.message}`);
    process.exit(2);
  });
}
