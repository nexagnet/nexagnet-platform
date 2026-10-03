// AUTOPILOT V4 / Reviewer — hop dong ket qua co cau truc va comment may-doc-duoc.
//
// Reviewer (Claude, chi doc) tra JSON qua `--json-schema`; MOT buoc tat dinh chay tren ma cua `main`
// parse no, BAT head_sha khop HEAD hien tai, roi moi dang comment. JSON rong/sai dang/khac HEAD bi tu
// choi — khong co duong "doan y".

import {
  MARKER_KINDS,
  REVIEWER_RUN_NAME_PREFIX,
  REVIEWER_WORKFLOW_PATH,
  encodeMarker,
  isFullSha,
  parseMarker,
  trustedMarkers,
} from './autopilot-core.mjs';

export const REVIEW_VERDICTS = Object.freeze(['PASS', 'REQUEST_CHANGES']);
export const FINDING_SEVERITIES = Object.freeze(['blocker', 'major', 'minor', 'nit']);
const BLOCKING_SEVERITIES = new Set(['blocker', 'major']);

export const MAX_FINDINGS = 20;
const MAX_SUMMARY = 1500;
const MAX_MESSAGE = 600;
const MAX_PATH = 300;

/** Ban sao BAT BUOC trung khop voi `--json-schema` trong autopilot-reviewer.yml (contract test khoa). */
export const REVIEW_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'head_sha', 'summary', 'findings'],
  properties: {
    verdict: { enum: [...REVIEW_VERDICTS] },
    head_sha: { type: 'string' },
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'path', 'line', 'message'],
        properties: {
          severity: { enum: [...FINDING_SEVERITIES] },
          path: { type: 'string' },
          line: { type: 'integer' },
          message: { type: 'string' },
        },
      },
    },
  },
});

const fail = (reason) => ({ ok: false, reason });
const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const hasExactKeys = (object, keys) => {
  const actual = Object.keys(object).sort();
  return actual.length === keys.length && [...keys].sort().every((key, i) => key === actual[i]);
};
const nonEmptyString = (value, max) =>
  typeof value === 'string' && value.trim() !== '' && value.length <= max;

/**
 * @param {unknown} raw chuoi JSON (hoac object da parse) tu `structured_output`
 * @param {{ expectedHeadSha: string }} options
 * @returns {{ ok: true, result: { verdict: string, head_sha: string, summary: string, findings: any[] } } | { ok: false, reason: string }}
 */
export function parseReviewResult(raw, { expectedHeadSha }) {
  let value = raw;
  if (typeof raw === 'string') {
    if (raw.trim() === '') return fail('EMPTY_OUTPUT');
    try {
      value = JSON.parse(raw);
    } catch {
      return fail('MALFORMED_JSON');
    }
  }
  if (value === undefined || value === null) return fail('EMPTY_OUTPUT');
  if (!isPlainObject(value)) return fail('NOT_AN_OBJECT');
  if (!hasExactKeys(value, REVIEW_SCHEMA.required)) return fail('SCHEMA_KEYS');

  if (!REVIEW_VERDICTS.includes(value.verdict)) return fail('SCHEMA_VERDICT');
  if (!isFullSha(value.head_sha)) return fail('SCHEMA_HEAD_SHA');
  if (value.head_sha !== expectedHeadSha) return fail('HEAD_SHA_MISMATCH');
  if (!nonEmptyString(value.summary, MAX_SUMMARY)) return fail('SCHEMA_SUMMARY');
  if (!Array.isArray(value.findings) || value.findings.length > MAX_FINDINGS)
    return fail('SCHEMA_FINDINGS');

  for (const finding of value.findings) {
    if (!isPlainObject(finding) || !hasExactKeys(finding, ['severity', 'path', 'line', 'message']))
      return fail('SCHEMA_FINDING_KEYS');
    if (!FINDING_SEVERITIES.includes(finding.severity)) return fail('SCHEMA_FINDING_SEVERITY');
    if (typeof finding.path !== 'string' || finding.path.length > MAX_PATH)
      return fail('SCHEMA_FINDING_PATH');
    if (!Number.isInteger(finding.line) || finding.line < 0) return fail('SCHEMA_FINDING_LINE');
    if (!nonEmptyString(finding.message, MAX_MESSAGE)) return fail('SCHEMA_FINDING_MESSAGE');
  }

  const blocking = value.findings.some((finding) => BLOCKING_SEVERITIES.has(finding.severity));
  if (value.verdict === 'PASS' && blocking) return fail('PASS_WITH_BLOCKING_FINDING');
  if (value.verdict === 'REQUEST_CHANGES' && !blocking)
    return fail('REQUEST_CHANGES_WITHOUT_BLOCKING_FINDING');

  return { ok: true, result: value };
}

