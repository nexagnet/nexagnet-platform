import { expect, type Page, type Request, type Route } from '@playwright/test';

/**
 * `#379` — MAY CHU GIA cho be mat tao don, dung chung cho `order-composer.spec.ts` (luong nghiep vu)
 * va `order-composer-layout.spec.ts` (bo cuc, tuong phan, ban phim).
 *
 * Moi yeu cau `/transport/*` va `/auth/*` di qua `page.route`: khong mot yeu cau nao ra Internet,
 * va moi than yeu cau duoc ghi lai de bai kiem khang dinh DUNG cai da gui.
 */

export interface Point {
  readonly latitude: number;
  readonly longitude: number;
}

export interface OrderRow {
  readonly id: string;
  readonly code: string;
  readonly status: 'OPEN';
  readonly businessDate: string;
  readonly customerId: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly originPoint?: Point | null;
  readonly destinationPoint?: Point | null;
  readonly cargoDescription: string | null;
  readonly freightAmount: number | null;
  readonly currencyCode: 'VND';
  readonly note: null;
  readonly cancelledAt: null;
  readonly cancellationReason: null;
}

export interface World {
  readonly orders: OrderRow[];
  readonly createBodies: Record<string, unknown>[];
  readonly placeCalls: string[];
  readonly searchQueries: string[];
  readonly reverseBodies: Record<string, unknown>[];
  searchResponse: unknown;
  reverseResponse: unknown;
  /** `true` = `GET /transport/orders` tra 502 (may chu dang deploy). */
  failOrders: boolean;
  orderListReads: number;
}

export const DINH_VU_FACTORY: Point = { latitude: 20.8264, longitude: 106.7752 };
export const TAN_PHU_HUNG: Point = { latitude: 21.617, longitude: 105.817 };
export const KCN_DINH_VU: Point = { latitude: 20.8301, longitude: 106.7613 };

/**
 * Nhan loai DUNG nhu may chu that tra (`PLACE_KIND_LABEL` / `fenceKindLabel`, `#395` §2.1): kho cua
 * mot KHACH HANG (phap nhan co mat khach hang) la "Địa điểm khách hàng", nha may cua don vi khac la
 * "Nhà máy / kho đối tác", hang rao `CUSTOMER` cu la "Điểm khách hàng (kiểu cũ)".
 */
export const KNOWN_PLACE_LABEL = {
  DEPOT: 'Bãi xe',
  CUSTOMER_SITE: 'Địa điểm khách hàng',
  PARTNER_SITE: 'Nhà máy / kho đối tác',
  LEGACY_CUSTOMER: 'Điểm khách hàng (kiểu cũ)',
} as const;

const KNOWN_PLACES = {
  available: true,
  places: [
    {
      id: 'gf-depot-hn',
      kind: 'DEPOT',
      kindLabel: KNOWN_PLACE_LABEL.DEPOT,
      name: 'Bãi xe Hà Nội',
      detail: null,
      point: { latitude: 20.9652, longitude: 105.8468 },
      radiusMetres: 250,
    },
    {
      id: 'gf-dinh-vu',
      kind: 'COUNTERPARTY_SITE',
      kindLabel: KNOWN_PLACE_LABEL.PARTNER_SITE,
      name: 'Nhà máy thép Đình Vũ',
      detail: 'Công ty CP Thép Đông Á',
      point: DINH_VU_FACTORY,
      radiusMetres: 300,
    },
    {
      id: 'gf-tan-phu-hung',
      kind: 'COUNTERPARTY_SITE',
      kindLabel: KNOWN_PLACE_LABEL.CUSTOMER_SITE,
      name: 'Kho Nhựa Tân Phú Hưng',
      detail: 'Công ty TNHH Nhựa Tân Phú Hưng',
      point: TAN_PHU_HUNG,
      radiusMetres: 250,
    },
    {
      // Nam TRONG khung cua ba diem tren — khong doi khung ban do ban dau cua cac bai kiem khac.
      id: 'gf-kho-cu-hung-yen',
      kind: 'CUSTOMER',
      kindLabel: KNOWN_PLACE_LABEL.LEGACY_CUSTOMER,
      name: 'Kho cũ Hưng Yên',
      detail: 'Công ty TNHH Nhựa Tân Phú Hưng',
      point: { latitude: 20.95, longitude: 106.05 },
      radiusMetres: 200,
    },
  ],
};

