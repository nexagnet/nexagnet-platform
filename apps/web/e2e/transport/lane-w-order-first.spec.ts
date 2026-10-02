import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Lane W / #296 — hop dong trinh duyet cho duong ORDER-FIRST cua chu doanh nghiep.
 *
 * API lap ke hoach va dieu xe da co tren accepted main. Bo bai nay co y KHONG mock mot "Chuyen"
 * legacy nao: neu man hinh chi co the ket thuc luong bang cach day nguoi dung sang `section=trips`,
 * day la mot lan hong that cua hop dong W1, khong phai mot fixture bi thieu.
 *
 * Hai che do duoc tach thanh bai rieng. Khong duoc lam bai ONE xanh bang cach cho MULTI chay ngam,
 * va khong duoc lam bai MULTI xanh bang cach coi mot bang xep hang la mot lan phan cong.
 */

type Grouping = 'ONE_ORDER_PER_RUN' | 'MULTI_ORDER_RUN';

interface Point {
  readonly latitude: number;
  readonly longitude: number;
}

/*
 * `#379` — toa do la SU THAT cua hai dau tuyen. Hai diem nay la dia diem DA BIET cua doanh nghiep
 * (mock `GET /transport/places/known`), nen bai tao don chon chung tu danh sach — khong go chu.
 */
const KHO_HAI_PHONG: Point = { latitude: 20.8449, longitude: 106.6881 };
const NINH_BINH: Point = { latitude: 20.2506, longitude: 105.9745 };

const KNOWN_PLACES = {
  available: true,
  places: [
    {
      id: 'gf-depot-hp',
      kind: 'DEPOT',
      name: 'Bãi xe Hải Phòng',
      detail: null,
      point: { latitude: 20.8612, longitude: 106.6503 },
      radiusMetres: 250,
    },
    {
      id: 'gf-kho-hp',
      kind: 'COUNTERPARTY_SITE',
      name: 'Kho Hải Phòng',
      detail: 'Công ty Nam Phong',
      point: KHO_HAI_PHONG,
      radiusMetres: 300,
    },
    {
      id: 'gf-ninh-binh',
      kind: 'CUSTOMER',
      name: 'Ninh Bình',
      detail: null,
      point: NINH_BINH,
      radiusMetres: 300,
    },
  ],
};

interface OrderRow {
  readonly id: string;
  readonly code: string;
  readonly status: 'OPEN';
  readonly businessDate: string;
  readonly customerId: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly originPoint: Point | null;
  readonly destinationPoint: Point | null;
  readonly cargoDescription: string | null;
  readonly freightAmount: number | null;
  readonly currencyCode: 'VND';
  readonly note: string | null;
  readonly cancelledAt: null;
  readonly cancellationReason: null;
}

interface OwnerMock {
  readonly orders: OrderRow[];
  readonly createBodies: unknown[];
  readonly previewBodies: unknown[];
  readonly planBodies: unknown[];
  readonly suggestionBodies: unknown[];
  readonly assignmentBodies: unknown[];
}

const json = async (route: Route, body: unknown, status = 200): Promise<void> => {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
};

/** Danh muc khach — man hinh tao don CHON tu day, nen mot bo mock thieu no la mot bo mock sai. */
const CUSTOMERS = [
  { id: 'cus-nam-phong', name: 'Công ty Nam Phong' },
  { id: 'cus-hai-ha', name: 'Hải Hà Logistics' },
].map((entry) => ({
  ...entry,
  phone: null,
  address: null,
  taxCode: null,
  status: 'ACTIVE',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}));

const order = (id: string, code: string): OrderRow => ({
  id,
  code,
  status: 'OPEN',
  businessDate: '2026-09-19',
  customerId: 'cus-nam-phong',
  originLabel: 'Kho Hải Phòng',
  destinationLabel: 'Ninh Bình',
  originPoint: KHO_HAI_PHONG,
  destinationPoint: NINH_BINH,
  cargoDescription: 'Hàng tổng hợp synthetic',
  freightAmount: 5_000_000,
  currencyCode: 'VND',
  note: null,
  cancelledAt: null,
  cancellationReason: null,
});

const place = (label: string) => ({
  point: null,
  pointRedacted: false,
  source: 'GEOFENCE_LABEL_EXACT',
  label,
  geofenceId: null,
  siteId: null,
});

