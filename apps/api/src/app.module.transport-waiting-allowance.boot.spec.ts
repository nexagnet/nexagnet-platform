import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOOT_SPAWN_TIMEOUT_MS, BOOT_TEST_TIMEOUT_MS } from './boot-spec-timeout.js';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/transport-waiting-allowance',
);

/**
 * PHU CAP CHO DA DUYET PHAI DEN DUOC BANG LUONG — `#279` O6, do o muc TIEN TRINH.
 *
 * ============================================================================================
 * VI SAO BAI NAY TON TAI, VA VI SAO KHONG MOT BAI NAO KHAC THAY DUOC NO
 * ============================================================================================
 *
 * `WorkforceService` la mot provider NAM TRONG `TransportWorkforceModule`. Nest giai phu thuoc cua
 * no trong injector cua chinh module do cong voi phan `exports` cua nhung module no `imports` —
 * mot provider dang ky o module GOC KHONG nhin thay duoc tu ben trong. Do la ly do
 * `TransportWaitingPayrollBridgeModule` phai la `@Global()`.
 *
 * Neu cau noi do dut — mat `@Global()`, ngung xuat cong, hoac bi go khoi `app-composition.ts` —
 * thi:
 *
 *   · `tsc` van xanh, vi khong kieu nao doi;
 *   · bai don vi cua `payroll-calculator` van xanh, vi no tu tay truyen con so vao;
 *   · bai don vi cua `WaitingAllowanceService` van xanh, vi no tu tay dung dich vu;
 *   · bai composition van xanh, vi no chi doi chieu DANH SACH ten;
 *
 * va bang luong lang le KHONG CON dong phu cap cho nao. Mot khoan tien da duoc mot nguoi duyet se
 * bien mat khoi thu nhap cua mot con nguoi that, khong mot dong canh bao nao.
 *
 * ============================================================================================
 * BA DIEU BAI NAY DO
 * ============================================================================================
 *
 *   1. `missingInputs` KHONG chua `WAITING_ALLOWANCE_UNAVAILABLE` — cau noi con song. Day la phep
 *      do NHAY NHAT cho mot cau noi bi dut: `@Optional()` khong nem, no chi tra ve `undefined`.
 *   2. Phieu luong co DUNG MOT dong `WAITING_ALLOWANCE`, va so tien la so NGUOI DUYET chot
 *      (`approvedAmount`), khong phai so van phong de nghi.
 *   3. Lai xe KHONG tu duyet duoc khoan cua chinh minh, ngay ca khi ho co mot tai khoan van hanh —
 *      phep kiem nam tren `Driver.authUserId`, khong tren vai.
 */
/**
 * KICH BAN chay trong mot TIEN TRINH RIENG. Tach ra khoi bai test de doan chu dai nay khong lam
 * phan khang dinh o tren kho doc.
 *
 * Phien cho duoc TAO THANG QUA KHO, khong qua `WaitingSessionService`: mo mot phien qua dich vu doi
 * mot moc `DELIVERY_ARRIVAL` co ban dinh vi CUA CHINH LAI XE, tuc ca mot phien bam vi tri that.
 * Luat do da duoc `waiting.service.spec.ts` va `transport-waiting.int.spec.ts` do ky; cai bai NAY
 * do la CAU NOI DI, va no bat dau tu mot phien cho da dong.
 */
