import { expect, test, type Page } from '@playwright/test';
import {
  chooseKnown,
  chooseResult,
  emptyMapPoint,
  expectNoRequest,
  fillFacts,
  isCreateOrderRequest,
  isReverseRequest,
  isSearchRequest,
  isAboveSubmitBar,
  isUnloadGuarded,
  KCN_DINH_VU,
  openComposer,
  recordExternalRequests,
  serve,
  shoot,
  TAN_PHU_HUNG,
} from './order-composer-server';

/**
 * `#379` — BE MAT TAO DON: chot HAI TOA DO (lay/giao) roi moi co mot don.
 *
 * ================================================================================================
 * NHUNG GI BO BAI NAY KHOA
 * ================================================================================================
 *
 * 1. Dia diem da biet CHI doc khi mo be mat tao don — xem danh sach khong ban them mot lan doc nao.
 * 2. Tim theo chu CHI khi nguoi dung bam (Enter / "Tìm") — go phim khong goi mang.
 * 3. Mot quy tac: moi thu ban chon di vao o DANG CHON; dat xong diem lay thi tu chuyen sang giao.
 *    Sua ten khong doi o; bam dup de phong to khong dat diem.
 * 4. "Tạo đơn" khoa den khi du; than yeu cau mang DUNG toa do da chon + nhan.
 * 5. Tao xong: ve danh sach, thong bao (vung trang thai rong truoc, chu sau), don moi duoc mo san.
 * 6. Moi loi (tim tat/hong, vi tri bi tu choi, danh sach doc lai hong) noi mot cau ro va ban nhap
 *    con nguyen.
 * 7. Tieu diem khong bao gio roi ve `<body>`: mo -> tieu de, quay lai -> "Tạo đơn mới", tao xong ->
 *    cau thong bao.
 * 8. Khong mot yeu cau nao ra khoi may chu web: nen ban do la nen CUC BO (`provider=local`).
 *
 * Bo cuc o man rong (lop noi khong de len nhau, tuong phan) nam o `order-composer-layout.spec.ts`.
 */

const status = (page: Page) => page.getByTestId('tx-finder-status');
const ticketOf = (page: Page) => page.getByRole('group', { name: 'Đang đặt điểm nào?' });

