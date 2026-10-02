import type { Page, Route } from '@playwright/test';

/**
 * Du lieu gia lap dung chung cho `settings-focus.spec.ts` va `settings-shots.spec.ts`.
 *
 * CO Y tach khoi `settings.spec.ts`: bo test bang gia (#127/#132) tu giu trang thai ky gia BIEN DOI
 * trong tung bai, con hai bo o day chi can mot the gioi TINH va giong nhau moi lan chay. Anh chup
 * man hinh dung lam bang chung chi co gia tri khi cung mot dau vao cho ra cung mot khung hinh — nen
 * moi truong o day khong co gio he thong, khong ngau nhien, khong phu thuoc thu tu bai chay.
 *
 * Moi muc cua `/settings` duoc dat vao TRANG THAI CO VIEC CAN LAM, khong phai trang thai rong: mot
 * man hinh rong khong chung minh duoc rang "viec dang lam" da noi bat hon "boi canh".
 */

export const CURRENT_MONTH = '2026-09';

export const FIXED_NOW = '2026-09-02T03:00:00.000Z';

const products = Array.from({ length: 19 }, (_, index) => ({
  sku: `SP${String(index + 1).padStart(2, '0')}`,
  name: `San pham ${index + 1}`,
  unit: 'cai',
}));

/** Mot nhom da map, MOT NHOM CHUA MAP (viec dang can lam), mot nhom da go. */
export const groups = [
  {
    groupId: 'group-db-1',
    zcaChatId: 'zca-group-1',
    id: 'zca-group-1',
    name: 'Dai ly Meta HN',
    status: 'mapped',
    allowed: true,
    memberCount: 12,
    activeParticipants: 12,
    inactiveParticipants: 0,
    dealerId: 'dealer-1',
    dealerName: 'Dai ly Meta HN',
    lastSyncedAt: '2026-09-01T02:00:00.000Z',
  },
  {
    groupId: 'group-db-2',
    zcaChatId: 'zca-group-2',
    id: 'zca-group-2',
    name: 'CTV Thai Nguyen',
    status: 'pending',
    allowed: true,
    memberCount: 0,
    activeParticipants: 0,
    inactiveParticipants: 0,
  },
  {
    groupId: 'group-db-3',
    zcaChatId: 'zca-group-3',
    id: 'zca-group-3',
    name: 'Nhom test dot truoc',
    status: 'ignored',
    allowed: false,
    memberCount: 0,
    activeParticipants: 0,
    inactiveParticipants: 0,
    dealerId: 'dealer-1',
    dealerName: 'Dai ly Meta HN',
  },
];

export const summary = {
  channelMode: 'hybrid',
  dataClassification: 'test',
  adminUi: 'off',
  zca: { state: 'ready', displayName: 'Tai khoan pilot', allowedGroupIds: ['zca-group-1'] },
  botIdentity: { state: 'ready', id: 'bot-1', name: 'Bot doanh nghiep' },
  autoSend: { enabled: false },
  orderAutomation: { enabled: true, maxAutoConfirmQuantity: 50 },
  sourceTruth: { productCount: 19, dealerCount: 2 },
  rules: { activeVersion: '1', provisionalKeys: ['A3.shipping', 'D8.codFee', 'D15.thresholds'] },
  groups,
  warnings: ['Rank thanh vien khong thay doi don gia.'],
};

export const readiness = {
  codeComplete: true,
  goLiveReady: false,
  checkedAt: '2026-09-02T00:00:00.000Z',
  reasons: ['missing_current_price_period'],
  checks: [
    {
      key: 'price.current_period',
      label: 'Bảng giá tháng hiện hành',
      status: 'missing',
      blocking: true,
      detail: 'missing_current_price_period',
    },
    {
      key: 'groups.mapped',
      label: 'Nhóm đã map đại lý',
      status: 'missing',
      blocking: true,
      detail: 'missing_group_mappings',
    },
    {
      key: 'dealers.configured',
      label: 'Đại lý đã cấu hình',
      status: 'ready',
      blocking: true,
      detail: 'ok',
    },
    {
      key: 'channel.listener',
      label: 'Kênh nghe tin',
      status: 'warning',
      blocking: false,
      detail: 'zca_listener_idle',
    },
    {
      key: 'rules.shipping',
      label: 'Cước vận chuyển',
      status: 'blocked',
      blocking: false,
      detail: 'awaiting_A3',
    },
  ],
};

const rules = [
  {
    id: 'rule-active',
    version: '1',
    status: 'active',
    createdAt: '2026-08-20T02:00:00.000Z',
    payload: {},
    provisionalKeys: ['A3.shipping', 'D8.codFee'],
    provisionalVerified: false,
  },
  {
    id: 'rule-draft',
    version: '2',
    status: 'draft',
    createdAt: '2026-09-01T02:00:00.000Z',
    payload: {},
    provisionalKeys: [],
    provisionalVerified: true,
  },
];

