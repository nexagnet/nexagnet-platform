import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * TRANG CHU LAI XE RUN-FIRST — `#340`, tren trinh duyet that o 390px.
 *
 * ==============================================================================================
 * LOI DUOC SUA
 *
 * Trang chu chi doc `/transport/me/trips` (`TransportTrip`). Lai xe duoc dieu mot vong chay THAT —
 * man Hien truong thay no — van doc tren trang chu "Chưa có chuyến nào được phân công cho bạn", va
 * khong co duong nao dan sang Hien truong.
 *
 * ==============================================================================================
 * BAI NAY KIEM
 *
 *   1. Vong chay that + chuyen cu RONG: trang chu noi CO viec (ma vong chay, chang, tuyen, giai
 *      doan, don), va MOT cham vao Hien truong — man do hien NGAY tu cung lan doc, cung o nho.
 *   2. Co ca chuyen cu lan vong chay: vong chay THANG — nam tren, chuyen cu o loi phu va khong mang
 *      nut doi trang thai Trip nao.
 *   3. Khong co ca hai: trang thai rong THAT, va Nhan viec tai diem la mot duong RIENG.
 *   4. Doc viec duoc dieu HONG: bao hong kem nut thu lai — KHONG noi "khong co viec".
 *   5. Khong mot con so doanh thu nao, va trang chu chi doc duong cua CHINH lai xe (`/transport/me/`).
 *
 * KHONG KIEM: rang may chu tinh dung. May chu o day la GIA — read model that o
 * `apps/api/src/transport/field/`, luat chon "the chinh" o `workspace/__tests__/driver.spec.ts`.
 */

const AT = '2026-09-22T03:00:00.000Z';
const RUN_HEADING = 'Việc được điều từ văn phòng';
const LEGACY_HEADING = 'Chuyến theo cách làm trước đây';

/** Mot vong chay, mot chang CO hang, chua bat dau — may chu chao `Đã tới điểm lấy hàng`. */
const RUN = {
  runId: 'run-1',
  runCode: 'VC-001',
  legs: [
    {
      legId: 'leg-1',
      sequence: 1,
      kind: 'LOADED',
      originLabel: 'Hà Nội',
      destinationLabel: 'Hải Phòng',
      orderCode: 'ORD-1',
      orderId: 'ord-1',
      phase: 'PLANNED',
      recordedTypes: [],
      arrivalCheckpointId: null,
      waiting: null,
      documents: [],
      missingDocumentTypes: [],
      receiptHandover: null,
      nextActions: [
        {
          kind: 'CHECKPOINT',
          label: 'Đã tới điểm lấy hàng',
          checkpointType: 'PICKUP_ARRIVAL',
          requiresLocation: false,
          required: true,
        },
      ],
    },
  ],
};

/** Chuyen theo cach lam truoc day, DANG CHAY, cua chinh lai xe nay. */
const LEGACY_TRIP = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'VT-2026-0912',
  kind: 'OWN_DIRECT',
  status: 'IN_TRANSIT',
  businessDate: '2026-09-22',
  originLabel: 'Hà Nội',
  destinationLabel: 'Thái Nguyên',
  cargoDescription: 'Hàng gia dụng',
  distanceKm: 78,
  customerName: 'Công ty Đông Anh',
  vehicleId: 'veh-1',
  vehicleRegistrationPlate: '29H-123.45',
  assignedAt: '2026-09-22T01:00:00.000Z',
  isCurrentAssignee: true,
};

const FUND = {
  account: {
    id: 'acc-1',
    driverId: 'drv-1',
    currencyCode: 'VND',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
  },
  driverId: 'drv-1',
  balance: 2_000_000,
  balanceStance: 'DRIVER_HOLDS_COMPANY_CASH',
  currencyCode: 'VND',
  entries: [],
};

interface HomeState {
  trips: readonly unknown[];
  runs: readonly unknown[];
  fieldWorkFails: boolean;
  fieldReads: number;
  /** Khac `null` thi moi lan doc `field-work` DUNG LAI cho toi khi lan hua nay xong. */
  hold: Promise<void> | null;
  /** Moi duong `/transport/*` trang da goi — de khang dinh trang chu chi doc duong cua lai xe. */
  readonly transportPaths: string[];
}

const json = async (route: Route, body: unknown, status = 200): Promise<void> => {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
};