test.describe('#379 — be mat tao don', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('mo be mat: tieu diem vao tieu de; ban do chon diem + dia diem da biet, doc hang rao DUNG mot lan', async ({
    page,
  }) => {
    const external = recordExternalRequests(page);
    const world = await serve(page);
    await openComposer(page, world);

    // Be mat THAY cho danh sach: nut vua bam da mat, tieu diem vao tieu de — khong roi ve <body>.
    await expect(page.getByRole('heading', { level: 1, name: 'Tạo đơn mới' })).toBeFocused();

    const map = page.getByTestId('tx-picker-map');
    // Ban do CHON diem, khong phai anh: khong `role="img"`, co ten noi cach dung.
    await expect(map).toHaveAttribute('role', 'group');
    await expect(map).toHaveAttribute('data-basemap', 'LOCAL_FALLBACK');
    await expect(map).toHaveAttribute('data-mode', 'pick');
    await expect(map).not.toHaveClass(/tx-map\b/);
    await expect(page.getByRole('button', { name: 'Bãi xe: Bãi xe Hà Nội' })).toBeVisible();
    // `#395` §2.1 — nhan loai la nhan MAY CHU tra (`kindLabel`), cung voi man "Địa điểm vận hành".
    await expect(
      page.getByRole('button', { name: 'Nhà máy / kho đối tác: Nhà máy thép Đình Vũ' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Địa điểm khách hàng: Kho Nhựa Tân Phú Hưng' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Điểm khách hàng (kiểu cũ): Kho cũ Hưng Yên' }),
    ).toBeVisible();

    await expect(page.getByRole('radio', { name: 'Lấy hàng' })).toBeChecked();
    await expect(page.getByTestId('tx-composer-active')).toContainText('Đang đặt điểm lấy hàng');

    // Moi nut "Chọn làm …" mang TEN dia diem: tam nut cung mot ten la tam cho de chon nham.
    for (const name of ['Bãi xe Hà Nội', 'Nhà máy thép Đình Vũ', 'Kho Nhựa Tân Phú Hưng']) {
      await expect(
        page.getByRole('button', { name: `Chọn làm điểm lấy hàng: ${name}`, exact: true }),
      ).toHaveCount(1);
    }
    await expect(
      page.getByRole('button', { name: 'Chọn làm điểm lấy hàng', exact: true }),
    ).toHaveCount(0);

    // Vung trang thai cua the tim LUON trong cay truy cap, ke ca khi rong.
    await expect(status(page)).toHaveText('');
    expect(await status(page).evaluate((node) => getComputedStyle(node).display)).not.toBe('none');

    expect(world.placeCalls).toEqual(['GET /transport/places/known']);
    expect(world.searchQueries).toEqual([]);
    expect(external).toEqual([]);
  });

  test('tim -> diem lay (tu chuyen sang giao), dia diem da biet -> diem giao, gui dung toa do', async ({
    page,
  }) => {
    const external = recordExternalRequests(page);
    const world = await serve(page);
    await openComposer(page, world);

    const finder = page.getByRole('search', { name: 'Tìm địa điểm' });
    const box = finder.getByRole('searchbox');
    // Go TUNG PHIM: mot tim-theo-go (ke ca co tre) se ban mot yeu cau trong khoang cho duoi day.
    await box.pressSequentially('Đình Vũ', { delay: 40 });
    await expectNoRequest(page, isSearchRequest);
    expect(world.searchQueries).toEqual([]);
    await expect(status(page)).toHaveText('');

    await box.press('Enter');
    await expect(status(page)).toHaveText('Tìm thấy 2 địa điểm. Chọn một kết quả để đặt điểm.');
    // Enter la DUNG MOT lan tim — va khong co lan nao den muon sau do.
    await expectNoRequest(page, isSearchRequest, 1_000);
    expect(world.searchQueries).toEqual(['Đình Vũ']);
    await expect(page.getByText('© OpenStreetMap contributors')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Kết quả 1: Khu công nghiệp Đình Vũ' }),
    ).toBeVisible();

    await chooseResult(page, 'Khu công nghiệp Đình Vũ', 1, 'lấy');
    await expect(page.getByRole('radio', { name: 'Giao hàng' })).toBeChecked();
    await expect(page.getByTestId('tx-composer-active')).toContainText(
      'Đã đặt điểm lấy hàng. Tiếp theo: điểm giao hàng.',
    );

    await page.getByRole('tab', { name: /Địa điểm đã biết/ }).click();
    await chooseKnown(page, 'Kho Nhựa Tân Phú Hưng', 'giao');

    const ticket = ticketOf(page);
    await expect(ticket).toContainText('Khu công nghiệp Đình Vũ');
    await expect(ticket).toContainText('Kết quả tìm kiếm');
    await expect(ticket).toContainText('Kho Nhựa Tân Phú Hưng');
    await expect(ticket).toContainText('Địa điểm khách hàng của Công ty TNHH Nhựa Tân Phú Hưng');
    await expect(ticket).toContainText('Đường chim bay ≈');
    await expect(
      page.getByRole('button', { name: /Điểm lấy hàng: Khu công nghiệp/ }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Điểm giao hàng: Kho Nhựa/ })).toBeVisible();

    const submit = page.getByRole('button', { name: 'Tạo đơn', exact: true });
    await expect(submit).toBeDisabled();
    await expect(page.getByText('Còn thiếu: mã đơn, khách hàng, cước.')).toBeVisible();
    await fillFacts(page);
    await expect(submit).toBeEnabled();
    await expect(page.getByText('Đủ thông tin để tạo đơn.')).toBeVisible();
    // Ban nhap co noi dung: tai lai / dong tab thi trinh duyet hoi truoc.
    expect(await isUnloadGuarded(page)).toBe(true);
    await shoot(page, 'desktop-1440-both-endpoints');

    // Ghi lai MOI lan vung thong bao cua danh sach doi chu, tu luc no xuat hien.
    await page.evaluate(() => {
      const log: string[] = [];
      (window as unknown as { noticeLog: string[] }).noticeLog = log;
      new MutationObserver(() => {
        const node = document.querySelector('[data-testid="tx-created-notice"]');
        if (node === null) return;
        const text = node.textContent ?? '';
        if (log[log.length - 1] !== text) log.push(text);
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });

    await submit.click();
    const sentence =
      'Đã tạo đơn DH-379-01 — lấy tại Khu công nghiệp Đình Vũ, giao tại Kho Nhựa Tân Phú Hưng.';
    const notice = page.getByTestId('tx-created-notice');
    // Cau nay CHI co sau `onSuccess` — doc than yeu cau gia sau no la doc sau khi POST da xong.
    await expect(notice).toHaveText(sentence);
    await expect(notice).toHaveAttribute('role', 'status');
    // Tieu diem vao cau xac nhan; vung trang thai co mat RONG truoc roi moi co chu -> duoc doc.
    await expect(notice).toBeFocused();
    const log = await page.evaluate(() => (window as unknown as { noticeLog: string[] }).noticeLog);
    expect(log).toEqual(['', sentence]);
    expect(await isUnloadGuarded(page)).toBe(false);
    expect(world.createBodies).toEqual([
      {
        code: 'DH-379-01',
        originLabel: 'Khu công nghiệp Đình Vũ',
        destinationLabel: 'Kho Nhựa Tân Phú Hưng',
        originPoint: KCN_DINH_VU,
        destinationPoint: TAN_PHU_HUNG,
        businessDate: '2026-09-23',
        customerId: 'cus-dong-a',
        freightAmount: 6_800_000,
        cargoDescription: null,
      },
    ]);

    // Ve danh sach, don moi DUOC MO SAN va khoi "Tuyến" hien voi ban do chi doc.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Đơn hàng & vòng chạy' }),
    ).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'DH-379-01' })).toBeVisible();
    const route = page.getByRole('region', { name: 'Tuyến của đơn DH-379-01' });
    await expect(route).toContainText('Khu công nghiệp Đình Vũ');
    await expect(route).toContainText('20.83010, 106.76130');
    await expect(page.getByTestId('tx-route-map')).toHaveAttribute('data-mode', 'view');
    await expect(
      page.getByRole('form', { name: 'Lập kế hoạch và giao xe cho đơn DH-379-01' }),
    ).toBeVisible();
    await shoot(page, 'desktop-1440-after-create');
    expect(external).toEqual([]);
  });

  test('don cu khong toa do: khoi Tuyến noi thang; bo loc giau don dang mo thi NOI RA', async ({
    page,
  }) => {
    await serve(page);
    await page.goto('/?section=movement');
    await page.getByRole('rowheader', { name: 'DH-CU-01' }).click();
    const route = page.getByRole('region', { name: 'Tuyến của đơn DH-CU-01' });
    await expect(route).toContainText(
      'Đơn này được tạo trước khi hệ thống lưu toạ độ — chỉ có tên hiển thị.',
    );
    await expect(page.getByTestId('tx-route-map')).toHaveCount(0);

    // Bo loc giau don dang mo: chi tiet cua no AN theo, co mot cau + nut lay lai — khong lang le.
    await page.getByRole('searchbox', { name: 'Tìm đơn' }).fill('không có đơn này');
    const hidden = page.getByTestId('tx-open-order-hidden');
    await expect(hidden).toContainText('Đơn đang mở DH-CU-01 không khớp bộ lọc');
    await expect(route).toHaveCount(0);
    await hidden.getByRole('button', { name: 'Bỏ lọc' }).click();
    await expect(route).toBeVisible();
    await expect(hidden).toHaveCount(0);
  });

  test('bam ban do dat diem; ten den tu tim nguoc; bam ghim KHONG phai bam ban do', async ({
    page,
  }) => {
    const external = recordExternalRequests(page);
    const world = await serve(page);
    await openComposer(page, world);

    // Bam ghim dia diem da biet: chon dia diem do, khong dat them "diem tren ban do".
    await page.getByRole('button', { name: 'Bãi xe: Bãi xe Hà Nội' }).click();
    // Lan bam ban do chi thanh lan chon SAU mot khoang cho — het khoang cho van khong co gi them.
    await expectNoRequest(page, isReverseRequest);
    expect(world.reverseBodies).toEqual([]);
    await expect(page.getByLabel('Tên trên đơn (điểm lấy hàng)')).toHaveValue('Bãi xe Hà Nội');
    // `#395` §2.3 — ten BAI XE khoa: khau lap ke hoach nhan ra bai bang dung ten nay.
    await expect(page.getByLabel('Tên trên đơn (điểm lấy hàng)')).toHaveAttribute('readonly', '');
    await expect(page.getByText('Tên bãi xe lấy từ Địa điểm vận hành.')).toBeVisible();
    await expect(page.getByLabel('Tên trên đơn (điểm giao hàng)')).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Giao hàng' })).toBeChecked();

    // O dang chon gio la GIAO: bam vao mot cho TRONG tren ban do.
    const picker = page.getByTestId('tx-picker-map');
    await picker.click({ position: await emptyMapPoint(page) });
    const ticket = ticketOf(page);
    await expect(ticket).toContainText('Cảng Chùa Vẽ');
    await expect(ticket).toContainText('Chọn trên bản đồ');
    expect(world.reverseBodies).toHaveLength(1);
    const [reverse] = world.reverseBodies;
    expect(Object.keys(reverse ?? {}).sort()).toEqual(['latitude', 'longitude']);
    expect(typeof reverse?.latitude).toBe('number');
    await expect(page.getByLabel('Tên trên đơn (điểm giao hàng)')).toHaveValue('Cảng Chùa Vẽ');
    await expect(page.getByLabel('Tên trên đơn (điểm lấy hàng)')).toHaveValue('Bãi xe Hà Nội');
    expect(external).toEqual([]);
  });

  test('bam dup de phong to KHONG dat diem nao — va ban do van phong to', async ({ page }) => {
    const world = await serve(page);
    await openComposer(page, world);
    const pin = page.getByRole('button', { name: 'Bãi xe: Bãi xe Hà Nội' });
    const before = await pin.boundingBox();

    await page.getByTestId('tx-picker-map').dblclick({ position: await emptyMapPoint(page) });
    // Hai lan `click` cua cu bam dup deu bi bo: khong tim nguoc, khong diem nao, o van la LAY.
    await expectNoRequest(page, isReverseRequest);
    expect(world.reverseBodies).toEqual([]);
    await expect(page.getByRole('radio', { name: 'Lấy hàng' })).toBeChecked();
    await expect(page.getByLabel(/Tên trên đơn/)).toHaveCount(0);
    await expect(ticketOf(page)).not.toContainText('Điểm trên bản đồ');

    // Van phong to: ghim bai xe doi cho tren man hinh.
    await expect
      .poll(async () => {
        const after = await pin.boundingBox();
        return before === null || after === null
          ? 0
          : Math.hypot(after.x - before.x, after.y - before.y);
      })
      .toBeGreaterThan(20);
  });

  test('sua ten diem lay KHONG doi o dang chon: lan bam ban do sau do dat diem GIAO', async ({
    page,
  }) => {
    const world = await serve(page);
    await openComposer(page, world);
    await chooseKnown(page, 'Nhà máy thép Đình Vũ', 'lấy');
    await expect(page.getByRole('radio', { name: 'Giao hàng' })).toBeChecked();

    const originName = page.getByLabel('Tên trên đơn (điểm lấy hàng)');
    await originName.fill('Nhà máy thép Đình Vũ — cổng 2');
    await expect(page.getByRole('radio', { name: 'Giao hàng' })).toBeChecked();

    await page.getByTestId('tx-picker-map').click({ position: await emptyMapPoint(page) });
    await expect(page.getByLabel('Tên trên đơn (điểm giao hàng)')).toHaveValue('Cảng Chùa Vẽ');
    // Diem lay giu nguyen ca toa do lan ten vua go.
    await expect(originName).toHaveValue('Nhà máy thép Đình Vũ — cổng 2');
    await expect(ticketOf(page)).toContainText('20.82640, 106.77520');
    expect(world.reverseBodies).toHaveLength(1);
  });

  test('tim bi tat / khong phan hoi: cau ro, van chon duoc tu dia diem da biet', async ({
    page,
  }) => {
    const world = await serve(page);
    world.searchResponse = {
      status: 'DISABLED',
      reason: 'PROVIDER_UNCONFIGURED',
      results: [],
      attribution: null,
      fromCache: false,
    };
    await openComposer(page, world);
    const finder = page.getByRole('search', { name: 'Tìm địa điểm' });
    await finder.getByRole('searchbox').fill('Đình Vũ');
    await finder.getByRole('button', { name: 'Tìm' }).click();
    await expect(status(page)).toHaveText(
      'Tìm kiếm địa điểm chưa được bật cho doanh nghiệp này. Vẫn chọn được trên bản đồ, từ địa điểm đã biết hoặc vị trí của bạn.',
    );

    world.searchResponse = {
      status: 'UNAVAILABLE',
      reason: 'PROVIDER_UNAVAILABLE',
      results: [],
      attribution: null,
      fromCache: false,
    };
    await finder.getByRole('button', { name: 'Tìm' }).click();
    await expect(status(page)).toHaveText(
      'Dịch vụ tìm kiếm không phản hồi. Thử lại sau, hoặc chọn trực tiếp trên bản đồ.',
    );
    await shoot(page, 'desktop-1440-search-unavailable');

    await page.getByRole('tab', { name: /Địa điểm đã biết/ }).click();
    await chooseKnown(page, 'Nhà máy thép Đình Vũ', 'lấy');
    await chooseKnown(page, 'Kho Nhựa Tân Phú Hưng', 'giao');
    await fillFacts(page);
    await expect(page.getByRole('button', { name: 'Tạo đơn', exact: true })).toBeEnabled();
  });

  test('chi go chu, chua chon diem: khong co POST nao', async ({ page }) => {
    const world = await serve(page);
    await openComposer(page, world);
    await fillFacts(page);
    const submit = page.getByRole('button', { name: 'Tạo đơn', exact: true });
    await expect(submit).toBeDisabled();
    await expect(page.getByText('Còn thiếu: điểm lấy hàng, điểm giao hàng.')).toBeVisible();
    // Enter trong mot o cung khong gui. POST di sau mot vong CSRF: phai cho het khoang do.
    await page.getByRole('form', { name: 'Tạo đơn hàng' }).getByLabel('Mã đơn').press('Enter');
    await expectNoRequest(page, isCreateOrderRequest);
    expect(world.createBodies).toEqual([]);
    await expect(page.getByText(/Đã tạo đơn/)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Tạo đơn mới' })).toBeVisible();
  });

  test('quay lai: sach thi ve ngay; da nhap thi hoi; tieu diem ve nut "Tạo đơn mới"', async ({
    page,
  }) => {
    const world = await serve(page);
    await openComposer(page, world);
    const openButton = page.getByRole('button', { name: 'Tạo đơn mới' });

    // Chua nhap gi: khong hoi, khong chan tai lai trang; tieu diem ve dung nut vua mo be mat.
    expect(await isUnloadGuarded(page)).toBe(false);
    await page.getByRole('button', { name: 'Quay lại danh sách' }).click();
    await expect(openButton).toBeFocused();

    await openButton.click();
    await chooseKnown(page, 'Nhà máy thép Đình Vũ', 'lấy');
    expect(await isUnloadGuarded(page)).toBe(true);
    await page.getByRole('button', { name: 'Quay lại danh sách' }).click();
    const dialog = page.getByRole('dialog', { name: 'Bỏ đơn đang soạn?' });
    await dialog.getByRole('button', { name: 'Quay lại' }).click();
    await expect(ticketOf(page)).toContainText('Nhà máy thép Đình Vũ');
    await page.getByRole('button', { name: 'Quay lại danh sách' }).click();
    await dialog.getByRole('button', { name: 'Bỏ đơn đang soạn' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Đơn hàng & vòng chạy' }),
    ).toBeVisible();
    await expect(openButton).toBeFocused();
    // Be mat da go: khong con gi chan tai lai trang.
    expect(await isUnloadGuarded(page)).toBe(false);
    expect(world.createBodies).toEqual([]);
  });

  test('danh sach doc lai HONG luc dang soan: be mat va ban nhap van nguyen', async ({ page }) => {
    const world = await serve(page);
    await openComposer(page, world);
    await chooseKnown(page, 'Nhà máy thép Đình Vũ', 'lấy');
    const code = page.getByRole('form', { name: 'Tạo đơn hàng' }).getByLabel('Mã đơn');
    await code.fill('DH-GIU-01');

    // Mang chap chon luc may chu dang deploy: moi truy van cu doc lai khi "online" tro lai, va hong.
    world.failOrders = true;
    let failedReads = 0;
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (path === '/transport/orders' && response.status() === 502) failedReads += 1;
    });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
    });
    // Lan doc lai VA lan thu lai (`retry: 1`) deu hong — tu day truy van danh sach mang loi.
    await expect.poll(() => failedReads, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    // Cho React ve lai voi loi do (lan ve cu se go be mat ngay trong khoang nay).
    await page.waitForTimeout(500);

    await expect(page.getByRole('heading', { level: 1, name: 'Tạo đơn mới' })).toBeVisible();
    await expect(ticketOf(page)).toContainText('Nhà máy thép Đình Vũ');
    await expect(code).toHaveValue('DH-GIU-01');
    await expect(page.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);
    expect(world.orderListReads).toBeGreaterThanOrEqual(3);
  });

  test('vi tri bi tu choi: cau ro (va duoc doc), nut giu tieu diem, cac cach khac van chay', async ({
    page,
  }) => {
    const world = await serve(page);
    await openComposer(page, world);
    const locate = page.getByRole('button', { name: 'Vị trí của tôi' });
    await locate.click();
    const denied =
      'Trình duyệt chưa cho phép lấy vị trí. Bật quyền vị trí cho trang này, hoặc chọn trên bản đồ.';
    await expect(page.getByTestId('tx-composer-position')).toContainText(denied);
    await expect(page.getByTestId('tx-position-status')).toHaveText(denied);
    await expect(locate).toBeFocused();
    await shoot(page, 'desktop-1440-geolocation-denied');
    await chooseKnown(page, 'Nhà máy thép Đình Vũ', 'lấy');
    await expect(page.getByRole('radio', { name: 'Giao hàng' })).toBeChecked();
  });
});

