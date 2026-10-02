import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  chooseKnown,
  chooseResult,
  fillFacts,
  isAboveSubmitBar,
  openComposer,
  serve,
  shoot,
  waitForCameraRest,
} from './order-composer-server';

/**
 * `#379` — BO CUC cua be mat tao don o may xach tay, va TUONG PHAN chu.
 *
 * ================================================================================================
 * VI SAO CO BAI NAY
 * ================================================================================================
 *
 * O 1366x768 (va 1280x720) ban do chi cao ~500px. The tim, the "Vị trí của tôi", nut vi tri va
 * bang "Đang đặt…" cung nam tren ban do; mot bo cuc dat chung doc lap (moi cai mot `position:
 * absolute`) de the tim — luon cao vi hien san dia diem da biet — che mat the vi tri va hai nut
 * "Đặt làm điểm …" cua no. Bai kiem 1440x900 khong bao gio thay dieu do.
 *
 * Khang dinh: khong cap nao trong bon lop do cat nhau, va nut cua the vi tri bam duoc that (khong
 * bi phan tu nao de len). Anh chup ghi khi co `SHOTS_DIR`.
 */

type Box = NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>;

const intersects = (first: Box, second: Box): boolean =>
  first.x < second.x + second.width &&
  second.x < first.x + first.width &&
  first.y < second.y + second.height &&
  second.y < first.y + first.height;

async function overlappingPairs(layers: Record<string, Locator>): Promise<string[]> {
  const boxes = await Promise.all(
    Object.entries(layers).map(async ([name, locator]) => [name, await locator.boundingBox()]),
  );
  const present = boxes.filter((entry): entry is [string, Box] => entry[1] !== null);
  return present.flatMap(([name, box], index) =>
    present
      .slice(index + 1)
      .filter(([, other]) => intersects(box, other))
      .map(([otherName]) => `${name} x ${otherName}`),
  );
}

const overlayLayers = (page: Page): Record<string, Locator> => ({
  finder: page.locator('.tx-composer__finder'),
  position: page.getByTestId('tx-composer-position'),
  locate: page.getByRole('button', { name: 'Vị trí của tôi' }),
  banner: page.locator('.tx-composer__banner'),
});

const LAPTOPS = [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
] as const;

for (const viewport of LAPTOPS) {
  const size = `${viewport.width}x${viewport.height}`;

  test.describe(`#379 — may xach tay ${size}, co quyen vi tri`, () => {
    test.use({
      viewport,
      permissions: ['geolocation'],
      geolocation: { latitude: 21.0285, longitude: 105.8542, accuracy: 35 },
    });

    test('the vi tri, the tim, nut vi tri va bang trang thai khong de len nhau', async ({
      page,
    }) => {
      const world = await serve(page);
      await openComposer(page, world);
      if (viewport.width === 1366) {
        await chooseKnown(page, 'Nhà máy thép Đình Vũ', 'lấy');
        await chooseKnown(page, 'Kho Nhựa Tân Phú Hưng', 'giao');
        await fillFacts(page);
        await waitForCameraRest(page);
        await shoot(page, `desktop-${size}-both-endpoints`);

        /*
         * Cot trai dai hon man hinh: thanh gui dinh day de len o "Cước". Tab toi o do thi trang phai
         * cuon cho o nam TREN thanh (WCAG 2.4.11), khong nam duoi no.
         */
        await page.evaluate(() => window.scrollTo(0, 0));
        const form = page.getByRole('form', { name: 'Tạo đơn hàng' });
        await form.getByLabel('Khách hàng').focus();
        await page.keyboard.press('Tab');
        await expect(form.getByLabel('Cước (đ)')).toBeFocused();
        expect(await isAboveSubmitBar(page, 'Cước (đ)')).toBe(true);
        await page.evaluate(() => window.scrollTo(0, 0));
      }

      await page.getByRole('button', { name: 'Vị trí của tôi' }).click();
      const card = page.getByRole('group', { name: 'Vị trí của bạn' });
      await expect(card).toBeVisible();
      expect(await overlappingPairs(overlayLayers(page))).toEqual([]);
      // Hai nut cua the vi tri NHAN duoc cu bam (khong phan tu nao de len chung).
      for (const name of ['Đặt làm điểm lấy hàng', 'Đặt làm điểm giao hàng']) {
        await card.getByRole('button', { name }).click({ trial: true, timeout: 2_000 });
      }
      await waitForCameraRest(page);
      await shoot(page, `desktop-${size}-position-found`);

      // Mo lai danh sach cua the tim khi the vi tri dang mo: van khong de len nhau.
      await page.getByRole('tab', { name: /Địa điểm đã biết/ }).click();
      expect(await overlappingPairs(overlayLayers(page))).toEqual([]);
    });
  });

  test.describe(`#379 — may xach tay ${size}, vi tri bi tu choi`, () => {
    test.use({ viewport });

    test('cau loi vi tri doc duoc tron ven, khong bi the tim che', async ({ page }) => {
      const world = await serve(page);
      await openComposer(page, world);
      await page.getByRole('button', { name: 'Vị trí của tôi' }).click();
      const failed = page.getByTestId('tx-composer-position');
      await expect(failed).toContainText('Trình duyệt chưa cho phép lấy vị trí.');
      expect(await overlappingPairs(overlayLayers(page))).toEqual([]);
      await failed.getByRole('button', { name: 'Đóng' }).click({ trial: true, timeout: 2_000 });
      await shoot(page, `desktop-${size}-position-denied`);
    });
  });
}

