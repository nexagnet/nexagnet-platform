/**
 * Kịch bản chụp ảnh HƯỚNG DẪN TÀI XẾ trên bản CỤC BỘ (xem README cùng thư mục).
 *
 *   DOCS_DEMO_PASSWORD=… node docs/khach-hang/van-tai-viet/ban-giao/cong-cu-anh/chup-tai-xe.mjs
 *
 * Làm đúng một vòng việc từ đầu tới cuối trên dữ liệu mẫu cục bộ:
 *   văn phòng tạo đơn có toạ độ → lập kế hoạch, giao xe → tài xế đi hết các mốc trên điện thoại →
 *   văn phòng tiến chặng và xác nhận giao xong.
 * Mỗi bước chụp MỘT ảnh điện thoại có khoanh số. Trạng thái cuối (mã đơn, vòng xe) ghi vào
 * `trang-thai.json` để kịch bản kế toán dùng tiếp.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureAnnotated } from './khoanh-vung.mjs';
import {
  BAN_GIAO,
  REPO_ROOT,
  makeSampleDocument,
  openBrowser,
  persona,
  readConfig,
  settle,
} from './phien.mjs';
import { toJpeg } from './xuat-anh.mjs';

const config = readConfig();
const OUT = process.env.DOCS_OUT_DIR ?? join(REPO_ROOT, 'tmp/docs-anh');
const ASSETS = join(BAN_GIAO, 'assets/tai-xe');
mkdirSync(OUT, { recursive: true });
mkdirSync(ASSETS, { recursive: true });

/** Toạ độ MẪU của hai địa điểm đã biết trong dữ liệu demo — không phải vị trí thật của ai. */
const PICKUP = { name: 'Nhà máy thép Đình Vũ', latitude: 20.8264, longitude: 106.7752 };
const DELIVERY = { name: 'Kho Nhựa Tân Phú Hưng', latitude: 21.617, longitude: 105.817 };
const DRIVER_LOGIN = process.env.DOCS_DRIVER ?? 'lx.thang';

function vehiclePlateOf(login) {
  const month = JSON.parse(
    readFileSync(join(REPO_ROOT, 'tenants/transport-preview/data/demo-month.json'), 'utf8'),
  );
  const driver = month.drivers.find((row) => row.login === login);
  const vehicle = month.vehicles.find((row) => row.ref === driver?.vehicle);
  if (!vehicle) throw new Error(`Tài xế ${login} không gắn xe nào trong dữ liệu mẫu.`);
  return { ...vehicle, driverName: driver.name };
}

const place = (p) => ({ latitude: p.latitude, longitude: p.longitude, accuracy: 15 });
const items = (body) => body.items ?? body;

const browser = await openBrowser();
const office = await persona(browser, config, 'giam-doc');
const driver = await persona(browser, config, DRIVER_LOGIN, { phone: true, place: place(PICKUP) });
const page = driver.page;

const already = await driver.call('GET', '/transport/me/field-work');
if (already.runs.length > 0) {
  throw new Error(`${DRIVER_LOGIN} đang có vòng xe mở — chọn tài xế khác bằng DOCS_DRIVER.`);
}

// ---- 1. Văn phòng: đơn có toạ độ → kế hoạch → giao xe -------------------------------------
/** Ngày nghiệp vụ theo giờ Việt Nam, không theo UTC. */
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const stamp = today.slice(2).replace(/-/g, '');
const code = `DH-${stamp}-${String(Date.now()).slice(-3)}`;
const customer = items(await office.call('GET', '/transport/customers')).find((row) =>
  row.name.includes('Thép Đông Á'),
);
const order = await office.call('POST', '/transport/orders', {
  code,
  originLabel: PICKUP.name,
  originPoint: { latitude: PICKUP.latitude, longitude: PICKUP.longitude },
  destinationLabel: DELIVERY.name,
  destinationPoint: { latitude: DELIVERY.latitude, longitude: DELIVERY.longitude },
  businessDate: today,
  customerId: customer.id,
  freightAmount: 6_800_000,
  cargoDescription: 'Thép cuộn 20 tấn',
});
const seedVehicle = vehiclePlateOf(DRIVER_LOGIN);
const plate = seedVehicle.plate;
const vehicle = items(await office.call('GET', '/transport/vehicles')).find(
  (row) => row.registrationPlate === plate,
);
await office.call('POST', `/transport/planning/orders/${order.id}/plan`, {
  vehicleId: vehicle.id,
  idempotencyKey: `docs-tai-xe-${code}`,
});
const work = await driver.call('GET', '/transport/me/field-work');
const run = work.runs[0];
const emptyLeg = run.legs.find((leg) => leg.kind === 'EMPTY');
const loadedLeg = run.legs.find((leg) => leg.kind === 'LOADED');
const moveLeg = (leg, to) =>
  office.call('POST', `/transport/runs/${run.runId}/legs/${leg.legId}/transition`, { to });

