/* global document, window */
/**
 * KHOANH VÙNG + ĐÁNH SỐ lên ảnh chụp màn hình THẬT — chỉ phục vụ tài liệu bàn giao.
 *
 * Không vẽ tay, không sửa ảnh bằng phần mềm đồ hoạ: vị trí từng khung lấy từ CHÍNH phần tử trên
 * trang (`locator.boundingBox()`), rồi một lớp SVG trong suốt được đặt đè lên trang trước khi chụp.
 * Chạy lại là ra đúng ảnh cũ nếu giao diện không đổi; giao diện đổi thì khung chạy theo phần tử.
 *
 * Không đụng tới mã sản phẩm: lớp vẽ chỉ tồn tại trong trình duyệt của lần chụp.
 */

/** Cùng màu cam với ảnh của tài liệu lãnh đạo; viền trắng để nổi trên cả nền sáng lẫn nền tối. */
const STROKE = '#e0662b';
const HALO = '#ffffff';
const FILL = 'rgba(224, 102, 43, 0.06)';
const BADGE_RADIUS = 14;

/**
 * Tìm khung bao của từng dấu. Mỗi dấu là `{ n, target, pad?, badge? }`:
 *   - `n`      số in trong vòng tròn (1, 2, 3…);
 *   - `target` một Playwright `Locator` (lấy phần tử ĐẦU TIÊN khớp);
 *   - `pad`    khoảng hở quanh phần tử, mặc định 6px;
 *   - `badge`  vị trí vòng số: `tl` (mặc định), `tr`, `bl`, `br`, `l`, `r`.
 *
 * Phần tử không hiện trên màn hình là LỖI, không phải một dấu bị bỏ qua: một ảnh thiếu số 3 mà
 * bảng chú thích vẫn nói về số 3 là một hướng dẫn sai.
 */
export async function resolveMarks(marks) {
  const resolved = [];
  for (const mark of marks) {
    const box = await mark.target.first().boundingBox();
    if (box === null) {
      throw new Error(`Dấu số ${mark.n}: phần tử không hiện trên màn hình.`);
    }
    const pad = mark.pad ?? 6;
    resolved.push({
      n: mark.n,
      x: box.x - pad,
      y: box.y - pad,
      width: box.width + pad * 2,
      height: box.height + pad * 2,
      badge: mark.badge ?? 'tl',
    });
  }
  return resolved;
}

/** Vẽ lớp khoanh vùng lên trang. Gọi lại lần nữa sẽ thay lớp cũ. */
export async function drawMarks(page, resolved) {
  await page.evaluate(
    ({ items, style }) => {
      const NS = 'http://www.w3.org/2000/svg';
      document.getElementById('docs-annotation-layer')?.remove();

      const width = window.innerWidth;
      const height = window.innerHeight;
      const svg = document.createElementNS(NS, 'svg');
      svg.id = 'docs-annotation-layer';
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      Object.assign(svg.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        zIndex: '2147483647',
        pointerEvents: 'none',
      });

      const add = (name, attrs) => {
        const node = document.createElementNS(NS, name);
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
        svg.appendChild(node);
        return node;
      };

      const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
      const r = style.radius;

      for (const item of items) {
        const x = clamp(item.x, 2, width - 4);
        const y = clamp(item.y, 2, height - 4);
        const w = Math.min(item.width, width - x - 2);
        const h = Math.min(item.height, height - y - 2);
        const frame = { x, y, width: w, height: h, rx: 9, ry: 9 };
        add('rect', { ...frame, fill: style.fill, stroke: style.halo, 'stroke-width': 6 });
        add('rect', { ...frame, fill: 'none', stroke: style.stroke, 'stroke-width': 3 });

        // Vòng số đặt LỆCH RA NGOÀI góc khung, để ít đè lên chữ bên trong phần tử nhất.
        const out = r * 0.45;
        const anchors = {
          tl: [x - out, y - out],
          tr: [x + w + out, y - out],
          bl: [x - out, y + h + out],
          br: [x + w + out, y + h + out],
          l: [x - r - 4, y + h / 2],
          r: [x + w + r + 4, y + h / 2],
        };
        const [ax, ay] = anchors[item.badge] ?? anchors.tl;
        const cx = clamp(ax, r + 3, width - r - 3);
        const cy = clamp(ay, r + 3, height - r - 3);
        add('circle', { cx, cy, r: r + 2.5, fill: style.halo });
        add('circle', { cx, cy, r, fill: style.stroke });
        const label = add('text', {
          x: cx,
          y: cy + 0.5,
          fill: '#ffffff',
          'font-family': 'Segoe UI, Arial, Helvetica, sans-serif',
          'font-size': r + 2,
          'font-weight': 700,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        });
        label.textContent = String(item.n);
      }
      document.body.appendChild(svg);
    },
    {
      items: resolved,
      style: { stroke: STROKE, halo: HALO, fill: FILL, radius: BADGE_RADIUS },
    },
  );
}

/** Gỡ lớp khoanh vùng — để ảnh kế tiếp trên cùng trang không mang dấu của ảnh trước. */
export async function clearMarks(page) {
  await page.evaluate(() => document.getElementById('docs-annotation-layer')?.remove());
}

/** Chụp MỘT ảnh đã khoanh vùng (khung nhìn hiện tại). Trả về các khung đã vẽ. */
export async function captureAnnotated(page, path, marks) {
  const resolved = await resolveMarks(marks);
  await drawMarks(page, resolved);
  await page.screenshot({ path, animations: 'disabled', caret: 'hide' });
  await clearMarks(page);
  return resolved;
}
