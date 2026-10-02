// Hanh vi cua cong kich hoat — moi duong khong tin cay tren repo PUBLIC phai bi tu choi voi DUNG ma.
// Khong goi mang, khong secret: event la fixture, API la stub.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REASON, checkEvent, decide, run } from './gate.mjs';

const LABEL = 'agent:claude';
const OWNER = { login: 'repo-owner', id: 1001, type: 'User' };
const STRANGER = { login: 'stranger', id: 2002, type: 'User' };
const APP_BOT = { login: 'nexagent-autopilot[bot]', id: 3003, type: 'Bot' };

function labeledEvent({ sender = OWNER, author = OWNER, label = LABEL, action = 'labeled' } = {}) {
  return {
    action,
    label: { name: label },
    sender,
    issue: { id: 555, number: 42, state: 'open', user: author, labels: [{ name: label }] },
  };
}

function liveFrom(event, overrides = {}) {
  return { ...event.issue, labels: [{ name: LABEL }], ...overrides };
}

function input(event, extra = {}) {
  return {
    eventName: 'issues',
    event,
    activationLabel: LABEL,
    ownerId: String(OWNER.id),
    ownerLogin: OWNER.login,
    triggeringActor: OWNER.login,
    liveIssue: liveFrom(event),
    senderPermission: 'admin',
    ...extra,
  };
}

test('chu repo gan nhan len Issue cua chinh minh -> duoc phep', () => {
  assert.deepEqual(decide(input(labeledEvent())), { authorized: true, reason: REASON.AUTHORIZED });
});

test('NGUOI LA gan nhan -> tu choi (khong quan trong ten nhan)', () => {
  assert.equal(decide(input(labeledEvent({ sender: STRANGER }))).reason, REASON.SENDER_NOT_OWNER);
});

test('App/bot gan nhan -> tu choi, ke ca App cua chinh repo', () => {
  assert.equal(decide(input(labeledEvent({ sender: APP_BOT }))).reason, REASON.SENDER_NOT_USER);
});

test('chu repo gan nhan len Issue do NGUOI LA viet -> tu choi', () => {
  assert.equal(
    decide(input(labeledEvent({ author: STRANGER }))).reason,
    REASON.ISSUE_AUTHOR_NOT_OWNER,
  );
});

test('so sanh theo ID tai khoan: trung LOGIN ma khac ID van la nguoi la', () => {
  const impostor = { login: OWNER.login, id: 9999, type: 'User' };
  assert.equal(decide(input(labeledEvent({ sender: impostor }))).reason, REASON.SENDER_NOT_OWNER);
  assert.equal(
    decide(input(labeledEvent({ author: impostor }))).reason,
    REASON.ISSUE_AUTHOR_NOT_OWNER,
  );
});

test('nhan khac (vd agent:ready cua pilot V2) -> khong kich hoat', () => {
  assert.equal(decide(input(labeledEvent({ label: 'agent:ready' }))).reason, REASON.WRONG_LABEL);
});

test('su kien khac `issues.labeled` -> khong kich hoat', () => {
  assert.equal(decide(input(labeledEvent({ action: 'opened' }))).reason, REASON.WRONG_EVENT);
  assert.equal(
    decide(input(labeledEvent(), { eventName: 'issue_comment' })).reason,
    REASON.WRONG_EVENT,
  );
});

test('re-run boi nguoi khac chu repo -> tu choi', () => {
  assert.equal(
    decide(input(labeledEvent(), { triggeringActor: STRANGER.login })).reason,
    REASON.TRIGGERING_ACTOR_NOT_OWNER,
  );
});

test('Issue da dong, hoac nhan da bi go truoc khi job chay -> tu choi theo trang thai HIEN TAI', () => {
  const event = labeledEvent();
  assert.equal(
    decide(input(event, { liveIssue: liveFrom(event, { state: 'closed' }) })).reason,
    REASON.ISSUE_NOT_OPEN,
  );
  assert.equal(
    decide(input(event, { liveIssue: liveFrom(event, { labels: [] }) })).reason,
    REASON.LABEL_NO_LONGER_PRESENT,
  );
});

test('API tra ve mot Issue khac, hoac mot PR -> tu choi', () => {
  const event = labeledEvent();
  assert.equal(
    decide(input(event, { liveIssue: liveFrom(event, { id: 777 }) })).reason,
    REASON.LIVE_ISSUE_MISMATCH,
  );
  assert.equal(
    decide(input(event, { liveIssue: liveFrom(event, { pull_request: { url: 'x' } }) })).reason,
    REASON.ISSUE_IS_PULL_REQUEST,
  );
});

