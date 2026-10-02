import type { Page, Route } from '@playwright/test';

/**
 * MAY CHU GIA CO TRANG THAI cho `office-leg-lifecycle.spec.ts` (`#376`).
 *
 * Tach khoi tep bai kiem theo dung khuon `lifecycle-server.ts`: tep bai chi con cac buoc tren man
 * hinh, con "the gioi" (don, vong chay, chang, ke hoach, moc) va luat CHEP LAI tu API nam o day.
 * Van phong va lai xe dung CHUNG mot `World`: moc lai xe ghi vao dung cho man van phong doc ra.
 *
 * Luat duoc chep lai o muc du de man hinh bi do dung cach — khong hon: phan xu dong vong chay
 * (`evaluateRunClosure` + `CARGO_STILL_CARRIED`), cong hien truong cua chang co hang
 * (`LEG_FIELD_DELIVERY_NOT_RECORDED`), may trang thai chang, hang cho "Kết thúc đơn" chi nhan don
 * `FULFILLED`. Luat THAT duoc do o `apps/api`.
 */

const TODAY = '2026-09-23';
export const DEPOT = 'Bãi xe Hà Nội';
export const PLATE = '29H-123.45';
export const HANOI = { latitude: 21.0285, longitude: 105.8542 };
export const ORDER_CODE = 'DH-376-01';

type Role = 'ADMIN' | 'ACCOUNTING' | 'SALE';
type OrderStatus = 'OPEN' | 'FULFILLED' | 'CANCELLED';
type RunStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
type LegStatus = 'PLANNED' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
type LegKind = 'LOADED' | 'EMPTY';
type Checkpoint = 'PICKUP_ARRIVAL' | 'PICKUP_DEPARTURE' | 'DELIVERY_ARRIVAL' | 'DELIVERY_ACCEPTED';
type Phase = 'AT_PICKUP' | 'IN_TRANSIT' | 'ARRIVED' | 'DELIVERED';

interface OrderRow {
  id: string;
  code: string;
  status: OrderStatus;
  businessDate: string;
  customerId: string;
  originLabel: string;
  destinationLabel: string;
  cargoDescription: string | null;
  freightAmount: number;
  currencyCode: 'VND';
  note: null;
  cancelledAt: null;
  cancellationReason: null;
}

interface RunRow {
  id: string;
  code: string;
  vehicleId: string;
  status: RunStatus;
  businessDate: string;
  startedAt: string | null;
  completedAt: string | null;
  note: null;
  cancelledAt: null;
  cancellationReason: null;
}

interface LegRow {
  id: string;
  runId: string;
  sequence: number;
  kind: LegKind;
  status: LegStatus;
  orderId: string | null;
  originLabel: string;
  destinationLabel: string;
  businessDate: string;
  distanceKm: number | null;
  plannedDistanceKm: number | null;
  note: null;
  startedAt: string | null;
  completedAt: string | null;
  /** Moc lai xe DA ghi tren chang — nguon cua cot "Hiện trường". */
  recorded: Checkpoint[];
}

interface PlanRow {
  id: string;
  orderId: string;
  runId: string;
  vehicleId: string;
  loadedLegId: string;
  emptyLegId: string | null;
  grouping: 'ONE_ORDER_PER_RUN';
  outcome: 'NEW_RUN';
  businessDate: string;
  createdAt: string;
  cancelledAt: null;
  cancellationReason: null;
}

