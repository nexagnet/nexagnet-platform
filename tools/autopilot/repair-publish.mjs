#!/usr/bin/env node
// AUTOPILOT V4 / Repair — buoc XUAT BAN tat dinh tren runner SACH, ma tu `main`.
//
// Claude (job truoc) CHI commit cuc bo va dong goi bundle; no khong giu token ghi nao. O day, khong
// mot dong ma nao cua nhanh PR duoc chay — chi doc object git:
//   1. nhanh PR van o dung HEAD da review (khong thi bo, HEAD moi se co chu trinh rieng)
//   2. bundle la hau due thang cua HEAD do, khong merge commit, so commit trong tran
//   3. validate-diff (cung luat Builder): moi duong dan thay doi — ca tung commit cua Repair — khong
//      cham mat phang dieu khien
//   4. push fast-forward bang token App (khong co quyen `workflows`) len CHINH nhanh cua PR
// Bat ky nhanh nao khong day len duoc -> NEEDS_HUMAN (tru khi HEAD da bi doi tu ben ngoai).

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escalateToHuman } from './actions.mjs';
import { isFullSha } from './autopilot-core.mjs';
import { loadComments, parsePrNumber } from './evidence.mjs';
import { createClient, writeOutputs, writeSummary } from './github-api.mjs';
import { isAgentBranch, isProtectedPath, validateDiff } from './validate-diff.mjs';

export const MAX_REPAIR_COMMITS = 20;
const CANDIDATE_REF = 'refs/autopilot/repair';
const BUNDLE_BRANCH = 'autopilot-repair';

/**
 * @param {{ headSha: string, branchTip: string | null, descendant: boolean, commitCount: number, mergeCount: number, netFiles: string[], commitFiles: string[], prFiles: string[], risk: string }} input
 * @returns {{ decision: 'PUSH' | 'BLOCK', reason: string, escalate: boolean, blocked: string[] }}
 */
export function evaluateRepairCandidate(input) {
  const stop = (reason, escalate = true, blocked = []) => ({
    decision: 'BLOCK',
    reason,
    escalate,
    blocked,
  });
  if (input.branchTip !== input.headSha) return stop('HEAD_MOVED', false);
  if (!input.descendant) return stop('NOT_DESCENDANT');
  if (input.commitCount === 0 || input.netFiles.length === 0) return stop('NO_CHANGES');
  if (input.mergeCount > 0) return stop('MERGE_COMMITS');
  if (input.commitCount > MAX_REPAIR_COMMITS) return stop('TOO_MANY_COMMITS');

  // Tung commit cua Repair cung bi kiem: sua roi hoan lai mot duong dan bao ve van de dau vet trong lich su.
  const touched = [...new Set([...input.commitFiles, ...input.netFiles])].filter(isProtectedPath);
  if (touched.length > 0) return stop('PROTECTED_PATH', true, touched);
  const verdict = validateDiff({ files: input.prFiles, risk: input.risk });
  if (verdict.decision !== 'PASS') return stop(verdict.reason, true, verdict.blocked);
  return { decision: 'PUSH', reason: 'OK', escalate: false, blocked: [] };
}

export const git = (args, options = {}) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
const lines = (text) => text.split('\n').filter(Boolean);
const nulList = (text) => text.split('\0').filter(Boolean);

export function inspectCandidate({ headSha, branch, baseRef }) {
  const tip = (() => {
    try {
      return git(['rev-parse', '--verify', `refs/remotes/origin/${branch}`]).trim();
    } catch {
      return null;
    }
  })();
  const descendant = (() => {
    try {
      git(['merge-base', '--is-ancestor', headSha, CANDIDATE_REF]);
      return true;
    } catch {
      return false;
    }
  })();
  if (!descendant) {
    return {
      branchTip: tip,
      descendant,
      commitCount: 0,
      mergeCount: 0,
      netFiles: [],
      commitFiles: [],
      prFiles: [],
    };
  }
  const range = `${headSha}..${CANDIDATE_REF}`;
  return {
    branchTip: tip,
    descendant,
    commitCount: Number(git(['rev-list', '--count', range]).trim()),
    mergeCount: Number(git(['rev-list', '--count', '--merges', range]).trim()),
    netFiles: nulList(git(['diff', '--name-only', '--no-renames', '-z', headSha, CANDIDATE_REF])),
    commitFiles: lines(git(['log', '--name-only', '--no-renames', '--format=', range])),
    prFiles: nulList(
      git(['diff', '--name-only', '--no-renames', '-z', `${baseRef}...${CANDIDATE_REF}`]),
    ),
  };
}