/* ------------------------------------------------------------------ *
 * Tuong phan chu: moi chu nho cua be mat >= 4,5:1 tren nen THAT cua no
 * ------------------------------------------------------------------ */

/** Cac chu nho moi cua `#379` (toa do, chu thich, dong phu, ghi nguon, dong trang thai…). */
const SMALL_TEXT = [
  '.tx-ticket__legend',
  '.tx-ticket__place',
  '.tx-ticket__source',
  '.tx-ticket__detail',
  '.tx-ticket__coords',
  '.tx-ticket__distance',
  '.tx-finder__status',
  '.tx-finder__name',
  '.tx-finder__detail',
  '.tx-finder__grouptitle',
  '.tx-finder__credit',
  '.tx-finder__panel > .tx-note',
  '.tx-composer__banner-text',
  '.tx-composer__missing',
  '.tx-composer__notice',
  '.tx-composer__legend li',
];

async function lowContrast(page: Page): Promise<string[]> {
  return page.evaluate((selectors) => {
    const channels = (color: string): number[] => (color.match(/[\d.]+/g) ?? []).map(Number);
    const luminance = ([red = 0, green = 0, blue = 0]: number[]): number => {
      const linear = (value: number): number => {
        const unit = value / 255;
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
    };
    /* Nen THAT: to tien gan nhat co nen dac (nen rua cua cuong dang chon, the, giay…). */
    const backgroundOf = (node: Element): number[] => {
      for (let current: Element | null = node; current !== null; current = current.parentElement) {
        const [red = 0, green = 0, blue = 0, alpha = 1] = channels(
          getComputedStyle(current).backgroundColor,
        );
        if (alpha > 0.5) return [red, green, blue];
      }
      return [255, 255, 255];
    };
    return selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector))
        .filter((node) => (node.textContent ?? '').trim().length > 0)
        .map((node) => {
          const fore = luminance(channels(getComputedStyle(node).color));
          const back = luminance(backgroundOf(node));
          const ratio = (Math.max(fore, back) + 0.05) / (Math.min(fore, back) + 0.05);
          return { selector, ratio };
        })
        .filter((entry) => entry.ratio < 4.5)
        .map((entry) => `${entry.selector} ${entry.ratio.toFixed(2)}:1`),
    );
  }, SMALL_TEXT);
}

test.describe('#379 — tuong phan chu nho', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('chu nho cua phieu tuyen, the tim, ban do dat 4,5:1', async ({ page }) => {
    const world = await serve(page);
    await openComposer(page, world);
    // Luc mo: "Chưa chọn", chu thich nhom radio, nhom dia diem da biet.
    expect(await lowContrast(page)).toEqual([]);

    // Sau khi tim + chon: toa do tren nen rua, dia chi, ghi nguon OpenStreetMap, duong chim bay.
    const finder = page.getByRole('search', { name: 'Tìm địa điểm' });
    await finder.getByRole('searchbox').fill('Đình Vũ');
    await finder.getByRole('button', { name: 'Tìm' }).click();
    await expect(page.getByText('© OpenStreetMap contributors')).toBeVisible();
    await chooseResult(page, 'Khu công nghiệp Đình Vũ', 1, 'lấy');
    expect(await lowContrast(page)).toEqual([]);
    await page.getByRole('tab', { name: /Địa điểm đã biết/ }).click();
    await chooseKnown(page, 'Kho Nhựa Tân Phú Hưng', 'giao');
    expect(await lowContrast(page)).toEqual([]);
  });
});
