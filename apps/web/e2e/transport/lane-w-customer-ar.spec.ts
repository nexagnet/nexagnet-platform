import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Lane W / `#296` — DUONG TIEN, tu mot don go tay den mot dong tien da phan bo.
 *
 * ================================================================================================
 * BO BAI NAY DO HAI THU MA MOT BAN MOCK DE DANG BO QUA
 * ================================================================================================
 *
 * 1. MOT DON TAO TU MAN HINH PHAI DI DUOC TOI DOI SOAT. So cong no chi nhan mot don vao "cho doi
 *    soat" khi don DONG THOI: da `FULFILLED`, ket thuc thuong mai da `APPROVED`, co `customerId`
 *    VA co `freightAmount`. Man "Tao don moi" truoc ban nay chi gui bon truong (ma don, hai dau
 *    tuyen, ngay), nen don tao tu giao dien chay xong roi DUNG LAI mai mai truoc cua doi soat —
 *    khong mot man hinh nao bao loi. Vi the ban gia lap duoi day AP DUNG DUNG bon dieu kien do
 *    thay vi tra ve mot danh sach dung san, va bo bai co mot DOI CHUNG AM: mot don thieu
 *    khach/cuoc, da giao va da ket thuc, KHONG duoc phep xuat hien.
 *
 * 2. KHONG MOT O NHAP NAO DOI MOT ID. Ke toan chon khach bang TEN, chon tien bang SO TIEN + NGAY
 *    NHAN, chon khoan phai thu bang MA DON + SO CON LAI. Bai kiem ca hai chieu: than yeu cau gui
 *    len may chu mang DUNG cac ID noi bo, va man hinh KHONG hien mot ID nao ra cho nguoi doc.
 *
 * ================================================================================================
 * PHAN DUOC MO PHONG, noi thang de khong ai doc nham bo bai nay
 * ================================================================================================
 *
 * Buoc lai xe cham moc va giao hang khong chay o day (no thuoc `#329` va co bo bai rieng). Ban gia
 * lap coi mot don dang nam trong hang cho ket thuc la da giao xong: khi ke toan bam "Da ket thuc",
 * don chuyen `FULFILLED` + `APPROVED`. Moi dieu kien CON LAI cua cong doi soat van do that.
 */

type OrderStatus = 'OPEN' | 'FULFILLED' | 'CANCELLED';

interface OrderRow {
  readonly id: string;
  readonly code: string;
  status: OrderStatus;
  readonly businessDate: string;
  readonly customerId: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  /** `#379` — vang mat o don cu (mock cu khong co truong), co o don tao tu giao dien. */
  readonly originPoint?: { readonly latitude: number; readonly longitude: number } | null;
  readonly destinationPoint?: { readonly latitude: number; readonly longitude: number } | null;
  readonly cargoDescription: string | null;
  readonly freightAmount: number | null;
  readonly currencyCode: 'VND';
  readonly note: null;
  readonly cancelledAt: null;
  readonly cancellationReason: null;
}

interface ReceivableRow {
  readonly documentId: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly currencyCode: string;
  readonly grossAmount: number;
  allocatedAmount: number;
  readonly dueDate: string | null;
}

interface PaymentRow {
  readonly id: string;
  readonly customerId: string;
  readonly amount: number;
  readonly currencyCode: string;
  readonly businessDate: string;
  readonly externalRef: string | null;
  allocatedAmount: number;
}

interface ArMock {
  readonly orders: OrderRow[];
  readonly approved: Set<string>;
  readonly receivables: ReceivableRow[];
  readonly payments: PaymentRow[];
  readonly createBodies: Record<string, unknown>[];
  readonly confirmBodies: { readonly orderId: string; readonly body: Record<string, unknown> }[];
  readonly paymentBodies: Record<string, unknown>[];
  readonly allocationBodies: {
    readonly paymentId: string;
    readonly body: Record<string, unknown>;
  }[];
}

