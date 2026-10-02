import { describe, expect, it } from 'vitest';
import type { Order, RunAssignment, RunLeg, VehicleRun } from '../movement/movement.types.js';
import type { Driver, Vehicle } from '../transport.types.js';
import type { OperationalAlertFeed } from '../asset-compliance/operational-alerts.js';
import type { RunTimeline, RunTimelineEntry } from '../checkpoint/run-timeline.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import {
  ControlTowerAlertFacts,
  ControlTowerCheckpointFacts,
  ControlTowerFieldFacts,
  ControlTowerClaimFacts,
  ControlTowerCoreFacts,
  ControlTowerFuelFacts,
  type ControlTowerClaimFact,
  type ControlTowerFuelEntryFact,
  type ControlTowerReconciliationFact,
} from './control-tower-facts.port.js';
import { ControlTowerReadService } from './control-tower-read.service.js';
import { isRunningBoardColumn } from './control-tower.types.js';

const TODAY = '2026-09-08';
const NOW = new Date('2026-09-08T03:00:00.000Z');
const RUN_ID = '7c1f0a2e-0000-4000-8000-000000000001';

const policy = { timeZone: 'Asia/Ho_Chi_Minh' } as TransportCorePolicy;

const run = (over: Partial<VehicleRun> = {}): VehicleRun => ({
  id: RUN_ID,
  code: 'VR-001',
  vehicleId: 'b0d1e2f3-0000-4000-8000-000000000001',
  status: 'ACTIVE',
  businessDate: TODAY,
  startedAt: `${TODAY}T01:00:00.000Z`,
  completedAt: null,
  note: null,
  createdAt: `${TODAY}T01:00:00.000Z`,
  updatedAt: `${TODAY}T01:00:00.000Z`,
  cancelledAt: null,
  cancellationReason: null,
  ...over,
});

const leg = (over: Partial<RunLeg> = {}): RunLeg => ({
  id: '9a2b3c4d-0000-4000-8000-000000000001',
  runId: RUN_ID,
  sequence: 1,
  kind: 'LOADED',
  status: 'COMPLETED',
  orderId: null,
  originLabel: 'A',
  destinationLabel: 'B',
  businessDate: TODAY,
  distanceKm: 120,
  plannedDistanceKm: null,
  startedAt: null,
  completedAt: `${TODAY}T05:00:00.000Z`,
  note: null,
  createdAt: `${TODAY}T01:00:00.000Z`,
  updatedAt: `${TODAY}T01:00:00.000Z`,
  ...over,
});

class CoreStub extends ControlTowerCoreFacts {
  constructor(
    private readonly data: {
      runs?: readonly VehicleRun[];
      legs?: readonly RunLeg[];
      assignments?: readonly RunAssignment[];
      vehicles?: readonly Vehicle[];
      drivers?: readonly Driver[];
      orders?: readonly Order[];
    } = {},
  ) {
    super();
  }
  listRuns() {
    return Promise.resolve(this.data.runs ?? []);
  }
  listLegs() {
    return Promise.resolve(this.data.legs ?? []);
  }
  listRunAssignments() {
    return Promise.resolve(this.data.assignments ?? []);
  }
  listVehicles() {
    return Promise.resolve(this.data.vehicles ?? []);
  }
  listDrivers() {
    return Promise.resolve(this.data.drivers ?? []);
  }
  listOrders() {
    return Promise.resolve(this.data.orders ?? []);
  }
}

const timeline = (over: Partial<RunTimeline> = {}): RunTimeline => ({
  runId: RUN_ID,
  entries: [],
  legPhases: {},
  warningCount: 0,
  ...over,
});

const timelineEntry = (over: Partial<RunTimelineEntry> = {}): RunTimelineEntry => ({
  checkpointId: 'cp-1',
  at: new Date(`${TODAY}T04:00:00.000Z`),
  type: 'DELIVERY_ARRIVAL',
  legId: '9a2b3c4d-0000-4000-8000-000000000001',
  recordedBy: 'auth-user-1',
  driverId: 'dd44ee55-0000-4000-8000-000000000001',
  hasLocationProof: false,
  note: null,
  warnings: [],
  ...over,
});

class CheckpointStub extends ControlTowerCheckpointFacts {
  constructor(private readonly value: RunTimeline = timeline()) {
    super();
  }
  timelineForRun(runId: string) {
    return Promise.resolve({ ...this.value, runId });
  }
}

