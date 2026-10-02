import { expect, test, type Page } from '@playwright/test';
import {
  actionsForRole,
  MANAGER_HAS_NO_TRANSPORT_SCOPE,
} from '../../experiences/transport-operations/transport-actions';
import {
  ACCOUNTANT,
  groupCodes,
  groupNeeds,
  lastRequest,
  makeAccount,
  serveAccounts,
  shoot,
  temporaryPasswordOf,
} from './admin-accounts-server';

/**
 * `#395` — "Tài khoản & quyền" va CONG QUYEN cua man hinh, tren trinh duyet that.
 *
 * Luat thuan (loc, bo quyen toi gian, o ba trang thai, cau ly do) khoa o vitest. Bo nay do thu chi
 * trinh duyet do duoc: mot Giam doc di het luong tao tai khoan va nhan dung the mat khau tam; man
 * hinh doc TAP QUYEN cua may chu (mot Dieu hanh duoc cap nhom thay dung man do va du lieu; mot Ke
 * toan bi bot nhom thi muc do bien mat); va man doi mat khau bat buoc dung duoc tren dien thoai.
 */

const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng vận hành vận tải' });

const horizontalOverflow = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('Tài khoản & quyền — Giám đốc', () => {
  test('tao tai khoan Dieu hanh voi nhom Doi xe: the mat khau tam, roi cau "Người này làm được gì?"', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const world = await serveAccounts(page);
    await page.goto('/?section=admin-accounts');

    await expect(page.getByRole('heading', { level: 1, name: 'Tài khoản & quyền' })).toBeVisible();
    // Nhom QUAN TRI o CUOI danh muc, hai muc cua no deu hien voi Giam doc.
    await expect(nav(page).locator('.tx-nav__grouplabel').last()).toHaveText('QUẢN TRỊ');
    await expect(nav(page).getByRole('link', { name: 'Tài khoản & quyền' })).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Địa điểm vận hành' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Kế toán Mai/ })).toBeVisible();
    await shoot(page, 'accounts-list-1440');

    await page.getByRole('button', { name: 'Thêm tài khoản' }).click();
    await expect(page.getByRole('heading', { name: 'Người này là ai?' })).toBeFocused();
    await page.getByRole('radio', { name: /Điều hành \/ Quản lý/ }).check();
    await page.getByRole('button', { name: 'Tiếp tục' }).click();

    await page.getByLabel('Họ tên').fill('Trần Văn An');
    // Ten dang nhap do MAY CHU goi y tu ho ten — sua duoc, nhung khong phai go tay.
    // `exact`: o tim cua danh sach ben trai cung nhac "tên đăng nhập, chức danh, số điện thoại".
    await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toHaveValue('tran.van.an');
    await page.getByLabel('Số điện thoại', { exact: true }).fill('0912345678');
    await page.getByLabel('Chức danh', { exact: true }).fill('Điều phối viên');
    // Quay lai doi Điều hành ↔ Kế toán (cung tien to): goi y ten dang nhap KHONG bi xoa.
    for (const preset of [/^Kế toán/, /Điều hành \/ Quản lý/]) {
      await page.getByRole('button', { name: 'Quay lại' }).click();
      await page.getByRole('radio', { name: preset }).check();
      await page.getByRole('button', { name: 'Tiếp tục' }).click();
      await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toHaveValue('tran.van.an');
    }
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await expect(page.getByText('Tên đăng nhập cần từ 3 đến 64 ký tự.')).toHaveCount(0);

    await expect(
      page.getByRole('heading', { name: 'Người này làm những nhóm việc nào?' }),
    ).toBeVisible();
    const fleet = page.getByRole('checkbox', { name: 'Nhóm Đội xe & lái xe' });
    await expect(fleet).toHaveAttribute('aria-checked', 'false');
    await fleet.click();
    await expect(fleet).toHaveAttribute('aria-checked', 'true');
    // Mo tung viec, bo mot dong: o nhom thanh BA TRANG THAI — `aria-checked="mixed"`.
    await page.getByRole('button', { name: 'Từng việc của nhóm Đội xe & lái xe' }).click();
    await page.getByRole('checkbox', { name: 'Cập nhật sở hữu xe và bên góp vốn' }).uncheck();
    await expect(fleet).toHaveAttribute('aria-checked', 'mixed');
    // Nhom chi Giam doc KHOA: khong bat duoc bang o nhom.
    await expect(page.getByRole('checkbox', { name: 'Nhóm Quản trị' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await shoot(page, 'accounts-wizard-groups-1440');

    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    const card = page.getByTestId('credential-card');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('temporary-password')).toHaveText(
      /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/,
    );
    await expect(card.getByRole('textbox', { name: 'Lời nhắn để gửi (Zalo, SMS)' })).toHaveValue(
      /Tên đăng nhập: tran\.van\.an[\s\S]*Mật khẩu tạm: [a-z2-9-]{19}[\s\S]*đặt mật khẩu riêng/,
    );

    const created = lastRequest(world, 'POST', '/settings/users')?.body as Record<string, unknown>;
    // KHONG co mat khau: may chu tao mat khau tam. Bo quyen TOI GIAN — dung cac dong da chon.
    expect(created).not.toHaveProperty('password');
    expect(created).toMatchObject({
      username: 'tran.van.an',
      name: 'Trần Văn An',
      role: 'MANAGER',
    });
    const expected = groupCodes('doi-xe')
      .filter((code) => code !== 'transport.asset_ownership.manage')
      .sort();
    expect(
      (created.grants as { permission: string; effect: string }[])
        .map((grant) => `${grant.effect}:${grant.permission}`)
        .sort(),
    ).toEqual(expected.map((code) => `ALLOW:${code}`));
    await shoot(page, 'accounts-credential-1440');

    await card.getByRole('button', { name: 'Đã gửi xong, đóng thẻ' }).click();
    await expect(page.getByTestId('account-detail')).toBeVisible();
    await expect(page).toHaveURL(/selected=tran\.van\.an/);
    // "Người này làm được gì?" la cau cua MAY CHU, khong phai man hinh tu doan.
    await expect(page.getByTestId('access-sentences')).toContainText('Đội xe & lái xe:');
    await expect(page.getByTestId('access-sentences')).toContainText('Không duyệt được tiền');
    await shoot(page, 'accounts-detail-1440');
  });

  test('bat nhom Bao duong: quyen "kèm theo để dùng được" cua nhom Doi xe bat cung, ghi ro ly do', async ({
    page,
  }) => {
    const world = await serveAccounts(page);
    await page.goto('/?section=admin-accounts');
    await page.getByRole('button', { name: 'Thêm tài khoản' }).click();
    await page.getByRole('radio', { name: /Điều hành \/ Quản lý/ }).check();
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await page.getByLabel('Họ tên').fill('Lê Văn Bảo');
    await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toHaveValue('le.van.bao');
    await page.getByRole('button', { name: 'Tiếp tục' }).click();

    const maintenance = page.getByRole('checkbox', { name: 'Nhóm Bảo dưỡng / giấy tờ' });
    const fleet = page.getByRole('checkbox', { name: 'Nhóm Đội xe & lái xe' });
    // Nhom NOI truoc no se bat kem gi — Giam doc khong bi bat ngo.
    await expect(
      page
        .locator('.tx-admin-group')
        .filter({ has: maintenance })
        .locator('.tx-admin-group__needs'),
    ).toHaveText('Kèm theo để dùng được: Xem danh sách xe, Xem hồ sơ lái xe');
    await expect(fleet).toHaveAttribute('aria-checked', 'false');

    await maintenance.click();
    await expect(maintenance).toHaveAttribute('aria-checked', 'true');
    // Hai phep XEM cua nhom Doi xe bat cung → nhom do "do dang", va dong cua no noi VI SAO.
    await expect(fleet).toHaveAttribute('aria-checked', 'mixed');
    await page.getByRole('button', { name: 'Từng việc của nhóm Đội xe & lái xe' }).click();
    const vehicleRow = page.locator('.tx-admin-action').filter({ hasText: 'Xem danh sách xe' });
    await expect(vehicleRow.getByRole('checkbox')).toBeChecked();
    await expect(vehicleRow).toContainText('Kèm theo để dùng được Bảo dưỡng / giấy tờ');
    await shoot(page, 'accounts-wizard-needs-1440');

    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    await expect(page.getByTestId('credential-card')).toBeVisible();
    const created = lastRequest(world, 'POST', '/settings/users')?.body as {
      grants: { permission: string; effect: string }[];
    };
    const granted = created.grants.map((grant) => `${grant.effect}:${grant.permission}`);
    expect(groupNeeds('bao-duong')).toEqual(['transport.vehicle.read', 'transport.driver.read']);
    for (const need of groupNeeds('bao-duong')) expect(granted).toContain(`ALLOW:${need}`);
    // Chi PHEP XEM kem theo — khong mot viec ghi nao cua nhom Doi xe.
    expect(granted).not.toContain('ALLOW:transport.vehicle.manage');
  });

  test('dat lai mat khau, khoa va mo khoa — moi viec co xac nhan va vao lich su', async ({
    page,
  }) => {
    const world = await serveAccounts(page);
    await page.goto('/?section=admin-accounts');
    await page.getByRole('button', { name: /Kế toán Mai/ }).click();
    const detail = page.getByTestId('account-detail');
    await expect(detail.getByRole('heading', { name: 'Kế toán Mai' })).toBeVisible();

    await detail.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
    const resetDialog = page.getByRole('dialog', { name: 'Đặt lại mật khẩu cho Kế toán Mai?' });
    // Lan dau may chu tu choi (than THAT cua ThrottlerGuard, gioi han 5 lan/phut): loi hien TRONG hop
    // thoai dang phu kin trang — bang tieng Viet, khong phai "ThrottlerException".
    const resetPath = `/settings/users/${ACCOUNTANT.id}/credentials/reset`;
    world.failNext = {
      method: 'POST',
      path: resetPath,
      status: 429,
      body: { statusCode: 429, message: 'ThrottlerException: Too Many Requests' },
    };
    await resetDialog.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
    await expect(resetDialog.getByRole('alert')).toHaveText(
      'Bạn thao tác quá nhanh — chờ khoảng một phút rồi thử lại.',
    );
    await expect(resetDialog).not.toContainText('ThrottlerException');
    await resetDialog.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
    await expect(page.getByTestId('temporary-password')).toHaveText(
      /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/,
    );
    expect(
      lastRequest(world, 'POST', `/settings/users/${ACCOUNTANT.id}/credentials/reset`)?.body,
    ).toEqual({});
    await page.getByRole('button', { name: 'Đã gửi xong, đóng thẻ' }).click();
    await expect(detail.getByText('Chờ đổi mật khẩu').first()).toBeVisible();

    await detail.getByRole('button', { name: 'Khoá tài khoản' }).click();
    const lockDialog = page.getByRole('dialog', { name: 'Khoá tài khoản Kế toán Mai?' });
    const confirmLock = lockDialog.getByRole('button', { name: 'Khoá tài khoản' });
    // Ly do BAT BUOC: chua ghi thi chua xac nhan duoc.
    await expect(confirmLock).toBeDisabled();
    // Hop moi KHONG mang loi cua hop truoc (lan dat lai bi tu choi o tren).
    await expect(lockDialog.getByRole('alert')).toHaveCount(0);
    const lockReason = lockDialog.getByLabel('Lý do khoá (ghi vào nhật ký)');
    // Trung `max(500)` cua may chu — khong go qua duoc roi moi bi `400`.
    await expect(lockReason).toHaveAttribute('maxlength', '500');
    await lockReason.fill('Nghỉ việc');
    await confirmLock.click();
    await expect(detail.getByText('Đã khoá').first()).toBeVisible();
    expect(lastRequest(world, 'POST', `/settings/users/${ACCOUNTANT.id}/disable`)?.body).toEqual({
      confirmed: true,
      reason: 'Nghỉ việc',
    });

    await detail.getByRole('button', { name: 'Mở khoá tài khoản' }).click();
    await page
      .getByRole('dialog', { name: 'Mở khoá Kế toán Mai?' })
      .getByRole('button', { name: 'Mở khoá' })
      .click();
    await expect(detail.getByRole('button', { name: 'Khoá tài khoản' })).toBeVisible();

    await detail.getByRole('button', { name: 'Lịch sử thay đổi' }).click();
    const history = detail.locator('.tx-admin-history');
    await expect(history).toContainText('Mở khoá tài khoản');
    // Ly do "ghi vào nhật ký" DOC LAI duoc: may chu gia tra CUNG hinh dang may chu that
    // (`summary` "Khoá tài khoản", ly do o `after.reason`) — man hinh ghep chung.
    await expect(history).toContainText('Khoá tài khoản — Nghỉ việc');
    await expect(history).toContainText('Cấp mật khẩu tạm mới');

    // Lai xe da noi ho so: man hinh noi TEN ho so va xe dang phu trach.
    await page.getByRole('button', { name: /Nguyễn Văn Bình/ }).click();
    await expect(detail.getByTestId('linked-driver')).toContainText('Nguyễn Văn Bình');
    await expect(detail.getByTestId('linked-driver')).toContainText('Xe 29H-123.45');

    // Tai khoan HE THONG: noi ro, khong co nut khoa / dat lai.
    await page.getByRole('button', { name: /Vận hành hệ thống/ }).click();
    await expect(detail.getByText(/Tài khoản hệ thống — không sửa được ở đây/)).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Khoá tài khoản' })).toHaveCount(0);
    // CHINH MINH: khong tu khoa, tu doi quyen, tu dat lai mat khau.
    // Hang cua danh sach, khong phai nut menu tai khoan o dau trang (cung ten).
    await page.locator('.tx-admin-person').filter({ hasText: 'Giám đốc Hùng' }).click();
    await expect(detail.getByRole('button', { name: 'Đặt lại mật khẩu' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Chỉnh quyền' })).toHaveCount(0);
  });

  test('chinh quyen Ke toan: xung dot tach nhiem noi TEN hai quyen, tu cau cua may chu', async ({
    page,
  }) => {
    const world = await serveAccounts(page);
    await page.goto(`/?section=admin-accounts&selected=${ACCOUNTANT.username}`);
    const detail = page.getByTestId('account-detail');
    await detail.getByRole('button', { name: 'Chỉnh quyền' }).click();

    await detail
      .getByRole('button', { name: 'Từng việc của nhóm Hiện trường & bằng chứng' })
      .click();
    // `click`, khong `check`: o chua bat cho toi khi xac nhan xong — do la y do.
    await detail.getByRole('checkbox', { name: 'Ghi bù mốc hiện trường từ văn phòng' }).click();
    // Quyen NHAY CAM: hoi truoc khi dua vao ban nhap.
    const escalate = page.getByRole('dialog', {
      name: /Cấp quyền nhạy cảm: Ghi bù mốc hiện trường/,
    });
    await escalate.getByRole('button', { name: 'Tôi hiểu, cấp quyền' }).click();

    const violations = detail.locator('.tx-admin-violations');
    await expect(violations).toContainText('” vừa “Ghi bù mốc hiện trường từ văn phòng”');
    await expect(violations).toContainText('Một người không được vừa “');
    await expect(violations).not.toContainText('transport.');
    const preview = lastRequest(world, 'PUT', `/settings/users/${ACCOUNTANT.id}/access`)?.body;
    expect(preview).toMatchObject({ role: 'ACCOUNTING', dryRun: true });
    // `#395` (e): may chu VUA noi bo quyen nay vi pham → "Lưu quyền" TAT, va noi vi sao.
    const save = detail.getByRole('button', { name: 'Lưu quyền' });
    await expect(save).toBeDisabled();
    await expect(detail.getByRole('status').filter({ hasText: 'Chưa lưu được' })).toContainText(
      'còn vi phạm quy tắc ở khung “Xem trước”',
    );
    // Khong mot lan GHI nao duoc gui (chi co cac lan xem truoc).
    expect(
      world.requests.filter(
        (entry) =>
          entry.method === 'PUT' &&
          entry.path === `/settings/users/${ACCOUNTANT.id}/access` &&
          (entry.body as { dryRun?: boolean }).dryRun !== true,
      ),
    ).toEqual([]);

    // Vai Giam doc: phai GO cau xac nhan, mot lan bam la qua re cho toan quyen.
    await detail.getByRole('radio', { name: /^Giám đốc/ }).check();
    // O nhom KHOA van noi DUNG trang thai: Giam doc du ca nhom — khong phai o trong canh "n/n".
    const fleetGroup = detail.getByRole('checkbox', { name: 'Nhóm Đội xe & lái xe' });
    await expect(fleetGroup).toHaveAttribute('aria-disabled', 'true');
    await expect(fleetGroup).toHaveAttribute('aria-checked', 'true');
    await expect(fleetGroup).toHaveText('✓');
    await expect(save).toBeDisabled();
    await detail.getByLabel(/Gõ đúng câu/).fill('Tôi hiểu Giám đốc có toàn quyền');
    await expect(save).toBeEnabled();
    await shoot(page, 'accounts-editor-1440');
  });
});

test.describe('Man hinh doc TAP QUYEN cua may chu', () => {
  test('Dieu hanh duoc cap nhom Doi xe: thay dung man do va du lieu, khong phai cau "chưa được cấp quyền"', async ({
    page,
  }) => {
    const an = makeAccount({ id: 'u-an', username: 'an', name: 'Trần Văn An', role: 'MANAGER' });
    await serveAccounts(page, { me: an, permissions: groupCodes('doi-xe') });
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Đội xe & lái xe' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: '29H-123.45' })).toBeVisible();
    await expect(page.getByText(MANAGER_HAS_NO_TRANSPORT_SCOPE)).toHaveCount(0);
    await expect(nav(page).getByRole('link', { name: 'Tài khoản & quyền' })).toHaveCount(0);
    await expect(nav(page).getByRole('link', { name: 'Tổng quan' })).toHaveCount(0);
  });

  test('Dieu hanh co quyen VA da noi ho so ben gop von: van vao duoc "Xe tôi có cổ phần"', async ({
    page,
  }) => {
    const an = makeAccount({ id: 'u-an', username: 'an', name: 'Trần Văn An', role: 'MANAGER' });
    await serveAccounts(page, {
      me: an,
      permissions: groupCodes('doi-xe'),
      myVehicles: [
        {
          vehicleId: 'veh-1',
          registrationPlate: '29H-123.45',
          vehicleClass: 'Đầu kéo',
          status: 'IDLE',
          operationalControl: 'INTERNAL_OPERATED',
          currentOdoKm: 120000,
          myBasisPoints: 3000,
          myEffectiveFrom: '2026-01-01',
          myHistory: [
            { ownershipBasisPoints: 3000, effectiveFrom: '2026-01-01', effectiveTo: null },
          ],
          driverName: 'Nguyễn Văn Bình',
        },
      ],
    });
    await page.goto('/');

    // Danh muc KHONG rong (co nhom Doi xe) — truoc day man ben gop von chi hien khi danh muc rong.
    await expect(page.getByRole('heading', { level: 1, name: 'Đội xe & lái xe' })).toBeVisible();
    const mine = nav(page).getByRole('link', { name: 'Xe tôi có cổ phần' });
    await expect(mine).toBeVisible();
    await mine.click();
    await expect(page).toHaveURL(/section=my-vehicles/);
    await expect(page.getByRole('table', { name: 'Xe tôi có cổ phần', exact: true })).toContainText(
      '29H-123.45',
    );

    // Tai lai trang: dia chi `?section=my-vehicles` con song toi luc may chu xac nhan pham vi.
    await page.reload();
    await expect(page.getByRole('table', { name: 'Xe tôi có cổ phần', exact: true })).toContainText(
      '29H-123.45',
    );
  });

  test('Dieu hanh KHONG gop von: may chu tra 403 cho lan hoi — khong co muc do', async ({
    page,
  }) => {
    const an = makeAccount({ id: 'u-an', username: 'an', name: 'Trần Văn An', role: 'MANAGER' });
    const world = await serveAccounts(page, { me: an, permissions: groupCodes('doi-xe') });
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Đội xe & lái xe' })).toBeVisible();
    // Man hinh DA hoi may chu (khong doan), va may chu noi khong.
    await expect
      .poll(() => world.requests.filter((entry) => entry.path === '/transport/me/vehicles').length)
      .toBeGreaterThan(0);
    await expect(nav(page).getByRole('link', { name: 'Xe tôi có cổ phần' })).toHaveCount(0);
  });

  /**
   * `#395` — QUYEN RIENG luon cho ra mot man dung duoc. Bam o nhom tren trinh chinh quyen = moi viec
   * thuong cua nhom (khong nhay cam, khong chi Giam doc) — dung bo `diag-groups` da cap tren may that.
   */
  const groupToggle = (id: string): string[] =>
    groupCodes(id).filter((code) => code !== 'transport.trip.cancel');
  const manager = () =>
    makeAccount({ id: 'u-bao', username: 'bao', name: 'Lê Văn Bảo', role: 'MANAGER' });

  test('#395 Dieu hanh duoc cap DUNG nhom Bao duong (kem quyen kem theo): man Bao duong doc duoc bien so', async ({
    page,
  }) => {
    await serveAccounts(page, {
      me: manager(),
      permissions: [...groupToggle('bao-duong'), ...groupNeeds('bao-duong')],
    });
    await page.goto('/?section=maintenance');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Bảo dưỡng & giấy tờ' }),
    ).toBeVisible();
    await expect(page.getByRole('rowheader', { name: '29H-123.45' })).toBeVisible();
    await expect(page.getByText('Bạn chưa được cấp quyền xem')).toHaveCount(0);
    await expect(page.getByText(MANAGER_HAS_NO_TRANSPORT_SCOPE)).toHaveCount(0);
  });

  test('#395 nhom Bao duong KHONG co quyen kem theo: muc van mo, ten xe noi mot cau, KHONG hoi may chu', async ({
    page,
  }) => {
    const world = await serveAccounts(page, {
      me: manager(),
      permissions: groupToggle('bao-duong'),
    });
    await page.goto('/');

    // Truoc ban sua: danh muc trong + "Tài khoản của bạn chưa được cấp quyền…".
    await expect(
      page.getByRole('heading', { level: 1, name: 'Bảo dưỡng & giấy tờ' }),
    ).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Bảo dưỡng & giấy tờ' })).toBeVisible();
    await expect(page.getByText(MANAGER_HAS_NO_TRANSPORT_SCOPE)).toHaveCount(0);
    await expect(
      page.getByText('Bạn chưa được cấp quyền xem danh sách xe và hồ sơ lái xe.'),
    ).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Xe chưa đọc được tên' })).toBeVisible();
    expect(
      world.requests.filter((entry) =>
        ['/transport/vehicles', '/transport/drivers'].includes(entry.path),
      ),
    ).toEqual([]);
  });

  test('#395 Dieu hanh duoc cap nhom Dieu hanh: KHONG thay "Hiệu quả từng chuyến" (man do doc bao cao quyet toan)', async ({
    page,
  }) => {
    await serveAccounts(page, {
      me: manager(),
      permissions: [...groupToggle('dieu-hanh'), ...groupNeeds('dieu-hanh')],
    });
    await page.goto('/');
    await expect(nav(page).getByRole('link', { name: 'Đơn hàng & vòng chạy' })).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Hiệu quả từng chuyến' })).toHaveCount(0);
  });

  test('#395 CHI co quyen sua dia diem: khong muc nao mo duoc, va danh muc noi dung ly do', async ({
    page,
  }) => {
    const world = await serveAccounts(page, {
      me: manager(),
      permissions: ['transport.geofence.manage'],
    });
    await page.goto('/?section=admin-places');

    await expect(page.getByText(MANAGER_HAS_NO_TRANSPORT_SCOPE)).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Địa điểm vận hành' })).toHaveCount(0);
    await expect(nav(page)).toContainText('Chưa có mục nào bạn được cấp quyền mở.');
    await expect(nav(page)).not.toContainText('Không có mục nào khớp');
    expect(world.requests.filter((entry) => entry.path === '/transport/places/admin')).toEqual([]);
  });

  test('Ke toan bi BOT nhom Nhien lieu: muc do bien khoi danh muc; tra lai thi hien', async ({
    page,
  }) => {
    const fuel = new Set(groupCodes('nhien-lieu'));
    const world = await serveAccounts(page, {
      me: ACCOUNTANT,
      permissions: actionsForRole('ACCOUNTING').filter((code) => !fuel.has(code)),
    });
    await page.goto('/?section=fuel');

    await expect(nav(page).getByRole('link', { name: 'Phải thu khách hàng' })).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Nhiên liệu' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Nhiên liệu' })).toHaveCount(0);
    await expect(nav(page).getByText('QUẢN TRỊ', { exact: true })).toHaveCount(0);

    // Doi chung: cung tai khoan, may chu tra LAI nhom do → muc hien lai.
    world.me = { ...world.me, permissions: actionsForRole('ACCOUNTING') };
    await page.reload();
    await expect(nav(page).getByRole('link', { name: 'Nhiên liệu' })).toBeVisible();
  });
});