/** Header Authorization qua bien moi truong (khong qua argv): loi cua git khong in token ra log. */
function pushWithToken({ pushUrl, branch, token }) {
  const env = { ...process.env };
  if (token) {
    const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
    console.log(`::add-mask::${header.split(' ').at(-1)}`);
    Object.assign(env, {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: `http.${new URL(pushUrl).origin}/.extraheader`,
      GIT_CONFIG_VALUE_0: header,
    });
  }
  git(['push', pushUrl, `${CANDIDATE_REF}:refs/heads/${branch}`], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function main() {
  const {
    GITHUB_REPOSITORY,
    GITHUB_TOKEN,
    APP_TOKEN,
    GITHUB_RUN_ID,
    GITHUB_SERVER_URL,
    BRANCH,
    HEAD_SHA,
    RISK,
    BUNDLE_PATH,
    HAS_BUNDLE,
    REPAIR_RESULT,
    BASE_REF = 'origin/main',
  } = process.env;
  const prNumber = parsePrNumber(process.env.PR_NUMBER);
  if (!prNumber || !isFullSha(HEAD_SHA) || !isAgentBranch(BRANCH))
    throw new Error('tham so Repair khong hop le');
  const runUrl = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
  const pushUrl = process.env.PUSH_URL ?? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}.git`;

  const finish = async (decision, reason, { escalate = false, newHead = '' } = {}) => {
    const line = `REPAIR_PUBLISH ${decision} reason=${reason} pr=${prNumber}`;
    console.log(line);
    if (decision !== 'PUSHED') console.log(`::warning::${line}`);
    writeSummary(`\`${line}\``);
    writeOutputs({ decision, reason, new_head: newHead });
    if (escalate) {
      const write = createClient({ token: APP_TOKEN });
      const comments = await loadComments(
        createClient({ token: GITHUB_TOKEN }),
        GITHUB_REPOSITORY,
        prNumber,
      );
      await escalateToHuman({
        write,
        repository: GITHUB_REPOSITORY,
        prNumber,
        comments,
        headSha: HEAD_SHA,
        reason: `REPAIR_${reason}`,
        runUrl,
      });
    }
  };

  if (REPAIR_RESULT !== 'success') return finish('BLOCK', 'REPAIR_JOB_FAILED', { escalate: true });
  if (HAS_BUNDLE !== 'true') return finish('BLOCK', 'NO_CHANGES', { escalate: true });

  git(['fetch', '--no-tags', 'origin', `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`]);
  try {
    git(['bundle', 'verify', BUNDLE_PATH]);
    git(['fetch', '--no-tags', BUNDLE_PATH, `+refs/heads/${BUNDLE_BRANCH}:${CANDIDATE_REF}`]);
  } catch {
    return finish('BLOCK', 'BUNDLE_INVALID', { escalate: true });
  }

  const verdict = evaluateRepairCandidate({
    headSha: HEAD_SHA,
    risk: RISK,
    ...inspectCandidate({ headSha: HEAD_SHA, branch: BRANCH, baseRef: BASE_REF }),
  });
  for (const path of verdict.blocked) console.log(`::error::PROTECTED_PATH ${path}`);
  if (verdict.decision !== 'PUSH')
    return finish('BLOCK', verdict.reason, { escalate: verdict.escalate });

  pushWithToken({ pushUrl, branch: BRANCH, token: APP_TOKEN });
  return finish('PUSHED', 'OK', { newHead: git(['rev-parse', CANDIDATE_REF]).trim() });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`::error::REPAIR_PUBLISH_ERROR ${error.message}`);
    process.exit(2);
  });
}