class ThrowingCheckpointStub extends ControlTowerCheckpointFacts {
  timelineForRun(): Promise<RunTimeline> {
    return Promise.reject(new Error('kho moc dang hong'));
  }
}

class ClaimStub extends ControlTowerClaimFacts {
  constructor(private readonly claims: readonly ControlTowerClaimFact[]) {
    super();
  }
  listAwaitingReview() {
    return Promise.resolve(this.claims);
  }
}

class FuelStub extends ControlTowerFuelFacts {
  constructor(
    private readonly entries: readonly ControlTowerFuelEntryFact[] = [],
    private readonly reconciliations: readonly ControlTowerReconciliationFact[] = [],
  ) {
    super();
  }
  listEntriesAwaitingVerification() {
    return Promise.resolve(this.entries);
  }
  listOpenReconciliations() {
    return Promise.resolve(this.reconciliations);
  }
}

class ThrowingFuelStub extends ControlTowerFuelFacts {
  listEntriesAwaitingVerification(): Promise<readonly ControlTowerFuelEntryFact[]> {
    return Promise.reject(new Error('kho nhien lieu dang hong'));
  }
  listOpenReconciliations(): Promise<readonly ControlTowerReconciliationFact[]> {
    return Promise.resolve([]);
  }
}

class AlertStub extends ControlTowerAlertFacts {
  constructor(private readonly feedValue: OperationalAlertFeed) {
    super();
  }
  feed() {
    return Promise.resolve(this.feedValue);
  }
}

/**
 * CONG HIEN TRUONG (`#279` Lane O) — ba cau tra loi, khong mot hang du lieu nao.
 *
 * Mac dinh la RONG chu khong `null`: mot khach BAT `transport-checkpoint` ma hom nay khong xe nao
 * dang cho van la mot cau tra loi hop le, va no phai khac han voi mot khach TAT capability do.
 */
class FieldStub extends ControlTowerFieldFacts {
  constructor(
    private readonly waiting: ReadonlySet<string> = new Set(),
    private readonly pending = 0,
    private readonly missing: ReadonlySet<string> = new Set(),
  ) {
    super();
  }
  listOpenWaitingLegIds() {
    return Promise.resolve(this.waiting);
  }
  countPendingAllowances() {
    return Promise.resolve(this.pending);
  }
  listLegsMissingRequiredDocuments() {
    return Promise.resolve(this.missing);
  }
}

describe('nguon vang mat phai NOI RA, khong duoc im lang', () => {
  it('khach chi bat `transport-core` — bon nguon deu duoc cong bo la thieu', async () => {
    const service = new ControlTowerReadService(new CoreStub(), policy);

    const view = await service.view(NOW);

    expect([...view.unavailableSources].sort()).toEqual([
      'CHECKPOINT',
      'EXPENSE_CLAIMS',
      // `#279` Lane O — phien cho / phu cap / chung tu. TACH khoi `CHECKPOINT`: vang mat `CHECKPOINT`
      // thi ba cot giai doan trong, vang mat cai nay thi cot `WAITING` trong. Hai thu khac nhau.
      'FIELD_OPERATIONS',
      'FUEL',
      'OPERATIONAL_ALERTS',
    ]);
    expect(view.queue).toHaveLength(0);
  });

  it('khach bat du NAM nguon — khong con nguon nao duoc bao la thieu', async () => {
    const service = new ControlTowerReadService(
      new CoreStub(),
      policy,
      new ClaimStub([]),
      new FuelStub(),
      new AlertStub({ generatedFor: TODAY, alerts: [], unavailableSources: [] }),
      new CheckpointStub(),
      undefined,
      new FieldStub(),
    );

    const view = await service.view(NOW);

    expect(view.unavailableSources).toEqual([]);
  });

  /*
   * Kho moc HONG khac han capability moc TAT, nhung o mot diem thi hai tinh huong phai giong nhau:
   * ba cot giai doan deu KHONG duoc hien ra nhu the chung dang trong. Nen ca hai deu ha
   * `legPhasesByRun` xuong `null` — xem `readTimelines()`.
   */
  it('kho moc nem loi: ba cot giai doan dong lai, bang van dung, va nguon duoc cong bo', async () => {
    const service = new ControlTowerReadService(
      new CoreStub({ runs: [run()] }),
      policy,
      undefined,
      undefined,
      undefined,
      new ThrowingCheckpointStub(),
    );

    const view = await service.view(NOW);

    expect(view.unavailableSources).toContain('CHECKPOINT');
    expect(view.board.find((column) => column.column === 'PICKUP')?.unavailableReason).toBe(
      'AWAITING_CHECKPOINT_SOURCE',
    );
    /* Bang van co that: vong chay dang chay van len cot In transit. */
    expect(view.board.find((column) => column.column === 'IN_TRANSIT')?.cards).toHaveLength(1);
  });

  /**
   * MOT NGUON HONG KHONG DUOC LAM HONG CA BANG.
   *
   * Day la bai quan trong nhat cua tep: neu no do, nguoi truc se mat CA cong cu chan doan dung luc
   * mot mien nghiep vu dang hong — tuc dung luc ho can no nhat.
   */
  it('mot nguon nem loi thi chi mat DUNG muc do, phan con lai van dung', async () => {
    const service = new ControlTowerReadService(
      new CoreStub({ vehicles: [] }),
      policy,
      new ClaimStub([{ id: 'claim-1', driverId: 'driver-1' }]),
      new ThrowingFuelStub(),
    );

    const view = await service.view(NOW);

    expect(view.queue.map((item) => item.kind)).toEqual(['EXPENSE_CLAIM_AWAITING_REVIEW']);
    /* Nguon CO BAT — no hong, khong phai vang. Hai tinh huong do hai hanh dong khac nhau. */
    expect(view.unavailableSources).not.toContain('FUEL');
  });
});