test.describe('Mật khẩu tạm — đổi trước khi làm việc', () => {
  test('man doi mat khau bat buoc dung duoc o 390px, doi xong vao thang viec', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const an = makeAccount({
      id: 'u-an',
      username: 'an',
      name: 'Trần Văn An',
      role: 'MANAGER',
      mustChangePassword: true,
      temporaryPasswordExpiresAt: '2026-09-28T02:00:00.000Z',
    });
    const world = await serveAccounts(page, { me: an, permissions: groupCodes('doi-xe') });
    const temporary = temporaryPasswordOf(9);
    const chosen = ['mot', 'cau', 'de', 'nho', 'cua', 'an'].join('-');

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Đặt mật khẩu của riêng bạn' })).toBeVisible();
    await expect(page.getByText(/Mật khẩu tạm hết hạn lúc/)).toBeVisible();
    await expect(nav(page)).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await shoot(page, 'forced-change-390');

    await page.getByLabel('Mật khẩu tạm đang dùng').fill(temporary);
    await page.getByLabel('Mật khẩu mới', { exact: true }).fill(chosen);
    await page.getByLabel('Nhập lại mật khẩu mới').fill(`${chosen}x`);
    await page.getByRole('button', { name: 'Lưu mật khẩu và bắt đầu' }).click();
    await expect(page.locator('.login-error')).toContainText(
      'Hai lần nhập mật khẩu mới chưa khớp nhau.',
    );
    expect(lastRequest(world, 'POST', '/auth/credentials/change')).toBeUndefined();

    await page.getByLabel('Nhập lại mật khẩu mới').fill(chosen);
    await page.getByRole('button', { name: 'Lưu mật khẩu và bắt đầu' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Đội xe & lái xe' })).toBeVisible();
    const change = lastRequest(world, 'POST', '/auth/credentials/change')?.body as Record<
      string,
      unknown
    >;
    expect(Object.keys(change).sort()).toEqual(['currentPassword', 'newPassword']);
    expect(change.newPassword).toBe(chosen);
  });

  test('Tai khoan & quyen o 390px: danh sach roi chi tiet, khong tran ngang', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await serveAccounts(page);
    await page.goto('/?section=admin-accounts');
    await expect(page.getByRole('heading', { level: 1, name: 'Tài khoản & quyền' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Kế toán Mai/ })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await shoot(page, 'accounts-list-390');

    const row = page.getByRole('button', { name: /Kế toán Mai/ });
    // Ban phim: danh sach bi AN khi chi tiet mo — tieu diem phai sang tieu de chi tiet, khong roi
    // ve `<body>`; "Đóng" tra tieu diem ve DUNG dong da mo.
    await row.focus();
    await page.keyboard.press('Enter');
    const detail = page.getByTestId('account-detail');
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('heading', { name: 'Kế toán Mai' })).toBeFocused();
    // Tren dien thoai chi tiet THAY danh sach; "Đóng" ve danh sach.
    await expect(page.getByRole('button', { name: /Nguyễn Văn Bình/ })).toBeHidden();
    await expect(page.getByTestId('access-sentences')).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await shoot(page, 'accounts-detail-390');
    await detail.getByRole('button', { name: /Đóng/ }).click();
    await expect(page.getByRole('button', { name: /Nguyễn Văn Bình/ })).toBeVisible();
    await expect(row).toBeFocused();
  });
});