// `@` -> `@` + ky tu rong: finding do model viet khong duoc goi thong bao toi nguoi that.
const neutralize = (text) => String(text).replaceAll('@', '@​').replaceAll('\r', '');

const toBase64Url = (text) => Buffer.from(text, 'utf8').toString('base64url');
const fromBase64Url = (text) => Buffer.from(text, 'base64url').toString('utf8');

/** Comment Reviewer: dong 1 = marker (kem du lieu base64url), phan con lai cho nguoi doc. */
export function buildReviewComment({ result, risk, runId, runUrl }) {
  const marker = encodeMarker(MARKER_KINDS.review, {
    head: result.head_sha,
    verdict: result.verdict,
    risk,
    run: runId,
    data: toBase64Url(JSON.stringify(result)),
  });
  const lines = [
    marker,
    `**Autopilot V4 Reviewer: ${result.verdict}** — \`${result.head_sha}\` (\`risk:${risk}\`)`,
    '',
    neutralize(result.summary),
  ];
  if (result.findings.length > 0) {
    lines.push('', 'Findings:');
    for (const finding of result.findings) {
      const where = finding.path ? `\`${finding.path}:${finding.line}\`` : '(general)';
      lines.push(`- **${finding.severity}** ${where} — ${neutralize(finding.message)}`);
    }
  }
  lines.push('', `Run: ${runUrl}`);
  return lines.join('\n');
}

/** Doc lai mot comment Reviewer; tra null neu marker/du lieu khong hop le hoac khong khop head. */
export function readReviewComment(comment) {
  const fields = parseMarker(comment?.body, MARKER_KINDS.review);
  if (!fields || !isFullSha(fields.head) || !fields.data || !fields.run) return null;
  let data;
  try {
    data = fromBase64Url(fields.data);
  } catch {
    return null;
  }
  const parsed = parseReviewResult(data, { expectedHeadSha: fields.head });
  if (!parsed.ok || parsed.result.verdict !== fields.verdict) return null;
  return {
    commentId: comment.id,
    createdAt: comment.created_at,
    head: fields.head,
    verdict: fields.verdict,
    risk: fields.risk,
    runId: fields.run,
    result: parsed.result,
  };
}

/** Ket qua Reviewer MOI NHAT cua bot tin cay cho dung `headSha` (marker hong thi bo qua). */
export function latestTrustedReview(comments, headSha) {
  const reviews = trustedMarkers(comments, MARKER_KINDS.review)
    .map(({ comment }) => readReviewComment(comment))
    .filter((review) => review !== null && review.head === headSha);
  return reviews.at(-1) ?? null;
}

/**
 * Comment co the bi gia: chi comment tro toi mot RUN Reviewer co that cua dung HEAD moi duoc tin.
 * `run-name` cua autopilot-reviewer.yml (chi `main` viet duoc) la `autopilot-reviewer <head sha>`.
 *
 * Luc Reviewer dispatch, run cua no CON DANG CHAY (chinh job `report` dang goi) — nen chap nhan
 * status chua `completed`, chi loai run da that bai/bi huy.
 */
export function verifyReviewRun({ run, review }) {
  if (!run) return { ok: false, reason: 'REVIEW_RUN_NOT_FOUND' };
  if (!String(run.path ?? '').startsWith(REVIEWER_WORKFLOW_PATH))
    return { ok: false, reason: 'REVIEW_RUN_WRONG_WORKFLOW' };
  if (run.event !== 'workflow_run') return { ok: false, reason: 'REVIEW_RUN_WRONG_EVENT' };
  if (run.display_title !== `${REVIEWER_RUN_NAME_PREFIX} ${review.head}`)
    return { ok: false, reason: 'REVIEW_RUN_WRONG_HEAD' };
  if (run.status === 'completed' && run.conclusion !== 'success')
    return { ok: false, reason: 'REVIEW_RUN_NOT_SUCCESS' };
  if (String(run.id) !== String(review.runId))
    return { ok: false, reason: 'REVIEW_RUN_ID_MISMATCH' };
  if (!run.run_started_at || Date.parse(review.createdAt) < Date.parse(run.run_started_at))
    return { ok: false, reason: 'REVIEW_COMMENT_BEFORE_RUN' };
  return { ok: true, reason: 'OK' };
}