async function mockHome(page: Page, initial: Partial<HomeState> = {}): Promise<HomeState> {
  const state: HomeState = {
    trips: [],
    runs: [],
    fieldWorkFails: false,
    fieldReads: 0,
    hold: null,
    transportPaths: [],
    ...initial,
  };

  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/transport/')) state.transportPaths.push(path);
  });

  await page.route('**/auth/config', (route) => json(route, { mode: 'session' }));
  await page.route('**/auth/me', (route) =>
    json(route, {
      user: { id: 'u-driver', username: 'laixe', name: 'Lai xe Binh', role: 'SALE' },
      roles: ['SALE'],
    }),
  );
  await page.route('**/auth/csrf', (route) => json(route, { csrfToken: 'e2e-csrf' }));
  await page.route('**/transport/me/trips', (route) => json(route, state.trips));
  await page.route('**/transport/me/fund', (route) => json(route, FUND));
  await page.route('**/transport/me/field-work', async (route) => {
    state.fieldReads += 1;
    if (state.hold !== null) await state.hold;
    if (state.fieldWorkFails) {
      await json(route, { message: 'Mất kết nối tạm thời' }, 503);
      return;
    }
    await json(route, { serverNow: AT, runs: state.runs });
  });

  return state;
}

/** 30 giay: bai dau tien cua cau hinh tra tien bien dich cua `next dev` — xem `field-location-checkpoint.spec.ts`. */
const openHome = async (page: Page): Promise<void> => {
  await page.goto('/?surface=driver');
  await expect(page.getByRole('heading', { level: 1, name: 'Trang chủ' })).toBeVisible({
    timeout: 30_000,
  });
};

const primary = (page: Page) => page.getByRole('region', { name: RUN_HEADING });

const openWorkMetric = (page: Page) =>
  page.locator('.tx-metric', { hasText: 'Chuyến đang mở' }).locator('.tx-metric__value');