const CUSTOMERS = [
  { id: 'cus-nam-phong', name: 'Công ty Nam Phong' },
  { id: 'cus-hai-ha', name: 'Hải Hà Logistics' },
];

/*
 * `#379` — don moi mang TOA DO hai dau tuyen. Diem giao den tu mot KET QUA TIM gia (mock
 * `POST /transport/places/search`), diem lay tu dia diem da biet — hai duong chon khac nhau, cung
 * mot quy tac "chon gi thi vao o dang chon".
 */
const KHO_HAI_PHONG = { latitude: 20.8449, longitude: 106.6881 };
const NINH_BINH = { latitude: 20.2506, longitude: 105.9745 };

const KNOWN_PLACES = {
  available: true,
  places: [
    {
      id: 'gf-kho-hp',
      kind: 'COUNTERPARTY_SITE',
      name: 'Kho Hải Phòng',
      detail: 'Công ty Nam Phong',
      point: KHO_HAI_PHONG,
      radiusMetres: 300,
    },
  ],
};

const SEARCH_NINH_BINH = {
  status: 'OK',
  reason: null,
  results: [{ label: 'Ninh Bình', address: 'Thành phố Ninh Bình, Ninh Bình', point: NINH_BINH }],
  attribution: '© OpenStreetMap contributors',
  fromCache: false,
};

const json = async (route: Route, body: unknown, status = 200): Promise<void> => {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
};