const campaigns = [
  {
    id: 'campaign-draft',
    name: 'Chao thang 9',
    content: 'Kinh gui quy dai ly, thang 9 co chuong trinh moi.',
    kind: 'one_off',
    status: 'draft',
    createdAt: '2026-09-01T01:00:00.000Z',
    targets: [{ id: 't1', groupId: 'zca-group-1', chatId: 'zca-group-1', enabled: true }],
    deliveries: [],
  },
  {
    id: 'campaign-approved',
    name: 'Nhac cong no ky truoc',
    content: 'Nhac nhe quy dai ly ve cong no ky truoc.',
    kind: 'one_off',
    status: 'approved',
    createdAt: '2026-08-28T01:00:00.000Z',
    targets: [{ id: 't2', groupId: 'zca-group-1', chatId: 'zca-group-1', enabled: true }],
    deliveries: [],
  },
];

const notificationSettings = {
  email: {
    enabled: true,
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    user: 'thongbao@example.com',
    pass: '********',
    from: 'thongbao@example.com',
    recipients: ['sale@example.com', 'quanly@example.com'],
  },
  zalo: {
    enabled: true,
    targetMemberNames: ['Nguyen Thu Phuong'],
    targetMemberIds: [],
    targetGroupIds: [],
  },
};

const leads = [
  {
    leadId: 'lead-1',
    payload: {
      fullName: 'Tran Van A',
      phone: '0900000001',
      email: 'a@example.com',
      company: 'Cong ty A',
      workflow: 'sales-order',
    },
    dispatchResult: {
      leadId: 'lead-1',
      zalo: { success: true, recipientsSent: ['Nguyen Thu Phuong'] },
      email: { success: true, recipientsSent: ['sale@example.com'] },
      dispatchedAt: '2026-09-01T04:00:00.000Z',
    },
    createdAt: '2026-09-01T04:00:00.000Z',
  },
  {
    leadId: 'lead-2',
    payload: {
      fullName: 'Le Thi B',
      phone: '0900000002',
      email: 'b@example.com',
      company: 'Cong ty B',
      workflow: 'knowledge',
    },
    dispatchResult: {
      leadId: 'lead-2',
      zalo: { success: false, message: 'listener_not_ready' },
      email: { success: true, recipientsSent: ['sale@example.com'] },
      dispatchedAt: '2026-09-01T06:00:00.000Z',
    },
    createdAt: '2026-09-01T06:00:00.000Z',
  },
];

const auditEntries = [
  {
    id: 'audit-1',
    actor: 'quanly',
    action: 'activate',
    entityType: 'price',
    entityId: 'period-08',
    createdAt: '2026-09-01T03:00:00.000Z',
    before: { status: 'draft' },
    after: { status: 'active' },
  },
  {
    id: 'audit-2',
    actor: 'quanly',
    action: 'update',
    entityType: 'rule_config',
    entityId: 'rule-active',
    createdAt: '2026-08-30T03:00:00.000Z',
    before: null,
    after: { version: '1' },
  },
];

/**
 * `#395` — hinh dang `AccountView` cua may chu moi: them lan dang nhap gan nhat, co mat khau tam,
 * chuc danh, quyen rieng va co "tai khoan he thong". Man `/settings` doc duoc ca hinh cu lan moi.
 */
const accountExtras = {
  mustChangePassword: false,
  temporaryPasswordExpiresAt: null,
  jobTitle: null,
  permissionGrants: [],
  isProtected: false,
};

const users = [
  {
    id: 'u-admin',
    username: 'admin',
    name: 'Quan Tri Vien',
    role: 'ADMIN',
    disabledAt: null,
    lastLoginAt: '2026-09-25T01:00:00.000Z',
    ...accountExtras,
  },
  {
    id: 'u-sale',
    username: 'sale1',
    name: 'Nguyen Thu Phuong',
    role: 'SALE',
    disabledAt: null,
    lastLoginAt: null,
    ...accountExtras,
  },
  {
    id: 'u-old',
    username: 'ketoan_cu',
    name: 'Ke Toan Cu',
    role: 'ACCOUNTING',
    disabledAt: '2026-08-01T00:00:00.000Z',
    lastLoginAt: '2026-07-30T08:00:00.000Z',
    ...accountExtras,
  },
];

/** Mat khau tam SINH LUC CHAY — khong mot chuoi mat khau nao nam trong ma nguon. */
const temporaryCredential = () => ({
  temporaryPassword: Array.from({ length: 16 }, (_, index) => 'abcdefghjkmnpqrs'[index]).join(''),
  expiresAt: '2026-09-28T01:00:00.000Z',
});

