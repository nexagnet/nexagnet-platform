import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  RunClosureOutcome,
  RunClosureVerdict,
  RunLeg,
  RunLegPhase,
  VehicleRunStatus,
} from '../../transport-types';
import {
  CLOSURE_BLOCKER_LABEL,
  closureLineFor,
  FIELD_NOT_DELIVERED_NOTE,
  fieldTruthLabel,
  LEG_FAILURE_MESSAGE,
  legTitle,
  legWorkflowFor,
  lifecycleFailureOf,
  ORDER_FAILURE_MESSAGE,
  ORDER_STATUS_LABEL,
  orderFulfilmentFor,
  OVERRIDE_CARGO_WARNING,
  RUN_STATUS_LABEL,
  transitionNoticeFor,
  type FieldTruth,
  type LegWorkflowInput,
} from '../office-lifecycle';

/**
 * `#376` — viec van phong tren chang va don. Bon bat bien cua `office-lifecycle.ts` duoc do o day:
 * moc la bang chung, khong nut vong chay, ghi de co ly do, don khong tu giao xong.
 */

type LegShape = LegWorkflowInput['leg'];

const leg = (over: Partial<LegShape> = {}): LegShape => ({
  sequence: 2,
  kind: 'LOADED',
  status: 'PLANNED',
  originLabel: 'Kho Hải Phòng',
  destinationLabel: 'Ninh Bình',
  ...over,
});

const KNOWN_DELIVERED: FieldTruth = { kind: 'KNOWN', phase: 'DELIVERED' };
const KNOWN_ARRIVED: FieldTruth = { kind: 'KNOWN', phase: 'ARRIVED' };
const KNOWN_NO_CHECKPOINT: FieldTruth = { kind: 'KNOWN', phase: null };

const rowFor = (over: Partial<LegWorkflowInput> = {}) =>
  legWorkflowFor({
    leg: leg(),
    runCode: 'VC-001',
    runStatus: 'ACTIVE',
    field: { kind: 'UNKNOWN' },
    deliveryRejected: false,
    ...over,
  });

const verdict = (over: Partial<RunClosureVerdict> = {}): RunClosureVerdict => ({
  closable: false,
  trigger: null,
  blockers: [],
  holding: false,
  ...over,
});

const outcome = (
  runStatus: VehicleRunStatus,
  over: Partial<RunClosureVerdict> = {},
  closed = false,
): RunClosureOutcome => ({
  runId: 'run-1',
  verdict: verdict(over),
  closed,
  run: {
    id: 'run-1',
    code: 'VC-001',
    vehicleId: 'veh-1',
    status: runStatus,
    businessDate: '2026-09-23',
    startedAt: null,
    completedAt: null,
    note: null,
    cancelledAt: null,
    cancellationReason: null,
  },
});