export interface Write {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

export interface World {
  readonly orders: OrderRow[];
  readonly runs: RunRow[];
  readonly legs: LegRow[];
  readonly plans: PlanRow[];
  /** MOI lenh ghi ma may chu gia nhan, theo thu tu. */
  readonly writes: Write[];
  /** Duong `/transport|auth` ma may chu gia chua co — de mot bai do noi ro no thieu gi. */
  readonly unhandled: string[];
  /** Bao cao vong chay (nguon cot "Hiện trường") dang hong — 503. */
  journeyDown: boolean;
  /**
   * Lan tien chang KE TIEP bi guard quyen tu choi — cung than `403` voi `actionNotPermitted` cua may
   * chu tu `#395`: `reason: 'ACTION_NOT_PERMITTED'`, cau co dau, ma hanh dong o `detail.action`.
   */
  denyNextLegWrite: boolean;
  tick: number;
}

const json = async (route: Route, body: unknown, status = 200): Promise<void> => {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
};

/** Cau cua `TransportActionGuard` khi thieu quyen van tai (`transport-access-errors.ts`). */
export const ACTION_NOT_PERMITTED_MESSAGE = 'Bạn không có quyền thực hiện thao tác này.';

/** Than loi CO KIEU cua mien — dung hinh dang `transportErrorBody` (`#168 B7`). */
const denied = (route: Route, reason: string, message: string, status = 403): Promise<void> =>
  json(route, { statusCode: status, message, error: 'Forbidden', reason }, status);

export const now = (world: World): string => {
  world.tick += 1;
  return new Date(Date.UTC(2026, 8, 23, 3, 0, world.tick)).toISOString();
};

export const order = (id: string, code: string, destinationLabel = 'Ninh Bình'): OrderRow => ({
  id,
  code,
  status: 'OPEN',
  businessDate: TODAY,
  customerId: 'cus-1',
  originLabel: 'Kho Hải Phòng',
  destinationLabel,
  cargoDescription: 'Gạch men 12 pallet',
  freightAmount: 5_000_000,
  currencyCode: 'VND',
  note: null,
  cancelledAt: null,
  cancellationReason: null,
});

export const createWorld = (orders: OrderRow[]): World => ({
  orders,
  runs: [],
  legs: [],
  plans: [],
  writes: [],
  unhandled: [],
  journeyDown: false,
  denyNextLegWrite: false,
  tick: 0,
});

/* ------------------------------------------------------------------ *
 * LUAT CHEP LAI TU API — du de man hinh bi do dung cach
 * ------------------------------------------------------------------ */

/** `deriveLegPhase` — `null` khi chang chua co moc nao (chang vang khoi `legPhases`). */
const phaseOf = (recorded: readonly Checkpoint[]): Phase | null => {
  if (recorded.includes('DELIVERY_ACCEPTED')) return 'DELIVERED';
  if (recorded.includes('DELIVERY_ARRIVAL')) return 'ARRIVED';
  if (recorded.includes('PICKUP_DEPARTURE')) return 'IN_TRANSIT';
  if (recorded.includes('PICKUP_ARRIVAL')) return 'AT_PICKUP';
  return null;
};

/** `CARGO_ON_BOARD` cua `checkpoint-run-closure-blocker.source.ts` (khong co LOADING o day). */
const carriesCargo = (leg: LegRow): boolean => {
  const phase = phaseOf(leg.recorded);
  return phase === 'IN_TRANSIT' || phase === 'ARRIVED';
};

const isOpen = (leg: LegRow): boolean => leg.status === 'PLANNED' || leg.status === 'IN_TRANSIT';

export const legsOf = (world: World, runId: string): LegRow[] =>
  world.legs.filter((leg) => leg.runId === runId).sort((a, b) => a.sequence - b.sequence);

/** `evaluateRunClosure` + nguon chan `CARGO_STILL_CARRIED`. */
const verdictFor = (world: World, run: RunRow) => {
  const legs = legsOf(world, run.id);
  const blockers: string[] = [];
  if (run.status !== 'ACTIVE') blockers.push('RUN_NOT_ACTIVE');
  if (legs.some(isOpen)) blockers.push('LEG_STILL_OPEN');
  const openPlans = world.plans.filter(
    (plan) =>
      plan.runId === run.id && world.legs.some((leg) => leg.id === plan.loadedLegId && isOpen(leg)),
  );
  if (openPlans.length > 0) blockers.push('PLAN_STILL_OPEN');
  const completed = legs
    .filter((leg) => leg.status === 'COMPLETED' && leg.completedAt !== null)
    .sort(
      (a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? '') || a.sequence - b.sequence,
    )
    .at(-1);
  if (completed === undefined) blockers.push('NO_COMPLETED_WORK');
  if (legs.some(carriesCargo)) blockers.push('CARGO_STILL_CARRIED');

  if (blockers.length > 0 || completed === undefined) {
    return { closable: false, trigger: null, blockers, holding: false };
  }
  if (completed.destinationLabel === DEPOT) {
    return { closable: true, trigger: 'DEPOT_RETURN', blockers: [], holding: false };
  }
  return { closable: false, trigger: null, blockers: [], holding: true };
};

const LEG_EDGES: Readonly<Record<LegStatus, readonly LegStatus[]>> = {
  PLANNED: ['IN_TRANSIT'],
  IN_TRANSIT: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

/* ------------------------------------------------------------------ *
 * KHUNG NHIN may chu tra ve
 * ------------------------------------------------------------------ */

const orderCodeOf = (world: World, orderId: string | null): string | null =>
  orderId === null ? null : (world.orders.find((entry) => entry.id === orderId)?.code ?? null);

const legView = ({ recorded: _recorded, ...leg }: LegRow) => leg;

const distance = {
  loadedKm: 0,
  emptyKm: 0,
  totalKm: 0,
  emptyRatio: null,
  complete: false,
  legsMissingDistance: { loaded: 1, empty: 1 },
  countedLegs: 0,
};

const journeyOf = (world: World, run: RunRow) => ({
  run: {
    runId: run.id,
    runCode: run.code,
    vehicleId: run.vehicleId,
    vehiclePlate: PLATE,
    status: run.status,
    businessDate: run.businessDate,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    driverId: 'drv-1',
  },
  distance,
  orderCodes: [],
  legs: legsOf(world, run.id).map((leg) => ({
    legId: leg.id,
    sequence: leg.sequence,
    kind: leg.kind,
    status: leg.status,
    orderCode: orderCodeOf(world, leg.orderId),
    originLabel: leg.originLabel,
    destinationLabel: leg.destinationLabel,
    businessDate: leg.businessDate,
    distanceKm: leg.distanceKm,
    plannedDistanceKm: leg.plannedDistanceKm,
    startedAt: leg.startedAt,
    completedAt: leg.completedAt,
    phase: phaseOf(leg.recorded),
  })),
  timeline: [],
  unavailableSources: [],
});

const PHASE_COLUMN: Readonly<Record<Phase, string>> = {
  AT_PICKUP: 'PICKUP',
  IN_TRANSIT: 'IN_TRANSIT',
  ARRIVED: 'ARRIVED',
  DELIVERED: 'IN_TRANSIT',
};

/** `buildOperationsBoard` — cot theo trang thai vong chay, BEN TRONG `ACTIVE` theo chang dang lam. */
const controlTowerOf = (world: World) => {
  const columns = ['PLANNED', 'PICKUP', 'LOADING', 'IN_TRANSIT', 'ARRIVED', 'WAITING', 'DELIVERED'];
  const byColumn = new Map<string, unknown[]>();
  for (const run of world.runs) {
    const legs = legsOf(world, run.id);
    const current =
      legs.find((leg) => isOpen(leg) && phaseOf(leg.recorded) !== 'DELIVERED') ?? null;
    const column =
      run.status === 'PLANNED'
        ? 'PLANNED'
        : run.status === 'COMPLETED'
          ? 'DELIVERED'
          : run.status === 'ACTIVE'
            ? (() => {
                const phase = current === null ? null : phaseOf(current.recorded);
                return phase === null ? 'IN_TRANSIT' : PHASE_COLUMN[phase];
              })()
            : null;
    if (column === null) continue;
    const card = {
      runId: run.id,
      runCode: run.code,
      vehicleId: run.vehicleId,
      businessDate: run.businessDate,
      driverId: 'drv-1',
      loadedLegs: legs.filter((leg) => leg.kind === 'LOADED').length,
      emptyLegs: legs.filter((leg) => leg.kind === 'EMPTY').length,
      totalKm: null,
      emptyKm: null,
      currentLeg:
        current === null
          ? null
          : {
              legId: current.id,
              sequence: current.sequence,
              kind: current.kind,
              orderCode: orderCodeOf(world, current.orderId),
              phase: phaseOf(current.recorded),
            },
    };
    byColumn.set(column, [...(byColumn.get(column) ?? []), card]);
  }
  const running = world.runs.filter((run) => run.status === 'ACTIVE').length;
  return {
    generatedFor: TODAY,
    board: columns.map((column) => ({
      column,
      cards: byColumn.get(column) ?? [],
      total: (byColumn.get(column) ?? []).length,
      unavailableReason: null,
    })),
    fleet: {
      total: 1,
      idle: running > 0 ? 0 : 1,
      onTrip: running > 0 ? 1 : 0,
      underMaintenance: 0,
      activeDrivers: 1,
      runningRuns: running,
    },
    queue: [],
    queueTotal: 0,
    unavailableSources: [],
    pendingWork: [],
  };
};

/** Hang cho "Kết thúc đơn" — CHI don `FULFILLED` (`AcceptanceMovementFacts.listCompletableOrders`). */
const completionQueueOf = (world: World) =>
  world.orders
    .filter((entry) => entry.status === 'FULFILLED')
    .map((entry) => {
      const plan = world.plans.find((candidate) => candidate.orderId === entry.id);
      return {
        acceptanceId: null,
        orderId: entry.id,
        orderCode: entry.code,
        orderStatus: entry.status,
        customerId: entry.customerId,
        originLabel: entry.originLabel,
        destinationLabel: entry.destinationLabel,
        state: 'PENDING',
        counterpartyId: null,
        businessDate: entry.businessDate,
        evidenceCount: 0,
        settlementEligible: false,
        runCode: world.runs.find((run) => run.id === plan?.runId)?.code ?? null,
        vehicleId: plan?.vehicleId ?? null,
        latestDecidedAt: null,
        latestDecidedBy: null,
        latestDecidedByActor: null,
      };
    });

/* ------------------------------------------------------------------ *
 * HIEN TRUONG cua lai xe
 * ------------------------------------------------------------------ */

export const FIELD_FLOW: readonly {
  readonly type: Checkpoint;
  readonly label: string;
  readonly requiresLocation: boolean;
  readonly after: Checkpoint | null;
}[] = [
  { type: 'PICKUP_ARRIVAL', label: 'Đã tới điểm lấy hàng', requiresLocation: false, after: null },
  {
    type: 'PICKUP_DEPARTURE',
    label: 'Rời điểm lấy hàng',
    requiresLocation: false,
    after: 'PICKUP_ARRIVAL',
  },
  {
    type: 'DELIVERY_ARRIVAL',
    label: 'Đã đến nơi',
    requiresLocation: true,
    after: 'PICKUP_DEPARTURE',
  },
  {
    type: 'DELIVERY_ACCEPTED',
    label: 'Khách đã nhận hàng',
    requiresLocation: true,
    after: 'DELIVERY_ARRIVAL',
  },
];

/** `fieldActionsFor` rut gon: chang RONG va chang da ket thuc khong moi moc hang nao. */
const nextActionsOf = (leg: LegRow, run: RunRow) => {
  if (leg.kind === 'EMPTY' || !isOpen(leg)) return [];
  if (run.status === 'COMPLETED' || run.status === 'CANCELLED') return [];
  return FIELD_FLOW.filter(
    (step) =>
      !leg.recorded.includes(step.type) &&
      (step.after === null || leg.recorded.includes(step.after)),
  ).map((step) => ({
    kind: 'CHECKPOINT',
    label: step.label,
    checkpointType: step.type,
    requiresLocation: step.requiresLocation,
    required: true,
  }));
};

const fieldWorkOf = (world: World) => ({
  serverNow: `${TODAY}T03:00:00.000Z`,
  runs: world.runs
    .filter((run) => run.status === 'PLANNED' || run.status === 'ACTIVE')
    .map((run) => ({
      runId: run.id,
      runCode: run.code,
      legs: legsOf(world, run.id).map((leg) => ({
        legId: leg.id,
        sequence: leg.sequence,
        kind: leg.kind,
        originLabel: leg.originLabel,
        destinationLabel: leg.destinationLabel,
        orderCode: orderCodeOf(world, leg.orderId),
        orderId: leg.orderId,
        phase: phaseOf(leg.recorded) ?? 'PLANNED',
        recordedTypes: leg.recorded,
        arrivalCheckpointId: leg.recorded.includes('DELIVERY_ARRIVAL') ? `cp-${leg.id}-arr` : null,
        waiting: null,
        documents: [],
        missingDocumentTypes: [],
        receiptHandover: null,
        nextActions: nextActionsOf(leg, run),
      })),
    })),
});

/* ------------------------------------------------------------------ *
 * LENH GHI
 * ------------------------------------------------------------------ */

export const commitPlan = (world: World, orderId: string): { run: RunRow; legs: LegRow[] } => {
  const target = world.orders.find((entry) => entry.id === orderId);
  if (target === undefined) throw new Error(`khong co don ${orderId}`);
  const sequence = world.runs.length + 1;
  const run: RunRow = {
    id: `run-${sequence}`,
    code: `VC-00${sequence}`,
    vehicleId: 'veh-1',
    status: 'PLANNED',
    businessDate: TODAY,
    startedAt: null,
    completedAt: null,
    note: null,
    cancelledAt: null,
    cancellationReason: null,
  };
  const base = { runId: run.id, businessDate: TODAY, distanceKm: null, note: null };
  const legs: LegRow[] = [
    {
      ...base,
      id: `${run.id}-leg-1`,
      sequence: 1,
      kind: 'EMPTY',
      status: 'PLANNED',
      orderId: null,
      originLabel: DEPOT,
      destinationLabel: target.originLabel,
      plannedDistanceKm: 12,
      startedAt: null,
      completedAt: null,
      recorded: [],
    },
    {
      ...base,
      id: `${run.id}-leg-2`,
      sequence: 2,
      kind: 'LOADED',
      status: 'PLANNED',
      orderId,
      originLabel: target.originLabel,
      destinationLabel: target.destinationLabel,
      plannedDistanceKm: 132,
      startedAt: null,
      completedAt: null,
      recorded: [],
    },
  ];
  world.runs.push(run);
  world.legs.push(...legs);
  world.plans.push({
    id: `plan-${orderId}`,
    orderId,
    runId: run.id,
    vehicleId: 'veh-1',
    loadedLegId: `${run.id}-leg-2`,
    emptyLegId: `${run.id}-leg-1`,
    grouping: 'ONE_ORDER_PER_RUN',
    outcome: 'NEW_RUN',
    businessDate: TODAY,
    createdAt: now(world),
    cancelledAt: null,
    cancellationReason: null,
  });
  return { run, legs };
};

/** `POST /transport/runs/:runId/legs/:legId/transition` — cung thu tu cong voi `transitionLeg`. */
const transitionLeg = async (
  world: World,
  route: Route,
  runId: string,
  legId: string,
): Promise<void> => {
  const body = route.request().postDataJSON() as { to: LegStatus; overrideReason?: string };
  if (world.denyNextLegWrite) {
    world.denyNextLegWrite = false;
    await json(
      route,
      {
        statusCode: 403,
        message: ACTION_NOT_PERMITTED_MESSAGE,
        error: 'Forbidden',
        reason: 'ACTION_NOT_PERMITTED',
        detail: { action: 'transport.run.manage' },
      },
      403,
    );
    return;
  }
  const leg = world.legs.find((entry) => entry.id === legId && entry.runId === runId);
  const run = world.runs.find((entry) => entry.id === runId);
  if (leg === undefined || run === undefined) {
    await denied(route, 'RUN_LEG_NOT_FOUND', 'Khong tim thay chang do trong vong chay nay.', 404);
    return;
  }
  if (run.status === 'COMPLETED' || run.status === 'CANCELLED') {
    await denied(
      route,
      'LEG_RUN_TERMINAL',
      'Vong chay da o trang thai cuoi, khong them chang duoc',
    );
    return;
  }
  if (!LEG_EDGES[leg.status].includes(body.to)) {
    await denied(
      route,
      'LEG_TRANSITION_NOT_PERMITTED',
      'May trang thai khong cho phep buoc chuyen nay',
    );
    return;
  }
  const delivered = phaseOf(leg.recorded) === 'DELIVERED';
  if (body.to === 'COMPLETED' && leg.kind === 'LOADED' && !delivered && !body.overrideReason) {
    await denied(
      route,
      'LEG_FIELD_DELIVERY_NOT_RECORDED',
      'Hien truong chua ghi nguoi nhan da nhan hang — chua hoan tat duoc chang co hang',
    );
    return;
  }

  const at = now(world);
  leg.status = body.to;
  if (body.to === 'IN_TRANSIT') leg.startedAt = at;
  if (body.to === 'COMPLETED') leg.completedAt = at;
  if (body.to === 'IN_TRANSIT' && run.status === 'PLANNED') {
    run.status = 'ACTIVE';
    run.startedAt = at;
  }

  // PHAN XU DONG chay SAU lan ghi chang — `closures.attempt(runId, 'LEG_CHANGED')`.
  const verdict = verdictFor(world, run);
  const closed = verdict.closable && run.status === 'ACTIVE';
  if (closed) {
    run.status = 'COMPLETED';
    run.completedAt = now(world);
  }
  await json(route, {
    leg: legView(leg),
    closure: { runId: run.id, verdict, closed, run: { ...run } },
  });
};

const transitionOrder = async (world: World, route: Route, orderId: string): Promise<void> => {
  const target = world.orders.find((entry) => entry.id === orderId);
  if (target === undefined) {
    await denied(route, 'ORDER_NOT_FOUND', 'Khong tim thay nghia vu.', 404);
    return;
  }
  if (target.status !== 'OPEN') {
    await denied(route, 'ORDER_ALREADY_TERMINAL', 'Nghia vu da o trang thai cuoi');
    return;
  }
  target.status = 'FULFILLED';
  await json(route, { ...target });
};

const recordCheckpoint = async (world: World, route: Route): Promise<void> => {
  const body = route.request().postDataJSON() as {
    type: Checkpoint;
    legId: string;
    observationId?: string;
  };
  const leg = world.legs.find((entry) => entry.id === body.legId);
  const step = FIELD_FLOW.find((entry) => entry.type === body.type);
  if (leg === undefined || step === undefined) {
    await json(route, { statusCode: 400, message: 'Moc khong hop le' }, 400);
    return;
  }
  if (!isOpen(leg)) {
    await denied(
      route,
      'CHECKPOINT_LEG_TERMINAL',
      'Chặng đã kết thúc — không ghi thêm mốc vào chặng này.',
      409,
    );
    return;
  }
  if (step.requiresLocation && body.observationId === undefined) {
    await json(route, { statusCode: 400, message: 'Moc nay can vi tri' }, 400);
    return;
  }
  if (!leg.recorded.includes(body.type)) leg.recorded.push(body.type);
  await json(route, { id: `cp-${leg.id}-${body.type}` }, 201);
};

/* ------------------------------------------------------------------ *
 * MAY CHU GIA — mot trinh xu ly, dispatch theo (phuong thuc, duong dan)
 * ------------------------------------------------------------------ */

const USERS: Readonly<Record<Role, { id: string; name: string }>> = {
  ADMIN: { id: 'u-owner', name: 'Chủ doanh nghiệp' },
  ACCOUNTING: { id: 'u-ke-toan', name: 'Kế toán Hà' },
  SALE: { id: 'u-driver', name: 'Lái xe Bình' },
};

const CUSTOMERS = [
  {
    id: 'cus-1',
    name: 'Công ty Hoà Phát',
    phone: null,
    address: null,
    taxCode: null,
    status: 'ACTIVE',
    createdAt: `${TODAY}T00:00:00.000Z`,
    updatedAt: `${TODAY}T00:00:00.000Z`,
  },
];

const VEHICLES = [{ id: 'veh-1', registrationPlate: PLATE }];

export async function serve(page: Page, world: World, role: Role): Promise<void> {
  await page.route(/\/(transport|auth)\//, async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;
    if (method !== 'GET' && !path.startsWith('/auth/')) {
      world.writes.push({ method, path, body: request.postDataJSON() as unknown });
    }
    const match = (pattern: RegExp): RegExpExecArray | null => pattern.exec(path);
    let found: RegExpExecArray | null;

    if (path === '/auth/config') return json(route, { mode: 'session' });
    if (path === '/auth/csrf') return json(route, { csrfToken: 'csrf-376' });
    if (path === '/auth/me') {
      const user = USERS[role];
      return json(route, { user: { ...user, username: user.id, role }, roles: [role] });
    }

    if (method === 'GET') {
      if (path === '/transport/customers') return json(route, CUSTOMERS);
      if (path === '/transport/vehicles') return json(route, VEHICLES);
      if (path === '/transport/orders') return json(route, world.orders);
      if (path === '/transport/runs') return json(route, world.runs);
      if (path === '/transport/control-tower') return json(route, controlTowerOf(world));
      if (path === '/transport/commercial-acceptance') {
        return json(route, { acceptances: completionQueueOf(world) });
      }
      if (path === '/transport/planning/policy') {
        return json(route, {
          grouping: 'ONE_ORDER_PER_RUN',
          depots: [{ code: 'DEPOT-HN', label: DEPOT }],
          closure: { idleHours: 12 },
        });
      }
      if (path === '/transport/me/trips') return json(route, []);
      if (path === '/transport/me/field-work') return json(route, fieldWorkOf(world));
      if ((found = match(/^\/transport\/orders\/([^/]+)\/legs$/))) {
        const orderId = found[1];
        return json(route, world.legs.filter((leg) => leg.orderId === orderId).map(legView));
      }
      if ((found = match(/^\/transport\/planning\/orders\/([^/]+)\/plans$/))) {
        const orderId = found[1];
        return json(
          route,
          world.plans.filter((plan) => plan.orderId === orderId),
        );
      }
      if ((found = match(/^\/transport\/planning\/runs\/([^/]+)\/closure$/))) {
        const run = world.runs.find((entry) => entry.id === found?.[1]);
        return run === undefined ? json(route, {}, 404) : json(route, verdictFor(world, run));
      }
      if ((found = match(/^\/transport\/journey\/runs\/([^/]+)$/))) {
        if (world.journeyDown) return json(route, { message: 'Tạm thời không đọc được.' }, 503);
        const ref = found[1];
        const run = world.runs.find((entry) => entry.id === ref || entry.code === ref);
        return run === undefined ? json(route, {}, 404) : json(route, journeyOf(world, run));
      }
      if ((found = match(/^\/transport\/runs\/([^/]+)\/movement$/))) {
        return json(route, { actual: distance, planned: distance, cancelledLegs: 0 });
      }
      if ((found = match(/^\/transport\/runs\/([^/]+)$/))) {
        const run = world.runs.find((entry) => entry.id === found?.[1]);
        if (run === undefined) return json(route, {}, 404);
        return json(route, {
          run,
          legs: legsOf(world, run.id).map(legView),
          activeAssignment: {
            id: `asg-${run.id}`,
            runId: run.id,
            driverId: 'drv-1',
            effectiveFrom: `${TODAY}T02:00:00.000Z`,
            effectiveTo: null,
            assignedBy: 'u-owner',
          },
        });
      }
    }

    if (method === 'POST') {
      if ((found = match(/^\/transport\/planning\/orders\/([^/]+)\/preview$/))) {
        const target = world.orders.find((entry) => entry.id === found?.[1]);
        if (target === undefined) return json(route, {}, 404);
        return json(route, {
          orderId: target.id,
          vehicleId: 'veh-1',
          grouping: 'ONE_ORDER_PER_RUN',
          outcome: 'NEW_RUN',
          runId: null,
          runCode: null,
          startsFrom: DEPOT,
          startSource: 'DEPOT',
          emptyLegRequired: true,
          legs: [
            {
              sequence: 1,
              kind: 'EMPTY',
              orderId: null,
              originLabel: DEPOT,
              destinationLabel: target.originLabel,
              plannedDistanceKm: 12,
            },
            {
              sequence: 2,
              kind: 'LOADED',
              orderId: target.id,
              originLabel: target.originLabel,
              destinationLabel: target.destinationLabel,
              plannedDistanceKm: 132,
            },
          ],
        });
      }
      if ((found = match(/^\/transport\/planning\/orders\/([^/]+)\/plan$/))) {
        const orderId = found[1] ?? '';
        const { run, legs } = commitPlan(world, orderId);
        return json(route, { plan: world.plans.at(-1), run, legs: legs.map(legView) }, 201);
      }
      if ((found = match(/^\/transport\/runs\/([^/]+)\/legs\/([^/]+)\/transition$/))) {
        return transitionLeg(world, route, found[1] ?? '', found[2] ?? '');
      }
      if ((found = match(/^\/transport\/orders\/([^/]+)\/transition$/))) {
        return transitionOrder(world, route, found[1] ?? '');
      }
      if (path === '/transport/me/tracking/sessions') {
        return json(route, { id: 'sess-1', runId: 'run-1', tripId: null, status: 'ACTIVE' }, 201);
      }
      if ((found = match(/^\/transport\/me\/tracking\/sessions\/[^/]+\/observations$/))) {
        const count = world.writes.filter((write) => write.path.endsWith('/observations')).length;
        return json(route, [{ id: `obs-${count}`, sessionId: 'sess-1' }], 201);
      }
      if (path === '/transport/me/checkpoints') return recordCheckpoint(world, route);
    }

    world.unhandled.push(`${method} ${path}`);
    return json(route, { message: `May chu gia chua co ${method} ${path}` }, 404);
  });
}
