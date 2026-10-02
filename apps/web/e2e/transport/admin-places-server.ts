import type { Page, Route } from '@playwright/test';

/**
 * `#395` — MAY CHU GIA CO TRANG THAI cho "Địa điểm vận hành" va man Tao don doc cung nguon.
 *
 * MOT so dia diem (`world.places`) tra loi CA hai cau: danh sach quan tri
 * (`/transport/places/admin`) va dia diem da biet cua man Tao don (`/transport/places/known`). Them
 * mot dia diem o man quan tri roi mo lai man Tao don phai thay no — dung dieu thiet ke doi.
 *
 * Tim kiem va tim nguoc TAT (`DISABLED`) — duong "khach khong bat nha cung cap ngoai": moi diem dat
 * bang ban do. May chu gia giu luat bai xe: MOT bai bat; bai moi khi da co bai bat thi la bai du
 * phong; doi bai chinh khi con viec dang mo thi `409 DEPOT_CHANGE_AFFECTS_OPEN_WORK`.
 */

interface Point {
  readonly latitude: number;
  readonly longitude: number;
}

type Kind = 'DEPOT' | 'COUNTERPARTY_SITE' | 'CUSTOMER';
type DisplayKind = 'DEPOT' | 'CUSTOMER_SITE' | 'PARTNER_SITE' | 'LEGACY_CUSTOMER';

export interface Place {
  id: string;
  kind: Kind;
  displayKind: DisplayKind;
  kindLabel: string;
  name: string;
  address: string | null;
  point: Point;
  radiusMetres: number;
  status: 'ACTIVE' | 'INACTIVE';
  effectiveStatus: 'ACTIVE' | 'INACTIVE' | 'OWNER_INACTIVE';
  note: string | null;
  owner: {
    counterpartyId: string | null;
    counterpartyName: string | null;
    customerId?: string;
    customerName?: string;
    siteId: string | null;
    siteName: string | null;
  } | null;
  depot: {
    code: string;
    plannerStatus: 'IN_USE' | 'STANDBY' | 'AMBIGUOUS' | 'NOT_IN_USE';
    source: 'MANAGED';
  } | null;
  conflicts: string[];
  updatedAt: string;
}

export interface Recorded {
  readonly method: string;
  readonly path: string;
  readonly body: Record<string, unknown>;
}

