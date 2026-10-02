/**
 * WEB WORKER CUA MAPLIBRE 6 — phuc vu nhu TEP TINH cung origin (#374).
 *
 * MapLibre 6 chi phat hanh ESM va nap worker tu MOT TEP RIENG luc chay. No tu doan duong dan tu
 * `import.meta.url` cua chinh no — nhung duoi webpack (Next.js) `import.meta.url` la mot duong dan
 * `file://`, nen MapLibre bo cuoc va goi `new Worker("")`: worker chet im lang, style van tai ve, va
 * KHONG mot o tile nao duoc xin. Do tren trinh duyet that 23/09/2026 voi OpenFreeMap: nen be trong
 * tron, co dong ghi nguon, khong duong sa nao. Nen cuc bo cua Lane N (khong nguon tile) khong bao gio
 * can worker, nen loi nay nam im tu truoc.
 *
 * Tai lieu cai dat cua MapLibre (muc Next.js) chi dung cach nay: sao `maplibre-gl-worker.mjs` VA
 * `maplibre-gl-shared.mjs` (worker import tuong doi toi no) vao `public/`, roi `setWorkerUrl`.
 * https://maplibre.org/maplibre-gl-js/docs/
 *
 * Sao tu `node_modules` o MOI lan Next.js nap cau hinh (`next.config.mjs`), khong qua `predev` /
 * `prebuild`: Playwright va `dev-transport.mjs` goi thang `next dev`, va pnpm mac dinh khong chay
 * script `pre*`. Ban sao nam trong `.gitignore` — luon cung phien ban voi MapLibre dang cai, khong
 * mot ban vendored nao troi lech sau lan nang cap.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Worker va module no import tuong doi — phai nam CANH nhau. */
export const MAPLIBRE_WORKER_FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

/** Thu muc con cua `public/` — trinh duyet thay no o `/maplibre/…`. */
export const MAPLIBRE_WORKER_PUBLIC_DIR = 'maplibre';

const here = dirname(fileURLToPath(import.meta.url));

export function maplibreDistDir() {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve('maplibre-gl/package.json')), 'dist');
}

const sameBytes = (a, b) => existsSync(b) && readFileSync(a).equals(readFileSync(b));

/**
 * Chi GHI khi ban sao thieu hoac khac. `next start` trong image da build cung nap cau hinh nay: o do
 * ban sao tu `next build` da dung, nen khong mot lan ghi nao — chay duoc ca tren he tep chi-doc.
 * Tra ve danh sach tep da ghi.
 */
export function copyMaplibreWorker(targetDir = join(here, 'public', MAPLIBRE_WORKER_PUBLIC_DIR)) {
  const dist = maplibreDistDir();
  const written = [];
  for (const file of MAPLIBRE_WORKER_FILES) {
    const source = join(dist, file);
    const target = join(targetDir, file);
    if (sameBytes(source, target)) continue;
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(source, target);
    written.push(file);
  }
  return written;
}
