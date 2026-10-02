import { copyMaplibreWorker } from './maplibre-worker.mjs';

// Worker cua MapLibre 6 phai co mat trong `public/maplibre/` TRUOC khi trang ban do chay — ke ca
// khi `next dev` duoc goi thang (Playwright, `dev-transport.mjs`). Xem `maplibre-worker.mjs`.
copyMaplibreWorker();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /*
   * Nen ban do mac dinh goi `tiles.openfreemap.org` tu MOI trang ban do (#374), trong khi dia chi
   * trang co the mang ma vong chay (`?selected=RUN-…`). Chinh sach nay giu `Referer` gui ra ngoai
   * chi la ORIGIN — khai tuong minh thay vi dua vao mac dinh cua tung trinh duyet. Cung gia tri edge
   * Caddy da dat cho cac stack tren VM (`deploy/netviet/edge/Caddyfile`).
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }],
      },
    ];
  },
};

export default nextConfig;