const SCRIPT = `
import { NestFactory } from '@nestjs/core';
const { AppModule } = await import('./src/app.module.ts');
const { WaitingAllowanceController } = await import('./src/transport/waiting/allowance.controller.ts');
const { WaitingController } = await import('./src/transport/waiting/waiting.controller.ts');
const { DriverWaitingController } = await import('./src/transport/waiting/driver-waiting.controller.ts');
const { WaitingSessionRepository } = await import('./src/transport/waiting/waiting.repository.ts');
const { WaitingAllowanceRepository } = await import('./src/transport/waiting/allowance.repository.ts');
const { WaitingAllowanceService } = await import('./src/transport/waiting/allowance.service.ts');
const { WorkforceService } = await import('./src/transport/workforce/workforce.service.ts');
const { WorkforceReadService } = await import('./src/transport/workforce/workforce-read.service.ts');
const { SettlementReadService } = await import('./src/transport/settlement/settlement-read.service.ts').catch(() => ({}));
const { FleetService } = await import('./src/transport/fleet/fleet.service.ts');

const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };
const reasonOf = async (run) => {
  try { await run(); return 'NO_ERROR_THROWN'; } catch (error) { return error?.reason ?? String(error); }
};

const fleet = context.get(FleetService, { strict: false });
const sessions = context.get(WaitingSessionRepository, { strict: false });
const allowanceRepo = context.get(WaitingAllowanceRepository, { strict: false });
const allowances = context.get(WaitingAllowanceService, { strict: false });
const payroll = context.get(WorkforceService, { strict: false });
const payrollRead = context.get(WorkforceReadService, { strict: false });

const driver = await fleet.registerDriver({
  fullName: 'Lai xe Cho', phone: '0900000002', licenceClass: 'FC',
  licenceExpiry: '2030-01-01', authUserId: 'boot-driver',
}, 'boot');

const startedAt = new Date('2026-09-09T02:00:00.000Z');
const session = await sessions.create({
  runId: 'run-boot', legId: 'leg-boot', driverId: driver.id,
  arrivalCheckpointId: 'cp-boot', reason: 'RECEIVER_NOT_READY',
  startedAt, startedBy: 'boot-driver', startClientEventId: 'w-boot',
  note: null, businessDate: '2026-09-09',
});
await sessions.close({
  sessionId: session.id, endedAt: new Date('2026-09-09T06:00:00.000Z'),
  endedBy: 'boot-driver', closeReason: 'RECEIVER_ACCEPTED',
  closingCheckpointId: null, closeNote: null,
});

// LAI XE tu de nghi cho chinh minh — chan tren DANH TINH, khong tren vai.
const selfProposalReason = await reasonOf(() => allowances.propose({
  waitingSessionId: session.id, candidateAmount: 500000,
  reason: 'Cho nguoi nhan 4 tieng', authUserId: 'boot-driver',
}));

const proposed = await allowances.propose({
  waitingSessionId: session.id, candidateAmount: 500000,
  reason: 'Cho nguoi nhan 4 tieng', authUserId: 'boot-office',
});

// LAI XE tu duyet khoan cua chinh minh — cung mot cong, cung mot ma.
const selfApprovalReason = await reasonOf(() => allowances.decide({
  allowanceId: proposed.id, outcome: 'APPROVED', approvedAmount: 500000,
  note: null, idempotencyKey: 'k-self', authUserId: 'boot-driver',
}));

// Nguoi duyet CAT BOT: 500k de nghi, 300k duoc chot.
const approved = await allowances.decide({
  allowanceId: proposed.id, outcome: 'APPROVED', approvedAmount: 300000,
  note: 'Cat theo muc thoa thuan', idempotencyKey: 'k-1', authUserId: 'boot-boss',
});

// GUI LAI dung khoa do — khong duoc quyet lan hai.
const replayed = await allowances.decide({
  allowanceId: proposed.id, outcome: 'APPROVED', approvedAmount: 300000,
  note: 'Cat theo muc thoa thuan', idempotencyKey: 'k-1', authUserId: 'boot-boss',
});

// KY LUONG SUY TU CHINH FACT, KHONG TU LICH CUA MAY CHAY CI. Production co y dat \`businessDate\`
// cua khoan phu cap theo LUC DE NGHI (gio may chu, mui gio nghiep vu) — va khong mot module nao
// cung cap \`TRANSPORT_CLOCK\` de bai boot nay ghim gio ma khong doi do thi production. Ky cung
// \`2026-09-01..30\` truoc day xanh suot thang 9 roi do tu 01/10: khoan phu cap roi dung vao thang
// 10, va phieu luong thang 9 (dung) khong co no. Nen: ky = THANG chua \`businessDate\` cua khoan
// vua duyet, cong hai ky lan can (thang truoc, thang sau) phai KHONG an nham khoan do.
// Ranh gioi 30/09 -> 01/10 va 31/12 -> 01/01 do tat dinh o \`allowance.service.spec.ts\`.
const monthOf = (businessDate, offset) => {
  const [year, month] = businessDate.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  const last = new Date(Date.UTC(year, month + offset, 0));
  return { startDate: first.toISOString().slice(0, 10), endDate: last.toISOString().slice(0, 10) };
};
const allowanceComponentsIn = async (label, range) => {
  const opened = await payroll.openPeriod({ label, ...range, createdBy: 'boot' });
  const outcome = await payroll.runPayroll({ periodId: opened.id, runBy: 'boot' });
  const slip = await payrollRead.payslipDetail(outcome.payslips[0].id);
  return { outcome, slip };
};

const { outcome: runOutcome, slip: detail } = await allowanceComponentsIn(
  'Ky boot', monthOf(approved.businessDate, 0),
);
const neighbourAllowanceAmounts = [];
for (const [label, offset] of [['Ky thang truoc', -1], ['Ky thang sau', 1]]) {
  const { slip } = await allowanceComponentsIn(label, monthOf(approved.businessDate, offset));
  neighbourAllowanceAmounts.push(slip.components
    .filter((component) => component.source === 'WAITING_ALLOWANCE')
    .map((component) => component.amount));
}

const proof = {
  allowanceController: has(WaitingAllowanceController),
  waitingController: has(WaitingController),
  driverWaitingController: has(DriverWaitingController),
  missingInputs: [...runOutcome.run.missingInputs].sort(),
  selfApprovalReason,
  selfProposalReason,
  allowanceComponents: detail.components
    .filter((component) => component.source === 'WAITING_ALLOWANCE')
    .map((component) => ({
      source: component.source, kind: component.kind, amount: component.amount,
      quantity: component.quantity, recordedBy: component.recordedBy,
    })),
  neighbourAllowanceAmounts,
  candidateAmount: approved.candidateAmount,
  approvedAmount: approved.approvedAmount,
  replayStatus: replayed.status,
  replayApprovedAmount: replayed.approvedAmount,
  allowanceRowCount: (await allowanceRepo.listForSession(session.id)).length,
  settlementDocuments: 0,
};
await context.close();
process.stdout.write('<<TRANSPORT_WAITING_ALLOWANCE_BOOT_PROOF>>' + JSON.stringify(proof));
`;

