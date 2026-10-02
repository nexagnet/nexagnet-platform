import { expect, test, type Route } from '@playwright/test';
import { mockLifecycle } from './lifecycle-server';

/**
 * FUEL EVENT RUN-FIRST tren trinh duyet — `#364`, may chu gia co trang thai.
 *
 * ==============================================================================================
 * KIEM DIEU GI
 *
 *   1. Lai xe co VIEC DUOC DIEU (vong xe) ma KHONG co chuyen cu: khai duoc phieu; than yeu cau mang
 *      `runId`/`legId` va KHONG mang `tripId`/`vehicleId`/`driverId`. Tien mat lai xe ung CHON DUOC
 *      tren vong xe (`#380`, khop `#369` R-4) — khong con nhan "chỉ chuyến cũ".
 *   2. Khong vong xe, khong chuyen cu: man hinh noi ro chua khai duoc — khong bia ngu canh.
 *   3. Ke toan thay phieu KHONG chuyen trong hop thu, loc duoc theo MA VONG XE, va phan bo gia thanh
 *      o mot khoi RIENG — lenh ghi duy nhat la lenh phan bo, khong cham phieu.
 *
 * KHONG KIEM: may chu that tinh dung — do la viec cua `apps/api` (`fuel-run-first.spec.ts`,
 * `fuel-cost-attribution.spec.ts`, va hai bo Postgres that `transport-fuel-*.int.spec.ts`).
 * ==============================================================================================
 */

const AT = '2026-09-10T01:00:00.000Z';

const json = (route: Route, body: unknown, status = 200): Promise<void> =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const RUN = {
  runId: 'run-1',
  runCode: 'RUN-364',
  runStatus: 'ACTIVE',
  vehicleId: 'veh-1',
  vehiclePlate: '29H-152.44',
  legs: [
    {
      legId: 'leg-1',
      sequence: 1,
      kind: 'EMPTY',
      status: 'COMPLETED',
      originLabel: 'Bãi xe',
      destinationLabel: 'Kho A',
    },
    {
      legId: 'leg-2',
      sequence: 2,
      kind: 'LOADED',
      status: 'IN_TRANSIT',
      originLabel: 'Kho A',
      destinationLabel: 'Kho B',
    },
  ],
};

test.describe('lai xe — khai phieu theo viec duoc dieu (#364)', () => {
  test('co vong xe, khong chuyen cu: than yeu cau theo vong xe, tien mat ung CHON DUOC', async ({
    page,
  }) => {
    const state = await mockLifecycle(page, 'SALE');
    state.fuelRuns.push(RUN);

    // Than yeu cau doc NGAY tren su kien `request` — may chu gia cua `mockLifecycle` tra loi.
    const bodies: Record<string, unknown>[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/transport/me/fuel/slips')) {
        bodies.push(request.postDataJSON() as Record<string, unknown>);
      }
    });
    await page.goto('/?surface=driver&screen=fuel');
    const slipForm = page.getByRole('region', { name: 'Ghi phiếu đổ nhiên liệu' });
    await expect(slipForm.getByText('Vòng xe RUN-364 · xe 29H-152.44')).toBeVisible();
    // `#380` — thuoc tinh DOM chu khong `toBeEnabled()`: Playwright 1.62 doc sai `<option disabled>`.
    await expect(slipForm.getByRole('option', { name: /chỉ chuyến cũ/ })).toHaveCount(0);
    await expect(
      slipForm.getByRole('option', { name: 'Lái xe trả tiền mặt', exact: true }),
    ).toHaveJSProperty('disabled', false);
    await slipForm.getByLabel('Thanh toán').selectOption('DRIVER_CASH');
    await expect(slipForm.getByRole('note')).toContainText('trừ vào quỹ lái xe');

    await slipForm.getByLabel('Chặng').selectOption('leg-2');
    await slipForm.getByLabel('Cây xăng').selectOption({ label: 'Petrolimex Cầu Giấy' });
    await slipForm.getByLabel('Số lít').fill('60');
    await slipForm.getByLabel('Số tiền (đồng)').fill('1320000');
    await slipForm.getByLabel('Số km trên đồng hồ').fill('120450');
    await slipForm.getByRole('button', { name: 'Gửi phiếu' }).click();
    await expect(page.getByText('Đã gửi phiếu đổ dầu.')).toBeVisible();
    // Danh sach phieu cua lai xe noi VONG XE + CHANG, khong mot ma chuyen nao.
    await expect(page.getByRole('region', { name: 'Phiếu đổ dầu của bạn' })).toContainText(
      'Vòng xe RUN-364 · Chặng 2',
    );

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      runId: 'run-1',
      legId: 'leg-2',
      supplierId: 'sup-1',
      paymentMethod: 'DRIVER_CASH',
    });
    for (const forbidden of ['tripId', 'vehicleId', 'driverId']) {
      expect(bodies[0]).not.toHaveProperty(forbidden);
    }
  });

  test('khong vong xe, khong chuyen cu: KHONG bia ngu canh, noi ro chua khai duoc', async ({
    page,
  }) => {
    await mockLifecycle(page, 'SALE');
    await page.goto('/?surface=driver&screen=fuel');
    const slipForm = page.getByRole('region', { name: 'Ghi phiếu đổ nhiên liệu' });
    await expect(slipForm.getByText(/chưa có việc được điều nào đang mở/)).toBeVisible();
    await expect(slipForm.getByRole('button', { name: 'Gửi phiếu' })).toHaveCount(0);
  });
});

