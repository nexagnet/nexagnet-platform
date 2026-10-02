import { expect, test, type Page } from '@playwright/test';
import {
  NARROW_SECTIONS,
  TARGET_SECTIONS,
  measureHorizontalOverflow,
  mockSettingsSurfaces,
} from './fixtures/settings-mocks';

/**
 * `/settings` — TIEU DIEM CO DAN DUONG tren cac muc ngoai bang gia (#146).
 *
 * Bo nay kiem HANH VI, khong kiem chu: mot muc dat khi nguoi van hanh nhin mot khung hinh la biet
 * dang o dau, phai lam gi, va bam nut nao TRUOC. Ba bat bien duoc khoa lai o day:
 *
 *  1. moi muc co DUNG MOT khoi viec dang lam (`[data-settings-work]`);
 *  2. trong khoi do co DUNG MOT nut chinh (`.settings-button--primary`);
 *  3. noi dung phu/lich su mac dinh gap lai, va khong muc nao tran ngang.
 *
 * Bang gia (`products-pricing`) CO Y nam ngoai: no thuoc #127/#144 va da co bo test rieng trong
 * `settings.spec.ts`. O day chi kiem lai rang no khong tran ngang sau khi CSS dung chung doi.
 */

async function openSettings(page: Page, section: string): Promise<void> {
  await mockSettingsSurfaces(page, { role: 'ADMIN' });
  await page.goto(`/settings?section=${section}`);
  await page.getByRole('heading', { level: 1, name: /Thiết lập/ }).waitFor();
}