describe('nut tren mot chang — PLANNED -> IN_TRANSIT -> COMPLETED', () => {
  it('chang du kien chi co MOT buoc: bat dau chay (khong nhay thang toi hoan tat)', () => {
    const row = rowFor({ leg: leg({ status: 'PLANNED' }), field: KNOWN_DELIVERED });
    expect(row.action?.kind).toBe('START');
    expect(row.action?.to).toBe('IN_TRANSIT');
    expect(row.action?.reasonLabel).toBeNull();
    expect(row.note).toBeNull();
  });

  it('moc "Khach da nhan hang" KHONG sinh buoc nao tren chang chua chay — moc la bang chung', () => {
    // Hien truong da giao xong, nhung chang van `PLANNED`: nut duy nhat van la "Bat dau chay".
    const row = rowFor({ leg: leg({ status: 'PLANNED' }), field: KNOWN_DELIVERED });
    expect(row.action?.to).not.toBe('COMPLETED');
  });

  it('chang co hang dang chay + hien truong da giao: hoan tat THUONG, khong doi ly do', () => {
    const row = rowFor({ leg: leg({ status: 'IN_TRANSIT' }), field: KNOWN_DELIVERED });
    expect(row.action?.kind).toBe('COMPLETE');
    expect(row.action?.to).toBe('COMPLETED');
    expect(row.action?.reasonLabel).toBeNull();
    expect(row.action?.confirmDetail).toContain('Hiện trường đã ghi khách nhận hàng');
    expect(row.note).toBeNull();
  });

  it.each([
    ['moc cuoi la da den noi', KNOWN_ARRIVED],
    ['chang chua co moc nao', KNOWN_NO_CHECKPOINT],
  ])('hien truong CHUA giao (%s): chi con duong ghi de CO LY DO', (_name, field) => {
    const row = rowFor({ leg: leg({ status: 'IN_TRANSIT' }), field });
    expect(row.action?.kind).toBe('COMPLETE_WITH_OVERRIDE');
    expect(row.action?.to).toBe('COMPLETED');
    expect(row.action?.isOverride).toBe(true);
    expect(row.action?.reasonLabel).toBe('Lý do hoàn tất trái hiện trường');
    expect(row.note).toBe(FIELD_NOT_DELIVERED_NOTE);
  });

  it('hop thoai ghi de noi TRUOC he qua khi hien truong con ghi hang tren xe', () => {
    const phases: RunLegPhase[] = ['PLANNED', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'ARRIVED'];
    const warned = phases.filter((phase) =>
      rowFor({
        leg: leg({ status: 'IN_TRANSIT' }),
        field: { kind: 'KNOWN', phase },
      }).action?.confirmDetail.includes(OVERRIDE_CARGO_WARNING),
    );
    expect(warned).toEqual(['LOADING', 'IN_TRANSIT', 'ARRIVED']);
    // Chang chua co moc nao: khong co hang tren xe theo hien truong, khong canh bao.
    expect(
      rowFor({ leg: leg({ status: 'IN_TRANSIT' }), field: KNOWN_NO_CHECKPOINT }).action
        ?.confirmDetail,
    ).not.toContain(OVERRIDE_CARGO_WARNING);
  });

  it('hien truong doc lai "da giao" thang lan tu choi cu: tro ve hoan tat THUONG, khong doi ly do', () => {
    const row = rowFor({
      leg: leg({ status: 'IN_TRANSIT' }),
      field: KNOWN_DELIVERED,
      deliveryRejected: true,
    });
    expect(row.action?.kind).toBe('COMPLETE');
    expect(row.action?.reasonLabel).toBeNull();
    expect(row.note).toBeNull();
  });

  it('may chu vua tu choi vi hien truong: chuyen sang ghi de ngay ca khi chua doc duoc hien truong', () => {
    const row = rowFor({
      leg: leg({ status: 'IN_TRANSIT' }),
      field: { kind: 'UNKNOWN' },
      deliveryRejected: true,
    });
    expect(row.action?.kind).toBe('COMPLETE_WITH_OVERRIDE');
  });

  it.each([
    ['chua doc duoc hien truong', { kind: 'UNKNOWN' } as FieldTruth],
    ['khach khong bat moc', { kind: 'NO_SOURCE' } as FieldTruth],
  ])(
    '%s: nut hoan tat THUONG — may chu la nguoi quyet, man hinh khong doan "chua giao"',
    (_n, field) => {
      const row = rowFor({ leg: leg({ status: 'IN_TRANSIT' }), field });
      expect(row.action?.kind).toBe('COMPLETE');
      expect(row.note).toBeNull();
    },
  );

  it('chang RONG dang chay: hoan tat thuong, hien truong khong lien quan', () => {
    const row = rowFor({ leg: leg({ kind: 'EMPTY', status: 'IN_TRANSIT' }), field: KNOWN_ARRIVED });
    expect(row.action?.kind).toBe('COMPLETE');
  });

  it.each(['COMPLETED', 'CANCELLED'] as const)('chang %s: khong con nut nao', (status) => {
    expect(rowFor({ leg: leg({ status }) })).toEqual({ action: null, note: null });
  });

  it.each(['COMPLETED', 'CANCELLED'] as const)(
    'vong chay %s: chang con mo khong co nut, va man hinh noi vi sao',
    (runStatus) => {
      const row = rowFor({ leg: leg({ status: 'PLANNED' }), runStatus });
      expect(row.action).toBeNull();
      expect(row.note).toBe(LEG_FAILURE_MESSAGE.LEG_RUN_TERMINAL);
    },
  );

  it('KHONG buoc nao nham toi vong chay: moi dich den la trang thai cua CHANG', () => {
    const statuses: RunLeg['status'][] = ['PLANNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'];
    const runs: VehicleRunStatus[] = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];
    const fields: FieldTruth[] = [
      { kind: 'UNKNOWN' },
      { kind: 'NO_SOURCE' },
      KNOWN_DELIVERED,
      KNOWN_ARRIVED,
    ];
    const targets = new Set<string>();
    for (const status of statuses) {
      for (const runStatus of runs) {
        for (const field of fields) {
          for (const kind of ['LOADED', 'EMPTY'] as const) {
            const action = rowFor({ leg: leg({ status, kind }), runStatus, field }).action;
            if (action !== null) targets.add(action.to);
          }
        }
      }
    }
    expect([...targets].sort()).toEqual(['COMPLETED', 'IN_TRANSIT']);
  });

  it('nhan chang doc duoc thay cho ma ky thuat', () => {
    expect(
      legTitle(
        leg({ sequence: 1, kind: 'EMPTY', originLabel: 'Bãi xe', destinationLabel: 'Kho A' }),
      ),
    ).toBe('Chặng 1 · chạy rỗng · Bãi xe → Kho A');
  });
});

