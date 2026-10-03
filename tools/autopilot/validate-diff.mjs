#!/usr/bin/env node
// AUTOPILOT V4 / Builder — kiem diff tu `main` den nhanh cua agent, TRUOC khi mo PR.
//
// Chay trong job `publish` tren runner SACH, tu ban checkout cua `main`: khong mot dong ma nao cua
// nhanh agent duoc thuc thi o day, chi doc danh sach duong dan qua `git diff`.
//
// BLOCK khi diff cham mat phang dieu khien (`.github/`, `deploy/`, `infra/`, `tools/autopilot/`,
// tep chi dan agent, cau hinh MCP/Claude) hoac khi khong co thay doi nao. Rui ro R2 KHONG block —
// chi gan co `needsHuman` de PR mang nhan `needs-human`.

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const BRANCH_PREFIX = 'autopilot/';

const PROTECTED_DIRS = ['.github/', 'deploy/', 'infra/', 'tools/autopilot/', '.claude/'];
const PROTECTED_FILES = ['.mcp.json'];
// Tep chi dan agent bi khoa o MOI cap thu muc, khong chi o goc.
const PROTECTED_BASENAMES = ['agents.md', 'claude.md'];

/** So sanh khong phan biet hoa thuong: `.GitHub/` tren Linux la thu muc khac, nhung van phai chan. */
export function isProtectedPath(path) {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1);
  return (
    PROTECTED_DIRS.some((dir) => normalized.startsWith(dir)) ||
    PROTECTED_FILES.includes(normalized) ||
    PROTECTED_BASENAMES.includes(basename)
  );
}

/**
 * @param {{ files: string[], risk: string }} input
 * @returns {{ decision: 'PASS' | 'BLOCK', reason: string, blocked: string[], needsHuman: boolean }}
 */
export function validateDiff({ files, risk }) {
  const needsHuman = risk === 'R2';
  if (files.length === 0)
    return { decision: 'BLOCK', reason: 'NO_CHANGES', blocked: [], needsHuman };

  const blocked = files.filter(isProtectedPath);
  if (blocked.length > 0)
    return { decision: 'BLOCK', reason: 'PROTECTED_PATH', blocked, needsHuman };
  return { decision: 'PASS', reason: 'OK', blocked: [], needsHuman };
}

/** Nhanh agent phai do action tao ra (`autopilot/...`) va la ten ref hop le. */
export function isAgentBranch(branch) {
  return (
    typeof branch === 'string' &&
    branch.startsWith(BRANCH_PREFIX) &&
    branch.length > BRANCH_PREFIX.length &&
    /^[A-Za-z0-9._/-]+$/.test(branch) &&
    !branch.includes('..')
  );
}

/** `--no-renames`: mot rename vao vung cam hien ra thanh xoa + them, ca hai duong deu duoc kiem. */
function changedFiles(base, head) {
  const out = execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', '-z', `${base}...${head}`],
    {
      encoding: 'utf8',
    },
  );
  return out.split('\0').filter(Boolean);
}

function main() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string', default: 'origin/main' },
      branch: { type: 'string' },
      risk: { type: 'string', default: '' },
    },
  });
  if (!isAgentBranch(values.branch)) throw new Error(`nhanh khong hop le: ${values.branch}`);

  const files = changedFiles(values.base, `origin/${values.branch}`);
  const result = validateDiff({ files, risk: values.risk });

  console.log(`VALIDATE_DIFF ${result.decision} reason=${result.reason} files=${files.length}`);
  for (const path of result.blocked) console.log(`::error::PROTECTED_PATH ${path}`);

  const { GITHUB_OUTPUT } = process.env;
  if (GITHUB_OUTPUT) {
    appendFileSync(
      GITHUB_OUTPUT,
      `decision=${result.decision}\nreason=${result.reason}\nneeds_human=${result.needsHuman}\n`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`::error::VALIDATE_DIFF_ERROR ${error.message}`);
    process.exit(2);
  }
}