describe('hang viec doc duoc tu chinh `transport-core`', () => {
  it('vong chay dang chay ma khong co phan cong hieu luc thi len hang viec, muc CRITICAL', async () => {
    const service = new ControlTowerReadService(new CoreStub({ runs: [run()] }), policy);

    const view = await service.view(NOW);
    const item = view.queue.find((entry) => entry.kind === 'RUN_ACTIVE_WITHOUT_DRIVER');

    expect(item?.severity).toBe('CRITICAL');
    expect(item?.subject).toEqual({ kind: 'RUN', id: RUN_ID, reference: 'VR-001' });
  });

  it('vong chay CO phan cong hieu luc thi khong len hang viec', async () => {
    const assignment: RunAssignment = {
      id: 'aa11bb22-0000-4000-8000-000000000001',
      runId: RUN_ID,
      driverId: 'dd44ee55-0000-4000-8000-000000000001',
      effectiveFrom: `${TODAY}T01:00:00.000Z`,
      effectiveTo: null,
      assignedBy: 'operator',
      createdAt: `${TODAY}T01:00:00.000Z`,
    };
    const service = new ControlTowerReadService(
      new CoreStub({ runs: [run()], assignments: [assignment] }),
      policy,
    );

    const view = await service.view(NOW);

    expect(view.queue.map((entry) => entry.kind)).not.toContain('RUN_ACTIVE_WITHOUT_DRIVER');
  });

  it('chang DA XONG ma thieu km len hang viec, va tro ve dung chang do', async () => {
    const service = new ControlTowerReadService(
      new CoreStub({ runs: [run()], legs: [leg({ distanceKm: null })] }),
      policy,
    );

    const view = await service.view(NOW);
    const item = view.queue.find((entry) => entry.kind === 'RUN_LEG_MISSING_DISTANCE');

    expect(item?.subject.kind).toBe('RUN_LEG');
    expect(item?.subject.id).toBe('9a2b3c4d-0000-4000-8000-000000000001');
    /* Ma vong chay, khong phai `id` — day la thu duoc phep dat len dia chi. */
    expect(item?.subject.reference).toBe('VR-001');
  });

  it('chang CHUA XONG ma thieu km thi CHUA phai viec — no chua den luc nhap', async () => {
    const service = new ControlTowerReadService(
      new CoreStub({ runs: [run()], legs: [leg({ status: 'IN_TRANSIT', distanceKm: null })] }),
      policy,
    );

    const view = await service.view(NOW);

    expect(view.queue.map((entry) => entry.kind)).not.toContain('RUN_LEG_MISSING_DISTANCE');
  });
});