const contentSnapshot = {
  provenance: [{ id: 'local_manifest:inventory', kind: 'local_manifest', sourceId: 'inventory' }],
  assets: [],
  faqs: [
    {
      id: 'faq-1',
      externalId: 'faq-1',
      productSku: 'SP01',
      question: 'San pham nay ve sinh the nao?',
      answer: 'Lau bang khan mem.',
      status: 'draft',
      operatorEdited: false,
      provenanceKey: 'local_manifest:inventory',
    },
  ],
  advice: [
    {
      id: 'advice-1',
      externalId: 'advice-1',
      productSku: 'SP02',
      title: 'Tu van chon size',
      body: 'Chon theo dien tich phong.',
      status: 'active',
      operatorEdited: true,
      provenanceKey: null,
    },
  ],
  links: [],
  readiness: [
    { productSku: 'SP01', ready: false, missing: ['active_image'] },
    { productSku: 'SP02', ready: true, missing: [] },
    { productSku: 'SP03', ready: false, missing: ['faq', 'active_image'] },
  ],
};

/** Mot ky thang truoc dang ap dung, thang hien tai CHUA co — day la viec dang chan ban hang. */
const pricePeriods = {
  currentMonth: CURRENT_MONTH,
  currentPeriodId: null,
  missingCurrentPeriod: true,
  periods: [
    {
      id: 'period-08',
      validMonth: '2026-08',
      status: 'active',
      source: 'operator',
      prices: products.map((product, index) => ({
        sku: product.sku,
        wholesale: 1_000_000 + index * 1000,
      })),
    },
  ],
};

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

export interface MockOptions {
  /** Vai tro dang nhap. `null` = khong bat dang nhap (mode `none`), giong demo hien tai. */
  readonly role?: 'ADMIN' | 'MANAGER' | 'SALE' | null;
}

/**
 * Cai toan bo cac route ma `/settings` doc, TRUOC khi dieu huong.
 *
 * Moi route deu tra du lieu tinh; khong route nao phu thuoc thu tu goi, nen mot bai chay rieng va
 * mot bai chay trong ca bo cho ra cung ket qua.
 */