// ---- 2. Tài xế ------------------------------------------------------------------------------
const shots = [];
async function shot(name, marks) {
  await settle(page);
  const png = join(OUT, `tai-xe-${name}.png`);
  await captureAnnotated(page, png, marks);
  await toJpeg(png, join(ASSETS, `${name}.jpg`));
  shots.push(name);
}
const tab = (label) =>
  page
    .getByRole('link', { name: label })
    .or(page.getByRole('button', { name: label }))
    .first();
const card = page.getByTestId('field-current-leg');
const action = (label) => page.getByTestId('field-action').filter({ hasText: label });
async function tap(label) {
  await action(label).click();
  await page.waitForTimeout(1500);
  await settle(page);
}

await page.goto(`${config.web}/?surface=driver`, { waitUntil: 'networkidle', timeout: 180_000 });
const homeCard = page.locator('section', { hasText: 'Việc được điều từ văn phòng' }).first();
await shot('01-trang-chu', [
  { n: 1, target: homeCard.getByText(/Việc kế tiếp/) },
  { n: 2, target: page.getByRole('button', { name: /Mở Hiện trường/ }) },
  { n: 3, target: page.getByText('Số dư quỹ').locator('..') },
]);

await moveLeg(emptyLeg, 'IN_TRANSIT');
await tab('Hiện trường').click();
await shot('02-hien-truong', [
  { n: 1, target: card.locator('dl') },
  { n: 2, target: action('Đã tới điểm lấy hàng') },
  { n: 3, target: page.getByRole('region', { name: 'Chặng khác' }) },
]);

await tap('Đã tới điểm lấy hàng');
await shot('03-tai-diem-lay', [
  { n: 1, target: action('Đã vào cổng') },
  { n: 2, target: action('Đang xếp hàng') },
  { n: 3, target: action('Rời điểm lấy hàng') },
]);

const receiptFile = join(OUT, 'bien-nhan-mau.jpg');
await makeSampleDocument(browser, receiptFile, {
  title: 'BIÊN NHẬN GIAO HÀNG',
  lines: [
    `Đơn: ${code}`,
    'Hàng: Thép cuộn 20 tấn',
    'Người nhận: Kho Nhựa Tân Phú Hưng',
    'Ký nhận: (mẫu)',
  ],
});

await tap('Đang xếp hàng');
await moveLeg(emptyLeg, 'COMPLETED');
await moveLeg(loadedLeg, 'IN_TRANSIT');
await tap('Rời điểm lấy hàng');
await driver.context.setGeolocation(place(DELIVERY));
await shot('04-tren-duong', [
  { n: 1, target: card.getByTestId('field-phase') },
  { n: 2, target: action('Đã đến nơi') },
]);

// Máy chưa cho quyền vị trí: mốc KHÔNG được ghi, màn hình nói rõ phải làm gì.
await driver.context.clearPermissions();
await action('Đã đến nơi').click();
await page.waitForTimeout(2500);
await shot('05-chua-bat-vi-tri', [
  { n: 1, target: page.getByText(/quyền vị trí|bắt được vị trí|không đọc được vị trí/).first() },
]);
await driver.context.grantPermissions(['geolocation']);

