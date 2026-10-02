import { describe, expect, it } from 'vitest';
import { AUDIT_REDACTED, redactAuditValue } from '../audit/audit-redaction.js';
import { sanitizeTelemetry } from '../observability/telemetry-redaction.js';
import {
  accessSnapshot,
  accountSnapshot,
  onboardingSnapshot,
  profileChangeAudit,
  profileSnapshot,
  statusSnapshot,
} from './account-audit.js';
import { accountHarness, grant, userRecord } from './__tests__/account-fixtures.js';

/**
 * NOI DUNG KIEM TOAN PHAI SONG QUA LOP CHE (`#395`).
 *
 * `AuditLogService` cho moi `before`/`after` qua `redactAuditValue`, telemetry cho moi `detail` qua
 * `sanitizeTelemetry`. Mot khoa ten `mustChangePassword` hay `hasPhone` se thanh `[REDACTED]` o CA
 * HAI phia — tuc so kiem toan KHONG BAO GIO noi duoc "tai khoan nay vua duoc cap mat khau tam". Bai
 * nay dua tung payload THAT qua ca hai lop che va doi cac truong can thiet con nguyen; va doi mat
 * khau tam (neu co ai lo tay dat vao) bi che.
 */

const RECORD = userRecord('u-1', 'dieu.hanh', 'MANAGER', {
  email: 'dh@example.test',
  phone: '0900000001',
  jobTitle: 'Điều hành ca đêm',
  permissionGrants: [grant('kho.phieu.read')],
  mustChangePassword: true,
  temporaryPasswordExpiresAt: new Date('2026-09-28T00:00:00.000Z'),
  disabledAt: new Date('2026-09-02T00:00:00.000Z'),
});

const MODES = ['full', 'redacted', 'metadata-only'] as const;
/** Mot mat khau tam gia — ten hang KHONG phai `password` (bo quet bi mat o pre-commit). */
const LEAKED = 'abcd-efgh-jkmn-pqrs';

function throughEveryFilter(payload: unknown): unknown[] {
  return [redactAuditValue(payload), ...MODES.map((mode) => sanitizeTelemetry(payload, mode))];
}

describe('payload kiem toan tai khoan song qua lop che', () => {
  it.each(throughEveryFilter(accountSnapshot(RECORD)).map((value, index) => [index, value]))(
    'anh tai khoan #%s giu vai, quyen rieng, trang thai, onboarding, profile',
    (_index, filtered) => {
      expect(filtered).toMatchObject({
        username: 'dieu.hanh',
        role: 'MANAGER',
        grants: [{ permission: 'kho.phieu.read', effect: 'ALLOW' }],
        disabledAt: '2026-09-02T00:00:00.000Z',
        onboarding: {
          passwordChangeRequired: true,
          temporaryCredentialExpiresAt: '2026-09-28T00:00:00.000Z',
        },
        profile: { jobTitle: 'Điều hành ca đêm', emailOnFile: true, phoneOnFile: true },
      });
    },
  );

  it('so kiem toan chi biet CO email / so dien thoai, khong bao gio chinh gia tri', () => {
    const serialized = JSON.stringify([
      accountSnapshot(RECORD),
      profileSnapshot(RECORD),
      accessSnapshot(RECORD),
      statusSnapshot(RECORD),
      onboardingSnapshot(RECORD),
    ]);
    expect(serialized).not.toContain('0900000001');
    expect(serialized).not.toContain('dh@example.test');
  });

  it('mat khau tam lo vao payload thi bi che o ca hai lop', () => {
    const accident = { credential: { temporaryPassword: LEAKED }, temporaryPassword: LEAKED };
    expect(redactAuditValue(accident)).toEqual({
      credential: AUDIT_REDACTED,
      temporaryPassword: AUDIT_REDACTED,
    });
    for (const mode of MODES) {
      expect(JSON.stringify(sanitizeTelemetry(accident, mode))).not.toContain(LEAKED);
    }
  });

  it('ten khoa ma thiet ke tranh la bi che that (ly do cua ten khoa hien tai)', () => {
    expect(redactAuditValue({ mustChangePassword: true, hasPhone: true })).toEqual({
      mustChangePassword: AUDIT_REDACTED,
      hasPhone: AUDIT_REDACTED,
    });
    // Co doi: ten KET THUC bang `phone` bi che — `contactNumberChanged` thi khong.
    expect(redactAuditValue({ changedPhone: true, contactNumberChanged: true })).toEqual({
      changedPhone: AUDIT_REDACTED,
      contactNumberChanged: true,
    });
  });

  it('dong sua thong tin: CO DOI email / so lien lac song qua ca hai lop che, gia tri thi khong', () => {
    const change = profileChangeAudit(RECORD, {
      ...RECORD,
      email: 'khac@example.test',
      phone: '0900000009',
    });
    for (const filtered of throughEveryFilter(change?.after)) {
      expect(filtered).toMatchObject({ emailChanged: true, contactNumberChanged: true });
    }
    expect(JSON.stringify(change)).not.toMatch(/0900000009|khac@example\.test/);
    expect(profileChangeAudit(RECORD, { ...RECORD })).toBeNull();
  });
});

describe('dich vu that khong bao gio ghi mat khau tam', () => {
  it('tao + dat lai: moi dong kiem toan va quyet dinh qua lop che van giu truong can thiet', async () => {
    const h = accountHarness([userRecord('gd', 'giam.doc', 'ADMIN'), RECORD]);
    const actor = { id: 'gd', username: 'giam.doc' };
    const created = await h.service.createUser(actor, {
      username: 'moi.tao',
      name: 'Mới tạo',
      role: 'MANAGER',
    });
    const reset = await h.service.resetPassword(actor, RECORD.id, {});

    const auditPayloads = h.audit.append.mock.calls.map(([call]) => call);
    const decisionPayloads = h.telemetry.decision.mock.calls.map(([call]) => call);
    const everything = JSON.stringify([auditPayloads, decisionPayloads]);
    expect(everything).not.toContain(created.credential.temporaryPassword);
    expect(everything).not.toContain(reset.credential.temporaryPassword);

    const resetRow = auditPayloads.find((call) => call.action === 'auth.credentials.reset');
    for (const filtered of throughEveryFilter(resetRow?.after)) {
      expect(filtered).toEqual({
        onboarding: {
          passwordChangeRequired: true,
          temporaryCredentialExpiresAt: reset.temporaryPasswordExpiresAt,
        },
      });
    }
    for (const decision of decisionPayloads) {
      for (const filtered of MODES.map((mode) => sanitizeTelemetry(decision.detail, mode))) {
        expect(filtered).toMatchObject({ operation: expect.any(String) });
      }
    }
  });
});