describe('viec CHUA THEO DOI DUOC phai duoc cong bo kem ly do', () => {
  /**
   * BA MUC, khong con nam — `#279` Lane O da lam ra nguon cho HAI muc kia.
   *
   * `RECEIVER_WAITING_ABOVE_THRESHOLD` o lai, nhung voi mot ma ly do KHAC, va khac biet do la ca
   * diem: NGUON da co (mot phien cho co gio mo, dem duoc), cai thieu la mot CHINH SACH — *"cho bao
   * lau thi dang bao dong"*. `#279` O6 cam bia con so do ra.
   */
  it('ba muc, moi muc mot ma ly do doc duoc', async () => {
    const service = new ControlTowerReadService(new CoreStub(), policy);

    const view = await service.view(NOW);

    expect(view.pendingWork).toEqual([
      { kind: 'RECEIVER_WAITING_ABOVE_THRESHOLD', reason: 'AWAITING_WAITING_THRESHOLD_POLICY' },
      { kind: 'CUSTOMER_AR_OVERDUE', reason: 'AWAITING_RECEIVABLE_DUE_DATE_SOURCE' },
      { kind: 'LOCATION_PROOF_REVIEW', reason: 'AWAITING_FLEET_WIDE_PROOF_QUERY' },
    ]);
  });

  /*
   * `#278` N13 bai 2, lop thu hai — o TANG DICH VU.
   *
   * Bai o `control-tower-projection.spec.ts` khoa cot `WAITING`. Bai nay khoa LY DO: sau khi moc da
   * co that, khong muc nao doi phien cho duoc phep con mang `AWAITING_CHECKPOINT_SOURCE`. Neu co,
   * nguoi doc se di tim mot nguon da nam san trong he thong.
   */
  it('sau khi co nguon moc, khong muc nao con vin vao ly do "chua co moc"', async () => {
    const service = new ControlTowerReadService(
      new CoreStub(),
      policy,
      undefined,
      undefined,
      undefined,
      new CheckpointStub(),
    );

    const view = await service.view(NOW);

    expect(view.pendingWork.map((entry) => entry.reason)).not.toContain(
      'AWAITING_CHECKPOINT_SOURCE',
    );
  });
});

describe('moc hien truong — bang doc, khong suy', () => {
  it('ba cot giai doan MO ra khi co nguon moc, va chang dang lam mang giai doan that', async () => {
    const service = new ControlTowerReadService(
      new CoreStub({ runs: [run()], legs: [leg({ status: 'IN_TRANSIT' })] }),
      policy,
      undefined,
      undefined,
      undefined,
      new CheckpointStub(
        timeline({ legPhases: { '9a2b3c4d-0000-4000-8000-000000000001': 'LOADING' } }),
      ),
    );

    const view = await service.view(NOW);
    const loading = view.board.find((column) => column.column === 'LOADING');

    expect(loading?.unavailableReason).toBeNull();
    expect(loading?.cards.map((card) => card.runCode)).toEqual(['VR-001']);
    expect(loading?.cards[0]?.currentLeg?.phase).toBe('LOADING');
  });

  it('canh bao thieu chung cu vi tri len hang viec va tro ve DUNG moc do', async () => {
    const service = new ControlTowerReadService(
      new CoreStub({ runs: [run()] }),
      policy,
      undefined,
      undefined,
      undefined,
      new CheckpointStub(
        timeline({
          entries: [timelineEntry({ warnings: ['LOCATION_PROOF_MISSING'] })],
          warningCount: 1,
        }),
      ),
    );

    const view = await service.view(NOW);
    const item = view.queue.find((entry) => entry.kind === 'CHECKPOINT_LOCATION_PROOF_MISSING');

    expect(item?.severity).toBe('WARNING');
    expect(item?.subject).toEqual({ kind: 'RUN_CHECKPOINT', id: 'cp-1', reference: 'VR-001' });
    expect(item?.detail.checkpointType).toBe('DELIVERY_ARRIVAL');
  });

  it('moc CO chung cu vi tri thi khong sinh viec — canh bao khong phai mot mac dinh', async () => {
    const service = new ControlTowerReadService(
      new CoreStub({ runs: [run()] }),
      policy,
      undefined,
      undefined,
      undefined,
      new CheckpointStub(
        timeline({ entries: [timelineEntry({ hasLocationProof: true, warnings: [] })] }),
      ),
    );

    const view = await service.view(NOW);

    expect(view.queue.map((entry) => entry.kind)).not.toContain(
      'CHECKPOINT_LOCATION_PROOF_MISSING',
    );
  });

  it('ma don doc duoc len the — khong phai `orderId` ky thuat', async () => {
    const order: Order = {
      id: 'o-9',
      code: 'ORD-2026-09-0009',
      status: 'OPEN',
      businessDate: TODAY,
      customerId: null,
      originLabel: 'Ha Noi',
      destinationLabel: 'Hai Phong',
      originPoint: null,
      destinationPoint: null,
      cargoDescription: null,
      freightAmount: null,
      currencyCode: 'VND',
      note: null,
      createdAt: `${TODAY}T01:00:00.000Z`,
      updatedAt: `${TODAY}T01:00:00.000Z`,
      cancelledAt: null,
      cancellationReason: null,
    };
    const service = new ControlTowerReadService(
      new CoreStub({
        runs: [run()],
        legs: [leg({ status: 'IN_TRANSIT', orderId: 'o-9' })],
        orders: [order],
      }),
      policy,
      undefined,
      undefined,
      undefined,
      new CheckpointStub(),
    );

    const view = await service.view(NOW);
    const card = view.board.find((column) => column.column === 'IN_TRANSIT')?.cards[0];

    expect(card?.currentLeg?.orderCode).toBe('ORD-2026-09-0009');
  });
});