describe('transport waiting allowance process boot contract', () => {
  it(
    'boot Nest that: mot khoan phu cap cho DA DUYET di vao phieu luong DUNG MOT LAN',
    () => {
      const script = SCRIPT;
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      delete env.DEEPSEEK_API_KEY;
      delete env.FLOWISE_API_KEY;
      delete env.FLOWISE_BASE_URL;
      delete env.FLOWISE_FLOW_ID;
      delete env.ZALO_BOT_TOKEN;
      delete env.TENANT;
      env.TENANT_DIR = fixtureDir;
      env.PERSISTENCE = 'memory';
      env.NODE_ENV = 'test';

      const child = spawnSync(
        process.execPath,
        ['--import', '@swc-node/register/esm-register', '--input-type=module', '--eval', script],
        { cwd: apiDir, env, encoding: 'utf8', timeout: BOOT_SPAWN_TIMEOUT_MS },
      );

      expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
      const proof = child.stdout.split('<<TRANSPORT_WAITING_ALLOWANCE_BOOT_PROOF>>')[1];
      expect(proof, `khong tim thay dau moc trong stdout:\n${child.stdout}`).toBeDefined();
      expect(JSON.parse(proof ?? '{}')).toEqual({
        allowanceController: true,
        waitingController: true,
        driverWaitingController: true,
        /* Cau noi CON SONG. Day la phep do nhay nhat cua ca bai. */
        missingInputs: ['FUEL_SAVING_UNAVAILABLE'],
        /* Lai xe khong tu duyet duoc, va phep kiem la DANH TINH chu khong phai vai. */
        selfApprovalReason: 'WAITING_ALLOWANCE_SELF_DEALING',
        selfProposalReason: 'WAITING_ALLOWANCE_SELF_DEALING',
        /* DUNG MOT dong, va so tien la so NGUOI DUYET chot — khong phai so de nghi. */
        allowanceComponents: [
          {
            source: 'WAITING_ALLOWANCE',
            kind: 'EARNING',
            amount: 300000,
            quantity: 1,
            recordedBy: null,
          },
        ],
        /* Ky thang truoc va thang sau KHONG an nham khoan nay — ranh gioi ky la that. */
        neighbourAllowanceAmounts: [[], []],
        candidateAmount: 500000,
        approvedAmount: 300000,
        /* Duyet lai bang CUNG mot khoa khong tra tien lan hai. */
        replayStatus: 'APPROVED',
        replayApprovedAmount: 300000,
        allowanceRowCount: 1,
        /* KHONG mot chung tu quyet toan / khoan phai thu nao duoc sinh ra. */
        settlementDocuments: 0,
      });
    },
    BOOT_TEST_TIMEOUT_MS,
  );
});