export async function mockSettingsSurfaces(page: Page, options: MockOptions = {}): Promise<void> {
  const role = options.role === undefined ? null : options.role;

  if (role) {
    await page.route('**/auth/config', (route) => json(route, { mode: 'session' }));
    await page.route('**/auth/me', (route) =>
      json(route, {
        user: {
          id: `u-${role.toLowerCase()}`,
          username: role.toLowerCase(),
          name: 'Nguoi dung',
          role,
        },
        roles: [role],
      }),
    );
  } else {
    await page.route('**/auth/config', (route) => json(route, { mode: 'none' }));
  }
  await page.route('**/auth/csrf', (route) => json(route, { csrfToken: null }));

  await page.route('**/settings/summary', (route) => json(route, summary));
  await page.route('**/settings/readiness', (route) => json(route, readiness));
  await page.route('**/settings/price-periods', (route) => json(route, pricePeriods));
  await page.route('**/settings/rules', (route) => json(route, rules));
  await page.route('**/settings/rules/*/preview', (route) =>
    json(route, {
      totals: { itemsSubtotal: 11_500_000, shipFee: 0, vat: 0, grandTotal: 11_500_000 },
      warnings: ['Cuoc ship chua cau hinh nen don chuyen Sale.'],
    }),
  );
  await page.route('**/settings/audit**', (route) =>
    json(route, { entries: auditEntries, total: auditEntries.length, page: 1, limit: 25 }),
  );
  // Dang ky tu CHUNG den RIENG: Playwright uu tien route dang ky SAU, nen mot catch-all dat cuoi
  // se nuot ca cac duong dan rieng phia truoc. Sai thu tu o day tung lam man Thong bao vo that
  // (`leads` tra ve object thay vi mang) va trong nhu mot loi cua ung dung.
  // `#395`: tao / dat lai mat khau tra kem `credential` (mat khau tam, mot lan); con lai tra tai khoan.
  await page.route('**/settings/users/**', (route) =>
    route.request().url().includes('/credentials/reset')
      ? json(route, { ...users[1], credential: temporaryCredential() })
      : json(route, users[0]),
  );
  await page.route('**/settings/users', (route) =>
    route.request().method() === 'POST'
      ? json(
          route,
          {
            ...users[1],
            id: 'u-new',
            username: 'moi',
            mustChangePassword: true,
            credential: temporaryCredential(),
          },
          201,
        )
      : json(route, users),
  );
  await page.route('**/settings/participants**', (route) => json(route, []));

  await page.route('**/settings/source-truth', (route) =>
    json(route, [
      {
        resource: 'dealers',
        rows: [
          {
            id: 'dealer-1',
            label: 'Dai ly Meta HN',
            code: 'META-HN',
            fields: {
              id: 'dealer-1',
              name: 'Dai ly Meta HN',
              tier: 'dai_ly',
              defaultPolicy: 'cong_no_30',
            },
          },
          {
            id: 'dealer-2',
            label: 'CTV Thai Nguyen',
            code: 'CTV-TN',
            fields: {
              id: 'dealer-2',
              name: 'CTV Thai Nguyen',
              tier: 'ctv',
              defaultPolicy: 'thanh_toan_ngay',
            },
          },
        ],
      },
      { resource: 'products', rows: [] },
      { resource: 'overrides', rows: [] },
      { resource: 'glossary', rows: [] },
      { resource: 'groups', rows: [] },
    ]),
  );
  await page.route('**/settings/source-truth/*', (route) => {
    const resource = new URL(route.request().url()).pathname.split('/').pop();
    if (resource === 'dealers') {
      return json(route, [
        { id: 'dealer-1', name: 'Dai ly Meta HN', tier: 'dai_ly' },
        { id: 'dealer-2', name: 'CTV Thai Nguyen', tier: 'ctv' },
      ]);
    }
    if (resource === 'products') return json(route, products);
    return json(route, []);
  });

  await page.route('**/settings/content', (route) => json(route, contentSnapshot));
  await page.route('**/settings/content/import/preview', (route) =>
    json(route, { creates: 2, updates: 1, unchanged: 3, conflicts: 0, errors: [] }),
  );
  await page.route('**/campaigns/**', (route) => json(route, campaigns[0]));
  await page.route('**/campaigns/policy', (route) =>
    json(route, {
      defaultWindow: { start: '08:00', end: '12:00' },
      minSpacingSeconds: 30,
      maxTargets: 500,
      rateLimitPerMinute: 30,
      claimLeaseSeconds: 60,
      tickIntervalSeconds: 10,
      retry: { maxAttempts: 4, baseBackoffSeconds: 60 },
    }),
  );
  await page.route('**/campaigns', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, {
        id: 'campaign-new',
        ...body,
        status: 'draft',
        createdAt: FIXED_NOW,
        targets: [],
        deliveries: [],
      });
    }
    return json(route, campaigns);
  });

  await page.route('**/settings/notifications/**', (route) =>
    json(route, { success: true, message: 'Da gui thu nghiem.' }),
  );
  await page.route('**/settings/notifications/leads', (route) => json(route, leads));
  await page.route('**/settings/notifications', (route) => json(route, notificationSettings));

  await page.route('**/settings/automation/auto-send', (route) =>
    json(route, {
      autoSend: (route.request().postDataJSON() as { enabled: boolean }).enabled ? 'on' : 'off',
    }),
  );
  await page.route('**/settings/groups/*/mapping', (route) =>
    json(route, { chatId: 'zca-group-2', dealerId: 'dealer-1', status: 'mapped' }),
  );
  await page.route('**/settings/groups/*/hidden', (route) =>
    json(route, {
      chatId: 'zca-group-1',
      status: (route.request().postDataJSON() as { hidden: boolean }).hidden ? 'ignored' : 'mapped',
    }),
  );
  await page.route('**/zalo/groups/*/members/sync', (route) =>
    json(route, {
      groupId: 'zca-group-1',
      complete: true,
      expectedCount: 12,
      fetchedCount: 12,
      failedCount: 0,
      upsertedCount: 12,
      deactivatedCount: 0,
      syncedAt: FIXED_NOW,
    }),
  );
  await page.route('**/zalo/logout', (route) =>
    json(route, { state: 'logged_out', allowedGroupIds: [], botIdentity: summary.botIdentity }),
  );
}

/** Cac muc duoc kiem chung ngoai `products-pricing` — dung thu tu cua dieu huong. */
export const TARGET_SECTIONS = [
  'overview',
  'dealers-groups',
  'sales-policy',
  'content',
  'campaigns',
  'notifications',
  'zalo',
  'automation',
  'system-status',
  'users',
  'audit',
] as const;

export type TargetSection = (typeof TARGET_SECTIONS)[number];

/** Cac muc phai chung minh o khung hep — dung danh sach cua #146 §Automated proof. */
export const NARROW_SECTIONS: readonly TargetSection[] = [
  'dealers-groups',
  'sales-policy',
  'content',
  'campaigns',
  'notifications',
  'users',
];

export async function measureHorizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}
