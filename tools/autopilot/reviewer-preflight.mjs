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
import { loadComments, loadPullEvidence, loadPullFiles } from './evidence.mjs';
import { createClient, formatContract, writeOutputs, writeSummary } from './github-api.mjs';
import { protectedPathsInPullFiles } from './policy.mjs';
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

/**
 * Quyet dinh co chay Claude hay khong. Tra `{ decision: 'RUN'|'SKIP'|'BLOCK', reason, ... }`.
 *
 * Thu tu la co chu y: moi cong tat dinh (PR/Issue/rui ro, DIFF DAY DU, KHONG cham duong dan bao ve) phai
 * qua truoc khi `decision=RUN` — chi khi do job `review` moi duoc cap runner, checkout HEAD cua PR va
 * dua `CLAUDE_CODE_OAUTH_TOKEN` cho `claude-code-action`. Action nay bat MCP server cua du an va doc setting
 * du an/cuc bo, nen mot PR da sua `.mcp.json`, `.claude/**`, `AGENTS.md`/`CLAUDE.md` KHONG duoc toi do.
 * Khong dua vao viec Builder/Repair da validate diff luc truoc: HEAD co the bi nguoi co quyen ghi sua sau do.
 */
export async function runReviewerPreflight({ read, repository, runId }) {
  const ci = evaluateCiRun({
    run: await read.get(`/repos/${repository}/actions/runs/${runId}`),
    repository,
  });
  if (ci.decision !== 'OK') return block(ci.reason);

  const { pr, issue, evaluation } = await loadPullEvidence({
    read,
    repository,
    prNumber: ci.prNumber,
    expectedHeadSha: ci.headSha,
  });
  const base = { pr: ci.prNumber, risk: evaluation.risk };
  if (evaluation.decision !== 'OK') return block(evaluation.reason, base);

  const { files, complete } = await loadPullFiles({ read, repository, pr });
  if (!complete) return block('DIFF_INCOMPLETE', base);
  const protectedPaths = protectedPathsInPullFiles(files);
  if (protectedPaths.length > 0) return block('PROTECTED_PATH', { ...base, protectedPaths });

  // Mot HEAD chi duoc review MOT lan: CI chay lai (rerun, ready_for_review) khong dot them luot Claude.
  const comments = await loadComments(read, repository, ci.prNumber);
  if (latestTrustedReview(comments, ci.headSha))
    return { decision: 'SKIP', reason: 'ALREADY_REVIEWED', ...base };

  return {
    decision: 'RUN',
    reason: 'OK',
    ...base,
    head_sha: ci.headSha,
    issue: evaluation.issueNumber,
    contract: formatContract(issue),
  };
}

function publish(result) {
  const { decision, reason } = result;
  const line = `REVIEWER_PREFLIGHT ${decision} reason=${reason} pr=${result.pr ?? '-'} risk=${result.risk ?? '-'}`;
  console.log(line);
  if (decision !== 'RUN') console.log(`::notice::${line}`);
  writeSummary(`\`${line}\``);
  writeOutputs({
    decision,
    reason,
    pr: result.pr ?? '',
    head_sha: result.head_sha ?? '',
    risk: result.risk ?? '',
    issue: result.issue ?? '',
    contract: result.contract ?? '',
  });
}

async function main() {
  const { GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN } = process.env;
  const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
  const runId = event.workflow_run?.id;
  if (!Number.isInteger(runId)) throw new Error('event khong mang workflow_run.id');
  publish(
    await runReviewerPreflight({
      read: createClient({ token: GITHUB_TOKEN }),
      repository: GITHUB_REPOSITORY,
      runId,
    }),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`::error::REVIEWER_PREFLIGHT_ERROR ${error.message}`);
    process.exit(2);
  });
}
