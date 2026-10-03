#!/usr/bin/env node
// AUTOPILOT V4 / Phase 3 — RUNTIME PROOF report: sau (hoac thay cho) lan deploy, ghi bang chung len PR + Issue.
//
// Chay trong job `report` cua `autopilot-runtime-proof.yml`: ma tu `main`, KHONG OIDC, token App V4 ngan han
// CHI de comment. Khong rollback, khong promote, khong dispatch gi: that bai chi duoc GHI NHAN
// (`RUNTIME_PROOF_FAILED`) de nguoi xem — Phase 3 khong tu sua hay tu go ban deploy.
//
// THANH CONG = workflow deploy duoc goi `success` VA `deploy-signals.json` cua chinh run nay noi ve DUNG commit merge
// (release.gitSha), dung tenant va ba tang ha tang/hop dong deu `pass`.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKER_KINDS, isFullSha, sameRepository } from './autopilot-core.mjs';
import { postMarkedComment } from './actions.mjs';
import { loadComments, parsePrNumber } from './evidence.mjs';
import { createClient, writeOutputs, writeSummary } from './github-api.mjs';
import {
  RUNTIME_TARGETS,
  decideRuntimeResult,
  evaluateDeploySignals,
} from './runtime-proof-core.mjs';

/** Doc `deploy-signals.json` neu co; hong/khong co -> null (se thanh `SIGNALS_MISSING`, khong doan). */
export function readSignals(path) {
  try {
    return path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  } catch {
    return null;
  }
}

const describe = ({ result, reason, mergeSha, target, runUrl }) =>
  result === 'success'
    ? `**Autopilot V4: RUNTIME_PROOF_PASSED** — commit merge \`${mergeSha}\` da duoc deploy len \`${target}\`; rollout/health/deterministic smoke deu \`pass\` va \`deploy-signals.json\` tro dung commit nay.\n\nRun: ${runUrl}`
    : `**Autopilot V4: RUNTIME_PROOF_FAILED** — \`${reason}\` khi deploy commit merge \`${mergeSha}\` len \`${target}\`. KHONG rollback tu dong, KHONG promote production; can nguoi xem run duoi day.\n\nRun: ${runUrl}`;

/**
 * @param {{ read: any, write: any, repository: string, input: { pr: unknown, issue: unknown, mergeSha: string, target: string, deployResult: string, runId: string, runUrl: string }, signals: any }} args
 */
export async function runRuntimeReport({ read, write, repository, input, signals }) {
  const prNumber = parsePrNumber(input.pr);
  const issueNumber = parsePrNumber(input.issue);
  const { mergeSha, target, deployResult, runId, runUrl } = input;
  if (!prNumber || !issueNumber || !isFullSha(mergeSha) || !Object.hasOwn(RUNTIME_TARGETS, target))
    return { posted: false, reason: 'INPUT_INVALID' };

  // Dich den phai la DUNG PR da merge ra commit nay (khong tin dau vao cua job truoc).
  const pr = await read.get(`/repos/${repository}/pulls/${prNumber}`);
  if (
    pr.merged !== true ||
    pr.merge_commit_sha !== mergeSha ||
    !sameRepository(pr.base?.repo?.full_name, repository)
  )
    return { posted: false, reason: 'PR_MERGE_MISMATCH' };

  const outcome = decideRuntimeResult({
    deployResult,
    signalCheck: evaluateDeploySignals({ signals, mergeSha, target }),
  });
  const fields = {
    merge: mergeSha,
    target,
    result: outcome.result,
    reason: outcome.reason,
    run: runId,
  };
  const text = describe({ ...outcome, mergeSha, target, runUrl });
  const results = {};
  for (const [name, number] of [
    ['pr', prNumber],
    ['issue', issueNumber],
  ]) {
    results[name] = await postMarkedComment({
      write,
      repository,
      prNumber: number,
      comments: await loadComments(read, repository, number),
      kind: MARKER_KINDS.runtimeProof,
      fields,
      dedupe: ['merge', 'result'],
      text,
    });
  }
  return { posted: true, ...outcome, results };
}

async function main() {
  const { GITHUB_TOKEN, APP_TOKEN, GITHUB_REPOSITORY } = process.env;
  const result = await runRuntimeReport({
    read: createClient({ token: GITHUB_TOKEN }),
    write: createClient({ token: APP_TOKEN }),
    repository: GITHUB_REPOSITORY,
    input: {
      pr: process.env.PR_NUMBER,
      issue: process.env.ISSUE_NUMBER,
      mergeSha: process.env.MERGE_SHA,
      target: process.env.TARGET,
      deployResult: process.env.DEPLOY_RESULT,
      runId: process.env.RUN_ID,
      runUrl: process.env.RUN_URL,
    },
    signals: readSignals(process.env.SIGNALS_PATH),
  });
  const line = `RUNTIME_REPORT posted=${result.posted} result=${result.result ?? '-'} reason=${result.reason}`;
  console.log(line);
  writeSummary(`\`${line}\``);
  writeOutputs({ result: result.result ?? '', reason: result.reason });
  if (!result.posted) process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`::error::RUNTIME_REPORT_ERROR ${error.message}`);
    process.exit(2);
  });
}