/** Mot lan tra loi LOI cho yeu cau ke tiep khop — bai kiem dung de dung duong loi THAT. */
export interface Failure {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export interface PlacesWorld {
  readonly places: Place[];
  readonly counterparties: { id: string; name: string; taxCode: string | null; status: 'ACTIVE' }[];
  readonly requests: Recorded[];
  readonly history: Map<
    string,
    {
      at: string;
      actor: string;
      action: string;
      entityType: string;
      before: unknown;
      after: unknown;
    }[]
  >;
  /** Vong xe / don dang dung bai xe dang bat — co thi doi bai phai xac nhan. */
  openWork: { runs: { id: string; code: string }[]; orders: { id: string; code: string }[] } | null;
  knownReads: number;
  /** Tra loi LOI mot lan cho yeu cau ke tiep khop (vd `429` cua ThrottlerGuard) roi tu go. */
  failNext: Failure | null;
  /**
   * Nguoi dang dang nhap. `permissions: null` = may chu CU (khong tra tap quyen) — man hinh roi ve
   * ban guong theo vai.
   */
  readonly me: {
    readonly role: 'ADMIN' | 'MANAGER' | 'ACCOUNTING';
    readonly permissions: readonly string[] | null;
  };
}

const NOW = '2026-09-25T02:00:00.000Z';

const LABEL: Readonly<Record<DisplayKind, string>> = {
  DEPOT: 'Bãi xe',
  CUSTOMER_SITE: 'Địa điểm khách hàng',
  PARTNER_SITE: 'Nhà máy / kho đối tác',
  LEGACY_CUSTOMER: 'Điểm khách hàng (kiểu cũ)',
};

export const CUSTOMERS = [
  { id: 'cus-dong-a', name: 'Công ty CP Thép Đông Á' },
  { id: 'cus-son-ha', name: 'Công ty TNHH Sơn Hà' },
].map((entry) => ({
  ...entry,
  phone: null,
  address: null,
  taxCode: null,
  status: 'ACTIVE',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}));

const seedPlaces = (): Place[] => [
  {
    id: 'gf-depot-hn',
    kind: 'DEPOT',
    displayKind: 'DEPOT',
    kindLabel: LABEL.DEPOT,
    name: 'Bãi xe Hà Nội',
    address: 'Km 12 Pháp Vân, Hoàng Mai, Hà Nội',
    point: { latitude: 20.9652, longitude: 105.8468 },
    radiusMetres: 250,
    status: 'ACTIVE',
    effectiveStatus: 'ACTIVE',
    note: null,
    owner: null,
    depot: { code: 'DEPOT-HN', plannerStatus: 'IN_USE', source: 'MANAGED' },
    conflicts: [],
    updatedAt: '2026-09-20T00:00:00.000Z',
  },
  {
    id: 'gf-dinh-vu',
    kind: 'COUNTERPARTY_SITE',
    displayKind: 'CUSTOMER_SITE',
    kindLabel: LABEL.CUSTOMER_SITE,
    name: 'Nhà máy thép Đình Vũ',
    address: 'KCN Đình Vũ, Hải An, Hải Phòng',
    point: { latitude: 20.8264, longitude: 106.7752 },
    radiusMetres: 300,
    status: 'ACTIVE',
    effectiveStatus: 'ACTIVE',
    note: 'Vào cổng số 2',
    owner: {
      counterpartyId: 'cp-dong-a',
      counterpartyName: 'Công ty CP Thép Đông Á',
      customerId: 'cus-dong-a',
      customerName: 'Công ty CP Thép Đông Á',
      siteId: 'site-dinh-vu',
      siteName: 'Nhà máy thép Đình Vũ',
    },
    depot: null,
    conflicts: [],
    updatedAt: '2026-09-20T00:00:00.000Z',
  },
  {
    id: 'gf-tan-phu-hung',
    kind: 'COUNTERPARTY_SITE',
    displayKind: 'PARTNER_SITE',
    kindLabel: LABEL.PARTNER_SITE,
    name: 'Kho Nhựa Tân Phú Hưng',
    address: null,
    point: { latitude: 21.617, longitude: 105.817 },
    radiusMetres: 250,
    status: 'ACTIVE',
    effectiveStatus: 'ACTIVE',
    note: null,
    owner: {
      counterpartyId: 'cp-tan-phu-hung',
      counterpartyName: 'Công ty TNHH Nhựa Tân Phú Hưng',
      siteId: 'site-tan-phu-hung',
      siteName: 'Kho Nhựa Tân Phú Hưng',
    },
    depot: null,
    conflicts: [],
    updatedAt: '2026-09-20T00:00:00.000Z',
  },
];

const json = (route: Route, body: unknown, status = 200): Promise<void> =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const problem = (
  route: Route,
  status: number,
  reason: string,
  detail?: Record<string, unknown>,
): Promise<void> =>
  json(
    route,
    { statusCode: status, error: 'Error', message: reason, reason, ...(detail ? { detail } : {}) },
    status,
  );

const DISABLED = {
  status: 'DISABLED',
  reason: 'PROVIDER_DISABLED',
  attribution: null,
  fromCache: false,
};

/** Trang thai khau lap ke hoach cua moi bai — tinh lai sau MOI lenh ghi, nhu may chu that. */
function replan(world: PlacesWorld): void {
  const active = world.places.filter(
    (place) => place.kind === 'DEPOT' && place.status === 'ACTIVE',
  );
  for (const place of world.places) {
    if (place.depot === null) continue;
    place.depot.plannerStatus =
      place.status !== 'ACTIVE' ? 'STANDBY' : active.length > 1 ? 'AMBIGUOUS' : 'IN_USE';
  }
}

function remember(
  world: PlacesWorld,
  place: Place,
  action: string,
  before: unknown,
  extra: Record<string, unknown> = {},
): void {
  const rows = world.history.get(place.id) ?? [];
  // Cung hinh dang dong nhat ky cua may chu: `after` mang ly do (`auditChange(..., { reason })`).
  rows.unshift({
    at: NOW,
    actor: 'giam-doc',
    action,
    entityType: 'TransportGeofence',
    before,
    after: { status: place.status, ...extra },
  });
  world.history.set(place.id, rows);
}

const fold = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim();

function createPlace(
  world: PlacesWorld,
  body: Record<string, unknown>,
): Place | { reason: string; detail: Record<string, unknown> } {
  const name = String(body.name);
  const clash = world.places.find(
    (place) => place.status === 'ACTIVE' && fold(place.name) === fold(name),
  );
  if (clash !== undefined) {
    return {
      reason: 'PLACE_NAME_TAKEN',
      detail: {
        conflictName: clash.name,
        conflictKindLabel: clash.kindLabel,
        ownerName: clash.owner?.counterpartyName,
      },
    };
  }
  const id = `gf-new-${world.places.length + 1}`;
  const base = {
    id,
    name,
    address: (body.address as string | null | undefined) ?? null,
    point: body.point as Point,
    radiusMetres: Number(body.radiusMetres),
    note: (body.note as string | null | undefined) ?? null,
    conflicts: [],
    updatedAt: NOW,
  };
  if (body.kind === 'DEPOT') {
    const hasActive = world.places.some(
      (place) => place.kind === 'DEPOT' && place.status === 'ACTIVE',
    );
    const status = hasActive ? 'INACTIVE' : 'ACTIVE';
    return {
      ...base,
      kind: 'DEPOT',
      displayKind: 'DEPOT',
      kindLabel: LABEL.DEPOT,
      status,
      effectiveStatus: status,
      owner: null,
      depot: {
        code: `DEPOT-${fold(name)
          .replace(/[^a-z0-9]+/g, '-')
          .toUpperCase()}`,
        plannerStatus: 'STANDBY',
        source: 'MANAGED',
      },
    };
  }
  const owner = body.owner as {
    customerId?: string;
    counterpartyId?: string;
    newCounterparty?: { name: string };
  };
  const customer = CUSTOMERS.find((entry) => entry.id === owner.customerId);
  const counterparty =
    customer !== undefined
      ? { id: `cp-${customer.id}`, name: customer.name }
      : owner.newCounterparty !== undefined
        ? { id: `cp-new-${world.counterparties.length + 1}`, name: owner.newCounterparty.name }
        : world.counterparties.find((entry) => entry.id === owner.counterpartyId);
  if (owner.newCounterparty !== undefined && counterparty !== undefined) {
    world.counterparties.push({
      id: counterparty.id,
      name: counterparty.name,
      taxCode: null,
      status: 'ACTIVE',
    });
  }
  const displayKind: DisplayKind = customer === undefined ? 'PARTNER_SITE' : 'CUSTOMER_SITE';
  return {
    ...base,
    kind: 'COUNTERPARTY_SITE',
    displayKind,
    kindLabel: LABEL[displayKind],
    status: 'ACTIVE',
    effectiveStatus: 'ACTIVE',
    owner: {
      counterpartyId: counterparty?.id ?? null,
      counterpartyName: counterparty?.name ?? null,
      ...(customer === undefined ? {} : { customerId: customer.id, customerName: customer.name }),
      siteId: `site-${id}`,
      siteName: name,
    },
    depot: null,
  };
}

/** Doi bai xe dang dung khi con viec dang mo: tu choi cho toi khi nguoi dung xac nhan danh sach. */
const blockedByOpenWork = (
  world: PlacesWorld,
  place: Place,
  body: Record<string, unknown>,
): boolean =>
  world.openWork !== null && place.kind === 'DEPOT' && body.acknowledgeOpenWork !== true;

async function answerAdmin(
  route: Route,
  world: PlacesWorld,
  method: string,
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  if (path === '/transport/places/admin' && method === 'GET') return json(route, world.places);
  if (path === '/transport/places/admin' && method === 'POST') {
    const created = createPlace(world, body);
    if ('reason' in created) return problem(route, 409, created.reason, created.detail);
    world.places.push(created);
    replan(world);
    remember(world, created, 'transport.place.create', null);
    return json(route, created, 201);
  }
  const match = /^\/transport\/places\/admin\/([^/]+)(\/.*)?$/.exec(path);
  const place = world.places.find((entry) => entry.id === match?.[1]);
  if (match === null || place === undefined) return problem(route, 404, 'PLACE_NOT_FOUND');
  const suffix = match[2] ?? '';
  const before = { status: place.status, name: place.name };
  if (suffix === '/history') return json(route, world.history.get(place.id) ?? []);
  if (suffix === '' && method === 'PATCH') {
    if (body.name !== undefined && blockedByOpenWork(world, place, body)) {
      return problem(route, 409, 'DEPOT_CHANGE_AFFECTS_OPEN_WORK', {
        ...world.openWork,
        idleHours: 12,
      });
    }
    for (const key of ['name', 'address', 'point', 'radiusMetres', 'note'] as const) {
      if (body[key] !== undefined) Object.assign(place, { [key]: body[key] });
    }
    remember(world, place, 'transport.place.update', before);
    return json(route, place);
  }
  if (suffix === '/deactivate') {
    if (place.depot?.plannerStatus === 'IN_USE' && blockedByOpenWork(world, place, body)) {
      return problem(route, 409, 'DEPOT_CHANGE_AFFECTS_OPEN_WORK', {
        ...world.openWork,
        idleHours: 12,
      });
    }
    place.status = 'INACTIVE';
    place.effectiveStatus = 'INACTIVE';
    replan(world);
    remember(world, place, 'transport.place.deactivate', before, { reason: body.reason });
    return json(route, place);
  }
  if (suffix === '/activate') {
    // Luat cua may chu (`requireNoOtherActiveDepot`): MOT bai bat — bai du phong khong bat lai duoc.
    const active = world.places.find(
      (entry) => entry.kind === 'DEPOT' && entry.id !== place.id && entry.status === 'ACTIVE',
    );
    if (place.kind === 'DEPOT' && active !== undefined) {
      return json(
        route,
        {
          statusCode: 409,
          error: 'Conflict',
          message: `"${active.name}" đang là bãi chính. Muốn dùng bãi này, hãy chọn "Đổi thành bãi chính".`,
          reason: 'DEPOT_ALREADY_ACTIVE',
          detail: { activeDepot: { id: active.id, code: active.depot?.code, name: active.name } },
        },
        409,
      );
    }
    place.status = 'ACTIVE';
    place.effectiveStatus = 'ACTIVE';
    replan(world);
    remember(world, place, 'transport.place.activate', before);
    return json(route, place);
  }
  if (suffix === '/make-primary-depot') {
    if (place.kind !== 'DEPOT') return problem(route, 409, 'PLACE_NOT_A_DEPOT');
    if (blockedByOpenWork(world, place, body)) {
      return problem(route, 409, 'DEPOT_CHANGE_AFFECTS_OPEN_WORK', {
        ...world.openWork,
        idleHours: 12,
      });
    }
    for (const other of world.places.filter((entry) => entry.kind === 'DEPOT')) {
      other.status = other.id === place.id ? 'ACTIVE' : 'INACTIVE';
      other.effectiveStatus = other.status;
    }
    replan(world);
    remember(world, place, 'transport.place.make_primary_depot', before);
    return json(route, place);
  }
  return problem(route, 404, 'ROUTE_NOT_MOCKED');
}

async function answer(route: Route, world: PlacesWorld): Promise<void> {
  const request = route.request();
  const method = request.method();
  const path = new URL(request.url()).pathname;
  const body = (method === 'GET' ? {} : (request.postDataJSON() ?? {})) as Record<string, unknown>;
  world.requests.push({ method, path, body });
  const failure = world.failNext;
  if (failure !== null && failure.method === method && failure.path === path) {
    world.failNext = null;
    return json(route, failure.body, failure.status);
  }

  if (path === '/auth/config') return json(route, { mode: 'session' });
  if (path === '/auth/csrf') return json(route, { csrfToken: 'e2e-csrf' });
  if (path === '/auth/me') {
    // Mac dinh may chu CU: khong tra `permissions` — man hinh roi ve ban guong theo vai (Giam doc).
    const { role, permissions } = world.me;
    return json(route, {
      user:
        role === 'ADMIN'
          ? { id: 'u-giam-doc', username: 'giam-doc', name: 'Giám đốc Hùng', role }
          : { id: 'u-an', username: 'an', name: 'Trần Văn An', role },
      roles: [role],
      ...(permissions === null ? {} : { permissions }),
    });
  }
  if (path === '/transport/me/vehicles') {
    return problem(route, 403, 'ASSET_STAKEHOLDER_NOT_FOUND');
  }
  if (path.startsWith('/transport/places/admin'))
    return answerAdmin(route, world, method, path, body);
  if (path === '/transport/places/known') {
    world.knownReads += 1;
    return json(route, {
      available: true,
      places: world.places
        .filter((place) => place.effectiveStatus === 'ACTIVE')
        .map((place) => ({
          id: place.id,
          kind: place.kind,
          name: place.name,
          detail: place.owner?.customerName ?? place.owner?.counterpartyName ?? null,
          kindLabel: place.kindLabel,
          point: place.point,
          radiusMetres: place.radiusMetres,
        })),
    });
  }
  if (path === '/transport/places/search') return json(route, { ...DISABLED, results: [] });
  if (path === '/transport/places/reverse') return json(route, { ...DISABLED, result: null });
  if (path === '/transport/customers') return json(route, CUSTOMERS);
  if (path === '/transport/counterparties') return json(route, world.counterparties);
  if (path === '/transport/planning/policy') {
    return json(route, { grouping: 'ONE_ORDER_PER_RUN', depots: [], closure: { idleHours: 12 } });
  }
  if (
    path === '/transport/orders' ||
    path === '/transport/vehicles' ||
    path === '/transport/runs'
  ) {
    return json(route, []);
  }
  return problem(route, 404, 'ROUTE_NOT_MOCKED');
}

export async function servePlaces(
  page: Page,
  options: { readonly me?: PlacesWorld['me'] } = {},
): Promise<PlacesWorld> {
  const world: PlacesWorld = {
    places: seedPlaces(),
    counterparties: [
      {
        id: 'cp-tan-phu-hung',
        name: 'Công ty TNHH Nhựa Tân Phú Hưng',
        taxCode: '0101234567',
        status: 'ACTIVE',
      },
    ],
    requests: [],
    history: new Map(),
    openWork: null,
    knownReads: 0,
    failNext: null,
    me: options.me ?? { role: 'ADMIN', permissions: null },
  };
  await page.route(
    (url) => url.pathname.startsWith('/transport/') || url.pathname.startsWith('/auth/'),
    (route) => answer(route, world),
  );
  return world;
}

export const lastRequest = (
  world: PlacesWorld,
  method: string,
  path: string | RegExp,
): Recorded | undefined =>
  [...world.requests]
    .reverse()
    .find(
      (entry) =>
        entry.method === method &&
        (typeof path === 'string' ? entry.path === path : path.test(entry.path)),
    );

/**
 * Mot cho TRONG tren ban do dia diem (toa do trong khung ban do): xa moi ghim va nut dieu khien —
 * bam trung ghim la mo dia diem do, khong phai dat diem.
 */
export async function emptyPlacesMapPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.getByTestId('tx-places-map').evaluate((map) => {
    const frame = map.getBoundingClientRect();
    const blockers = Array.from(
      map.querySelectorAll('.maplibregl-marker, .maplibregl-ctrl'),
      (node) => node.getBoundingClientRect(),
    ).filter((rect) => rect.width > 0 && rect.height > 0);
    const margin = 32;
    const isClear = (x: number, y: number): boolean =>
      blockers.every(
        (rect) =>
          x < rect.left - margin ||
          x > rect.right + margin ||
          y < rect.top - margin ||
          y > rect.bottom + margin,
      );
    const steps = Array.from({ length: 15 }, (_, index) => 0.15 + index * 0.05);
    for (const fy of steps) {
      for (const fx of steps) {
        if (isClear(frame.left + fx * frame.width, frame.top + fy * frame.height)) {
          return { x: fx * frame.width, y: fy * frame.height };
        }
      }
    }
    throw new Error('Không còn chỗ trống nào trên bản đồ địa điểm.');
  });
}
