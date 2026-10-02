import type { AppendAuditLogCommand, AuditLogService } from './audit-log.service.js';

/**
 * DAU VET TRONG CUNG GIAO DICH voi thay doi (`#395`).
 *
 * Ghi thay doi roi moi `append` dau vet la HAI giao dich: mot cu chet o giua (pool Prisma het ket
 * noi, SIGTERM luc deploy) de lai mot thay doi DA CO HIEU LUC — vd mot quyen nhay cam da cap — ma
 * khong co dong nao noi ai lam. Te hon, lan thu lai thay "da co" nen khong bao gio ghi dong
 * `auth.user.access.escalate` nua.
 *
 * Nen kho nhan mot `TransactionTrail`: kho Prisma goi no BEN TRONG giao dich, voi CHINH ban
 * truoc/sau doc duoi khoa va client giao dich. Ham ghi dau vet qua `AuditLogService.within(client)`
 * — tuc qua CHINH kho kiem toan cua ung dung, tren giao dich do; hong thi thay doi lui theo. Kho bo
 * nho khong co giao dich: no khong goi ham, va `traceWrite` ghi dau vet ngay sau.
 */
export type TransactionTrail<C> = (change: C, client: unknown) => Promise<void>;

/**
 * Chay MOT lan ghi voi dau vet cua no. `entries` dung cac dong tu thay doi (mang rong = khong co
 * gi de ghi, vd khoa lap lai). `changeOf` rut thay doi tu ket qua cho duong SAU commit (`null` =
 * lan ghi khong doi gi / bi chan).
 */
export async function traceWrite<R, C>(
  audit: AuditLogService,
  write: (trail: TransactionTrail<C>) => Promise<R>,
  changeOf: (result: R) => C | null,
  entries: (change: C) => readonly AppendAuditLogCommand[],
): Promise<R> {
  let traced = false;
  const result = await write(async (change, client) => {
    const scoped = audit.within(client);
    // Kho kiem toan khong nhap duoc vao giao dich nay (vd kho bo nho canh kho Prisma trong mot bai
    // tich hop): ghi sau commit, nhu truoc.
    if (!scoped) return;
    for (const command of entries(change)) await scoped.append(command);
    traced = true;
  });
  if (traced) return result;
  const change = changeOf(result);
  for (const command of change === null ? [] : entries(change)) await audit.append(command);
  return result;
}