const customerRow = (entry: { readonly id: string; readonly name: string }) => ({
  ...entry,
  phone: null,
  address: null,
  taxCode: null,
  status: 'ACTIVE',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

/** DUNG bon dieu kien cua cong doi soat, khong phai mot danh sach dung san. */
const pendingOf = (state: ArMock) =>
  state.orders
    .filter(
      (order) =>
        order.status === 'FULFILLED' &&
        state.approved.has(order.id) &&
        order.customerId !== null &&
        order.freightAmount !== null &&
        !state.receivables.some((receivable) => receivable.orderId === order.id),
    )
    .map((order) => ({
      orderId: order.id,
      orderCode: order.code,
      customerId: order.customerId as string,
      proposedAmount: order.freightAmount as number,
      currencyCode: order.currencyCode,
      businessDate: order.businessDate,
    }));

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

const summaryOf = (state: ArMock, asOf: string) => {
  const receivables = state.receivables.map((receivable) => {
    const outstanding = receivable.grossAmount - receivable.allocatedAmount;
    return {
      reconciliation: { orderId: receivable.orderId },
      documentId: receivable.documentId,
      customerId: receivable.customerId,
      currencyCode: receivable.currencyCode,
      grossAmount: receivable.grossAmount,
      allocatedAmount: receivable.allocatedAmount,
      outstandingAmount: outstanding,
      dueDate: receivable.dueDate,
      status: outstanding === 0 ? 'PAID' : 'DUE',
    };
  });
  const payments = state.payments.map((payment) => ({
    payment: {
      id: payment.id,
      customerId: payment.customerId,
      amount: payment.amount,
      currencyCode: payment.currencyCode,
      receivedAt: `${payment.businessDate}T02:00:00.000Z`,
      businessDate: payment.businessDate,
      externalRef: payment.externalRef,
      note: null,
      recordedBy: 'giam-doc',
      sourceId: `src-${payment.id}`,
      sourceFingerprint: `fp-${payment.id}`,
      createdAt: `${payment.businessDate}T02:00:00.000Z`,
    },
    allocations: [],
    allocatedAmount: payment.allocatedAmount,
    unallocatedAmount: payment.amount - payment.allocatedAmount,
  }));
  return {
    asOf,
    customerId: null,
    pendingReconciliationAmount: sum(pendingOf(state).map((row) => row.proposedAmount)),
    officialReceivableAmount: sum(receivables.map((row) => row.grossAmount)),
    outstandingAmount: sum(receivables.map((row) => row.outstandingAmount)),
    notYetDueAmount: 0,
    dueAmount: sum(receivables.map((row) => row.outstandingAmount)),
    overdueAmount: 0,
    paidAmount: sum(receivables.map((row) => row.allocatedAmount)),
    unallocatedCreditAmount: sum(payments.map((row) => row.unallocatedAmount)),
    receivables,
    payments,
  };
};

const completionRowOf = (order: OrderRow, state: ArMock) => ({
  acceptanceId: null,
  orderId: order.id,
  orderCode: order.code,
  orderStatus: order.status,
  customerId: order.customerId,
  originLabel: order.originLabel,
  destinationLabel: order.destinationLabel,
  state: state.approved.has(order.id) ? 'APPROVED' : 'PENDING',
  counterpartyId: order.customerId,
  businessDate: order.businessDate,
  evidenceCount: 0,
  settlementEligible: state.approved.has(order.id),
  runCode: 'W-RUN-AR',
  vehicleId: 'veh-one',
  latestDecidedAt: null,
  latestDecidedBy: null,
  latestDecidedByActor: null,
});

async function mockCustomerAr(page: Page, initialOrders: OrderRow[]): Promise<ArMock> {
  const state: ArMock = {
    orders: [...initialOrders],
    approved: new Set<string>(),
    receivables: [],
    payments: [],
    createBodies: [],
    confirmBodies: [],
    paymentBodies: [],
    allocationBodies: [],
  };

  await page.route('**/auth/config', (route) => json(route, { mode: 'session' }));
  await page.route('**/auth/csrf', (route) => json(route, { csrfToken: 'lane-w-ar-csrf' }));
  await page.route('**/auth/me', (route) =>
    json(route, {
      user: { id: 'giam-doc', username: 'giam-doc', name: 'Giám đốc mẫu', role: 'ADMIN' },
      roles: ['ADMIN'],
    }),
  );

  await page.route('**/transport/customers', (route) => json(route, CUSTOMERS.map(customerRow)));
  await page.route('**/transport/places/known', (route) => json(route, KNOWN_PLACES));
  await page.route('**/transport/places/search', (route) => json(route, SEARCH_NINH_BINH));
  await page.route('**/transport/partners', (route) => json(route, []));
  await page.route('**/transport/vehicles', (route) =>
    json(route, [{ id: 'veh-one', registrationPlate: '15C-123.45' }]),
  );
  await page.route('**/transport/runs', (route) => json(route, []));
  await page.route('**/transport/planning/policy', (route) =>
    json(route, { grouping: 'ONE_ORDER_PER_RUN', depots: [], closure: { idleHours: null } }),
  );
  /*
   * Bang tuoi no nam CUNG mot trang voi so cong no, nen no phai tra ve DU hop dong `ArAgingReport`.
   * Thieu `totalsByBucket` thi ca trang cho ra "Application error" — va bo bai se do o mot cho
   * khong dinh gi toi thu dang duoc do.
   */
  await page.route('**/transport/settlement/ar-aging**', (route) =>
    json(route, {
      asOf: '2026-09-20',
      rows: [],
      totalsByBucket: { CURRENT: 0, D1_30: 0, D31_60: 0, D60_PLUS: 0 },
      outstandingTotal: 0,
      overdueTotal: 0,
    }),
  );

  await page.route('**/transport/orders', async (route) => {
    if (route.request().method() === 'GET') return json(route, state.orders);
    const body = route.request().postDataJSON() as Record<string, unknown>;
    state.createBodies.push(body);
    const created: OrderRow = {
      id: `ord-ui-${state.orders.length + 1}`,
      code: String(body.code),
      status: 'OPEN',
      businessDate: String(body.businessDate),
      customerId: typeof body.customerId === 'string' ? body.customerId : null,
      originLabel: String(body.originLabel),
      destinationLabel: String(body.destinationLabel),
      originPoint: (body.originPoint as OrderRow['originPoint'] | undefined) ?? null,
      destinationPoint: (body.destinationPoint as OrderRow['destinationPoint'] | undefined) ?? null,
      cargoDescription: typeof body.cargoDescription === 'string' ? body.cargoDescription : null,
      freightAmount: typeof body.freightAmount === 'number' ? body.freightAmount : null,
      currencyCode: 'VND',
      note: null,
      cancelledAt: null,
      cancellationReason: null,
    };
    state.orders.push(created);
    return json(route, created, 201);
  });
  await page.route('**/transport/orders/*/legs', (route) => json(route, []));
  await page.route('**/transport/orders/*/documents', (route) => json(route, []));
  await page.route('**/transport/planning/orders/*/plans', (route) => json(route, []));

  await page.route('**/transport/commercial-acceptance', (route) =>
    json(route, { acceptances: state.orders.map((order) => completionRowOf(order, state)) }),
  );
  await page.route('**/transport/commercial-acceptance/orders/*/decisions', async (route) => {
    const orderId = /orders\/([^/]+)\/decisions/.exec(route.request().url())?.[1] ?? '';
    const order = state.orders.find((entry) => entry.id === orderId);
    if (order !== undefined) {
      order.status = 'FULFILLED';
      state.approved.add(order.id);
    }
    await json(route, {
      acceptanceId: `acc-${orderId}`,
      orderId,
      state: 'APPROVED',
      decisions: [],
    });
  });

  await page.route('**/transport/customer-ar/pending**', (route) =>
    json(route, { orders: pendingOf(state) }),
  );
  await page.route('**/transport/customer-ar/batches**', (route) => json(route, { batches: [] }));
  await page.route('**/transport/customer-ar/summary**', (route) => {
    const asOf = new URL(route.request().url()).searchParams.get('asOf') ?? '2026-09-20';
    return json(route, summaryOf(state, asOf));
  });

  await page.route('**/transport/customer-ar/orders/*/confirmations', async (route) => {
    const orderId = /orders\/([^/]+)\/confirmations/.exec(route.request().url())?.[1] ?? '';
    const body = route.request().postDataJSON() as Record<string, unknown>;
    state.confirmBodies.push({ orderId, body });
    const order = state.orders.find((entry) => entry.id === orderId);
    state.receivables.push({
      documentId: `doc-ar-${state.receivables.length + 1}`,
      orderId,
      customerId: order?.customerId ?? 'khong-xac-dinh',
      currencyCode: String(body.currencyCode ?? 'VND'),
      grossAmount: Number(body.confirmedAmount),
      allocatedAmount: 0,
      dueDate: '2026-10-05',
    });
    await json(route, { reconciliation: { id: `rec-${orderId}` }, replayed: false }, 201);
  });

  await page.route('**/transport/customer-ar/payments', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    state.paymentBodies.push(body);
    const created: PaymentRow = {
      id: `pay-ar-${state.payments.length + 1}`,
      customerId: String(body.customerId),
      amount: Number(body.amount),
      currencyCode: String(body.currencyCode ?? 'VND'),
      businessDate: String(body.businessDate),
      externalRef: body.externalRef === null ? null : String(body.externalRef),
      allocatedAmount: 0,
    };
    state.payments.push(created);
    await json(
      route,
      {
        payment: {
          id: created.id,
          customerId: created.customerId,
          amount: created.amount,
          currencyCode: created.currencyCode,
          receivedAt: `${created.businessDate}T02:00:00.000Z`,
          businessDate: created.businessDate,
          externalRef: created.externalRef,
          note: null,
          recordedBy: 'giam-doc',
          sourceId: `src-${created.id}`,
          sourceFingerprint: `fp-${created.id}`,
          createdAt: `${created.businessDate}T02:00:00.000Z`,
        },
        allocations: [],
        allocatedAmount: 0,
        unallocatedAmount: created.amount,
      },
      201,
    );
  });

  await page.route('**/transport/customer-ar/payments/*/allocations', async (route) => {
    const paymentId = /payments\/([^/]+)\/allocations/.exec(route.request().url())?.[1] ?? '';
    const body = route.request().postDataJSON() as Record<string, unknown>;
    state.allocationBodies.push({ paymentId, body });
    const payment = state.payments.find((entry) => entry.id === paymentId);
    const receivable = state.receivables.find((entry) => entry.documentId === body.documentId);
    const amount = Number(body.amount);
    if (payment !== undefined) payment.allocatedAmount += amount;
    if (receivable !== undefined) receivable.allocatedAmount += amount;
    await json(route, { allocation: { id: `alloc-${paymentId}`, amount } }, 201);
  });

  return state;
}

/** Mot don CU tao qua API, thieu ca khach lan cuoc — doi chung am cua cong doi soat. */
const legacyOrder = (): OrderRow => ({
  id: 'ord-legacy-no-customer',
  code: 'W-LEGACY-01',
  status: 'OPEN',
  businessDate: '2026-09-20',
  customerId: null,
  originLabel: 'Kho Hà Nội',
  destinationLabel: 'Nam Định',
  cargoDescription: null,
  freightAmount: null,
  currencyCode: 'VND',
  note: null,
  cancelledAt: null,
  cancellationReason: null,
});

const finishCommercially = async (page: Page, orderCode: string): Promise<void> => {
  await page.goto('/?section=order-completion');
  const row = page.getByRole('row').filter({ hasText: orderCode });
  await row.getByRole('button', { name: 'Đã kết thúc' }).click();
  const dialog = page.getByRole('dialog', { name: `Đã kết thúc đơn ${orderCode}?` });
  // Khong co chung tu so thi phai NOI RO da nhan gi — cong nay la cua `#275`, khong phai cua Lane W.
  await dialog
    .getByLabel('Bên B đã nhận / xác nhận gì')
    .fill('Đã nhận biên bản giao hàng có chữ ký người nhận');
  await dialog.getByRole('button', { name: 'Đã kết thúc' }).click();
  await expect(dialog).toHaveCount(0);
};

test.describe('Lane W — tu don go tay den tien da phan bo', () => {
  test('don tao bang giao dien mang du khach + cuoc, roi di het duong toi phan bo tien', async ({
    page,
  }) => {
    const state = await mockCustomerAr(page, [legacyOrder()]);

    /* --- 1. TAO DON: chon khach bang TEN, nhap cuoc --- */
    await page.goto('/?section=movement');
    await page.getByRole('button', { name: 'Tạo đơn mới' }).click();
    const create = page.getByRole('form', { name: 'Tạo đơn hàng' });
    await expect(create).toBeVisible();

    // Diem lay: dia diem da biet. Diem giao: mot ket qua tim (gia) — chon, khong go.
    // Ten nut mang TEN dia diem (`#379`): moi nut "Chọn làm …" mot ten rieng.
    await page
      .getByRole('button', { name: 'Chọn làm điểm lấy hàng: Kho Hải Phòng', exact: true })
      .click();
    const finder = page.getByRole('search', { name: 'Tìm địa điểm' });
    await finder.getByRole('searchbox').fill('Ninh Bình');
    await finder.getByRole('button', { name: 'Tìm' }).click();
    await page
      .getByRole('button', {
        name: 'Chọn làm điểm giao hàng: Ninh Bình (kết quả 1)',
        exact: true,
      })
      .click();

    // Man hinh KHONG hoi mot ma khach nao — no hoi mot cai ten.
    await expect(create.getByLabel('Mã khách hàng')).toHaveCount(0);
    await create.getByLabel('Mã đơn').fill('W-AR-UI-01');
    await create.getByLabel('Khách hàng').selectOption({ label: 'Công ty Nam Phong' });
    await create.getByLabel('Ngày vận hành').fill('2026-09-20');
    await create.getByLabel('Cước (đ)').fill('5000000');
    await create.getByLabel('Hàng hoá (tuỳ chọn)').fill('Gạch men 12 pallet');
    await page.getByRole('button', { name: 'Tạo đơn', exact: true }).click();

    await expect(page.getByText('Đã tạo đơn W-AR-UI-01')).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'W-AR-UI-01' })).toBeVisible();
    expect(state.createBodies).toHaveLength(1);
    expect(state.createBodies[0]).toMatchObject({
      code: 'W-AR-UI-01',
      customerId: 'cus-nam-phong',
      freightAmount: 5_000_000,
      cargoDescription: 'Gạch men 12 pallet',
      originLabel: 'Kho Hải Phòng',
      destinationLabel: 'Ninh Bình',
      originPoint: KHO_HAI_PHONG,
      destinationPoint: NINH_BINH,
    });

    // Don vua tao doc ra bang TEN khach va SO cuoc, khong phai mot `cuid`.
    const createdRow = page.getByRole('row').filter({ hasText: 'W-AR-UI-01' });
    await expect(createdRow).toContainText('Công ty Nam Phong');
    await expect(createdRow).toContainText('5.000.000 đ');
    await expect(createdRow).not.toContainText('cus-nam-phong');

    /* --- 2. KET THUC THUONG MAI cho ca hai don --- */
    await finishCommercially(page, 'W-AR-UI-01');
    await finishCommercially(page, 'W-LEGACY-01');

    /* --- 3. CHO DOI SOAT nhan don co khach + cuoc, va CHI don do --- */
    await page.goto('/?section=settlement');
    const arPanel = page.getByRole('region', { name: 'Đối soát và công nợ khách hàng' });
    const pendingTable = arPanel.getByRole('table', { name: 'Đơn chờ đối soát' });
    await expect(pendingTable.getByRole('row').filter({ hasText: 'W-AR-UI-01' })).toContainText(
      'Công ty Nam Phong',
    );
    // Don cu da giao va da ket thuc, nhung thieu khach + cuoc: cong doi soat KHONG nhan.
    await expect(pendingTable.getByRole('row').filter({ hasText: 'W-LEGACY-01' })).toHaveCount(0);

    /* --- 4. XAC NHAN DOI SOAT: chon don bang MA DON --- */
    /*
     * Bon o nhap cua man nay nam trong bon NGAN DONG SAN (`CommandPanel`), xep theo thu tu nghiep
     * vu 1→4. Nguoi mo man hinh de XEM cong no khong phai cuon qua chung nua, nen moi buoc go vao
     * bat dau bang mot lan mo ngan — dung nhu tren man `Bảo dưỡng` va `Nhiên liệu`.
     */
    await page.getByRole('button', { name: 'Chốt một đơn' }).click();
    const confirmForm = page.getByRole('form', { name: 'Xác nhận đối soát trực tiếp' });
    await confirmForm.getByLabel('Đơn chờ đối soát').selectOption({ label: 'W-AR-UI-01' });
    await confirmForm.getByLabel('Số tiền xác nhận').fill('5000000');
    await confirmForm.getByLabel('Ngày nghiệp vụ').fill('2026-09-20');
    await confirmForm.getByRole('button', { name: 'Xác nhận đối soát' }).click();

    await expect(page.getByText('Đã xác nhận đối soát và tạo phải thu chính thức.')).toBeVisible();
    expect(state.confirmBodies).toHaveLength(1);
    expect(state.confirmBodies[0]?.orderId).toBe('ord-ui-2');
    expect(state.confirmBodies[0]?.body).toMatchObject({ confirmedAmount: 5_000_000 });

    /* --- 5. GHI NHAN TIEN: chon khach bang TEN --- */
    await page.getByRole('button', { name: 'Nhập tiền về' }).click();
    const paymentForm = page.getByRole('form', { name: 'Ghi nhận thanh toán hoặc trả trước' });
    await expect(paymentForm.getByLabel('Mã khách hàng')).toHaveCount(0);
    await paymentForm.getByLabel('Khách hàng').selectOption({ label: 'Công ty Nam Phong' });
    await paymentForm.getByLabel('Số tiền').fill('5000000');
    await paymentForm.getByLabel('Thời điểm nhận').fill('2026-09-20T09:00');
    await paymentForm.getByLabel('Ngày nghiệp vụ').fill('2026-09-20');
    await paymentForm.getByLabel('Tham chiếu ngân hàng').fill('VCB-9911');
    await paymentForm.getByRole('button', { name: 'Ghi nhận thanh toán' }).click();

    await expect(
      page.getByText('Đã ghi nhận tiền; phần chưa phân bổ được giữ là tiền nhận trước.'),
    ).toBeVisible();
    expect(state.paymentBodies).toHaveLength(1);
    expect(state.paymentBodies[0]).toMatchObject({
      customerId: 'cus-nam-phong',
      amount: 5_000_000,
    });

    /* --- 6. PHAN BO: chon tien va chon khoan phai thu bang chu, khong go mot ID nao --- */
    /*
     * Ngan 4 KHONG phai bam mo — no tu mo ngay sau khi ghi nhan tien. Buoc 3 luon keo theo buoc 4,
     * va man hinh da chon san khoan vua ghi (khang dinh ngay duoi); de lua chon do sau mot cai nut
     * dong thi khong ai nhin thay no. Bai nay do CHINH dieu do.
     */
    await expect(page.getByRole('button', { name: 'Gắn tiền vào nợ' })).toHaveCount(0);
    const allocateForm = page.getByRole('form', { name: 'Phân bổ thanh toán' });
    await expect(allocateForm.getByLabel('Mã thanh toán')).toHaveCount(0);
    await expect(allocateForm.getByLabel('Mã chứng từ phải thu')).toHaveCount(0);

    const paymentChoice = allocateForm.getByLabel('Khoản tiền đã nhận');
    await expect(paymentChoice).toHaveValue('pay-ar-1');
    await expect(paymentChoice).toContainText(
      'Công ty Nam Phong · 5.000.000 VND · nhận 20/09/2026 · còn 5.000.000 VND chưa phân bổ · VCB-9911',
    );

    const receivableChoice = allocateForm.getByLabel('Khoản phải thu');
    await expect(receivableChoice).toContainText('W-AR-UI-01 · Công ty Nam Phong · còn 5.000.000');
    // Chon bang DUNG cau ma ke toan doc duoc — neu nhan doi, bai nay do ngay o day.
    await receivableChoice.selectOption({
      label: 'W-AR-UI-01 · Công ty Nam Phong · còn 5.000.000 VND · đến hạn (hạn 05/10/2026)',
    });
    await allocateForm.getByLabel('Số tiền phân bổ').fill('5000000');
    await allocateForm.getByLabel('Ngày nghiệp vụ').fill('2026-09-20');
    await allocateForm.getByRole('button', { name: 'Phân bổ' }).click();

    await expect(page.getByText('Đã phân bổ tiền vào chứng từ phải thu.')).toBeVisible();
    expect(state.allocationBodies).toHaveLength(1);
    expect(state.allocationBodies[0]?.paymentId).toBe('pay-ar-1');
    expect(state.allocationBodies[0]?.body).toMatchObject({
      documentId: 'doc-ar-1',
      amount: 5_000_000,
    });

    /* --- 7. KHONG MOT ID NOI BO NAO LOT RA MAN HINH --- */
    const visible = await arPanel.innerText();
    for (const hidden of ['cus-nam-phong', 'pay-ar-1', 'doc-ar-1', 'ord-ui-2']) {
      expect(visible, hidden).not.toContain(hidden);
    }
  });
});