test.describe('#379 — vi tri cua toi (co quyen)', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    permissions: ['geolocation'],
    geolocation: { latitude: 21.0285, longitude: 105.8542, accuracy: 35 },
  });

  test('bam "Vị trí của tôi" -> duoc doc len, the vi tri -> dat lam diem giao', async ({
    page,
  }) => {
    const world = await serve(page);
    await openComposer(page, world);
    const locate = page.getByRole('button', { name: 'Vị trí của tôi' });
    await locate.click();
    const card = page.getByRole('group', { name: 'Vị trí của bạn' });
    await expect(card).toContainText('Vị trí của bạn, sai số khoảng ±35 m');
    await expect(page.getByTestId('tx-position-status')).toHaveText(
      'Đã có vị trí của bạn, sai số khoảng ±35 m. Chọn đặt làm điểm lấy hàng hoặc điểm giao hàng.',
    );
    // Nut khong bi `disabled` luc dang lay: tieu diem van o do.
    await expect(locate).toBeFocused();
    await expect(locate).not.toHaveAttribute('disabled');
    await card.getByRole('button', { name: 'Đặt làm điểm giao hàng' }).click();

    const ticket = ticketOf(page);
    await expect(ticket).toContainText('Vị trí hiện tại của tôi');
    await expect(ticket).toContainText('Vị trí trình duyệt, sai số khoảng ±35 m');
    await expect(ticket).toContainText('21.02850, 105.85420');
    // Diem lay con trong nen o dang chon quay ve LAY.
    await expect(page.getByRole('radio', { name: 'Lấy hàng' })).toBeChecked();
  });
});

