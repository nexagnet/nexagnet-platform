/**
 * Kịch bản chụp ảnh HƯỚNG DẪN KẾ TOÁN trên bản CỤC BỘ — chạy SAU `chup-tai-xe.mjs`.
 *
 *   DOCS_DEMO_PASSWORD=… node docs/khach-hang/van-tai-viet/ban-giao/cong-cu-anh/chup-ke-toan.mjs
 *
 * Đọc `trang-thai.json` (đơn mà kịch bản tài xế vừa giao xong, phiếu dầu tài xế tự trả tiền mặt)
 * rồi làm tiếp phần việc kế toán trên đúng màn hình kế toán dùng: kết thúc đơn → đối soát với
 * khách → ghi tiền về → gắn tiền vào nợ → xác thực phiếu dầu → phân bổ giá thành dầu.
 * `DOCS_FROM=<số bước>` chạy tiếp từ một bước (các bước trước đã ghi dữ liệu rồi).
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureAnnotated } from './khoanh-vung.mjs';
import { BAN_GIAO, REPO_ROOT, openBrowser, persona, readConfig, settle } from './phien.mjs';
import { toJpeg } from './xuat-anh.mjs';

const config = readConfig();
const OUT = process.env.DOCS_OUT_DIR ?? join(REPO_ROOT, 'tmp/docs-anh');
const ASSETS = join(BAN_GIAO, 'assets/ke-toan');
const FROM = Number(process.env.DOCS_FROM ?? '1');
mkdirSync(ASSETS, { recursive: true });
const state = JSON.parse(readFileSync(join(OUT, 'trang-thai.json'), 'utf8'));

const browser = await openBrowser();
const acc = await persona(browser, config, 'ke-toan');
const page = acc.page;

async function shot(name, marks) {
  await settle(page);
  const png = join(OUT, `ke-toan-${name}.png`);
  await captureAnnotated(page, png, marks);
  await toJpeg(png, join(ASSETS, `${name}.jpg`));
}
async function open(label) {
  await page.getByRole('link', { name: label, exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'networkidle' });
  await settle(page);
}
/** Đưa một khối vào giữa khung nhìn để ảnh thấy cả tiêu đề lẫn nút. */
const center = (locator) => locator.evaluate((node) => node.scrollIntoView({ block: 'center' }));
const optionValue = async (select, pattern) => {
  const options = await select
    .locator('option')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({ value: node.value, text: node.textContent ?? '' })),
    );
  const hit = options.find((option) => option.value !== '' && pattern.test(option.text));
  if (!hit)
    throw new Error(
      `Không có lựa chọn nào khớp ${pattern}: ${options.map((o) => o.text).join(' | ')}`,
    );
  return hit.value;
};
const confirmDialog = () => page.getByRole('dialog');