test.describe('Mỗi mục có đúng một việc đang làm', () => {
  for (const section of TARGET_SECTIONS) {
    test(`${section}: một khối việc, một nút chính`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openSettings(page, section);

      // `audit` CO Y khong co khoi viec: no chi doc, va "viec dang lam" cua no la MOT cau truy van
      // (#146 §11). Bat bien ve mot nut chinh thi van ap dung cho ca no.
      const work = page.locator('[data-settings-work]');
      await expect(work).toHaveCount(section === 'audit' ? 0 : 1);

      // Nut chinh la LOI HUA "bam cai nay truoc". Hai nut chinh cung hien mot luc nghia la nguoi
      // dung lai phai tu doan thu tu — dung cai #146 phai xoa bo.
      const primaries = page.locator('.settings-panel .settings-button--primary:visible');
      expect(
        await primaries.count(),
        `mục ${section} có nhiều hơn một nút chính`,
      ).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('Nội dung phụ mặc định gấp lại', () => {
  test('overview: phần “đang ổn” không cạnh tranh với việc đang chặn', async ({ page }) => {
    await openSettings(page, 'overview');

    // Con viec dang chan thi "đang ổn" phai la boi canh gap lai, khong phai mot luoi the ngang hang.
    await expect(page.getByRole('heading', { name: 'Làm tiếp sau đó' })).toBeVisible();
    const settled = page
      .locator('details.settings-focus-advanced')
      .filter({ hasText: 'Những phần đang ổn' });
    await expect(settled).toHaveJSProperty('open', false);
  });

  test('dealers-groups: bảng đầy đủ gấp lại khi còn nhóm chưa gán đại lý', async ({ page }) => {
    await openSettings(page, 'dealers-groups');

    await expect(
      page.getByRole('heading', { name: /Chọn đại lý cho nhóm/, level: 3 }),
    ).toBeVisible();
    // Bang day du la boi canh khi con viec dang chan -> chua mo, nen cac o chon trong bang chua hien.
    await expect(page.getByRole('combobox', { name: /Đại lý cho nhóm/ })).toHaveCount(0);

    await page.getByText('Tất cả nhóm đang nghe').click();
    await expect(page.getByRole('combobox', { name: /Đại lý cho nhóm/ }).first()).toBeVisible();
  });

  test('content: nhập hàng loạt nằm sau mục nâng cao, và phải xem trước mới ghi được', async ({
    page,
  }) => {
    await openSettings(page, 'content');

    await expect(page.getByLabel('Nội dung nhập hàng loạt')).toBeHidden();
    await page.getByText('Nhập hàng loạt (nâng cao)').click();
    await expect(page.getByLabel('Nội dung nhập hàng loạt')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ghi thay đổi vào hệ thống' })).toHaveCount(0);
  });

  test('campaigns: biểu mẫu soạn không mở sẵn khi chưa chọn việc', async ({ page }) => {
    await openSettings(page, 'campaigns');

    await expect(page.getByLabel('Tên chiến dịch')).toHaveCount(0);
    await page.getByRole('button', { name: 'Soạn chiến dịch' }).click();
    await expect(page.getByLabel('Tên chiến dịch')).toBeVisible();
  });

  test('users: biểu mẫu tạo tài khoản không mở sẵn', async ({ page }) => {
    await openSettings(page, 'users');

    await expect(page.getByLabel('Tên đăng nhập')).toHaveCount(0);
    await page.getByRole('button', { name: 'Thêm người dùng' }).click();
    await expect(page.getByLabel('Tên đăng nhập')).toBeVisible();
  });
});

test.describe('Hành động phá huỷ không bao giờ ngang hàng với việc đang làm', () => {
  test('zalo: đăng xuất là hành động hạng ba, tách khỏi cụm nút chính', async ({ page }) => {
    await openSettings(page, 'zalo');

    const work = page.locator('[data-settings-work]');
    await expect(work.locator('.settings-focus-actions__main')).not.toContainText(
      'Đăng xuất an toàn',
    );
    await expect(work.locator('.settings-focus-actions__aside')).toContainText('Đăng xuất an toàn');
  });

  test('automation: đổi công tắc an toàn phải đi qua hộp thoại giữ tiêu điểm', async ({ page }) => {
    await openSettings(page, 'automation');

    await page.getByRole('button', { name: 'Bật tự gửi', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    // Tieu diem vao nut HUY, khong phai nut xac nhan: mot phim Enter lo tay khong duoc bat tu gui.
    await expect(dialog.getByRole('button', { name: 'Để sau' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});

test.describe('Tiêu điểm đi theo việc, không theo lần nạp lại', () => {
  test('dealers-groups: gán đại lý xong thì sự chú ý chuyển sang đồng bộ thành viên', async ({
    page,
  }) => {
    await openSettings(page, 'dealers-groups');

    await page.getByRole('combobox', { name: /Đại lý phụ trách nhóm/ }).selectOption('dealer-1');

    await expect(page.getByText('Đã map nhóm vào đại lý')).toBeVisible();
  });

  test('users: mở biểu mẫu tạo tài khoản thì tiêu điểm vào chính biểu mẫu đó', async ({ page }) => {
    await openSettings(page, 'users');

    await page.getByRole('button', { name: 'Thêm người dùng' }).click();
    // Tieu de cua khoi viec nhan tieu diem: trinh doc man hinh doc ra "dang o dau" truoc khi go.
    const heading = page.getByRole('heading', { name: 'Thêm người dùng mới' });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
  });

  test('users: đóng biểu mẫu thì tiêu điểm quay về đúng nút đã mở nó', async ({ page }) => {
    await openSettings(page, 'users');

    const trigger = page.getByRole('button', { name: 'Thêm người dùng' });
    await trigger.click();
    await page.getByRole('button', { name: 'Hủy' }).click();
    await expect(trigger).toBeFocused();
  });

  test('content: đi hết luồng bổ sung nội dung bằng bàn phím', async ({ page }) => {
    await openSettings(page, 'content');

    await page.getByRole('button', { name: /Bổ sung nội dung cho sản phẩm này/ }).focus();
    await page.keyboard.press('Enter');

    const heading = page.getByRole('heading', { name: /cho SP01/, level: 3 });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(page.getByRole('button', { name: 'Lưu bản nháp' })).toBeVisible();
  });
});

test.describe('Mở một mục không tự cướp tiêu điểm', () => {
  for (const section of ['overview', 'notifications', 'sales-policy', 'dealers-groups'] as const) {
    test(`${section}: vừa mở trang thì không có gì đang giữ tiêu điểm`, async ({ page }) => {
      await openSettings(page, section);
      // React Query nap lai nen moi 10-15 giay. Neu tieu diem chay theo du lieu thay vi theo VIEC,
      // con tro cua nguoi dang go se bi giat ra khoi o nhap — va vien tieu diem bat len nhu the
      // nguoi dung vua bam nham cai gi do.
      await page.waitForTimeout(600);
      const active = await page.evaluate(() => document.activeElement?.tagName ?? 'NONE');
      expect(active, `mục ${section} tự lấy tiêu điểm khi vừa mở`).toBe('BODY');
    });
  }
});

test.describe('Không mục nào tràn ngang', () => {
  // Moi bai o day di qua toi 12 muc trong mot lan chay; 30 giay mac dinh cua Playwright khong du
  // cho mot may cham, va het gio thi bao cao doc ra y het mot loi tran ngang that.
  test.describe.configure({ timeout: 180_000 });

  for (const width of [1440, 768, 375]) {
    test(`không tràn ngang ở ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockSettingsSurfaces(page, { role: 'ADMIN' });

      for (const section of [...TARGET_SECTIONS, 'products-pricing']) {
        // Chi kiem khung hep cho cac muc phuc tap cua #146, cong bang gia de bat hoi quy #144.
        if (
          width < 1440 &&
          section !== 'products-pricing' &&
          !NARROW_SECTIONS.includes(section as (typeof NARROW_SECTIONS)[number])
        ) {
          continue;
        }
        await page.goto(`/settings?section=${section}`);
        await page.getByRole('heading', { level: 1, name: /Thiết lập/ }).waitFor();
        // Doi panel ve xong: do be ngang khi bang du lieu chua render se cho ket qua ngau nhien.
        await page.locator('.settings-panel').waitFor();
        await page.waitForTimeout(250);
        expect(
          await measureHorizontalOverflow(page),
          `mục ${section} tràn ngang ở ${width}px`,
        ).toBeLessThanOrEqual(1);
      }
    });
  }
});

/**
 * `#395` — MAN `/settings` CU VAN CHAY VOI MAY CHU MOI: mat khau ban dau TUY CHON (may chu tao mat
 * khau tam va tra MOT lan), the mat khau tam la viec dang lam, tai khoan da khoa mo lai duoc.
 */
test.describe('#395 — tài khoản: mật khẩu tạm và mở khoá', () => {
  test('tạo tài khoản không nhập mật khẩu: thẻ mật khẩu tạm là việc đang làm', async ({ page }) => {
    await openSettings(page, 'users');

    await page.getByRole('button', { name: 'Thêm người dùng' }).click();
    await page.getByLabel('Họ tên').fill('Nguoi Moi');
    await page.getByLabel('Tên đăng nhập').fill('moi');
    const created = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && new URL(request.url()).pathname === '/settings/users',
    );
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    // Mat khau rong KHONG duoc gui: may chu doc chuoi rong la mot mat khau qua ngan.
    expect(Object.keys((await created).postDataJSON() as object)).not.toContain('password');

    const work = page.locator('[data-settings-work]');
    await expect(work).toHaveCount(1);
    await expect(work.getByTestId('temporary-password')).toHaveText('abcd-efgh-jkmn-pqrs');
    await expect(work.locator('.settings-button--primary')).toHaveCount(1);
    await work.getByRole('button', { name: 'Đã gửi xong, đóng thẻ' }).click();
    await expect(page.getByTestId('temporary-password')).toHaveCount(0);
  });

  test('tài khoản đã vô hiệu hóa có nút Mở khoá, và tự đặt lại mật khẩu bị ẩn', async ({
    page,
  }) => {
    await openSettings(page, 'users');

    await page.getByText('Tài khoản đã vô hiệu hóa').click();
    const enabled = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith('/settings/users/u-old/enable'),
    );
    await page.getByRole('button', { name: 'Mở khoá' }).click();
    expect((await enabled).postDataJSON()).toEqual({ confirmed: true });
    await expect(page.getByText(/Đã mở khoá Ke Toan Cu/)).toBeVisible();

    // Chinh minh (`u-admin`): khong co nut dat lai mat khau — tu khoa minh ra ngoai la `SELF_LOCKOUT`.
    await page
      .locator('.settings-focus-queue li')
      .filter({ hasText: 'Quan Tri Vien' })
      .getByRole('button', { name: 'Quản lý' })
      .click();
    const work = page.locator('[data-settings-work]');
    await expect(work.getByRole('button', { name: 'Đặt lại mật khẩu' })).toHaveCount(0);
  });
});