const candidate = (
  vehicleId: string,
  plate: string,
  mode: 'CURRENT_NEAR' | 'NEXT_FREE_NEAR',
  originLabel: string,
  emptyRoadMetresToPickup: number,
) => ({
  vehicleId,
  registrationPlate: plate,
  mode,
  origin: place(originLabel),
  availableAt: '2026-09-19T03:30:00.000Z',
  availableAtIsLowerBound: true,
  emptyRoadMetresToPickup,
  roadSecondsToPickup: 1_800,
  pickupEtaAt: '2026-09-19T04:00:00.000Z',
  meetsRequiredPickupAt: null,
  suitability: [],
  currentLocation: null,
  nextFree:
    mode === 'NEXT_FREE_NEAR'
      ? {
          vehicleId,
          runId: 'run-existing',
          runCode: 'W-RUN-EXISTING',
          endpoint: place(originLabel),
          availableAt: '2026-09-19T03:30:00.000Z',
          availableAtIsLowerBound: true,
          remainingLegIds: ['leg-existing-loaded'],
          remainingOrderIds: ['ord-existing'],
          gaps: [],
        }
      : null,
  truckProfile: { complete: false },
  route: {
    providerId: 'synthetic',
    quality: 'SYNTHETIC',
    estimated: true,
    fromCache: false,
    computedAt: '2026-09-19T03:00:00.000Z',
    reason: 'ROUTE_SYNTHETIC_ESTIMATE',
  },
  reasonSummary:
    mode === 'NEXT_FREE_NEAR'
      ? 'Xe sẽ rảnh ở Ninh Bình rồi chạy rỗng tới điểm lấy hàng'
      : 'Xe đang ở gần điểm lấy hàng',
});

const proposal = (orderId: string) => ({
  orderId,
  vehicleId: 'veh-one',
  grouping: 'ONE_ORDER_PER_RUN',
  outcome: 'NEW_RUN',
  runId: null,
  runCode: null,
  startsFrom: 'Bãi xe Hải Phòng',
  startSource: 'DEPOT',
  emptyLegRequired: true,
  legs: [
    {
      sequence: 1,
      kind: 'EMPTY',
      orderId: null,
      originLabel: 'Bãi xe Hải Phòng',
      destinationLabel: 'Kho Hải Phòng',
      plannedDistanceKm: 12.4,
    },
    {
      sequence: 2,
      kind: 'LOADED',
      orderId,
      originLabel: 'Kho Hải Phòng',
      destinationLabel: 'Ninh Bình',
      plannedDistanceKm: 132,
    },
  ],
});

