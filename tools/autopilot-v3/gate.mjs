#!/usr/bin/env node
// CONG KICH HOAT TIN CAY cua `.github/workflows/claude-builder.yml` (Autopilot V3 / Phase A, #362).
//
// HAI LOP, HAI NGUON DU LIEU KHAC NHAU
//
//   1. `if:` cua job `gate` — GitHub danh gia tren EVENT PAYLOAD truoc khi cap runner. Sai mot dieu
//      kien la job bi skip: khong runner, khong secret, khong gi chay.
//   2. Tep nay — chay trong job `gate` (GITHUB_TOKEN chi doc, KHONG secret nao), doc LAI trang thai
//      HIEN TAI qua API roi quyet dinh voi mot MA LY DO co kieu. Lop 1 tra loi "luc gan nhan, ai
//      gan, tren Issue cua ai"; lop 2 tra loi "ngay luc nay dieu do con dung khong" (Issue con mo?
//      nhan con do? nguoi gan con quyen admin?).
//
// Uy quyen den tu DANH TINH nguoi gan nhan, so sanh theo ID tai khoan (bat bien khi doi ten), khong
// den tu ten nhan hay noi dung Issue: tren repo public ai cung go duoc chu vao mot Issue.
//
// Khong phu thuoc goi ngoai: Node >= 18 co san `fetch`. Tep nay chi duoc chay TRUOC buoc agent, tu
// mot checkout sach cua nhanh mac dinh — sau buoc agent, workspace la cay agent vua sua.

import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Moi ket cuc co dung mot ma. Tu choi thi phai noi DUOC vi sao, khong gop thanh `false`. */
export const REASON = Object.freeze({
  AUTHORIZED: 'AUTHORIZED',
  CONFIG_MISSING: 'CONFIG_MISSING',
  WRONG_EVENT: 'WRONG_EVENT',
  WRONG_LABEL: 'WRONG_LABEL',
  SENDER_NOT_USER: 'SENDER_NOT_USER',
  SENDER_NOT_OWNER: 'SENDER_NOT_OWNER',
  TRIGGERING_ACTOR_NOT_OWNER: 'TRIGGERING_ACTOR_NOT_OWNER',
  ISSUE_AUTHOR_NOT_OWNER: 'ISSUE_AUTHOR_NOT_OWNER',
  ISSUE_IS_PULL_REQUEST: 'ISSUE_IS_PULL_REQUEST',
  LIVE_ISSUE_MISMATCH: 'LIVE_ISSUE_MISMATCH',
  ISSUE_NOT_OPEN: 'ISSUE_NOT_OPEN',
  LABEL_NO_LONGER_PRESENT: 'LABEL_NO_LONGER_PRESENT',
  SENDER_NOT_ADMIN: 'SENDER_NOT_ADMIN',
  API_ERROR: 'API_ERROR',
});

const sameId = (a, b) =>
  a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b);

/**
 * Phan tinh — chi doc event payload va bien moi truong cua runner. Tra ve ma tu choi, hoac `null`.
 *
 * @param {{ eventName?: string, event?: any, activationLabel?: string, ownerId?: string,
 *           ownerLogin?: string, triggeringActor?: string }} input
 * @returns {string | null}
 */
export function checkEvent({
  eventName,
  event,
  activationLabel,
  ownerId,
  ownerLogin,
  triggeringActor,
}) {
  if (!activationLabel || !ownerId || !ownerLogin) return REASON.CONFIG_MISSING;
  if (eventName !== 'issues' || event?.action !== 'labeled') return REASON.WRONG_EVENT;
  if (event.label?.name !== activationLabel) return REASON.WRONG_LABEL;
  if (event.sender?.type !== 'User') return REASON.SENDER_NOT_USER;
  if (!sameId(event.sender.id, ownerId)) return REASON.SENDER_NOT_OWNER;
  // Re-run giu nguyen `actor` cua lan dau nhung doi `triggering_actor` — nguoi bam re-run cung phai
  // la chu repo.
  if (String(triggeringActor ?? '').toLowerCase() !== ownerLogin.toLowerCase()) {
    return REASON.TRIGGERING_ACTOR_NOT_OWNER;
  }
  if (!sameId(event.issue?.user?.id, ownerId)) return REASON.ISSUE_AUTHOR_NOT_OWNER;
  if (event.issue.pull_request) return REASON.ISSUE_IS_PULL_REQUEST;
  return null;
}

/**
 * Phan song — doi chieu voi trang thai doc tu API SAU khi event da xay ra.
 *
 * @param {{ event: any, activationLabel: string, ownerId: string, liveIssue?: any,
 *           senderPermission?: string }} input
 * @returns {string | null}
 */