export const SEARCH_OK = {
  status: 'OK',
  reason: null,
  results: [
    {
      label: 'Khu công nghiệp Đình Vũ',
      address: 'Đông Hải 2, Hải An, Hải Phòng',
      point: KCN_DINH_VU,
    },
    {
      label: 'Cảng Đình Vũ',
      address: 'Đông Hải 2, Hải An, Hải Phòng',
      point: { latitude: 20.8356, longitude: 106.7712 },
    },
  ],
  attribution: '© OpenStreetMap contributors',
  fromCache: false,
};

const REVERSE_OK = {
  status: 'OK',
  reason: null,
  result: {
    label: 'Cảng Chùa Vẽ',
    address: 'Đông Hải 1, Hải An, Hải Phòng',
    point: { latitude: 20.85, longitude: 106.72 },
  },
  attribution: '© OpenStreetMap contributors',
  fromCache: false,
};

const CUSTOMERS = [
  { id: 'cus-dong-a', name: 'Công ty CP Thép Đông Á' },
  { id: 'cus-tan-phu-hung', name: 'Công ty TNHH Nhựa Tân Phú Hưng' },
].map((entry) => ({
  ...entry,
  phone: null,
  address: null,
  taxCode: null,
  status: 'ACTIVE',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}));

/** Don CU: khong co truong toa do nao — dung nhu mock truoc `#379`. */
const legacyOrder: OrderRow = {
  id: 'ord-legacy',
  code: 'DH-CU-01',
  status: 'OPEN',
  businessDate: '2026-09-20',
  customerId: 'cus-dong-a',
  originLabel: 'Hải Phòng',
  destinationLabel: 'Hà Nội',
  cargoDescription: null,
  freightAmount: 4_900_000,
  currencyCode: 'VND',
  note: null,
  cancelledAt: null,
  cancellationReason: null,
};

const json = (route: Route, body: unknown, status = 200): Promise<void> =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const createdFrom = (world: World, body: Record<string, unknown>): OrderRow => ({
  id: `ord-new-${world.orders.length + 1}`,
  code: String(body.code),
  status: 'OPEN',
  businessDate: String(body.businessDate),
  customerId: typeof body.customerId === 'string' ? body.customerId : null,
  originLabel: String(body.originLabel),
  destinationLabel: String(body.destinationLabel),
  originPoint: (body.originPoint as Point | undefined) ?? null,
  destinationPoint: (body.destinationPoint as Point | undefined) ?? null,
  cargoDescription: typeof body.cargoDescription === 'string' ? body.cargoDescription : null,
  freightAmount: typeof body.freightAmount === 'number' ? body.freightAmount : null,
  currencyCode: 'VND',
  note: null,
  cancelledAt: null,
  cancellationReason: null,
});

async function answerOrders(route: Route, world: World, method: string): Promise<void> {
  if (method === 'GET') {
    world.orderListReads += 1;
    return world.failOrders
      ? json(route, { statusCode: 502, message: 'Máy chủ đang khởi động lại.' }, 502)
      : json(route, world.orders);
  }
  const body = route.request().postDataJSON() as Record<string, unknown>;
  world.createBodies.push(body);
  const created = createdFrom(world, body);
  world.orders.push(created);
  return json(route, created, 201);
}

async function answer(route: Route, world: World): Promise<void> {
  const request = route.request();
  const method = request.method();
  const path = new URL(request.url()).pathname;
  if (path.startsWith('/transport/places/')) world.placeCalls.push(`${method} ${path}`);

  if (path === '/auth/config') return json(route, { mode: 'session' });
  if (path === '/auth/csrf') return json(route, { csrfToken: 'composer-csrf' });
  if (path === '/auth/me') {
    return json(route, {
      user: { id: 'giam-doc', username: 'giam-doc', name: 'Giám đốc mẫu', role: 'ADMIN' },
      roles: ['ADMIN'],
    });
  }
  if (path === '/transport/planning/policy') {
    return json(route, { grouping: 'ONE_ORDER_PER_RUN', depots: [], closure: { idleHours: null } });
  }
  if (path === '/transport/customers') return json(route, CUSTOMERS);
  if (path === '/transport/vehicles' || path === '/transport/runs') return json(route, []);
  if (path === '/transport/orders') return answerOrders(route, world, method);
  if (/^\/transport\/orders\/[^/]+\/legs$/.test(path)) return json(route, []);
  if (/^\/transport\/planning\/orders\/[^/]+\/plans$/.test(path)) return json(route, []);
  if (path === '/transport/places/known') return json(route, KNOWN_PLACES);
  if (path === '/transport/places/search') {
    world.searchQueries.push(String((request.postDataJSON() as { query: unknown }).query));
    return json(route, world.searchResponse);
  }
  if (path === '/transport/places/reverse') {
    world.reverseBodies.push(request.postDataJSON() as Record<string, unknown>);
    return json(route, world.reverseResponse);
  }
  return json(route, { message: `khong co mock cho ${method} ${path}` }, 404);
}

