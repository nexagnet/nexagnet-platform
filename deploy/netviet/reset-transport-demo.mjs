import process from 'node:process';
// Giai quyet qua apps/api, giong `seed-transport-demo.mjs`: cong cu trien khai nay nam NGOAI
// workspace pnpm, nen khong duoc dua vao mot lan hoist o goc.
import { PrismaClient } from '../../apps/api/node_modules/@prisma/client/default.js';
import { argon2id, hash } from '../../apps/api/node_modules/argon2/argon2.cjs';
import { DemoTenantGuardError } from '../../apps/api/dist/transport/demo/demo-guard.js';
import { backfillDemoPlaceMarkers } from '../../apps/api/dist/transport/demo/demo-places.js';
import {
  resetTransportDemoData,
  seedTransportDemoMonth,
} from '../../apps/api/dist/transport/demo/demo-seed.js';

/**
 * DUA BAN DEMO VE TRANG THAI DAU — xoa sach du lieu van tai roi gieo lai thang van hanh mau.
 *
 * ---------------------------------------------------------------------------
 * VI SAO CAN MOT LENH, KHONG PHAI MOT DOAN HUONG DAN.
 *
 * `seedTransportDemoMonth()` BO QUA trong im lang khi DB da co chuyen — dung, vi Postgres la nguon
 * su that va khong lan deploy nao duoc phep de len du lieu dang chay. He qua: sau mot buoi demo
 * (hoac mot dot nghiem thu) ban mau khong tu quay ve duoc, va cach duy nhat truoc day la SQL tay.
 *
 * Kich ban demo cua T10 hua mot duong "lam lai tu dau". Mot loi hua ma nguoi van hanh khong go
 * duoc thanh lenh thi khong phai mot loi hua.
 *
 * ---------------------------------------------------------------------------
 * BA CONG, khong cai nao o trong tep nay.
 *
 * 1. `assertTransportDemoTenant` — goi khach phai khai `readiness.demoTenant`. Khong goi khach
 *    THAT nao khai co (khoa boi `transport-tenant-allowlist.spec.ts`), nen lenh nay khong the
 *    chay nham tren stack cua Ultty/Amico/Wata.
 * 2. `TRANSPORT_DEMO_RESET=xoa-va-gieo-lai` — mot cau go tay, khong phai mot co `--force`.
 * 3. `DemoTenantGuardError` la mot LOAI loi rieng: bat theo loai thi mot loi THAT (mat ket noi DB,
 *    schema lech) khong bao gio bi doc nham thanh "a, khach nay khong phai goi mau" roi bi nuot.
 *
 * ---------------------------------------------------------------------------
 * CACH CHAY tren VM (trong thu muc stack cua ban demo):
 *
 *   source ./stack-compose.sh
 *   netviet_load_stack_composition
 *   COMPOSE=(sudo docker compose --env-file .runtime/secrets.env "${NETVIET_COMPOSE_FILES[@]}")
 *   "${COMPOSE[@]}" --profile tools run --rm --no-deps \
 *     -e TENANT_DIR=/srv/tenant \
 *     -e TRANSPORT_DEMO_RESET=xoa-va-gieo-lai \
 *     bootstrap node deploy/netviet/reset-transport-demo.mjs
 *
 * PHAI la `bootstrap`, KHONG phai `api` — va cho nay da lam hong mot lan chay that.
 *
 * `TRANSPORT_DEMO_DRIVER_PASSWORD` chi duoc gan cho service `bootstrap` trong `compose.yaml`, co y
 * de gia tri khong bao gio xuat hien trong bang tien trinh cua VM. Chay qua `api exec` thi bien do
 * VANG, va hau qua khong phai mot loi: lenh chay xong, in ra day du so lieu da gieo, va lang le bo
 * lai mot ban demo KHONG AI DANG NHAP DUOC o be mat lai xe lan ke toan. Dong log
 * `Khong tao tai khoan dang nhap cho lai xe` la thu duy nhat noi ra dieu do — de doc luot qua.
 *
 * `--profile tools` la thu duy nhat lam service `bootstrap` ton tai; `--no-deps` giu no khong keo
 * theo Flowise; `TENANT_DIR=/srv/tenant` la cho goi khach duoc gan vao, giong het lenh gieo trong
 * `deploy-stack.sh`.
 */

/** Tom tat DAY DU: nguoi van hanh vua go lenh reset bang tay, nen in ca cac diem "da gieo". */
async function backfillPlaceMarkersWithoutBlocking(client) {
  try {
    const places = await backfillDemoPlaceMarkers(client);
    const created = Object.entries(places.created)
      .map(([key, count]) => `${key}=${count}`)
      .join(' ');
    const skipped = places.skipped.map((entry) => `${entry.label}=${entry.reason}`).join(', ');
    process.stdout.write(
      `Diem dia diem mau: tao ${created}; bo qua ${skipped.length > 0 ? skipped : 'khong'}\n`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `Khong gieo duoc diem dia diem mau (bo qua, du lieu van tai da gieo lai xong): ${reason}`,
    );
  }
}

const prisma = new PrismaClient();
try {
  const hashPassword = (plain) => hash(plain, { type: argon2id });

  const deleted = await resetTransportDemoData(prisma);
  const removed = Object.entries(deleted)
    .map(([table, count]) => `${table}=${count}`)
    .join(' ');
  process.stdout.write(`Da xoa du lieu van tai: ${removed.length > 0 ? removed : 'khong co gi'}\n`);

  const result = await seedTransportDemoMonth(prisma, { hashPassword });
  if (result.skipped) {
    // Khong the xay ra sau mot lan xoa thanh cong — neu xay ra thi mot buoc nao do da khong xoa
    // het, va bao "da lam lai" luc do la mot cau noi doi. Thoat khac 0 de nguoi van hanh thay.
    process.stderr.write('Gieo lai bi BO QUA du vua xoa xong — du lieu van tai chua sach.\n');
    process.exitCode = 1;
  } else {
    const summary = Object.entries(result.counts)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    process.stdout.write(`Da gieo lai thang van hanh mau (moc ${result.anchor}): ${summary}\n`);
    if (result.driverLoginNote !== null) process.stdout.write(`${result.driverLoginNote}\n`);
    // Diem dia diem mau (#379): hang rao/phap nhan/dia diem SONG SOT lenh xoa o tren, nen lan nay
    // thuong khong tao gi. Hong thi GHI LOI va di tiep: du lieu van tai da gieo lai xong, va diem
    // mau chi la tien ich trinh dien — mot lan reset thanh cong khong duoc thanh ma thoat do vi no.
    await backfillPlaceMarkersWithoutBlocking(prisma);
  }
} catch (error) {
  if (error instanceof DemoTenantGuardError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  } else {
    throw error;
  }
} finally {
  await prisma.$disconnect();
}