export function checkLive({ event, activationLabel, ownerId, liveIssue, senderPermission }) {
  if (
    !liveIssue ||
    !sameId(liveIssue.id, event.issue.id) ||
    liveIssue.number !== event.issue.number
  ) {
    return REASON.LIVE_ISSUE_MISMATCH;
  }
  if (!sameId(liveIssue.user?.id, ownerId)) return REASON.ISSUE_AUTHOR_NOT_OWNER;
  if (liveIssue.pull_request) return REASON.ISSUE_IS_PULL_REQUEST;
  if (liveIssue.state !== 'open') return REASON.ISSUE_NOT_OPEN;
  const labels = Array.isArray(liveIssue.labels) ? liveIssue.labels : [];
  const stillLabeled = labels.some(
    (label) => (typeof label === 'string' ? label : label?.name) === activationLabel,
  );
  if (!stillLabeled) return REASON.LABEL_NO_LONGER_PRESENT;
  if (senderPermission !== 'admin') return REASON.SENDER_NOT_ADMIN;
  return null;
}

/**
 * Quyet dinh THUAN, khong I/O.
 *
 * @param {Parameters<typeof checkEvent>[0] & Omit<Parameters<typeof checkLive>[0], 'event'>} input
 * @returns {{ authorized: boolean, reason: string }}
 */
export function decide(input) {
  const reason = checkEvent(input) ?? checkLive(input);
  return reason === null
    ? { authorized: true, reason: REASON.AUTHORIZED }
    : { authorized: false, reason };
}

class ApiError extends Error {}

async function getJson(fetchImpl, url, token) {
  const res = await fetchImpl(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'nexagnet-platform/autopilot-v3-gate',
    },
  });
  if (!res.ok) {
    // Giu lai cau giai thich cua GitHub (bai hoc #188: mot 403 tran khong chan doan duoc gi).
    let detail = '';
    try {
      detail = String((await res.json())?.message ?? '').slice(0, 200);
    } catch {
      detail = '';
    }
    throw new ApiError(`HTTP ${res.status} ${url}${detail ? ` — ${detail}` : ''}`);
  }
  return res.json();
}

/**
 * Doc moi truong cua runner, goi API khi can, ghi `authorized`/`reason` vao GITHUB_OUTPUT.
 * Moi loi deu la tu choi (fail closed). Token khong bao gio duoc in ra.
 *
 * @returns {Promise<number>} ma thoat: 0 = duoc phep, 1 = tu choi
 */
export async function run({
  env = process.env,
  fetchImpl = globalThis.fetch,
  readFile = readFileSync,
  appendFile = appendFileSync,
  log = console.log,
} = {}) {
  let event = null;
  const finish = ({ authorized, reason }, detail) => {
    log(
      JSON.stringify({
        gate: 'claude-builder',
        authorized,
        reason,
        issue: event?.issue?.number ?? null,
        sender: event?.sender?.login ?? null,
        ...(detail ? { detail } : {}),
      }),
    );
    if (env.GITHUB_OUTPUT)
      appendFile(env.GITHUB_OUTPUT, `authorized=${authorized}\nreason=${reason}\n`);
    return authorized ? 0 : 1;
  };
  const deny = (reason, detail) => finish({ authorized: false, reason }, detail);

  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, GITHUB_API_URL: apiUrl } = env;
  if (!token || !repo || !apiUrl || !env.GITHUB_EVENT_PATH) return deny(REASON.CONFIG_MISSING);
  try {
    event = JSON.parse(readFile(env.GITHUB_EVENT_PATH, 'utf8'));
  } catch {
    return deny(REASON.CONFIG_MISSING, 'GITHUB_EVENT_PATH khong doc duoc');
  }

  const base = {
    eventName: env.GITHUB_EVENT_NAME,
    event,
    activationLabel: env.ACTIVATION_LABEL,
    ownerId: env.GITHUB_REPOSITORY_OWNER_ID,
    ownerLogin: env.GITHUB_REPOSITORY_OWNER,
    triggeringActor: env.GITHUB_TRIGGERING_ACTOR,
  };
  // Event sai tu dau thi khong goi API nao.
  const early = checkEvent(base);
  if (early !== null) return deny(early);

  try {
    const liveIssue = await getJson(
      fetchImpl,
      `${apiUrl}/repos/${repo}/issues/${event.issue.number}`,
      token,
    );
    const permission = await getJson(
      fetchImpl,
      `${apiUrl}/repos/${repo}/collaborators/${encodeURIComponent(event.sender.login)}/permission`,
      token,
    );
    return finish(decide({ ...base, liveIssue, senderPermission: permission?.permission }));
  } catch (error) {
    return deny(
      REASON.API_ERROR,
      error instanceof ApiError ? error.message : 'loi mang/khong xac dinh',
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      process.exitCode = 1;
    },
  );
}