await tap('Đã đến nơi');
await shot('06-da-den-noi', [
  { n: 1, target: action('Bắt đầu chờ') },
  { n: 2, target: action('Khách đã nhận hàng') },
]);

await tap('Bắt đầu chờ');
await shot('07-dang-cho', [{ n: 1, target: page.getByTestId('field-waiting') }]);

await tap('Khách đã nhận hàng');
await page.getByLabel('Tệp cho Chụp biên nhận giao hàng').setInputFiles(receiptFile);
await shot('08-chup-bien-nhan', [
  { n: 1, target: page.getByTestId('field-missing') },
  { n: 2, target: page.getByLabel('Tệp cho Chụp biên nhận giao hàng').locator('..') },
  { n: 3, target: action('Chụp biên nhận giao hàng') },
]);

await tap('Chụp biên nhận giao hàng');
await tap('Tôi đang giữ biên nhận');
await shot('09-da-gui-bien-nhan', [
  { n: 1, target: page.getByTestId('field-handover') },
  { n: 2, target: page.getByTestId('field-captured'), badge: 'bl' },
]);

// ---- Nhiên liệu: lái xe tự trả tiền mặt trên vòng xe đang mở ------------------------------
await tab('Nhiên liệu').click();
await settle(page);
const fuel = page.getByRole('region', { name: 'Ghi phiếu đổ nhiên liệu' });
const station = fuel.getByLabel('Cây xăng');
await station.selectOption((await station.locator('option').nth(1).getAttribute('value')) ?? '');
await fuel.getByLabel('Số lít').fill('60');
await fuel.getByLabel('Số tiền (đồng)').fill('1380000');
// Số km MẪU: cao hơn mọi mốc đồng hồ đã có của xe này trong dữ liệu mẫu.
await fuel.getByLabel('Số km trên đồng hồ').fill(String(seedVehicle.odoKm + 5000));
await fuel.getByLabel('Thanh toán').selectOption({ label: 'Lái xe trả tiền mặt' });
await shot('10-nhien-lieu', [
  { n: 1, target: fuel.getByText(/^Vòng xe RUN-/) },
  { n: 2, target: fuel.getByLabel('Thanh toán').locator('..') },
  { n: 3, target: fuel.getByRole('button', { name: 'Gửi phiếu' }) },
]);
await fuel.getByRole('button', { name: 'Gửi phiếu' }).click();
await page.waitForTimeout(2000);
await settle(page);
const sent = page.getByRole('region', { name: 'Phiếu đổ dầu của bạn' });
await sent.locator('li').first().scrollIntoViewIfNeeded();
await shot('11-phieu-da-gui', [{ n: 1, target: sent.locator('li').first() }]);

await tab('Chi phí').click();
await shot('12-chi-phi', [
  { n: 1, target: page.getByText('Bạn chưa có chuyến nào đang mở để ghi khoản chi.') },
]);

await tab('Quỹ').click();
await shot('13-quy', [
  { n: 1, target: page.getByRole('region', { name: 'Số dư quỹ' }) },
  { n: 2, target: page.getByRole('region', { name: 'Bút toán quỹ' }).locator('li').first() },
]);

await tab('Phiếu lương').click();
await shot('14-phieu-luong', [
  { n: 1, target: page.getByRole('region', { name: 'Bảng quyết toán của tôi' }) },
  { n: 2, target: page.locator('main li').first() },
]);

// ---- 3. Văn phòng hoàn tất chặng có hàng + xác nhận giao xong -------------------------------
await moveLeg(loadedLeg, 'COMPLETED');
await office.call('POST', `/transport/orders/${order.id}/transition`, { to: 'FULFILLED' });

writeFileSync(
  join(OUT, 'trang-thai.json'),
  JSON.stringify(
    {
      code,
      orderId: order.id,
      runId: run.runId,
      runCode: run.runCode,
      driver: DRIVER_LOGIN,
      driverName: seedVehicle.driverName,
      plate,
      shots,
    },
    null,
    2,
  ),
);
await browser.close();
process.stdout.write(`Đã chụp ${shots.length} ảnh tài xế cho đơn ${code} (vòng ${run.runCode}).\n`);