async function mockOwner(
  page: Page,
  grouping: Grouping,
  initialOrders: OrderRow[],
): Promise<OwnerMock> {
  const state: OwnerMock = {
    orders: [...initialOrders],
    createBodies: [],
    previewBodies: [],
    planBodies: [],
    suggestionBodies: [],
    assignmentBodies: [],
  };

  await page.route('**/auth/config', (route) => json(route, { mode: 'session' }));
  await page.route('**/auth/csrf', (route) => json(route, { csrfToken: 'lane-w-csrf' }));
  await page.route('**/auth/me', (route) =>
    json(route, {
      user: { id: 'owner-w', username: 'owner-w', name: 'Chủ doanh nghiệp UAT', role: 'ADMIN' },
      roles: ['ADMIN'],
    }),
  );

  await page.route('**/transport/planning/policy', (route) =>
    json(route, { grouping, depots: [], closure: { idleHours: null } }),
  );
  await page.route('**/transport/vehicles', (route) =>
    json(route, [
      { id: 'veh-one', registrationPlate: '15C-123.45' },
      { id: 'veh-next', registrationPlate: '29H-678.90' },
    ]),
  );
  await page.route('**/transport/runs', (route) => json(route, []));
  await page.route('**/transport/customers', (route) => json(route, CUSTOMERS));
  await page.route('**/transport/places/known', (route) => json(route, KNOWN_PLACES));

  await page.route('**/transport/orders', async (route) => {
    if (route.request().method() === 'GET') return json(route, state.orders);

    const body = route.request().postDataJSON() as Record<string, unknown>;
    state.createBodies.push(body);
    const created = order(`ord-created-${state.orders.length + 1}`, String(body.code));
    const hydrated: OrderRow = {
      ...created,
      businessDate: String(body.businessDate ?? created.businessDate),
      originLabel: String(body.originLabel),
      destinationLabel: String(body.destinationLabel),
      originPoint: (body.originPoint as Point | undefined) ?? null,
      destinationPoint: (body.destinationPoint as Point | undefined) ?? null,
      // Khach + cuoc di theo DUNG than yeu cau: mot ban mock tu dap hai truong nay vao se giau
      // mat dung lo hong ma `lane-w-customer-ar.spec.ts` sinh ra de chan.
      customerId: typeof body.customerId === 'string' ? body.customerId : null,
      freightAmount: typeof body.freightAmount === 'number' ? body.freightAmount : null,
      cargoDescription:
        typeof body.cargoDescription === 'string'
          ? body.cargoDescription
          : created.cargoDescription,
    };
    state.orders.push(hydrated);
    return json(route, hydrated, 201);
  });

  await page.route('**/transport/orders/*/legs', (route) => json(route, []));
  await page.route('**/transport/planning/orders/*/plans', (route) => json(route, []));

  await page.route('**/transport/planning/orders/*/preview', async (route) => {
    state.previewBodies.push(route.request().postDataJSON());
    const orderId = /orders\/([^/]+)\/preview/.exec(route.request().url())?.[1] ?? 'unknown';
    await json(route, proposal(orderId));
  });
  await page.route('**/transport/planning/orders/*/plan', async (route) => {
    state.planBodies.push(route.request().postDataJSON());
    const orderId = /orders\/([^/]+)\/plan/.exec(route.request().url())?.[1] ?? 'unknown';
    await json(route, {
      plan: { id: `plan-${orderId}`, orderId, vehicleId: 'veh-one', cancelledAt: null },
      run: { id: `run-${orderId}`, code: `W-RUN-${orderId}`, vehicleId: 'veh-one' },
      legs: proposal(orderId).legs,
    });
  });

  await page.route('**/transport/orders/*/dispatch-suggestions', async (route) => {
    state.suggestionBodies.push(route.request().postDataJSON());
    const orderId = /orders\/([^/]+)\/dispatch-suggestions/.exec(route.request().url())?.[1] ?? '';
    const found = state.orders.find((entry) => entry.id === orderId) ?? state.orders[0]!;
    await json(route, {
      orderId: found.id,
      orderCode: found.code,
      /* `#379` — diem lay hang la TOA DO cua don, khong suy tu nhan. */
      pickup: {
        place: {
          point: found.originPoint,
          pointRedacted: false,
          source: 'ORDER_PICKUP_POINT',
          label: found.originLabel,
          geofenceId: null,
          siteId: null,
        },
        resolution: 'PICKUP_FROM_ORDER_COORDINATES',
      },
      requiredPickupAt: null,
      generatedAt: '2026-09-19T03:00:00.000Z',
      orderingKeys: ['DEADLINE_FEASIBILITY', 'NO_WORK_INTERRUPTION', 'EMPTY_ROAD_DISTANCE'],
      candidates: [
        candidate('veh-one', '15C-123.45', 'CURRENT_NEAR', 'Bãi xe Hải Phòng', 4_200),
        candidate('veh-next', '29H-678.90', 'NEXT_FREE_NEAR', 'Ninh Bình', 18_600),
      ],
      excluded: [],
      assignmentCreated: false,
    });
  });

  await page.route('**/transport/orders/*/dispatch-assignment', async (route) => {
    state.assignmentBodies.push(route.request().postDataJSON());
    await json(route, { committed: true, runId: 'run-multi', planId: 'plan-multi' });
  });

  return state;
}

