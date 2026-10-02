import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  ACTION_NOT_PERMITTED_MESSAGE,
  commitPlan,
  createWorld,
  DEPOT,
  FIELD_FLOW,
  HANOI,
  legsOf,
  now,
  ORDER_CODE,
  order,
  PLATE,
  serve,
  type World,
  type Write,
} from './office-lifecycle-server';

/**
 * `#376` — KHE WORKFLOW VAN PHONG, do tren trinh duyet that.
 *
 * ==============================================================================================
 * CHUOI DUOC DO
 * ==============================================================================================
 *
 *   lap ke hoach + giao xe -> lai xe bam moc hien truong -> van phong tien chang
 *   -> he thong xet dong vong chay -> don VAN mo -> van phong xac nhan giao xong
 *   -> don xuat hien o "Kết thúc đơn"
 *
 * Moi buoc sau phai NHIN THAY ket qua cua buoc truoc, nen may chu gia o day CO TRANG THAI va dung
 * chung cho HAI trinh duyet: van phong (`ADMIN`/`ACCOUNTING`) va lai xe (`SALE`, co quyen dinh vi).
 * Moc lai xe ghi vao cung "the gioi" ma man van phong doc ra.
 *
 * ==============================================================================================
 * BAT BIEN MA BO NAY KHOA
 * ==============================================================================================
 *
 *   · Moc hien truong la BANG CHUNG: lai xe bam "Khách đã nhận hàng" khong doi chang, vong chay hay
 *     don — Bang dieu hanh van noi "Đã lên kế hoạch" (dung trieu chung cua `#376`).
 *   · Khong mot yeu cau nao toi `POST /transport/runs/:id/transition`, khong nut "Đóng vòng chạy":
 *     dong vong chay la cua he thong (`#293`).
 *   · `LOADED -> COMPLETED` trai hien truong chi di qua ghi de CO LY DO (`#332`).
 *   · Vong chay dong KHONG lam don giao xong; don chi vao "Kết thúc đơn" sau khi van phong bam.
 *
 * KHONG KIEM: rang may chu tinh dung. Phan xu dong vong chay, cong hien truong va cong quyen that
 * duoc do o `apps/api` (`run-closure.spec.ts`, `field-truth-leg-status.int.spec.ts`,
 * `transport-actions.spec.ts`). May chu gia duoi day CHEP LAI cac luat do o muc du de man hinh bi do
 * dung cach — va cai duy nhat duoc chung minh la BE MAT di dung chuoi.
 */

/* ------------------------------------------------------------------ *
 * THAO TAC TREN MAN HINH
 * ------------------------------------------------------------------ */

const officeNav = (page: Page): Locator =>
  page.getByRole('navigation', { name: 'Điều hướng vận hành vận tải' });

const openOrder = async (page: Page, code: string): Promise<void> => {
  await officeNav(page).getByRole('link', { name: 'Đơn hàng & vòng chạy' }).click();
  await page.getByRole('rowheader', { name: code }).click();
};

const legRow = (progress: Locator, sequence: number): Locator =>
  progress.getByRole('row').filter({
    has: progress.page().getByRole('rowheader', { name: String(sequence), exact: true }),
  });

/** Bam mot nut chang, xac nhan trong hop thoai, doi thong bao ket qua. */
const advance = async (
  page: Page,
  buttonName: string,
  dialogTitle: string,
  confirmLabel: string,
  reason?: string,
): Promise<void> => {
  await page.getByRole('button', { name: buttonName }).click();
  const dialog = page.getByRole('dialog', { name: dialogTitle });
  await expect(dialog).toBeVisible();
  if (reason !== undefined) {
    await expect(dialog.getByRole('button', { name: confirmLabel })).toBeDisabled();
    await dialog.getByRole('textbox').fill(reason);
  }
  await dialog.getByRole('button', { name: confirmLabel }).click();
  await expect(dialog).toHaveCount(0);
};

const legWrites = (world: World): unknown[] =>
  world.writes.filter((write) => /\/legs\/[^/]+\/transition$/.test(write.path)).map((w) => w.body);

const runTransitionWrites = (world: World): Write[] =>
  world.writes.filter((write) => /^\/transport\/runs\/[^/]+\/transition$/.test(write.path));

const LEG_1 = `Chặng 1 · chạy rỗng · ${DEPOT} → Kho Hải Phòng`;
const LEG_2 = 'Chặng 2 · có hàng · Kho Hải Phòng → Ninh Bình';