/**
 * `#336` BUG-07 — CUNG MOT MAN HINH, HAI CAU TRA LOI CHO "DANG CHAY".
 *
 * UAT 20–21/09/2026 tren `transport-preview` (baseline `8a390cb`): the so "Đang chạy" = 0, cung luc
 * cot "Đang chạy" cua bang co 2 vong chay. Nguyen nhan: the so dem cot `TransportVehicle.status`
 * (mot cot CHINH TAY — luong Order-first/Lane W khong co duong ghi nao dat `ON_TRIP`), con bang dem
 * `VehicleRun`. Hai nguon, hai con so.
 *
 * Cac bai duoi day chay tren DUNG khung nhin ma man hinh nhan (`view.fleet` canh `view.board`), vi
 * loi nam o cho hai nua do dat canh nhau — mot bai chi o tang phep chieu se khong thay no.
 */
describe('#336 — "Đang chạy" tren the so va tren bang la MOT dinh nghia', () => {
  const vehicle = (over: Partial<Vehicle> = {}): Vehicle => ({
    id: 'b0d1e2f3-0000-4000-8000-000000000001',
    registrationPlate: '29C-123.45',
    vehicleClass: 'TRACTOR',
    allowedPayloadKg: 20000,
    currentOdoKm: 100_000,
    status: 'IDLE',
    operationalControl: 'INTERNAL_OPERATED',
    ownershipRegisterComplete: false,
    createdAt: `${TODAY}T00:00:00.000Z`,
    updatedAt: `${TODAY}T00:00:00.000Z`,
    ...over,
  });

  /**
   * DU LIEU UAT: hai xe, hai vong chay `ACTIVE`, chua ai bam moc nao.
   *
   * Hai xe van luu `IDLE` — va do KHONG phai du lieu hong: khong co route nao dat `ON_TRIP`
   * (`fleet-status.controller.ts`), con §7.2 cua hop dong mien noi thang `ON_TRIP` la DAN XUAT.
   */
  const uatCore = (): CoreStub =>
    new CoreStub({
      vehicles: [
        vehicle({ id: 'veh-1', registrationPlate: '29C-111.11' }),
        vehicle({ id: 'veh-2', registrationPlate: '29C-222.22' }),
      ],
      runs: [
        run({ id: 'run-1', code: 'VR-101', vehicleId: 'veh-1' }),
        run({ id: 'run-2', code: 'VR-102', vehicleId: 'veh-2' }),
      ],
      legs: [leg({ status: 'PLANNED', completedAt: null, distanceKm: null })],
    });

  const runningOnBoard = (view: Awaited<ReturnType<ControlTowerReadService['view']>>): number =>
    view.board
      .filter((column) => isRunningBoardColumn(column.column))
      .reduce((sum, column) => sum + column.total, 0);

  it.each([
    ['khach BAT moc, chua ai bam', () => new CheckpointStub()],
    ['khach TAT moc', () => undefined],
    ['kho moc dang hong', () => new ThrowingCheckpointStub()],
  ])(
    'du lieu UAT (%s): the so bang dung so vong chay dang chay tren bang',
    async (_, checkpoints) => {
      const service = new ControlTowerReadService(
        uatCore(),
        policy,
        undefined,
        undefined,
        undefined,
        checkpoints(),
      );

      const view = await service.view(NOW);

      /* Tai hien dung quan sat UAT: hai the nam o cot mac dinh cua vong chay dang chay. */
      expect(view.board.find((column) => column.column === 'IN_TRANSIT')?.total).toBe(2);
      expect(runningOnBoard(view)).toBe(2);

      /* Truoc ban sua: `onTrip` = 0 vi ca hai xe van luu `IDLE`. */
      expect(view.fleet.onTrip).toBe(runningOnBoard(view));
      expect(view.fleet.runningRuns).toBe(runningOnBoard(view));
    },
  );

  it('du lieu UAT: xe dang chay KHONG con bi dem la dang ranh — doi xe khep kin', async () => {
    const service = new ControlTowerReadService(uatCore(), policy);

    const { fleet } = await service.view(NOW);

    /* Truoc ban sua: `idle` = 2 — hai xe dang chay bi dem them mot lan nua o o "Đang rảnh". */
    expect(fleet.idle).toBe(0);
    expect(fleet.onTrip + fleet.idle + fleet.underMaintenance).toBe(fleet.total);
  });

  /*
   * MOT XE, HAI VONG CHAY `ACTIVE` — ca review PR `#344` neu ra. Tren khung nhin that, the so dem XE
   * (1), con `runningRuns` — con so dong "Vòng chạy đang chạy" tren bang in ra — dem VONG CHAY (2) va
   * phai bang dung so the o nam cot dang chay, khong phai so xe.
   */
  it('1 xe mo 2 vong chay ACTIVE: onTrip dem 1 XE, runningRuns dem 2 VONG CHAY', async () => {
    const service = new ControlTowerReadService(
      new CoreStub({
        vehicles: [vehicle({ id: 'veh-1', registrationPlate: '29C-111.11' })],
        runs: [
          run({ id: 'run-1', code: 'VR-101', vehicleId: 'veh-1' }),
          run({ id: 'run-2', code: 'VR-102', vehicleId: 'veh-1' }),
        ],
        legs: [leg({ status: 'PLANNED', completedAt: null, distanceKm: null })],
      }),
      policy,
    );

    const view = await service.view(NOW);

    expect(view.fleet).toMatchObject({
      total: 1,
      onTrip: 1,
      idle: 0,
      underMaintenance: 0,
      runningRuns: 2,
    });
    expect(runningOnBoard(view)).toBe(2);
  });

  /**
   * FAIL-CLOSED. The so "Đang chạy" gio PHU THUOC kho vong chay; truoc day no chi doc xe. Mot lan
   * doc vong chay that bai ma van tra ve mot khung nhin se in "Đang chạy 0 · Đang rảnh 2" — dung
   * cau noi sai ma `#336` bao cao, lan nay vi mot loi kho thay vi mot loi dinh nghia.
   */
  it('kho vong chay hong thi ca khung nhin hong — khong in ra mot so 0 gia', async () => {
    class ThrowingRunsCore extends CoreStub {
      override listRuns(): Promise<readonly VehicleRun[]> {
        return Promise.reject(new Error('kho vong chay dang hong'));
      }
    }
    const service = new ControlTowerReadService(
      new ThrowingRunsCore({ vehicles: [vehicle({ id: 'veh-1' })] }),
      policy,
    );

    await expect(service.view(NOW)).rejects.toThrow('kho vong chay dang hong');
  });
});

