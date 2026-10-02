/* global document */
/**
 * PHIÊN cho kịch bản chụp ảnh tài liệu: trình duyệt, đăng nhập theo vai, gọi máy chủ bằng chính
 * phiên của người dùng đó.
 *
 * CHỈ CHẠY TRÊN MÁY CỤC BỘ. Kịch bản tạo đơn, bấm mốc, xác thực phiếu… tức là GHI dữ liệu. Chạy nó
 * trên bản demo dùng chung sẽ để lại đơn thử trong dữ liệu của mọi người, nên `readConfig()` từ
 * chối mọi địa chỉ không phải `localhost` / `127.0.0.1`.
 */
import { createRequire } from 'node:module';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../../../../..');
export const BAN_GIAO = resolve(HERE, '..');

/** Playwright nằm trong `apps/web` — dùng lại đúng bản đó, không cài thêm gì. */
const requireFromWeb = createRequire(join(REPO_ROOT, 'apps/web/package.json'));
const { chromium } = requireFromWeb('@playwright/test');

export const DESKTOP = { width: 1440, height: 900 };
export const PHONE = { width: 390, height: 844 };

const isLocal = (url) => ['localhost', '127.0.0.1'].includes(new URL(url).hostname);

export function readConfig() {
  const web = process.env.DOCS_WEB_URL ?? 'http://localhost:3422';
  const api = process.env.DOCS_API_URL ?? 'http://localhost:3421';
  if (!isLocal(web) || !isLocal(api)) {
    throw new Error('Kịch bản này GHI dữ liệu — chỉ chạy trên máy cục bộ (localhost).');
  }
  const password = process.env.DOCS_DEMO_PASSWORD;
  if (!password)
    throw new Error('Thiếu DOCS_DEMO_PASSWORD — mật khẩu nhân vật mẫu của bản cục bộ.');
  return { web, api, password };
}

export async function openBrowser() {
  return chromium.launch({ args: ['--lang=vi-VN'] });
}

/**
 * Một ngữ cảnh trình duyệt = một người dùng. Đăng nhập qua máy chủ (không gõ vào màn hình), rồi
 * trả về `call()` dùng chính cookie + mã chống giả mạo của phiên đó — máy chủ vẫn kiểm quyền và luật
 * nghiệp vụ như mọi lần.
 */
export async function persona(browser, config, username, { phone = false, place = null } = {}) {
  const context = await browser.newContext({
    viewport: phone ? PHONE : DESKTOP,
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    ...(place === null ? {} : { geolocation: place, permissions: ['geolocation'] }),
  });
  const headers = { origin: config.web, 'content-type': 'application/json' };
  const csrf = await (await context.request.get(`${config.api}/auth/csrf`, { headers })).json();
  const login = await context.request.post(`${config.api}/auth/login`, {
    headers: { ...headers, 'x-csrf-token': csrf.csrfToken },
    data: { username, password: config.password },
  });
  if (!login.ok()) throw new Error(`Không đăng nhập được "${username}": ${login.status()}`);
  const token = (await login.json()).csrfToken;

  const call = async (method, path, data) => {
    const res = await context.request.fetch(`${config.api}${path}`, {
      method,
      headers: { ...headers, 'x-csrf-token': token },
      data,
    });
    const text = await res.text();
    if (!res.ok()) throw new Error(`${method} ${path} -> ${res.status()}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  const page = await context.newPage();
  return { context, page, call, username };
}

/** Đợi trang yên: không còn chữ "Đang tải…/Đang đọc…", và gỡ chấm chỉ báo của Next ở chế độ dev. */
export async function settle(page, { timeout = 30_000 } = {}) {
  await page.waitForLoadState('networkidle', { timeout }).catch(() => undefined);
  await page
    .waitForFunction(() => !/Đang (tải|đọc)[^\n]*…/.test(document.body.innerText), null, {
      timeout,
    })
    .catch(() => undefined);
  await page.evaluate(() => document.querySelector('nextjs-portal')?.remove());
}

/**
 * Một tấm ảnh CHỨNG TỪ MẪU để tải lên (JPEG), vẽ bằng chính trình duyệt — không cần tệp mẫu nào
 * trong kho mã nguồn, và trên ảnh ghi rõ đây là giấy tờ mẫu.
 */
export async function makeSampleDocument(browser, path, { title, lines }) {
  const page = await browser.newPage({ viewport: { width: 640, height: 820 } });
  try {
    await page.setContent('<main></main>');
    await page.evaluate(
      ({ heading, rows }) => {
        document.body.style.cssText =
          'margin:0;background:#f4efe6;font-family:Arial,Helvetica,sans-serif;color:#222';
        const main = document.querySelector('main');
        main.style.cssText =
          'margin:40px;padding:36px;background:#fffdf8;border:2px solid #b9ad97;min-height:660px';
        const h = document.createElement('h1');
        h.textContent = heading;
        h.style.cssText = 'font-size:30px;margin:0 0 8px';
        const stamp = document.createElement('p');
        stamp.textContent = 'GIẤY TỜ MẪU — KHÔNG CÓ GIÁ TRỊ';
        stamp.style.cssText = 'color:#b42318;font-weight:700;margin:0 0 28px';
        main.append(h, stamp);
        for (const row of rows) {
          const p = document.createElement('p');
          p.textContent = row;
          p.style.cssText = 'font-size:20px;margin:14px 0;border-bottom:1px dashed #cfc6b4';
          main.append(p);
        }
      },
      { heading: title, rows: lines },
    );
    await page.screenshot({ path, type: 'jpeg', quality: 80 });
  } finally {
    await page.close();
  }
}