describe('cot Hien truong — ba trang thai khong duoc gop', () => {
  it('giai doan DELIVERED noi "Khách đã nhận hàng", KHONG "Đã giao xong" (chu cua DON)', () => {
    expect(fieldTruthLabel(KNOWN_DELIVERED, 'LOADED')).toBe('Khách đã nhận hàng');
    expect(fieldTruthLabel(KNOWN_DELIVERED, 'LOADED')).not.toBe(ORDER_STATUS_LABEL.FULFILLED);
  });

  it('chua co moc / khong co nguon / chua doc duoc la ba cau khac nhau', () => {
    const labels = new Set([
      fieldTruthLabel(KNOWN_NO_CHECKPOINT, 'LOADED'),
      fieldTruthLabel({ kind: 'NO_SOURCE' }, 'LOADED'),
      fieldTruthLabel({ kind: 'UNKNOWN' }, 'LOADED'),
    ]);
    expect(labels.size).toBe(3);
  });

  it('chang rong khong co moc hang', () => {
    expect(fieldTruthLabel(KNOWN_DELIVERED, 'EMPTY')).toBe('Không có mốc hàng');
  });
});

describe('ly do tu choi doc tu `reason` co kieu', () => {
  const rejected = (reason: string | null, message = 'Hien truong chua ghi...') =>
    Object.assign(new Error(message), { reason, status: 403 });

  it('LEG_FIELD_DELIVERY_NOT_RECORDED: cau co dau + mo duong ghi de', () => {
    const failure = lifecycleFailureOf(
      rejected('LEG_FIELD_DELIVERY_NOT_RECORDED'),
      LEG_FAILURE_MESSAGE,
    );
    expect(failure.needsOverride).toBe(true);
    expect(failure.message).toContain('Hoàn tất có ghi đè');
  });

  it('ma khong co trong bang hoac khong co ma: hien NGUYEN VAN cau cua may chu', () => {
    // Than `403` cua guard quyen tu `#395`: ma co kieu, cau co dau — khong thuoc bang cua chang.
    const guard = lifecycleFailureOf(
      rejected('ACTION_NOT_PERMITTED', 'Bạn không có quyền thực hiện thao tác này.'),
      LEG_FAILURE_MESSAGE,
    );
    expect(guard).toEqual({
      message: 'Bạn không có quyền thực hiện thao tác này.',
      needsOverride: false,
    });
    expect(lifecycleFailureOf(rejected(null, 'Máy chủ bận'), LEG_FAILURE_MESSAGE).message).toBe(
      'Máy chủ bận',
    );
    expect(
      lifecycleFailureOf(rejected('SOMETHING_NEW', 'Cau moi'), LEG_FAILURE_MESSAGE).message,
    ).toBe('Cau moi');
  });

  it('loi don chi dung bang cua DON — khong mo duong ghi de', () => {
    const failure = lifecycleFailureOf(rejected('ORDER_ALREADY_TERMINAL'), ORDER_FAILURE_MESSAGE);
    expect(failure.needsOverride).toBe(false);
    expect(failure.message).toBe(ORDER_FAILURE_MESSAGE.ORDER_ALREADY_TERMINAL);
  });
});