describe('tat dinh', () => {
  it('hai lan doc cung du lieu cho ra cung khung nhin', async () => {
    const build = () =>
      new ControlTowerReadService(
        new CoreStub({ runs: [run(), run({ id: 'r2', code: 'VR-002', status: 'PLANNED' })] }),
        policy,
        new ClaimStub([
          { id: 'c2', driverId: 'd2' },
          { id: 'c1', driverId: 'd1' },
        ]),
      );

    expect(await build().view(NOW)).toEqual(await build().view(NOW));
  });

  it('`queueTotal` la so muc that, khong phai do dai mot danh sach da cat', async () => {
    const service = new ControlTowerReadService(
      new CoreStub(),
      policy,
      new ClaimStub([
        { id: 'c1', driverId: 'd1' },
        { id: 'c2', driverId: 'd2' },
        { id: 'c3', driverId: 'd3' },
      ]),
    );

    const view = await service.view(NOW);

    expect(view.queueTotal).toBe(3);
    expect(view.queue).toHaveLength(3);
  });

  it('ngay nghiep vu tinh theo mui gio tenant, khong theo UTC', async () => {
    const service = new ControlTowerReadService(new CoreStub(), policy);

    /* 2026-09-08T17:30Z la 00:30 ngay 09/09 o Asia/Ho_Chi_Minh (`INV-25`). */
    const view = await service.view(new Date('2026-09-08T17:30:00.000Z'));

    expect(view.generatedFor).toBe('2026-09-09');
  });
});