export async function serve(page: Page): Promise<World> {
  const world: World = {
    orders: [legacyOrder],
    createBodies: [],
    placeCalls: [],
    searchQueries: [],
    reverseBodies: [],
    searchResponse: SEARCH_OK,
    reverseResponse: REVERSE_OK,
    failOrders: false,
    orderListReads: 0,
  };
  await page.route(
    (url) => url.pathname.startsWith('/transport/') || url.pathname.startsWith('/auth/'),
    (route) => answer(route, world),
  );
  return world;
}

/** Moi yeu cau http(s) RA KHOI may chu web — `#374`/`#379`: CI khong duoc goi Internet. */
export function recordExternalRequests(page: Page): string[] {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return;
    external.push(request.url());
  });
  return external;
}

const SHOTS_DIR = process.env.SHOTS_DIR?.trim() ?? '';

/** Anh chup chi ghi khi co `SHOTS_DIR` (duong dan tuyet doi): CI khong ghi gi ra ngoai repo. */
export async function shoot(page: Page, name: string, fullPage = false): Promise<void> {
  if (SHOTS_DIR.length === 0) return;
  // Chi bao dev cua Next (cham den goc trai duoi) khong phai giao dien — go truoc khi chup.
  await page.evaluate(() =>
    document.querySelectorAll('nextjs-portal').forEach((node) => node.remove()),
  );
  await page.screenshot({ path: `${SHOTS_DIR}/${name}.png`, fullPage });
}