describe('dong vong chay — chi DOC phan xu cua he thong', () => {
  it('vong chay chua chay / da dong / da huy doc tu trang thai, khong doc RUN_NOT_ACTIVE', () => {
    const planned = closureLineFor('PLANNED', verdict({ blockers: ['RUN_NOT_ACTIVE'] }));
    expect(planned.badge).toBe('Chưa chạy');
    expect(planned.text).not.toContain(CLOSURE_BLOCKER_LABEL.RUN_NOT_ACTIVE);
    expect(closureLineFor('COMPLETED', null).badge).toBe('Đã đóng');
    expect(closureLineFor('CANCELLED', null).badge).toBe('Đã huỷ');
  });

  it('dang chay + con chang mo: noi LY DO chan', () => {
    const line = closureLineFor('ACTIVE', verdict({ blockers: ['LEG_STILL_OPEN'] }));
    expect(line.badge).toBe('Chưa đóng');
    expect(line.text).toContain('còn chặng chưa hoàn tất');
  });

  it('het viec xa bai: "dang giu" la trang thai binh thuong, khong phai loi', () => {
    const line = closureLineFor('ACTIVE', verdict({ holding: true }));
    expect(line.badge).toBe('Đang giữ');
    expect(line.tone).toBe('wait');
    expect(line.text).toContain('xe chưa về bãi');
  });

  it('thong bao sau lan hoan tat noi dung ket cuc cua lan phan xu', () => {
    const base = {
      legLabel: 'Chặng 2 · có hàng · A → B',
      to: 'COMPLETED',
      override: false,
      runCode: 'VC-001',
    } as const;
    expect(
      transitionNoticeFor({ ...base, closure: outcome('ACTIVE', { holding: true }) }),
    ).toContain('hệ thống giữ vòng chạy mở');
    expect(
      transitionNoticeFor({
        ...base,
        closure: outcome('ACTIVE', { blockers: ['LEG_STILL_OPEN'] }),
      }),
    ).toContain('chưa đóng: còn chặng chưa hoàn tất');
    const closed = transitionNoticeFor({
      ...base,
      closure: outcome('COMPLETED', { closable: true, trigger: 'DEPOT_RETURN' }, true),
    });
    expect(closed).toContain('Hệ thống đã tự đóng vòng chạy VC-001 (xe đã về bãi)');
    // Dong vong chay KHONG phai giao xong don.
    expect(closed).toContain('Trạng thái đơn không tự đổi');
  });

  it('bat dau chang dau tien: noi vong chay dang chay', () => {
    const notice = transitionNoticeFor({
      legLabel: 'Chặng 1 · chạy rỗng · Bãi → Kho',
      to: 'IN_TRANSIT',
      override: false,
      runCode: 'VC-001',
      closure: outcome('ACTIVE', { blockers: ['LEG_STILL_OPEN'] }),
    });
    expect(notice).toBe(
      'Chặng 1 · chạy rỗng · Bãi → Kho: đã ghi đang chạy. Vòng chạy VC-001 đang chạy.',
    );
  });

  it('nhan trang thai vong chay: ACTIVE la "Đang chạy" (#336), COMPLETED la "Đã đóng"', () => {
    expect(RUN_STATUS_LABEL.ACTIVE).toBe('Đang chạy');
    expect(RUN_STATUS_LABEL.COMPLETED).toBe('Đã đóng');
  });
});