test('nguoi gan khong con quyen admin -> tu choi', () => {
  assert.equal(
    decide(input(labeledEvent(), { senderPermission: 'write' })).reason,
    REASON.SENDER_NOT_ADMIN,
  );
});

test('thieu cau hinh (nhan / ID chu repo) -> tu choi, khong mac dinh', () => {
  assert.equal(
    checkEvent({ ...input(labeledEvent()), activationLabel: '' }),
    REASON.CONFIG_MISSING,
  );
  assert.equal(checkEvent({ ...input(labeledEvent()), ownerId: undefined }), REASON.CONFIG_MISSING);
});

// ---------------------------------------------------------------------------------------------
// run(): phan I/O — event tu tep, API qua fetch, ket qua ra GITHUB_OUTPUT
// ---------------------------------------------------------------------------------------------

const CANARY = 'canary-value-must-never-be-printed';

function harness(event, { issueStatus = 200, permission = 'admin' } = {}) {
  const calls = [];
  const logs = [];
  const outputs = [];
  const env = {
    GITHUB_TOKEN: CANARY,
    GITHUB_REPOSITORY: 'o/r',
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_EVENT_PATH: '/event.json',
    GITHUB_EVENT_NAME: 'issues',
    GITHUB_OUTPUT: '/output',
    GITHUB_REPOSITORY_OWNER: OWNER.login,
    GITHUB_REPOSITORY_OWNER_ID: String(OWNER.id),
    GITHUB_TRIGGERING_ACTOR: OWNER.login,
    ACTIVATION_LABEL: LABEL,
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init.headers.authorization });
    if (url.endsWith('/issues/42')) {
      return issueStatus === 200
        ? { ok: true, json: async () => liveFrom(event) }
        : { ok: false, status: issueStatus, json: async () => ({ message: 'Server Error' }) };
    }
    return { ok: true, json: async () => ({ permission }) };
  };
  const deps = {
    env,
    fetchImpl,
    readFile: () => JSON.stringify(event),
    appendFile: (_path, text) => outputs.push(text),
    log: (line) => logs.push(line),
  };
  return { deps, calls, logs, outputs };
}

test('run: duong hop le goi dung hai API, ghi authorized=true, thoat 0', async () => {
  const h = harness(labeledEvent());
  assert.equal(await run(h.deps), 0);
  assert.deepEqual(
    h.calls.map((c) => c.url),
    [
      'https://api.github.test/repos/o/r/issues/42',
      'https://api.github.test/repos/o/r/collaborators/repo-owner/permission',
    ],
  );
  assert.equal(h.outputs.join(''), 'authorized=true\nreason=AUTHORIZED\n');
});

test('run: event cua nguoi la bi tu choi TRUOC moi loi goi API', async () => {
  const h = harness(labeledEvent({ sender: STRANGER }));
  assert.equal(await run(h.deps), 1);
  assert.equal(h.calls.length, 0);
  assert.equal(h.outputs.join(''), 'authorized=false\nreason=SENDER_NOT_OWNER\n');
});

test('run: API loi -> tu choi (fail closed), giu cau giai thich cua GitHub', async () => {
  const h = harness(labeledEvent(), { issueStatus: 500 });
  assert.equal(await run(h.deps), 1);
  assert.match(h.outputs.join(''), /reason=API_ERROR/u);
  assert.match(h.logs.join('\n'), /HTTP 500 .*Server Error/u);
});

test('run: thieu token -> tu choi, khong goi API', async () => {
  const h = harness(labeledEvent());
  h.deps.env.GITHUB_TOKEN = '';
  assert.equal(await run(h.deps), 1);
  assert.equal(h.calls.length, 0);
  assert.match(h.outputs.join(''), /reason=CONFIG_MISSING/u);
});

test('run: token chi di vao header, KHONG BAO GIO vao log hay output', async () => {
  for (const h of [harness(labeledEvent()), harness(labeledEvent(), { issueStatus: 403 })]) {
    await run(h.deps);
    const printed = h.logs.join('\n') + h.outputs.join('');
    assert.ok(!printed.includes(CANARY), 'token lot ra log/output');
    assert.ok(h.calls.every((c) => c.auth === `Bearer ${CANARY}`));
  }
});