test.describe('ke toan — phieu khong chuyen va gia thanh rieng (#364)', () => {
  const ENTRY = {
    id: 'fuel-run-1',
    tripId: null,
    runId: 'run-1',
    legId: 'leg-2',
    vehicleId: 'veh-1',
    driverId: 'drv-1',
    supplierId: 'sup-1',
    stationId: null,
    businessDate: '2026-09-10',
    occurredAt: AT,
    litersUnits: 100_000,
    amount: 2_100_000,
    currencyCode: 'VND',
    odometerKm: 120_450,
    previousOdometerKm: 120_050,
    consumptionUnits: 25_000,
    reviewReasons: [],
    paymentMethod: 'SUPPLIER_ACCOUNT',
    verificationStatus: 'VERIFIED',
    reconciliationStatus: 'UNMATCHED',
    sourceStatementId: null,
    invoiceNo: null,
    note: null,
    reviewNote: null,
    recordedBy: 'u-driver',
    createdAt: AT,
    updatedAt: AT,
  };

  const INBOX_ROW = {
    id: ENTRY.id,
    tripId: null,
    tripCode: null,
    runId: 'run-1',
    runCode: 'RUN-364',
    legId: 'leg-2',
    legSequence: 2,
    driverId: 'drv-1',
    driverName: 'Trần Văn Bình',
    vehicleId: 'veh-1',
    vehiclePlate: '29H-152.44',
    supplierId: 'sup-1',
    supplierName: 'Petrolimex Cầu Giấy',
    stationId: null,
    stationName: null,
    businessDate: ENTRY.businessDate,
    occurredAt: AT,
    litersUnits: ENTRY.litersUnits,
    amount: ENTRY.amount,
    currencyCode: 'VND',
    invoiceNo: null,
    paymentMethod: 'SUPPLIER_ACCOUNT',
    verificationStatus: 'VERIFIED',
    reconciliationStatus: 'UNMATCHED',
    reviewReasons: [],
    reviewNote: null,
    evidenceCount: 0,
    evidence: [],
  };

  const attributionView = (lines: readonly Record<string, unknown>[]) => {
    const attributed = lines.reduce((sum, line) => sum + Number(line.signedAmount), 0);
    return {
      fuelEntryId: ENTRY.id,
      amount: ENTRY.amount,
      currencyCode: 'VND',
      verificationStatus: 'VERIFIED',
      businessDate: ENTRY.businessDate,
      vehicleId: 'veh-1',
      ledger: 'FUEL_COST_ATTRIBUTION',
      legacyTrip: null,
      context: { runId: 'run-1', runCode: 'RUN-364', legId: 'leg-2', legSequence: 2 },
      attributedAmount: attributed,
      unattributedAmount: ENTRY.amount - attributed,
      lines,
    };
  };

  test('hop thu thay phieu khong chuyen, loc theo ma vong xe; phan bo gia thanh o khoi rieng', async ({
    page,
  }) => {
    const state = await mockLifecycle(page, 'ACCOUNTING');
    state.fuelEntries.set(ENTRY.id, ENTRY);

    const inboxQueries: URL[] = [];
    await page.route(/\/transport\/fuel\/entries(\?[^/]*)?$/, (route) => {
      const url = new URL(route.request().url());
      inboxQueries.push(url);
      const runCode = url.searchParams.get('runCode');
      const rows = runCode === null || runCode === 'RUN-364' ? [INBOX_ROW] : [];
      return json(route, {
        rows,
        total: rows.length,
        pendingVerificationCount: 0,
        limit: 50,
        offset: 0,
      });
    });

    let lines: Record<string, unknown>[] = [];
    const attributionBodies: Record<string, unknown>[] = [];
    await page.route('**/transport/fuel/entries/fuel-run-1/cost-attribution', (route) =>
      json(route, attributionView(lines)),
    );
    await page.route('**/transport/fuel/entries/fuel-run-1/cost-attributions', (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      attributionBodies.push(body);
      lines = [
        ...lines,
        {
          id: 'attr-1',
          kind: 'ALLOCATION',
          targetKind: 'RUN',
          runId: 'run-1',
          runCode: 'RUN-364',
          legId: null,
          legSequence: null,
          signedAmount: body.amount,
          reversalOfId: null,
          reversedById: null,
          note: body.note,
          recordedBy: 'u-acc',
          createdAt: AT,
        },
      ];
      return json(route, attributionView(lines));
    });

    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET' && request.url().includes('/transport/')) {
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
      }
    });

    await page.goto('/?section=fuel');
    const rowHeader = page.getByRole('rowheader', { name: 'Vòng xe RUN-364 · Chặng 2' });
    await expect(rowHeader).toBeVisible();

    // Loc theo MA VONG XE: may chu nhan dung tham so, va phieu van con do.
    await page.getByPlaceholder('Ví dụ: RUN-DH-0001').fill('RUN-364');
    await expect
      .poll(() => inboxQueries.some((url) => url.searchParams.get('runCode') === 'RUN-364'))
      .toBe(true);
    await expect(rowHeader).toBeVisible();

    await rowHeader.click();
    const detail = page.getByRole('region', { name: /Phiếu đổ dầu Vòng xe RUN-364 · Chặng 2/ });
    const panel = detail.getByRole('region', { name: 'Giá thành nhiên liệu' });
    await panel.getByRole('button', { name: 'Giá thành nhiên liệu' }).click();
    await expect(panel).toContainText('giá thành không tự vào chuyến nào');

    const form = panel.getByRole('form', { name: 'Phân bổ giá thành' });
    await form.getByLabel('Công việc nhận giá thành').selectOption({ label: 'Vòng xe RUN-364' });
    await form.getByLabel('Số tiền (đồng)').fill('1500000');
    await form.getByRole('button', { name: 'Phân bổ' }).click();

    await expect(panel.getByRole('list', { name: 'Các dòng phân bổ' })).toContainText(
      'Phân bổ · Vòng xe RUN-364',
    );
    expect(attributionBodies).toHaveLength(1);
    expect(attributionBodies[0]).toMatchObject({
      target: { kind: 'RUN', runId: 'run-1' },
      amount: 1_500_000,
      note: null,
    });
    expect(String(attributionBodies[0]?.correlationKey ?? '').length).toBeGreaterThanOrEqual(8);
    expect(attributionBodies[0]).not.toHaveProperty('tripId');

    // Lenh ghi DUY NHAT la lenh phan bo: khong duyet lai, khong sua phieu, khong cham chi phi chuyen.
    expect(writes).toEqual(['POST /transport/fuel/entries/fuel-run-1/cost-attributions']);
    expect(state.fuelEntries.get(ENTRY.id)).toEqual(ENTRY);
  });
});