describe('giao xong don — OPEN -> FULFILLED la hanh dong co nguoi thuc hien', () => {
  const loaded = (status: RunLeg['status']) => ({ kind: 'LOADED' as const, status });
  const empty = (status: RunLeg['status']) => ({ kind: 'EMPTY' as const, status });

  it('don dang mo, chang co hang da xong: xac nhan duoc, khong canh bao', () => {
    const view = orderFulfilmentFor({ status: 'OPEN' }, [empty('COMPLETED'), loaded('COMPLETED')]);
    expect(view.canFulfil).toBe(true);
    expect(view.warning).toBeNull();
    expect(view.statusLabel).toBe('Đang mở');
  });

  it('con chang co hang chua xong: CANH BAO nhung KHONG khoa (may chu khong doi dieu do)', () => {
    const view = orderFulfilmentFor({ status: 'OPEN' }, [loaded('IN_TRANSIT')]);
    expect(view.canFulfil).toBe(true);
    expect(view.warning).toContain('Còn 1 chặng có hàng chưa hoàn tất');
  });

  it('don khong co chang nao (thue xe ngoai): van xac nhan duoc, kem canh bao', () => {
    const view = orderFulfilmentFor({ status: 'OPEN' }, []);
    expect(view.canFulfil).toBe(true);
    expect(view.warning).toContain('chưa có chặng có hàng');
  });

  it('chua doc duoc chang: khong doan mot canh bao', () => {
    expect(orderFulfilmentFor({ status: 'OPEN' }, null).warning).toBeNull();
  });

  it.each(['FULFILLED', 'CANCELLED'] as const)('don %s: khong con nut xac nhan', (status) => {
    expect(orderFulfilmentFor({ status }, [loaded('COMPLETED')]).canFulfil).toBe(false);
  });
});

/**
 * BAN GUONG — ma ly do va ma chan dong o web phai la ma CO THAT o API. Cung ly le
 * `transport-actions.spec.ts`: mot ban sao khong duoc lech trong im lang.
 */
describe('ban guong ma cua API', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const API = resolve(HERE, '../../../../../api/src/transport');
  const read = (path: string): string => readFileSync(resolve(API, path), 'utf8');

  it('moi ma ly do web dich sang cau co dau deu la mot ma cua mien movement', () => {
    const source = read('movement/movement-decisions.ts') + read('movement/movement-errors.ts');
    for (const reason of [
      ...Object.keys(LEG_FAILURE_MESSAGE),
      ...Object.keys(ORDER_FAILURE_MESSAGE),
    ]) {
      expect(source, reason).toContain(`'${reason}'`);
    }
  });

  it('bang nhan ma chan dong khop DUNG danh sach RUN_CLOSURE_BLOCKERS cua API', () => {
    const source = read('planning/planning.types.ts');
    const start = source.indexOf('export const RUN_CLOSURE_BLOCKERS = [');
    const end = source.indexOf('\n] as const;', start);
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, end);
    const codes = [...body.matchAll(/^\s+'([A-Z_]+)',/gm)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    );
    expect(Object.keys(CLOSURE_BLOCKER_LABEL).sort()).toEqual([...codes].sort());
  });

  it('canh bao "hang con tren xe" dung DUNG tap CARGO_ON_BOARD cua nguon chan dong', () => {
    const source = read('checkpoint/checkpoint-run-closure-blocker.source.ts');
    const start = source.indexOf('const CARGO_ON_BOARD');
    const end = source.indexOf(']);', start);
    expect(start).toBeGreaterThan(-1);
    const phases = [...source.slice(start, end).matchAll(/'([A-Z_]+)'/g)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    );
    const warned = (
      ['PLANNED', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'] as const
    ).filter((phase) =>
      legWorkflowFor({
        leg: leg({ status: 'IN_TRANSIT' }),
        runCode: 'VC-001',
        runStatus: 'ACTIVE',
        field: { kind: 'KNOWN', phase },
        deliveryRejected: true,
      }).action?.confirmDetail.includes(OVERRIDE_CARGO_WARNING),
    );
    expect(phases.length).toBeGreaterThan(0);
    expect([...warned].sort()).toEqual([...phases].sort());
  });

  it('duong ghi chang cua web la duong CO THAT cua RunsController', () => {
    const controller = read('movement/runs.controller.ts');
    expect(controller).toContain("@Post(':runId/legs/:legId/transition')");
    expect(read('planning/planning.schemas.ts')).toMatch(
      /to: z\.enum\(\['IN_TRANSIT', 'COMPLETED'\]\),\s+overrideReason:/,
    );
  });
});