test.describe('Lane W — duong order-first cua chu doanh nghiep', () => {
  test('ONE: tao don -> xem ke hoach -> giao xe ngay tai don, khong goi MULTI hay day sang Chuyen', async ({
    page,
  }) => {
    const state = await mockOwner(page, 'ONE_ORDER_PER_RUN', []);
    const legacyNavigations: string[] = [];
    page.on('framenavigated', (frame) => {
      if (
        frame === page.mainFrame() &&
        new URL(frame.url()).searchParams.get('section') === 'trips'
      ) {
        legacyNavigations.push(frame.url());
      }
    });

    await page.goto('/?section=movement');
    await page.getByRole('button', { name: 'Tạo đơn mới' }).click();

    /*
     * `#379` — hai diem la TOA DO chon tu dia diem da biet, khong phai hai o go chu. Ten nut mang
     * TEN dia diem: moi nut "Chọn làm …" mot ten rieng.
     */
    const known = page.getByRole('tabpanel');
    await known
      .getByRole('button', { name: 'Chọn làm điểm lấy hàng: Kho Hải Phòng', exact: true })
      .click();
    await known
      .getByRole('button', { name: 'Chọn làm điểm giao hàng: Ninh Bình', exact: true })
      .click();

    const create = page.getByRole('form', { name: 'Tạo đơn hàng' });
    await create.getByLabel('Mã đơn').fill('W-ONE-UI-01');
    await create.getByLabel('Khách hàng').selectOption({ label: 'Công ty Nam Phong' });
    await create.getByLabel('Ngày vận hành').fill('2026-09-19');
    await create.getByLabel('Cước (đ)').fill('5000000');
    await page.getByRole('button', { name: 'Tạo đơn', exact: true }).click();

    await expect(page.getByText('Đã tạo đơn W-ONE-UI-01')).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'W-ONE-UI-01' })).toBeVisible();
    expect(state.createBodies).toHaveLength(1);
    /*
     * KHACH + CUOC phai nam trong than yeu cau, khong phai chi tren man hinh: thieu mot trong hai,
     * don nay se chay het duong van hanh roi khong bao gio vao duoc so cong no.
     */
    expect(state.createBodies[0]).toMatchObject({
      customerId: 'cus-nam-phong',
      freightAmount: 5_000_000,
      originLabel: 'Kho Hải Phòng',
      destinationLabel: 'Ninh Bình',
      originPoint: KHO_HAI_PHONG,
      destinationPoint: NINH_BINH,
    });
    expect(state.suggestionBodies).toEqual([]);

    // Don vua tao duoc MO SAN — khong bam lai dong (bam lai la dong no).
    const planning = page.getByRole('form', {
      name: 'Lập kế hoạch và giao xe cho đơn W-ONE-UI-01',
    });
    await planning.getByLabel('Xe').selectOption('veh-one');
    await planning.getByRole('button', { name: 'Xem kế hoạch' }).click();

    const preview = page.getByRole('region', {
      name: 'Kế hoạch vận chuyển cho đơn W-ONE-UI-01',
    });
    await expect(preview).toContainText('Chặng chạy rỗng');
    await expect(preview).toContainText('12,4 km');
    await expect(preview).toContainText('Chặng có hàng');
    expect(state.previewBodies).toEqual([{ vehicleId: 'veh-one' }]);
    expect(state.suggestionBodies).toEqual([]);

    await preview.getByRole('button', { name: 'Xác nhận kế hoạch và giao xe' }).click();
    await expect(page.getByText('Đã giao đơn W-ONE-UI-01 cho xe 15C-123.45')).toBeVisible();

    expect(state.planBodies).toHaveLength(1);
    expect(state.planBodies[0]).toMatchObject({ vehicleId: 'veh-one' });
    expect(state.suggestionBodies).toEqual([]);
    expect(legacyNavigations).toEqual([]);
    expect(new URL(page.url()).searchParams.get('section')).toBe('movement');
  });

  test('ONE: man Dieu xe khong goi bang de nghi va khong huong nguoi dung ve Chuyen legacy', async ({
    page,
  }) => {
    const state = await mockOwner(page, 'ONE_ORDER_PER_RUN', [order('ord-one', 'W-ONE-02')]);

    await page.goto('/?section=dispatch');

    const oneMode = page.getByTestId('tx-dispatch-one-order');
    await expect(oneMode).toBeVisible();
    await expect(oneMode).toContainText('mỗi đơn một vòng chạy');
    await expect(oneMode).not.toContainText('màn hình Chuyến');
    await expect(page.getByRole('button', { name: 'Tìm xe' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Đơn hàng' })).toHaveCount(0);
    expect(state.suggestionBodies).toEqual([]);
  });

  test('MULTI: de nghi noi ro current/next-free va EMPTY connector; chi gan sau khi boss bam', async ({
    page,
  }) => {
    const state = await mockOwner(page, 'MULTI_ORDER_RUN', [order('ord-multi-b', 'W-MULTI-B')]);

    await page.goto('/?section=dispatch');
    await page.getByRole('combobox', { name: 'Đơn hàng' }).selectOption('ord-multi-b');
    await page.getByRole('button', { name: 'Tìm xe' }).click();

    const current = page.getByRole('row').filter({ hasText: '15C-123.45' });
    const nextFree = page.getByRole('row').filter({ hasText: '29H-678.90' });
    await expect(current).toContainText('Đang ở gần điểm lấy hàng');
    await expect(nextFree).toContainText('Sẽ rảnh gần điểm lấy hàng');
    await expect(nextFree).toContainText('18,6 km');

    // Xem de nghi KHONG phai la gan xe. Lenh ghi chi duoc xuat hien sau nut cua dung dong boss chon.
    expect(state.assignmentBodies).toEqual([]);
    await current.getByRole('button', { name: 'Gán xe' }).click();
    await expect(page.getByText('Đã gán xe. Vòng chạy đã được cập nhật.')).toBeVisible();
    expect(state.assignmentBodies).toEqual([{ vehicleId: 'veh-one' }]);

    // 18,6 km khong chi la mot con so chung chung: day la EMPTY connector tu diem xe se ranh toi pickup.
    await expect(nextFree).toContainText('Chặng chạy rỗng');
  });
});
