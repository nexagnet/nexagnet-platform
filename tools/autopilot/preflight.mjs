#!/usr/bin/env node
// AUTOPILOT V4 / Builder — preflight tat dinh, chay TRUOC khi bat ky secret nao duoc dung.
//
// Chi kiem dung nhung gi hop dong Phase 1 noi (khong co engine cham diem rui ro):
//   - nhan vua gan la `autopilot:ready`
//   - Issue dang OPEN va con mang `autopilot:ready`
//   - co DUNG MOT nhan `risk:R0|R1|R2|R3`
//   - R3 -> BLOCK; R0/R1 -> RUN; R2 -> RUN + downstream gan `needs-human`
//
// Dung nhu ham thuan `evaluatePreflight()` (test) hoac CLI trong workflow: doc event tu
// GITHUB_EVENT_PATH, doc lai Issue HIEN TAI qua API (nhan co the doi giua luc gan va luc chay),
// ghi `decision`/`reason`/`risk`/`needs_human` vao GITHUB_OUTPUT.

import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ACTIVATION_LABEL = 'autopilot:ready';
export const NEEDS_HUMAN_LABEL = 'needs-human';
const RISK_LABEL = /^risk:(R[0-3])$/;
const BLOCKED_RISKS = new Set(['R3']);
const NEEDS_HUMAN_RISKS = new Set(['R2']);

const labelNames = (labels) =>
  (labels ?? []).map((label) => (typeof label === 'string' ? label : label?.name)).filter(Boolean);

const block = (reason, risk = null) => ({ decision: 'BLOCK', reason, risk, needsHuman: false });

/**
 * @param {{ eventLabel: string | undefined, issue: { state: string, labels: Array<string | { name: string }> } }} input
 * @returns {{ decision: 'RUN' | 'BLOCK', reason: string, risk: string | null, needsHuman: boolean }}
 */
export function evaluatePreflight({ eventLabel, issue }) {
  if (eventLabel !== ACTIVATION_LABEL) return block('NOT_ACTIVATION_LABEL');
  if (String(issue?.state).toLowerCase() !== 'open') return block('ISSUE_NOT_OPEN');

  const names = labelNames(issue.labels);
  if (!names.includes(ACTIVATION_LABEL)) return block('ACTIVATION_LABEL_GONE');

  const risks = [...new Set(names.map((name) => RISK_LABEL.exec(name)?.[1]).filter(Boolean))];
  if (risks.length === 0) return block('RISK_MISSING');
  if (risks.length > 1) return block('RISK_MULTIPLE');

  const [risk] = risks;
  if (BLOCKED_RISKS.has(risk)) return block('RISK_R3_BLOCKED', risk);
  return { decision: 'RUN', reason: 'OK', risk, needsHuman: NEEDS_HUMAN_RISKS.has(risk) };
}

async function fetchIssue({ repository, number, token }) {
  const response = await fetch(`https://api.github.com/repos/${repository}/issues/${number}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GET issue #${number} -> HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const { GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } =
    process.env;
  const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
  const number = event.issue?.number;
  if (!Number.isInteger(number)) throw new Error('event khong mang issue.number');

  const issue = await fetchIssue({ repository: GITHUB_REPOSITORY, number, token: GITHUB_TOKEN });
  const result = evaluatePreflight({ eventLabel: event.label?.name, issue });

  const line = `PREFLIGHT ${result.decision} reason=${result.reason} risk=${result.risk ?? '-'} needs_human=${result.needsHuman}`;
  console.log(line);
  if (result.decision === 'BLOCK') console.log(`::warning::Issue #${number}: ${line}`);
  if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `Issue #${number}: \`${line}\`\n`);
  if (GITHUB_OUTPUT) {
    appendFileSync(
      GITHUB_OUTPUT,
      [
        `decision=${result.decision}`,
        `reason=${result.reason}`,
        `risk=${result.risk ?? ''}`,
        `needs_human=${result.needsHuman}`,
        '',
      ].join('\n'),
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`::error::PREFLIGHT_ERROR ${error.message}`);
    process.exit(2);
  });
}
