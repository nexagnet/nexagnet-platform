import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

/**
 * Be mat VAN HANH VAN TAI — mot cau hinh rieng, va do la HE QUA cua rang buoc mot-khach-mot-may-chu
 * da ghi o `playwright.config.ts`.
 *
 * Mot khach chi khai duoc MOT experience (`PG-01`), nen khong the vua boot `b2b-sales-operations`
 * vua boot `transport-operations` tren cung mot may chu. Va hai `next dev` trong cung thu muc du an
 * ghi de len nhau o `.next`. Nen: hai cau hinh, hai cong, chay TUAN TU — `test:e2e` noi hai lenh
 * bang `&&`, khong bao gio chay chung cung luc.
 *
 * Cong 3011 de khong dung vao 3010 (b2b), 3002 (`dev-transport.mjs`) hay 3000 (`dev`).
 */
/**
 * Chay tren GOI KHACH THAT, khong phai mot fixture.
 *
 * Truoc day day tro vao `e2e/fixtures/tenant-transport` vi khong co goi khach nao bat nghiep vu
 * van tai (khoang cach `G-07`). #180 dua `tenants/transport-preview` vao repo, nen bo E2E chay
 * thang tren chinh goi se duoc trien khai — mot goi hong se lam do E2E, thay vi do luc boot tren
 * may chu.
 */
const TRANSPORT_TENANT_DIR = resolve(__dirname, '../../tenants/transport-preview');

/**
 * NEN BAN DO CUA BO E2E — CUC BO, tru khi nguoi chay CO Y chon khac (#374).
 *
 * Nen mac dinh cua san pham la OpenFreeMap (goi Internet). CI bat buoc khong duoc phu thuoc mang
 * ngoai, nen may chu e2e khai tuong minh `local`. Chay tay khoi `@openfreemap-basemap` hay
 * `@google-basemap` thi dat bien nay truoc lenh (xem `docs/phat-trien/van-hanh/ban-do-nen.md` §5).
 * Chuoi rong cung la `local` — mot bien rong khong duoc lang le mo duong ra Internet.
 */
const MAP_PROVIDER = process.env.NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER?.trim() || 'local';

export default defineConfig({
  testDir: './e2e/transport',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3011',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm exec next dev -p 3011',
    url: 'http://127.0.0.1:3011/',
    reuseExistingServer: false,
    timeout: 120_000,
    // `NEXT_PUBLIC_API_URL=''` lam moi loi goi API thanh duong TUONG DOI, nen `page.route` chan duoc.
    env: {
      ...process.env,
      TENANT_DIR: TRANSPORT_TENANT_DIR,
      NEXT_PUBLIC_API_URL: '',
      NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER: MAP_PROVIDER,
    },
  },
});