export async function openComposer(page: Page, world: World): Promise<void> {
  await page.goto('/?section=movement');
  await expect(page.getByRole('heading', { level: 1, name: 'Đơn hàng & vòng chạy' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'DH-CU-01' })).toBeVisible();
  // Xem danh sach KHONG doc dia diem: hang rao chi can khi tao don.
  expect(world.placeCalls).toEqual([]);
  await page.getByRole('button', { name: 'Tạo đơn mới' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tạo đơn mới' })).toBeVisible();
  await expect(page.getByTestId('tx-picker-map')).toBeVisible({ timeout: 30_000 });
}

type Endpoint = 'lấy' | 'giao';

/** Ten nut mang TEN dia diem (`#379`) — nut dung la nut duy nhat mang ten do. */
export const chooseKnown = (page: Page, name: string, endpoint: Endpoint): Promise<void> =>
  page
    .getByRole('button', { name: `Chọn làm điểm ${endpoint} hàng: ${name}`, exact: true })
    .click();

export const chooseResult = (
  page: Page,
  label: string,
  position: number,
  endpoint: Endpoint,
): Promise<void> =>
  page
    .getByRole('button', {
      name: `Chọn làm điểm ${endpoint} hàng: ${label} (kết quả ${position})`,
      exact: true,
    })
    .click();

export const fillFacts = async (page: Page): Promise<void> => {
  const form = page.getByRole('form', { name: 'Tạo đơn hàng' });
  await form.getByLabel('Mã đơn').fill('DH-379-01');
  await form.getByLabel('Ngày vận hành').fill('2026-09-23');
  await form.getByLabel('Khách hàng').selectOption({ label: 'Công ty CP Thép Đông Á' });
  await form.getByLabel('Cước (đ)').fill('6800000');
};

/**
 * Khang dinh KHONG co yeu cau nao khop trong ca mot khoang cho. Mot yeu cau sinh ra bat dong bo
 * (hen gio, effect, CSRF truoc POST) den SAU mot lenh kiem tra tuc thi — kiem ngay la kiem hut.
 * Khoang cho dai hon moi do tre go phim hop ly (300–500 ms) va hon mot vong CSRF + POST.
 */
export async function expectNoRequest(
  page: Page,
  matches: (request: Request) => boolean,
  windowMs = 1_500,
): Promise<void> {
  const seen = await page.waitForRequest(matches, { timeout: windowMs }).then(
    (request) => request.url(),
    () => null,
  );
  expect(seen).toBeNull();
}

/**
 * Mot cho TRONG tren ban do chon diem (toa do trong khung cua ban do): xa moi ghim, moi lop noi va
 * nut dieu khien. Khung dau tien doi theo be rong man hinh va lop noi, nen mot toa do co dinh co
 * ngay bam trung mot ghim — va bam ghim thi khong phai bam ban do.
 */
export async function emptyMapPoint(
  page: Page,
  prefer: { readonly x: number; readonly y: number } = { x: 0.72, y: 0.45 },
): Promise<{ x: number; y: number }> {
  return page.getByTestId('tx-picker-map').evaluate((map, want) => {
    const frame = map.getBoundingClientRect();
    const stage = map.closest('.tx-composer__stage') ?? document.body;
    const blockers = Array.from(
      stage.querySelectorAll('.maplibregl-marker, [data-map-overlay], .maplibregl-ctrl'),
      (node) => node.getBoundingClientRect(),
    ).filter((rect) => rect.width > 0 && rect.height > 0);
    const margin = 24;
    const isClear = (x: number, y: number): boolean =>
      blockers.every(
        (rect) =>
          x < rect.left - margin ||
          x > rect.right + margin ||
          y < rect.top - margin ||
          y > rect.bottom + margin,
      );
    const steps = Array.from({ length: 17 }, (_, index) => 0.1 + index * 0.05);
    const candidates = steps
      .flatMap((fy) => steps.map((fx) => [fx, fy] as const))
      .sort(
        (first, second) =>
          Math.hypot(first[0] - want.x, first[1] - want.y) -
          Math.hypot(second[0] - want.x, second[1] - want.y),
      );
    for (const [fx, fy] of candidates) {
      if (isClear(frame.left + fx * frame.width, frame.top + fy * frame.height)) {
        return { x: fx * frame.width, y: fy * frame.height };
      }
    }
    throw new Error('Không còn chỗ trống nào trên bản đồ chọn điểm.');
  }, prefer);
}

/** Cho camera ban do dung han (ghim khong con doi cho) — anh chup giua luc bay thi lech. */
export async function waitForCameraRest(page: Page): Promise<void> {
  const markerSpots = (): Promise<string> =>
    page.evaluate(() =>
      Array.from(
        document.querySelectorAll('[data-testid="tx-picker-map"] .maplibregl-marker'),
        (node) => {
          const rect = node.getBoundingClientRect();
          return `${Math.round(rect.left)},${Math.round(rect.top)}`;
        },
      ).join('|'),
    );
  let previous = '';
  await expect
    .poll(
      async () => {
        const current = await markerSpots();
        const isStill = current === previous;
        previous = current;
        return isStill;
      },
      { intervals: [150], timeout: 5_000 },
    )
    .toBe(true);
}

/** O `label` cua thong tin don nam tron TREN thanh gui dinh day (khong bi thanh che). */
export async function isAboveSubmitBar(page: Page, label: string): Promise<boolean> {
  const field = await page
    .getByRole('form', { name: 'Tạo đơn hàng' })
    .getByLabel(label)
    .boundingBox();
  const bar = await page.locator('.tx-composer__submit').boundingBox();
  if (field === null || bar === null) return false;
  return field.y + field.height <= bar.y;
}

/** Trinh duyet co hoi truoc khi tai lai / dong tab khong (`beforeunload` bi chan). */
export const isUnloadGuarded = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

export const isSearchRequest = (request: Request): boolean =>
  new URL(request.url()).pathname === '/transport/places/search';

export const isReverseRequest = (request: Request): boolean =>
  new URL(request.url()).pathname === '/transport/places/reverse';

export const isCreateOrderRequest = (request: Request): boolean =>
  request.method() === 'POST' && new URL(request.url()).pathname === '/transport/orders';
