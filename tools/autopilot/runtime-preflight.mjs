#!/usr/bin/env node
// AUTOPILOT V4 / Phase 3 — RUNTIME PROOF preflight, tat dinh, CHI DOC, KHONG OIDC, KHONG ghi.
//
// Event la `workflow_run` cua workflow `ci` (push len main). Payload chi la GOI Y (run id, head_sha):
// toan bo bang chung duoc lay lai bang `GITHUB_TOKEN` chi doc —
//   1. run CI kich hoat: dung push len main, xong, success, trung `head_sha` cua event;
//   2. dung MOT PR da merge ra chinh commit do, mang nhan `autopilot:generated`;
//   3. than PR lien ket dung MOT Issue (`Closes #N`);
//   4. Issue co dung MOT nhan rui ro, chi R0/R1;
//   5. comment `autopilot-merged` cua bot tin cay: `merge=<head_sha>`, head/risk khop;
//   6. section `RUNTIME PROOF` -> `TARGET:` thuoc allowlist ({none, transport-preview/gd1-test}).
// `decision=DEPLOY` chi khi du ca sau; `TARGET: none` va moi commit khong phai cua Autopilot la SKIP
// sach; moi manh thieu/mo ho khac la BLOCK (fail closed). Job deploy chi duoc cap OIDC khi nhan DEPLOY.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MARKER_KINDS,
  linkedIssueNumbers,
  riskOfIssue,
  trustedMarkers,
} from './autopilot-core.mjs';
import { loadComments } from './evidence.mjs';
import { GitHubError, createClient, writeOutputs, writeSummary } from './github-api.mjs';
import {
  RUNTIME_TARGETS,
  TARGET_NONE,
  decideRisk,
  evaluateTriggerRun,
  parseRuntimeProofTarget,
  selectMergedPull,
  verifyMergeMarker,
} from './runtime-proof-core.mjs';

const stop = (decision, reason, extra = {}) => ({ decision, reason, ...extra });

/**
 * @returns {Promise<{ decision: 'DEPLOY' | 'SKIP' | 'BLOCK', reason: string, gitSha?: string, target?: string, pr?: number, issue?: number, risk?: string }>}
 */
export async function runRuntimePreflight({ read, repository, runId, eventHeadSha }) {
  const trigger = evaluateTriggerRun({
    run: await read.get(`/repos/${repository}/actions/runs/${runId}`),
    repository,
    eventHeadSha,
  });
  if (trigger.decision !== 'OK') return stop(trigger.decision, trigger.reason);
  const gitSha = trigger.headSha;

  // Cac PR lien quan toi commit; moi ung vien duoc doc lai day du (cac truong merge/body/nhan).
  const associated = await read
    .paginate(`/repos/${repository}/commits/${gitSha}/pulls`)
    .catch((error) => {
      if (error instanceof GitHubError && error.status === 404) return [];
      throw error;
    });
  const pulls = [];
  for (const { number } of associated)
    pulls.push(await read.get(`/repos/${repository}/pulls/${number}`));
  const selected = selectMergedPull({ pulls, headSha: gitSha, repository });
  if (selected.decision !== 'OK') return stop(selected.decision, selected.reason, { gitSha });
  const { pr } = selected;

  const issueNumbers = linkedIssueNumbers(pr.body);
  if (issueNumbers.length !== 1)
    return stop('BLOCK', issueNumbers.length === 0 ? 'ISSUE_NOT_LINKED' : 'ISSUE_LINK_AMBIGUOUS', {
      gitSha,
      pr: pr.number,
    });
  const [issueNumber] = issueNumbers;
  const issue = await read.get(`/repos/${repository}/issues/${issueNumber}`);
  if (issue.number !== issueNumber || issue.pull_request)
    return stop('BLOCK', 'ISSUE_MISMATCH', { gitSha, pr: pr.number, issue: issueNumber });

  // `riskOfIssue` tra ok=false cho R3; tach ra de ly do R3 luon ro rang.
  const risk = riskOfIssue(issue);
  const where = { gitSha, pr: pr.number, issue: issueNumber };
  if (!risk.ok && risk.reason !== 'RISK_R3_BLOCKED') return stop('BLOCK', risk.reason, where);
  const riskDecision = decideRisk(risk.risk);
  if (!riskDecision.ok)
    return stop(riskDecision.decision, riskDecision.reason, { ...where, risk: risk.risk });

  const comments = await loadComments(read, repository, pr.number);
  const marker = verifyMergeMarker({
    markers: trustedMarkers(comments, MARKER_KINDS.merged),
    mergeSha: gitSha,
    prHeadSha: pr.head.sha,
    risk: risk.risk,
  });
  if (!marker.ok) return stop('BLOCK', marker.reason, { ...where, risk: risk.risk });

  const parsed = parseRuntimeProofTarget(issue.body);
  if (!parsed.ok) return stop('BLOCK', parsed.reason, { ...where, risk: risk.risk });
  if (parsed.target === TARGET_NONE)
    return stop('SKIP', 'TARGET_NONE', { ...where, risk: risk.risk, target: TARGET_NONE });
  if (!Object.hasOwn(RUNTIME_TARGETS, parsed.target))
    return stop('BLOCK', 'TARGET_UNKNOWN', { ...where, risk: risk.risk });

  return stop('DEPLOY', 'OK', { ...where, risk: risk.risk, target: parsed.target });
}

async function main() {
  const { GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN } = process.env;
  const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
  const run = event.workflow_run ?? {};
  const result = await runRuntimePreflight({
    read: createClient({ token: GITHUB_TOKEN }),
    repository: GITHUB_REPOSITORY,
    runId: run.id,
    eventHeadSha: run.head_sha,
  });
  const line = `RUNTIME_PREFLIGHT ${result.decision} reason=${result.reason} sha=${result.gitSha ?? run.head_sha ?? '-'} target=${result.target ?? '-'} risk=${result.risk ?? '-'} pr=${result.pr ?? '-'} issue=${result.issue ?? '-'}`;
  console.log(line);
  if (result.decision === 'BLOCK') console.log(`::warning::${line}`);
  writeSummary(`\`${line}\``);
  writeOutputs({
    decision: result.decision,
    reason: result.reason,
    git_sha: result.decision === 'DEPLOY' ? result.gitSha : '',
    target: result.decision === 'DEPLOY' ? result.target : '',
    pr: result.pr ?? '',
    issue: result.issue ?? '',
    risk: result.risk ?? '',
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`::error::RUNTIME_PREFLIGHT_ERROR ${error.message}`);
    process.exit(2);
  });
}