test.describe('trang chu lai xe Run-first — #340', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('vong chay that + chuyen cu rong: trang chu noi CO viec, va MOT cham vao Hien truong', async ({
    page,
  }) => {
    const state = await mockHome(page, { runs: [RUN], trips: [] });
    await openHome(page);

    /* --- 1. THE CHINH LA VIEC DUOC DIEU, doc tu vong chay --- */
    const card = primary(page);
    await expect(card).toBeVisible();
    await expect(page.getByTestId('home-run-headline')).toHaveText(
      'Việc kế tiếp: bấm “Đã tới điểm lấy hàng” ở màn Hiện trường.',
    );
    await expect(page.getByTestId('home-run-code')).toHaveText('VC-001');
    await expect(page.getByTestId('home-run-route')).toHaveText('Hà Nội → Hải Phòng');
    await expect(page.getByTestId('home-run-phase')).toHaveText('Chưa bắt đầu');
    await expect(card).toContainText('Chặng 1');
    await expect(card).toContainText('ORD-1');

    /* --- 2. KHONG mot cau "khong co viec" nao, va dem theo vong chay chu khong theo Trip --- */
    const main = page.locator('#tx-driver-main');
    await expect(main).not.toContainText('Chưa có chuyến nào được phân công');
    await expect(main).not.toContainText('Hiện chưa có việc nào');
    await expect(openWorkMetric(page)).toHaveText('1');

    /* --- 3. HAI DUONG NHAN VIEC KHONG LAN: viec da dieu thi khong day sang Nhan viec --- */
    await expect(card).toContainText('không cần vào Nhận việc để nhận lại');
    await expect(page.getByRole('region', { name: 'Nhận việc tại điểm' })).toHaveCount(0);

    /*
     * --- 4. NHIEN LIEU: tu `#364` phieu khai theo CHINH viec duoc dieu, nen trang chu KHONG con bao
     * "phieu van ghi theo chuyen, chua ghi duoc" — cau do se day lai xe di bao dieu hanh cho mot
     * phieu ho tu ghi duoc o man Nhien lieu. Va van khong bia mot chuyen nao.
     */
    await expect(main).not.toContainText('vẫn ghi theo chuyến');
    await expect(main).not.toContainText('chưa ghi được phiếu');
    await expect(page.getByRole('region', { name: LEGACY_HEADING })).toHaveCount(0);

    /* --- 5. NUT CHINH dung duoc o 390px, trang khong cuon ngang --- */
    const cta = page.getByRole('button', { name: 'Mở Hiện trường' });
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.height).toBeGreaterThanOrEqual(36);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    // Ngoai `test-results/`: Playwright don thu muc do o moi lan chay.
    await page.screenshot({ path: 'e2e-evidence/driver-home-run-first-390px.png', fullPage: true });

    /*
     * --- 6. MOT cham vao Hien truong, va man do hien NGAY tu CUNG o nho ---
     *
     * Giu lan doc `field-work` ke tiep lai: neu Hien truong van ve duoc chang dang lam trong luc
     * lan doc do con treo, thi no dang doc CHINH o nho trang chu vua dien — mot lan doc, mot khoa.
     */
    const readsBefore = state.fieldReads;
    let release: () => void = () => undefined;
    state.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await cta.click();

    await expect(page).toHaveURL(/screen=field/);
    await expect(page.getByRole('heading', { level: 1, name: 'Hiện trường' })).toBeVisible();
    await expect(page.getByTestId('field-current-leg')).toBeVisible();
    await expect(page.getByTestId('field-route')).toHaveText('Hà Nội → Hải Phòng');
    await expect.poll(() => state.fieldReads).toBeGreaterThan(readsBefore);
    state.hold = null;
    release();
  });

  test('co CA chuyen cu dang chay lan vong chay: vong chay thang, chuyen cu la loi phu', async ({
    page,
  }) => {
    await mockHome(page, { runs: [RUN], trips: [LEGACY_TRIP] });
    await openHome(page);

    const card = primary(page);
    const legacy = page.getByRole('region', { name: LEGACY_HEADING });
    await expect(card).toContainText('VC-001');
    await expect(legacy).toContainText('VT-2026-0912');
    await expect(legacy).toContainText('Đang chạy');

    // Vong chay nam TREN — the dau tien nguoi ta doc la viec duoc dieu.
    const cardBox = await card.boundingBox();
    const legacyBox = await legacy.boundingBox();
    expect(cardBox!.y).toBeLessThan(legacyBox!.y);

    // Nut doi trang thai Trip KHONG len trang chu khi vong chay la viec chinh.
    await expect(page.getByRole('button', { name: 'Đã giao' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Bắt đầu chuyến' })).toHaveCount(0);
    await page.screenshot({
      path: 'e2e-evidence/driver-home-run-and-legacy-390px.png',
      fullPage: true,
    });
  });

  test('khong co ca hai: trang thai rong THAT, Nhan viec tai diem la mot duong rieng', async ({
    page,
  }) => {
    await mockHome(page, { runs: [], trips: [] });
    await openHome(page);

    await expect(primary(page)).toContainText('Hiện chưa có việc nào được điều cho bạn.');
    await expect(page.getByRole('button', { name: 'Mở Hiện trường' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: LEGACY_HEADING })).toHaveCount(0);
    await expect(openWorkMetric(page)).toHaveText('0');

    const intake = page.getByRole('region', { name: 'Nhận việc tại điểm' });
    await expect(intake).toContainText('văn phòng chưa giao việc');
    await expect(intake.getByRole('button', { name: 'Mở Nhận việc' })).toBeVisible();
    await page.screenshot({ path: 'e2e-evidence/driver-home-empty-390px.png', fullPage: true });
  });

  test('doc viec duoc dieu HONG: bao hong kem thu lai, KHONG noi "khong co viec"', async ({
    page,
  }) => {
    const state = await mockHome(page, { runs: [RUN], trips: [], fieldWorkFails: true });
    await openHome(page);

    const card = primary(page);
    await expect(card.getByRole('alert')).toContainText('Mất kết nối tạm thời', {
      timeout: 15_000,
    });
    const main = page.locator('#tx-driver-main');
    await expect(main).not.toContainText('Hiện chưa có việc nào');
    await expect(main).not.toContainText('Chưa có chuyến nào được phân công');
    await expect(page.getByRole('region', { name: 'Nhận việc tại điểm' })).toHaveCount(0);

    // Song tro lai: bam thu lai la thay viec that.
    state.fieldWorkFails = false;
    await card.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByTestId('home-run-code')).toHaveText('VC-001');
  });

  test('khong mot con so doanh thu nao, va trang chu chi doc duong cua chinh lai xe', async ({
    page,
  }) => {
    // Mot payload chuyen cu LO truong doanh thu — the chuyen chon tung truong an toan, nen no
    // khong duoc di ra man hinh.
    const state = await mockHome(page, {
      runs: [RUN],
      trips: [{ ...LEGACY_TRIP, freightAmount: 11_500_000, marginAmount: 2_300_000 }],
    });
    await openHome(page);
    await expect(page.getByTestId('home-run-code')).toHaveText('VC-001');
    await expect(page.getByRole('region', { name: LEGACY_HEADING })).toBeVisible();

    const screen = await page.locator('#tx-driver-main').innerText();
    for (const revenue of [
      '11.500.000',
      '11500000',
      '2.300.000',
      'Cước',
      'Doanh thu',
      'Lợi nhuận',
    ]) {
      expect(screen, revenue).not.toContain(revenue);
    }
    expect(state.transportPaths.length).toBeGreaterThan(0);
    for (const path of state.transportPaths) {
      expect(path, path).toMatch(/^\/transport\/me\//);
    }
  });
});
