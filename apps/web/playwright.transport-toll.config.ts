import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

/**
 * BE MAT ETC — mot cau hinh RIENG, vi no doi mot DO SAN SANG khac voi ban xem truoc cua chu.
 *
 * Lane W dua `transport-toll` vao `readiness.blockedCapabilities` cua `tenants/transport-preview`:
 * dot UAT dau tien cua chu so huu CO Y khong co ETC, nen muc dieu huong bi an. Do la mot quyet
 * dinh NGHIEP VU, khong phai mot loi.
 *
 * Hau qua ky thuat: bo E2E cua ETC khong con mo duoc man hinh no phai chung minh. Hai duong SAI
 * de sua dieu do — bat lai ETC trong ban xem truoc, hoac bo/lam yeu cac bai — deu doi mot trong
 * hai thu dang duoc bao ve: pham vi UAT cua chu, hoac bang chung cua tinh nang.
 *
 * Duong dung la tach HAI CAU HOI ra hai may chu:
 *   - `playwright.transport.config.ts` chay tren GOI THAT `tenants/transport-preview` va vi the
 *     van do dung be mat ma chu sap nghiem thu — ke ca viec ETC bi an;
 *   - cau hinh NAY chay tren mot goi khach kiem thu KHAI RO rang ETC duoc bat va khong bi chan,
 *     nen bo ETC tiep tuc chung minh tinh nang doc lap voi pham vi san sang cua ban xem truoc.
 *
 * `first-uat-etc-readiness.contract.spec.ts` khoa ca hai dau lai: goi that PHAI con chan ETC, va
 * goi fixture PHAI bat ETC voi danh sach chan rong. Mot ben troi ra thi vitest do trong vai giay,
 * khong phai mot may chu Playwright do sau muoi hai phut.
 *
 * Cong 3012 de khong dung vao 3010 (b2b), 3011 (van tai), 3002 (`dev-transport.mjs`) hay 3000
 * (`dev`). Ba cau hinh chay TUAN TU trong `test:e2e` — hai `next dev` cung thu muc ghi de len
 * nhau o `.next`, dung nhu ghi chu o `playwright.config.ts`.
 */
const TOLL_TENANT_DIR = resolve(__dirname, 'e2e/fixtures/tenant-transport-toll');

export default defineConfig({
  testDir: './e2e/transport-toll',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3012',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm exec next dev -p 3012',
    url: 'http://127.0.0.1:3012/',
    reuseExistingServer: false,
    timeout: 120_000,
    // `NEXT_PUBLIC_API_URL=''` lam moi loi goi API thanh duong TUONG DOI, nen `page.route` chan duoc.
    env: {
      ...process.env,
      TENANT_DIR: TOLL_TENANT_DIR,
      NEXT_PUBLIC_API_URL: '',
      // Nen ban do mac dinh cua san pham (OpenFreeMap) goi Internet; CI bat buoc thi khong (#374).
      NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER: 'local',
    },
  },
});
