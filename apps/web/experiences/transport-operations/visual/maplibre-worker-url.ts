/**
 * Duong dan worker MapLibre 6 tren CHINH may chu web (#374).
 *
 * `apps/web/maplibre-worker.mjs` sao hai tep worker vao `public/maplibre/` luc Next.js nap cau hinh;
 * `MapLibreBasemap` dua duong dan nay cho `setWorkerUrl` truoc khi dung ban do dau tien. Thieu
 * no, MapLibre duoi webpack goi `new Worker("")` va khong bao gio xin mot o tile nao.
 *
 * Cung origin: CSP `worker-src 'self'` du, va khong mot yeu cau nao ra ngoai cho worker.
 */
export const MAPLIBRE_WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';
