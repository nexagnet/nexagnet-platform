import process from 'node:process';
// This deploy tool lives outside a pnpm workspace package. Resolve through apps/api, which owns
// both dependencies, instead of relying on a forbidden root-hoist that differs by pnpm layout.
import { PrismaClient } from '../../apps/api/node_modules/@prisma/client/default.js';
import { argon2id, hash } from '../../apps/api/node_modules/argon2/argon2.cjs';
import { DemoTenantGuardError } from '../../apps/api/dist/transport/demo/demo-guard.js';
import { backfillDemoPlaceMarkers } from '../../apps/api/dist/transport/demo/demo-places.js';
import {
  backfillDemoPersonaLoginsReport,
  seedTransportDemoMonth,
} from '../../apps/api/dist/transport/demo/demo-seed.js';

/**
 * GIEO THANG VAN HANH MAU cho goi khach dang chay (T8/#90).
 *
 * ---------------------------------------------------------------------------
 * BUOC NAY CHAY CHO MOI STACK, VA DO LA LY DO NO PHAI IM LANG VOI KHACH THAT.
 *
 * `deploy-stack.sh` khong biet stack no dang dung la goi mau hay goi khach — no chay cung mot day
 * lenh cho ultty, amico, wata va transport-preview. Nen mot goi khach that di qua day PHAI ra ve
 * voi ma thoat 0: bien mot lan deploy cua khach thanh do vi mot buoc chi phuc vu ban demo la doi
 * cai gia cua tinh nang nay sang nguoi khong dung no.
 *
 * `DemoTenantGuardError` la duong ra do — mot LOAI loi rieng chu khong phai mot chuoi thong bao.
 * Bat theo loai thi khong con kha nang mot loi THAT (goi khach hong, DB khong ket noi duoc) bi doc
 * nham thanh "a, khach nay khong phai goi mau" roi bi nuot mat.
 *
 * ---------------------------------------------------------------------------
 * MAT KHAU LAI XE KHONG NAM TRONG KHO MA NGUON.
 *
 * Thieu `TRANSPORT_DEMO_DRIVER_PASSWORD` thi VAN gieo — chi khong tao tai khoan dang nhap, va noi
 * ro dieu do ra log. Du lieu van tai day du van co gia tri de xem; rieng be mat lai xe thi chua ai
 * dang nhap duoc. Mot mat khau mac dinh nhung san trong tep nay se la mot thong tin dang nhap
 * duoc cong bo cong khai tren mot stack co that.
 *
 * ---------------------------------------------------------------------------
 * DIEM DIA DIEM MAU (#379) CHAY O CA HAI NHANH — VA KHONG BAO GIO CHAN API KHOI DONG.
 *
 * Bai xe + dia diem cua phap nhan (hang rao, phap nhan, dia diem) KHONG bi lenh reset xoa, va
 * stack xem truoc da co ca thang du lieu tu truoc #379 — nen nhanh "bo qua" cung phai tao bu. Moi
 * diem gieo toi da mot lan (xem `demo-places.ts`): lan chay thu hai khong tao gi.
 *
 * Railway chay tep nay o MOI lan khoi dong, noi voi lenh chay api bang `&&`. Diem mau chi la tien
 * ich cho buoi trinh dien; mot lan gieo diem hong (DB cham, xung dot lap lai) ma lam ca api khong
 * len la doi mot tien ich lay ca stack. Nen buoc nay GHI LOI ra stderr roi di tiep voi ma thoat 0 —
 * khac han buoc gieo thang van hanh o tren, noi mot loi that van phai lam do lan deploy.
 */

/** Chi in khi co gi dang noi: vua tao, hoac bo qua vi mot ly do KHAC "da gieo tu truoc". */
function reportPlaceMarkers(result) {
  const created = Object.entries(result.created).filter(([, count]) => count > 0);
  if (created.length > 0) {
    const summary = created.map(([key, count]) => `${key}=${count}`).join(' ');
    process.stdout.write(`Da tao bu diem dia diem mau: ${summary}\n`);
  }
  for (const entry of result.skipped) {
    if (entry.reason === 'MARKER_ALREADY_SEEDED') continue;
    process.stdout.write(`Bo qua diem dia diem mau "${entry.label}": ${entry.reason}\n`);
  }
}

async function backfillPlaceMarkersWithoutBlocking(client) {
  try {
    reportPlaceMarkers(await backfillDemoPlaceMarkers(client));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `Khong gieo duoc diem dia diem mau (bo qua, api van khoi dong; thu lai o lan khoi dong sau): ${reason}`,
    );
  }
}

const prisma = new PrismaClient();
try {
  const hashPassword = (plain) => hash(plain, { type: argon2id });
  const result = await seedTransportDemoMonth(prisma, { hashPassword });

  if (result.skipped) {
    process.stdout.write(
      `Da co ${result.counts.transportTrip} chuyen trong DB — Postgres la nguon su that, khong gieo lai.\n`,
    );
    // "Gieo truoc, cau hinh mat khau sau" phai la mot trinh tu chay duoc: khong co buoc nay thi
    // mot lan gieo som (chua co bien mat khau) se khoa be mat lai xe lai vinh vien.
    const logins = await backfillDemoPersonaLoginsReport(prisma, { hashPassword });
    if (logins.created > 0) {
      process.stdout.write(`Da tao bu ${logins.created} tai khoan dang nhap cho nhan vat mau.\n`);
    }
    // #395: lai xe mau KHONG duoc noi lai (Giam doc da go noi; tai khoan cung ten doi vai, bi khoa
    // hoac da noi ho so khac) — noi ro ra log de nguoi truc biet vi sao lai xe do chua dang nhap.
    for (const entry of logins.skipped) {
      process.stdout.write(
        `Khong noi tai khoan "${entry.login}" vao lai xe mau: ${entry.reason}\n`,
      );
    }
  } else {
    const summary = Object.entries(result.counts)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    process.stdout.write(`Da gieo thang van hanh mau (moc ${result.anchor}): ${summary}\n`);
    if (result.driverLoginNote !== null) process.stdout.write(`${result.driverLoginNote}\n`);
  }
  await backfillPlaceMarkersWithoutBlocking(prisma);
} catch (error) {
  if (error instanceof DemoTenantGuardError) {
    process.stdout.write('Goi khach nay khong phai goi mau — bo qua buoc gieo du lieu van tai.\n');
  } else {
    throw error;
  }
} finally {
  await prisma.$disconnect();
}