test.describe('#379 — man hep', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('390px: khong cuon ngang; thu tu nhin = thu tu Tab; vung cham >= 40px', async ({ page }) => {
    const external = recordExternalRequests(page);
    const world = await serve(page);
    await openComposer(page, world);

    // Vung cham: tab cua the tim va ghim tren ban do du mot dau ngon tay.
    for (const tab of await page.getByRole('tab').all()) {
      expect((await tab.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
    }
    const pinBox = await page.getByRole('button', { name: 'Bãi xe: Bãi xe Hà Nội' }).boundingBox();
    expect(pinBox?.width ?? 0).toBeGreaterThanOrEqual(40);
    expect(pinBox?.height ?? 0).toBeGreaterThanOrEqual(40);

    await chooseKnown(page, 'Nhà máy thép Đình Vũ', 'lấy');
    await chooseKnown(page, 'Kho Nhựa Tân Phú Hưng', 'giao');
    await fillFacts(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const top = async (locator: ReturnType<Page['getByRole']>): Promise<number> =>
      (await locator.boundingBox())?.y ?? Number.NaN;
    const ticketTop = await top(ticketOf(page));
    const finderTop = await top(page.getByRole('search', { name: 'Tìm địa điểm' }));
    const mapTop = await top(page.getByRole('group', { name: /Bản đồ chọn điểm/ }));
    const factsTop = await top(page.getByRole('form', { name: 'Tạo đơn hàng' }));
    expect(ticketTop).toBeLessThan(finderTop);
    expect(finderTop).toBeLessThan(mapTop);
    expect(mapTop).toBeLessThan(factsTop);
    await shoot(page, 'mobile-390');
    await shoot(page, 'mobile-390-full', true);

    // Tab di DUNG thu tu do: nut cuoi cua phieu tuyen -> the tim (khong nhay xuong thong tin don).
    await page.getByRole('button', { name: 'Xoá điểm giao hàng' }).focus();
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => document.activeElement?.closest('.tx-composer__finder') !== null),
    ).toBe(true);
    // Lop cuoi cua ban do (nut vi tri) -> o dau tien cua thong tin don.
    await page.getByRole('button', { name: 'Vị trí của tôi' }).focus();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('form', { name: 'Tạo đơn hàng' }).getByLabel('Mã đơn'),
    ).toBeFocused();

    const submit = page.getByRole('button', { name: 'Tạo đơn', exact: true });
    await expect(submit).toBeEnabled();
    const box = await submit.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
    // O vua nhan tieu diem nam TREN thanh gui dinh day, khong bi no che (WCAG 2.4.11).
    expect(await isAboveSubmitBar(page, 'Mã đơn')).toBe(true);
    await shoot(page, 'mobile-390-focus');
    expect(external).toEqual([]);
  });
});