const steps = [
  async function ketThucDon() {
    await open('Kết thúc đơn');
    await page.getByRole('button', { name: 'Chờ kết thúc', exact: true }).click();
    await settle(page);
    const row = page.getByRole('row', { name: new RegExp(state.code) });
    await shot('01-ket-thuc-don', [
      { n: 1, target: page.getByRole('button', { name: 'Chờ kết thúc', exact: true }) },
      { n: 2, target: row },
    ]);
  },
  async function ketThucDonXacNhan() {
    await open('Kết thúc đơn');
    await page.getByRole('button', { name: 'Chờ kết thúc', exact: true }).click();
    await settle(page);
    const row = page.getByRole('row', { name: new RegExp(state.code) });
    await row.getByRole('button', { name: 'Đã kết thúc', exact: true }).click();
    await page.waitForTimeout(800);
    const note = confirmDialog().getByRole('textbox');
    await note.fill('Đã nhận ảnh biên nhận giao hàng có chữ ký kho nhận; số lượng khớp đơn.');
    await shot('02-ket-thuc-don-xac-nhan', [
      { n: 1, target: note },
      { n: 2, target: confirmDialog().getByRole('button', { name: 'Đã kết thúc', exact: true }) },
    ]);
    await confirmDialog().getByRole('button', { name: 'Đã kết thúc', exact: true }).click();
    await page.waitForTimeout(1500);
  },
  async function phaiThuChoDoiSoat() {
    await open('Phải thu khách hàng');
    const work = page.getByRole('region', { name: 'Đối soát và công nợ khách hàng' });
    await work.scrollIntoViewIfNeeded();
    await page
      .getByRole('list', { name: 'Đường đi của một đồng tiền khách hàng' })
      .scrollIntoViewIfNeeded();
    await shot('03-phai-thu-cho-doi-soat', [
      { n: 1, target: page.getByRole('list', { name: 'Đường đi của một đồng tiền khách hàng' }) },
      { n: 2, target: work.getByRole('table').first() },
      { n: 3, target: page.getByRole('button', { name: /^Chốt một đơn/ }) },
    ]);
  },
  async function chotMotDon() {
    await open('Phải thu khách hàng');
    await page.getByRole('button', { name: /^Chốt một đơn/ }).click();
    const form = page.getByRole('form', { name: 'Xác nhận đối soát trực tiếp' });
    const order = form.getByLabel('Đơn chờ đối soát');
    await order.selectOption(await optionValue(order, new RegExp(state.code)));
    await form.getByLabel('Số tiền xác nhận').fill('6800000');
    await form.getByLabel('Tham chiếu xác nhận').fill('Biên bản đối soát tháng 9 (mẫu)');
    await center(form);
    await shot('04-chot-mot-don', [
      { n: 1, target: order.locator('..') },
      { n: 2, target: form.getByLabel('Số tiền xác nhận').locator('..') },
      { n: 3, target: form.getByRole('button', { name: 'Xác nhận đối soát' }) },
    ]);
    await form.getByRole('button', { name: 'Xác nhận đối soát' }).click();
    await page.waitForTimeout(1500);
    await settle(page);
  },
  async function nhapTienVe() {
    await open('Phải thu khách hàng');
    await page.getByRole('button', { name: /^Nhập tiền về/ }).click();
    const form = page.getByRole('form', { name: 'Ghi nhận thanh toán hoặc trả trước' });
    const customer = form.getByLabel('Khách hàng');
    await customer.selectOption(await optionValue(customer, /Thép Đông Á/));
    await form.getByLabel('Số tiền').fill('6800000');
    await form
      .getByLabel('Thời điểm nhận')
      .fill(
        `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())}T09:30`,
      );
    await form.getByLabel('Tham chiếu ngân hàng').fill('UNC mẫu 0924');
    await center(form);
    await shot('05-nhap-tien-ve', [
      { n: 1, target: customer.locator('..') },
      { n: 2, target: form.getByLabel('Số tiền').locator('..') },
      { n: 3, target: form.getByRole('button').last() },
    ]);
    await form.getByRole('button').last().click();
    await page.waitForTimeout(1500);
    await settle(page);
  },
  async function ganTienVaoNo() {
    await open('Phải thu khách hàng');
    await page.getByRole('button', { name: /^Gắn tiền vào nợ/ }).click();
    const form = page.getByRole('form', { name: 'Phân bổ thanh toán' });
    const paid = form.getByLabel('Khoản tiền đã nhận');
    await paid.selectOption(await optionValue(paid, /UNC mẫu 0924|6\.800\.000/));
    const due = form.getByLabel('Khoản phải thu');
    await due.selectOption(await optionValue(due, new RegExp(state.code)));
    await form.getByLabel('Số tiền phân bổ').fill('6800000');
    await center(form);
    await shot('06-gan-tien-vao-no', [
      { n: 1, target: paid.locator('..') },
      { n: 2, target: due.locator('..') },
      { n: 3, target: form.getByRole('button').last() },
    ]);
    await form.getByRole('button').last().click();
    await page.waitForTimeout(1500);
    await settle(page);
  },
  async function phaiTra() {
    await open('Phải trả đối tác & cây xăng');
    await shot('07-phai-tra', [
      { n: 1, target: page.getByRole('heading', { name: /^Cây xăng/ }) },
      { n: 2, target: page.getByRole('heading', { name: /^Nhà xe/ }) },
      { n: 3, target: page.getByRole('heading', { name: /^Hoa hồng nguồn đơn/ }) },
    ]);
  },
  async function xacThucPhieuDau() {
    await open('Nhiên liệu');
    const inbox = page.getByRole('region', { name: 'Phiếu nhiên liệu' });
    await inbox.getByLabel('Mã vòng xe').fill(state.runCode);
    await inbox.getByLabel('Mã vòng xe').press('Enter');
    await page.waitForTimeout(1500);
    await settle(page);
    await inbox
      .getByRole('row', { name: new RegExp(state.runCode) })
      .first()
      .click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Xác thực', exact: true }).first().click();
    await page.waitForTimeout(800);
    await shot('08-xac-thuc-phieu-dau', [
      { n: 1, target: confirmDialog().getByText(/quỹ lái xe/) },
      { n: 2, target: confirmDialog().getByRole('button', { name: 'Xác thực', exact: true }) },
    ]);
    await confirmDialog().getByRole('button', { name: 'Xác thực', exact: true }).click();
    await page.waitForTimeout(1500);
    await settle(page);
  },
  async function giaThanhDau() {
    const panel = page.getByRole('region', { name: 'Giá thành nhiên liệu' });
    await panel.getByRole('button', { name: 'Giá thành nhiên liệu' }).click();
    await page.waitForTimeout(1200);
    const target = panel.getByLabel('Công việc nhận giá thành');
    await target.selectOption(await optionValue(target, new RegExp(state.runCode)));
    await panel.scrollIntoViewIfNeeded();
    await shot('09-phan-bo-gia-thanh-dau', [
      { n: 1, target: target.locator('..') },
      { n: 2, target: panel.getByRole('button', { name: 'Phân bổ', exact: true }) },
    ]);
    await panel.getByRole('button', { name: 'Phân bổ', exact: true }).click();
    await page.waitForTimeout(1500);
  },
  async function quyLaiXe() {
    await open('Quỹ lái xe');
    const who = page.getByRole('combobox', { name: 'Lái xe' });
    await who.selectOption(await optionValue(who, new RegExp(state.driverName)));
    await page.waitForTimeout(1500);
    await settle(page);
    await shot('11-quy-lai-xe', [
      { n: 1, target: page.getByText('Số dư quỹ', { exact: true }).locator('..') },
      { n: 2, target: page.getByRole('row', { name: /Chi phí vòng xe/ }).first() },
    ]);
  },
  async function hieuQua() {
    // Bảng này rộng hơn 1440px: mở rộng khung nhìn cho riêng ảnh này để thấy cột Ghi chú.
    await page.setViewportSize({ width: 1680, height: 900 });
    await open('Hiệu quả từng chuyến');
    await page.getByRole('button', { name: /^Đơn theo vòng xe/ }).click();
    await settle(page);
    await center(page.getByRole('row', { name: new RegExp(state.code) }));
    await shot('12-hieu-qua-tung-don', [
      { n: 1, target: page.getByRole('row', { name: new RegExp(state.code) }) },
      { n: 2, target: page.getByRole('row', { name: /Chưa ghi chi phí/ }).first() },
    ]);
  },
  async function doiSoatBangKe() {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open('Nhiên liệu');
    const periods = page.getByRole('table', { name: /kỳ đối soát/i });
    await periods.getByRole('row').nth(1).click();
    await page.waitForTimeout(1500);
    await settle(page);
    const title = /^Đối soát \d/;
    const detail = page
      .locator('section', { has: page.getByRole('heading', { name: title }) })
      .last();
    await detail
      .getByRole('heading', { name: title })
      .evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await shot('10-doi-soat-bang-ke', [
      { n: 1, target: detail.getByText(/Đóng kỳ chỉ được khi/) },
      { n: 2, target: detail.getByText('Chênh lệch chờ xử lý').locator('..') },
      { n: 3, target: detail.getByRole('row', { name: /Xử lý/ }).first() },
      { n: 4, target: detail.getByRole('button', { name: 'Chạy so khớp' }) },
    ]);
  },
];

for (const [index, step] of steps.entries()) {
  if (index + 1 < FROM) continue;
  process.stdout.write(`Bước ${index + 1}: ${step.name}\n`);
  if (index + 1 === FROM || index === 0) {
    await page.goto(`${config.web}/`, { waitUntil: 'networkidle', timeout: 180_000 });
  }
  try {
    await step();
  } catch (error) {
    await page.screenshot({ path: join(OUT, `loi-buoc-${index + 1}.png`), fullPage: true });
    throw error;
  }
}
await browser.close();
process.stdout.write('Xong ảnh kế toán.\n');