/* ================================================================== *
 * 1. CHUOI DAY DU — plan/assign -> hien truong -> van phong -> dong -> giao xong
 * ================================================================== */

test.describe('#376 — van phong dong khe workflow Leg -> Order -> Ket thuc don', () => {
  test('chuoi day du: moc la bang chung, van phong tien chang, he thong giu vong chay, don vao "Kết thúc đơn" sau khi xac nhan', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    const world = createWorld([order('ord-376', ORDER_CODE)]);
    await serve(page, world, 'ADMIN');

    /* --- 1. LAP KE HOACH + GIAO XE, ngay tai don --- */
    await page.goto('/?section=movement');
    await expect(page.getByRole('rowheader', { name: ORDER_CODE })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('rowheader', { name: ORDER_CODE }).click();
    const planning = page.getByRole('form', {
      name: `Lập kế hoạch và giao xe cho đơn ${ORDER_CODE}`,
    });
    await planning.getByLabel('Xe').selectOption({ label: PLATE });
    await planning.getByRole('button', { name: 'Xem kế hoạch' }).click();
    await page
      .getByRole('region', { name: `Kế hoạch vận chuyển cho đơn ${ORDER_CODE}` })
      .getByRole('button', { name: 'Xác nhận kế hoạch và giao xe' })
      .click();
    await expect(page.getByText(`Đã giao đơn ${ORDER_CODE} cho xe ${PLATE}`)).toBeVisible();

    const progress = page.getByRole('region', { name: 'Tiến độ vòng chạy VC-001' });
    await expect(progress).toBeVisible();
    await expect(legRow(progress, 1)).toContainText('Dự kiến');
    await expect(legRow(progress, 2)).toContainText('Dự kiến');
    await expect(progress.getByRole('status', { name: 'Đóng vòng chạy VC-001' })).toContainText(
      'Chưa chạy',
    );

    /* --- 2. LAI XE BAM MOC HIEN TRUONG — tren trinh duyet cua CHINH lai xe --- */
    const driverContext = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: HANOI,
    });
    const driver = await driverContext.newPage();
    await serve(driver, world, 'SALE');
    await driver.goto('/?surface=driver&screen=field');
    await expect(driver.getByTestId('field-current-leg')).toBeVisible({ timeout: 60_000 });
    for (const step of FIELD_FLOW) {
      await driver.getByTestId('field-action').filter({ hasText: step.label }).click();
      await expect
        .poll(() => world.legs.find((leg) => leg.id === 'run-1-leg-2')?.recorded ?? [])
        .toContain(step.type);
    }
    await expect(driver.getByTestId('field-headline')).toContainText('Đã làm xong mọi việc');
    await driverContext.close();

    // MOC LA BANG CHUNG: khong mot trang thai nao doi.
    expect(world.legs.map((leg) => leg.status)).toEqual(['PLANNED', 'PLANNED']);
    expect(world.runs[0]?.status).toBe('PLANNED');
    expect(world.orders[0]?.status).toBe('OPEN');

    /* --- 3. TRIEU CHUNG CUA #376: hien truong da giao, bang dieu hanh van "Đã lên kế hoạch" --- */
    await officeNav(page).getByRole('link', { name: 'Bảng điều hành' }).click();
    const plannedColumn = page.getByRole('article', { name: 'Đã lên kế hoạch' });
    await expect(plannedColumn.getByRole('link', { name: /VC-001/ })).toBeVisible();

    /* --- 4. VAN PHONG TIEN CHANG — mot nut cho moi buoc, xac nhan truoc khi ghi --- */
    await openOrder(page, ORDER_CODE);
    await expect(legRow(progress, 2)).toContainText('Khách đã nhận hàng');
    await expect(legRow(progress, 2)).toContainText('Dự kiến');

    await advance(page, `Bắt đầu chạy — ${LEG_1}`, `Ghi ${LEG_1} đang chạy?`, 'Bắt đầu chạy');
    await expect(progress.getByRole('status', { name: 'Kết quả tiến chặng' })).toHaveText(
      `${LEG_1}: đã ghi đang chạy. Vòng chạy VC-001 đang chạy.`,
    );
    await expect(legRow(progress, 1)).toContainText('Đang chạy');
    await expect(progress.getByRole('status', { name: 'Đóng vòng chạy VC-001' })).toContainText(
      'còn chặng chưa hoàn tất',
    );

    await advance(page, `Hoàn tất chặng — ${LEG_1}`, `Hoàn tất ${LEG_1}?`, 'Hoàn tất chặng');
    await expect(legRow(progress, 1)).toContainText('Đã xong');

    await advance(page, `Bắt đầu chạy — ${LEG_2}`, `Ghi ${LEG_2} đang chạy?`, 'Bắt đầu chạy');
    // Hien truong DA giao: hoan tat THUONG, khong mot o ly do nao.
    await page.getByRole('button', { name: `Hoàn tất chặng — ${LEG_2}` }).click();
    const complete = page.getByRole('dialog', { name: `Hoàn tất ${LEG_2}?` });
    await expect(complete).toContainText('Hiện trường đã ghi khách nhận hàng');
    await expect(complete.getByRole('textbox')).toHaveCount(0);
    await complete.getByRole('button', { name: 'Hoàn tất chặng' }).click();
    await expect(complete).toHaveCount(0);

    /* --- 5. HE THONG XET DONG: het viec xa bai -> GIU, khong dong, khong can ai bam --- */
    await expect(progress.getByRole('status', { name: 'Kết quả tiến chặng' })).toContainText(
      'Vòng chạy VC-001: hết việc nhưng xe chưa về bãi',
    );
    await expect(progress.getByRole('status', { name: 'Đóng vòng chạy VC-001' })).toContainText(
      'Đang giữ',
    );
    await expect(legRow(progress, 2)).toContainText('Đã xong');
    expect(legWrites(world)).toEqual([
      { to: 'IN_TRANSIT' },
      { to: 'COMPLETED' },
      { to: 'IN_TRANSIT' },
      { to: 'COMPLETED' },
    ]);
    expect(runTransitionWrites(world)).toEqual([]);
    await expect(
      page.getByRole('button', { name: /Đóng vòng chạy|Kết thúc vòng chạy/ }),
    ).toHaveCount(0);

    /* --- 6. DON VAN MO — vong chay het viec khong phai don giao xong --- */
    const orderRow = page
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: ORDER_CODE }) });
    await expect(orderRow).toContainText('Đang mở');
    expect(world.orders[0]?.status).toBe('OPEN');

    await officeNav(page).getByRole('link', { name: 'Kết thúc đơn' }).click();
    const queue = page.getByRole('table', { name: 'Đơn chờ kết thúc' });
    await expect(queue).toBeVisible();
    await expect(queue.getByRole('row').filter({ hasText: ORDER_CODE })).toHaveCount(0);

    await officeNav(page).getByRole('link', { name: 'Bảng điều hành' }).click();
    await expect(
      page.getByRole('article', { name: 'Đã lên kế hoạch' }).getByRole('link', { name: /VC-001/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('article', { name: 'Trên đường' }).getByRole('link', { name: /VC-001/ }),
    ).toBeVisible();

    /* --- 7. VAN PHONG XAC NHAN GIAO XONG — hanh dong ro nghia, mot lan --- */
    await openOrder(page, ORDER_CODE);
    const fulfilment = page.getByRole('region', { name: `Giao xong đơn ${ORDER_CODE}` });
    await expect(fulfilment).toContainText('Đang mở');
    await fulfilment.getByRole('button', { name: 'Xác nhận đã giao xong' }).click();
    const confirmFulfil = page.getByRole('dialog', {
      name: `Xác nhận đơn ${ORDER_CODE} đã giao xong?`,
    });
    await expect(confirmFulfil).toContainText('không đóng vòng chạy và không tạo công nợ');
    await confirmFulfil.getByRole('button', { name: 'Xác nhận đã giao xong' }).click();
    await expect(fulfilment.getByRole('status', { name: 'Kết quả giao xong đơn' })).toHaveText(
      `Đơn ${ORDER_CODE} đã giao xong. Đơn đã vào hàng “Kết thúc đơn”.`,
    );
    await expect(orderRow).toContainText('Đã giao xong');
    await expect(fulfilment.getByRole('button', { name: 'Xác nhận đã giao xong' })).toHaveCount(0);
    expect(
      world.writes.filter((write) => write.path === '/transport/orders/ord-376/transition'),
    ).toEqual([
      { method: 'POST', path: '/transport/orders/ord-376/transition', body: { to: 'FULFILLED' } },
    ]);

    /* --- 8. XUAT HIEN O "KET THUC DON", chua ket thuc thuong mai --- */
    await fulfilment.getByRole('link', { name: 'Mở “Kết thúc đơn” →' }).click();
    const row = page.getByRole('table', { name: 'Đơn chờ kết thúc' }).getByRole('row').filter({
      hasText: ORDER_CODE,
    });
    await expect(row).toContainText('Đã giao xong');
    await expect(row).toContainText('Chờ kết thúc');
    await expect(row).toContainText('VC-001');

    expect(world.unhandled).toEqual([]);
  });

  /* ================================================================== *
   * 2. HIEN TRUONG CHUA GIAO — may chu tu choi, man hinh mo duong ghi de CO LY DO
   * ================================================================== */

  test('hoan tat trai hien truong: may chu tu choi bang ly do co kieu, chi ghi de co ly do moi qua', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const world = createWorld([order('ord-376', ORDER_CODE)]);
    commitPlan(world, 'ord-376');
    const [empty, loaded] = legsOf(world, 'run-1');
    if (empty === undefined || loaded === undefined) throw new Error('thieu chang');
    Object.assign(world.runs[0] ?? {}, { status: 'ACTIVE', startedAt: now(world) });
    Object.assign(empty, { status: 'COMPLETED', startedAt: now(world), completedAt: now(world) });
    Object.assign(loaded, {
      status: 'IN_TRANSIT',
      startedAt: now(world),
      // Lai xe bam den noi roi QUEN bam "Khách đã nhận hàng" — hang con tren xe theo hien truong.
      recorded: ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE', 'DELIVERY_ARRIVAL'],
    });
    // Bao cao vong chay dang hong: man hinh KHONG biet hien truong, nen nut la nut thuong.
    world.journeyDown = true;
    await serve(page, world, 'ADMIN');

    await page.goto('/?section=movement');
    await expect(page.getByRole('rowheader', { name: ORDER_CODE })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('rowheader', { name: ORDER_CODE }).click();
    const progress = page.getByRole('region', { name: 'Tiến độ vòng chạy VC-001' });
    await expect(legRow(progress, 2)).toContainText('Đang chạy');
    await expect(page.getByRole('button', { name: `Hoàn tất chặng — ${LEG_2}` })).toBeVisible();

    world.journeyDown = false;
    await advance(page, `Hoàn tất chặng — ${LEG_2}`, `Hoàn tất ${LEG_2}?`, 'Hoàn tất chặng');

    // Cau CO DAU chon theo `reason`, khong phai cau khong dau cua may chu.
    const alert = progress.locator('.tx-state--error');
    await expect(alert).toContainText('Hiện trường chưa ghi khách đã nhận hàng');
    await expect(alert).not.toContainText('Hien truong chua ghi');
    expect(loaded.status).toBe('IN_TRANSIT');

    // Doc lai: hien truong "Đã đến nơi giao", va buoc tiep CHI con ghi de.
    await expect(legRow(progress, 2)).toContainText('Đã đến nơi giao');
    await expect(page.getByRole('button', { name: `Hoàn tất chặng — ${LEG_2}` })).toHaveCount(0);
    await expect(legRow(progress, 2)).toContainText('nhắc lái xe bấm “Khách đã nhận hàng”');

    await page.getByRole('button', { name: `Hoàn tất có ghi đè… — ${LEG_2}` }).click();
    const dialog = page.getByRole('dialog', { name: `Hoàn tất ${LEG_2} trái hiện trường?` });
    // He qua noi TRUOC: chang dong roi khong nhan moc, vong chay se bi giu vi hang con tren xe.
    await expect(dialog).toContainText('hệ thống sẽ giữ vòng chạy mở vì “hàng còn trên xe”');
    await expect(dialog.getByRole('button', { name: 'Hoàn tất (ghi đè)' })).toBeDisabled();
    await dialog
      .getByLabel('Lý do hoàn tất trái hiện trường')
      .fill('Người nhận xác nhận qua điện thoại lúc 10:05');
    await dialog.getByRole('button', { name: 'Hoàn tất (ghi đè)' }).click();
    await expect(dialog).toHaveCount(0);

    await expect(progress.getByRole('status', { name: 'Kết quả tiến chặng' })).toContainText(
      `${LEG_2}: đã hoàn tất (ghi đè). Vòng chạy VC-001 chưa đóng: hiện trường cho thấy hàng còn trên xe.`,
    );
    expect(legWrites(world)).toEqual([
      { to: 'COMPLETED' },
      { to: 'COMPLETED', overrideReason: 'Người nhận xác nhận qua điện thoại lúc 10:05' },
    ]);
    // Ghi de doi CHANG, khong doi DON va khong dong vong chay.
    await expect(page.getByRole('region', { name: `Giao xong đơn ${ORDER_CODE}` })).toContainText(
      'Đang mở',
    );
    expect(world.runs[0]?.status).toBe('ACTIVE');
    expect(runTransitionWrites(world)).toEqual([]);
  });

  /* ================================================================== *
   * 3. XE VE BAI — HE THONG TU DONG; van phong (ke toan) khong bam dong
   * ================================================================== */

  test('chang cuoi ve bai: he thong tu dong vong chay, bang dieu hanh sang "Đã giao xong", don van mo', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const world = createWorld([order('ord-376', ORDER_CODE)]);
    commitPlan(world, 'ord-376');
    const [empty, loaded] = legsOf(world, 'run-1');
    if (empty === undefined || loaded === undefined) throw new Error('thieu chang');
    Object.assign(world.runs[0] ?? {}, { status: 'ACTIVE', startedAt: now(world) });
    Object.assign(empty, { status: 'COMPLETED', startedAt: now(world), completedAt: now(world) });
    Object.assign(loaded, {
      status: 'COMPLETED',
      startedAt: now(world),
      completedAt: now(world),
      recorded: ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE', 'DELIVERY_ARRIVAL', 'DELIVERY_ACCEPTED'],
    });
    world.legs.push({
      ...empty,
      id: 'run-1-leg-3',
      sequence: 3,
      status: 'IN_TRANSIT',
      originLabel: 'Ninh Bình',
      destinationLabel: DEPOT,
      startedAt: now(world),
      completedAt: null,
      recorded: [],
    });
    // Ke toan — cung quyen `transport.run.manage` voi chu doanh nghiep; man hinh khong xet chuc danh.
    await serve(page, world, 'ACCOUNTING');

    await page.goto('/?section=movement');
    await expect(page.getByRole('rowheader', { name: ORDER_CODE })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('rowheader', { name: ORDER_CODE }).click();
    const progress = page.getByRole('region', { name: 'Tiến độ vòng chạy VC-001' });
    const home = `Chặng 3 · chạy rỗng · Ninh Bình → ${DEPOT}`;
    await advance(page, `Hoàn tất chặng — ${home}`, `Hoàn tất ${home}?`, 'Hoàn tất chặng');

    await expect(progress.getByRole('status', { name: 'Kết quả tiến chặng' })).toContainText(
      'Hệ thống đã tự đóng vòng chạy VC-001 (xe đã về bãi). Trạng thái đơn không tự đổi.',
    );
    await expect(progress.getByRole('status', { name: 'Đóng vòng chạy VC-001' })).toContainText(
      'Đã đóng',
    );
    expect(world.runs[0]?.status).toBe('COMPLETED');
    expect(runTransitionWrites(world)).toEqual([]);
    await expect(page.getByRole('region', { name: `Giao xong đơn ${ORDER_CODE}` })).toContainText(
      'Đang mở',
    );

    await officeNav(page).getByRole('link', { name: 'Bảng điều hành' }).click();
    await expect(
      page.getByRole('article', { name: 'Đã giao xong' }).getByRole('link', { name: /VC-001/ }),
    ).toBeVisible();
    expect(world.orders[0]?.status).toBe('OPEN');
  });

  /* ================================================================== *
   * 4. THAT BAI DONG — may chu tu choi quyen, man hinh khong tu doi gi
   * ================================================================== */

  test('guard quyen tu choi: man hinh hien nguyen van cau cua may chu, khong doi trang thai nao', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const world = createWorld([order('ord-376', ORDER_CODE)]);
    commitPlan(world, 'ord-376');
    world.denyNextLegWrite = true;
    await serve(page, world, 'ADMIN');

    await page.goto('/?section=movement');
    await expect(page.getByRole('rowheader', { name: ORDER_CODE })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('rowheader', { name: ORDER_CODE }).click();
    const progress = page.getByRole('region', { name: 'Tiến độ vòng chạy VC-001' });
    await advance(page, `Bắt đầu chạy — ${LEG_1}`, `Ghi ${LEG_1} đang chạy?`, 'Bắt đầu chạy');

    await expect(progress.locator('.tx-state--error')).toHaveText(ACTION_NOT_PERMITTED_MESSAGE);
    await expect(legRow(progress, 1)).toContainText('Dự kiến');
    await expect(progress.getByRole('status', { name: 'Đóng vòng chạy VC-001' })).toContainText(
      'Chưa chạy',
    );
    await expect(progress.getByRole('status', { name: 'Kết quả tiến chặng' })).toHaveCount(0);
    expect(world.runs[0]?.status).toBe('PLANNED');
  });
});
