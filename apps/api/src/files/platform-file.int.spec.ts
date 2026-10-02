import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../config/prisma.service.js';
import { isUniqueViolationOn, describeStorageError } from '../config/storage-conflict.js';
import { buildPlatformFileKey } from './file-policy.js';
import { PLATFORM_FILE_ACTIVE_LINK } from './file-storage-conflict.js';
import { PrismaFileRepository } from './prisma-file.repository.js';
import type { CreateFileInput } from './file.repository.js';

/**
 * NEN TANG TEP tren POSTGRES THAT — `#287` P12 (*"Use real Postgres for DB constraints/concurrency
 * where relevant"*).
 *
 * ============================================================================================
 * CAI BO NAY DO, va vi sao khong bo nao khac do duoc
 * ============================================================================================
 *
 * Ban trong bo nho chung minh duoc LUAT. No khong chung minh duoc:
 *
 *   · nam `CHECK` va ba `TRIGGER` co that su chan — `prisma migrate dev` khong biet gi ve chung, va
 *     mot bo bai kiem hanh vi se van xanh sau khi chung bi xoa;
 *   · hai lan rut den CUNG LUC co ket thuc o mot su that duy nhat (`#287` P12 bai 16);
 *   · lan rut + go lien ket co that su la MOT giao dich.
 *
 * Chay bang `RUN_PRISMA_IT=1`.
 */

/**
 * TIEN TO fixture — KHONG LONG NHAU voi tien to cua bo nao khac.
 *
 * Buoc don dung `startsWith`, nen mot tien to la tien to cua mot tien to khac se lam hai bo xoa
 * fixture cua nhau khi CI chay chung song song.
 */
const CREATED_BY = 'it-platform-file-actor';
const OWNER_TYPE = 'IT_PLATFORM_FILE_OWNER';

/**
 * KHOA TU VAN quanh khoi TAT/BAT trigger — cung ly le voi cac bo IT khac cua kho nay.
 *
 * Trigger la mot doi tuong CHUNG cua ca co so du lieu, va CI chay cac tep IT SONG SONG. Mot bo bat
 * lai trigger dung luc bo kia dang xoa se lam lan xoa do chet vi chinh cai trigger vua duoc bat —
 * mot flake lam nguoi ta chay lai thay vi doc.
 */
const PLATFORM_FILE_TRIGGER_LOCK = 287_001;

const guarded: readonly [string, string][] = [
  ['PlatformFileLink', 'platform_file_link_append_only'],
  ['PlatformFile', 'platform_file_immutable'],
];

const AT = new Date('2026-09-18T04:00:00.000Z');

const newFile = (overrides: Partial<CreateFileInput> = {}): CreateFileInput => {
  const id = randomUUID();
  return {
    id,
    purpose: 'OPERATIONAL_DOCUMENT',
    originalFilename: 'bien-nhan.jpg',
    safeFilename: 'bien-nhan.jpg',
    declaredMimeType: 'image/jpeg',
    detectedMimeType: 'image/jpeg',
    byteSize: 128,
    sha256: 'a'.repeat(64),
    storageProvider: 'LOCAL',
    storageKey: buildPlatformFileKey(id, 'image/jpeg', AT, 'OPERATIONAL_DOCUMENT'),
    createdBy: CREATED_BY,
    retainUntil: null,
    captureMetadata: null,
    ...overrides,
  };
};

describe.runIf(process.env.RUN_PRISMA_IT === '1')('nen tang tep tren Postgres that', () => {
  const prisma = new PrismaService();
  const files = new PrismaFileRepository(prisma);

  /**
   * DON SAU, va don bang cach TAT TRIGGER.
   *
   * `platform_file_immutable` chan ca lenh `DELETE` — do chinh la bat bien lane nay dua vao, nen
   * buoc don PHAI di vong qua no mot cach tuong minh. Neu mot ngay nao do khoi nay khong con can
   * thiet, thi do la dau hieu trigger da bi go.
   */
  const cleanup = async (): Promise<void> => {
    // Khoa tu van MUC GIAO DICH, moi lenh trong CUNG mot giao dich (cung ly do voi
    // `waiting-delivery-accepted.int.spec.ts`): khoa muc phien qua pool Prisma co the nha tren
    // mot ket noi khac ("you don't own a lock"), ro lai va chan buoc don cua moi tep dung chung so.
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${PLATFORM_FILE_TRIGGER_LOCK})`);
        for (const [table, trigger] of guarded) {
          await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);
        }
        await tx.platformFileLink.deleteMany({ where: { businessOwnerType: OWNER_TYPE } });
        await tx.platformFileLink.deleteMany({ where: { createdBy: CREATED_BY } });
        await tx.platformFile.deleteMany({ where: { createdBy: CREATED_BY } });
        for (const [table, trigger] of guarded) {
          await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${trigger}"`);
        }
      },
      { maxWait: 10_000, timeout: 45_000 },
    );
  };

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  }, 60_000);

  /* ---------------------------------------------------------------- *
   * RANG BUOC — nhung thu `prisma migrate dev` khong biet, nen de mat
   * ---------------------------------------------------------------- */
  it('PF-IT-01 — khoa luu tru tro ra ngoai khu cua nen tang bi CSDL tu choi', async () => {
    await expect(
      files.create(newFile({ storageKey: 'media/2026/08/anh-cua-khach.webp' })),
    ).rejects.toThrow(/PlatformFile_storageKey_scope/);

    await expect(
      files.create(newFile({ storageKey: 'media/platform-file/2026/../secret.jpg' })),
    ).rejects.toThrow(/PlatformFile_storageKey_scope/);
  });

  it('PF-IT-02 — bam sai dang bi tu choi', async () => {
    await expect(files.create(newFile({ sha256: 'khong-phai-bam' }))).rejects.toThrow(
      /PlatformFile_sha256_hex/,
    );
    await expect(files.create(newFile({ sha256: 'A'.repeat(64) }))).rejects.toThrow(
      /PlatformFile_sha256_hex/,
    );
  });

  it('PF-IT-03 — tep rong bi tu choi o tang luu tru', async () => {
    await expect(files.create(newFile({ byteSize: 0 }))).rejects.toThrow(
      /PlatformFile_byteSize_positive/,
    );
  });

  /**
   * `#287` P3 bat bien 1: mot ho so bang chung xoa duoc thi khong con la bang chung cho bat cu dieu
   * gi. Bai nay di THANG qua Prisma, khong qua kho — vi chinh cho do la cho mot lenh xoa se duoc
   * viet neu no duoc phep.
   */
  it('PF-IT-04 — mot tep da ghi khong xoa duoc, ke ca bang mot lenh truc tiep', async () => {
    const created = await files.create(newFile());

    await expect(prisma.platformFile.delete({ where: { id: created.id } })).rejects.toThrow(
      /platform_file_immutable/,
    );
    expect(await files.findById(created.id)).not.toBeNull();
  });

  /**
   * `storageKey` sua duoc nghia la mot hang da rut co the tro sang byte cua tep khac — tuc vong doi
   * bi di vong ma khong lenh xoa nao duoc goi. `sha256` sua duoc nghia la phep doi chieu toan ven
   * luon dung, tuc vo dung.
   */
  it('PF-IT-05 — danh tinh cua mot tep da ghi khong doi duoc', async () => {
    const created = await files.create(newFile());

    for (const patch of [
      { storageKey: buildPlatformFileKey(randomUUID(), 'image/jpeg', AT, 'OPERATIONAL_DOCUMENT') },
      { sha256: 'b'.repeat(64) },
      { byteSize: 999 },
      { createdBy: 'nguoi-khac' },
    ]) {
      await expect(
        prisma.platformFile.update({ where: { id: created.id }, data: patch }),
      ).rejects.toThrow(/platform_file_immutable/);
    }
  });

  /**
   * `#287` P3 bat bien 7 + P12 bai 12, o TANG CSDL: mot lenh giu theo phap ly ma mot dong `psql` di
   * qua duoc thi no khong phai mot lenh giu.
   */
  it('PF-IT-06 — lenh giu phap ly chan don byte ngay o CSDL', async () => {
    const created = await files.create(newFile());
    await files.activate(created.id, 'NOT_SCANNED', AT);
    await files.withdraw(created.id, CREATED_BY, AT);
    await files.setLegalHold(created.id, true);

    await expect(
      prisma.platformFile.update({
        where: { id: created.id },
        data: { state: 'PURGED', purgedAt: new Date() },
      }),
    ).rejects.toThrow(/platform_file_purge_guard/);

    await files.setLegalHold(created.id, false);
    expect(await files.markPurged(created.id, new Date())).toMatchObject({ state: 'PURGED' });
  });

  it('PF-IT-07 — chua toi han luu tru thi CSDL chan don byte', async () => {
    const created = await files.create(newFile({ retainUntil: new Date(Date.now() + 86_400_000) }));
    await files.activate(created.id, 'NOT_SCANNED', AT);
    await files.withdraw(created.id, CREATED_BY, AT);

    await expect(files.markPurged(created.id, new Date())).rejects.toThrow(
      /platform_file_purge_guard/,
    );
  });

  /* ---------------------------------------------------------------- *
   * LIEN KET — `#287` P2/P11
   * ---------------------------------------------------------------- */
  it('PF-IT-08 — MOT lien ket dang hieu luc cho mot bo (unique MOT PHAN)', async () => {
    const created = await files.create(newFile());
    await files.activate(created.id, 'NOT_SCANNED', AT);
    const link = {
      fileId: created.id,
      businessOwnerType: OWNER_TYPE,
      businessOwnerId: 'DOC-IT-1',
      purpose: 'OPERATIONAL_DOCUMENT',
      createdBy: CREATED_BY,
    };

    await files.createLink(link);

    // Prisma KHONG bao ten index ra ngoai — no doi nguoc ten constraint thanh TEN TRUONG. Doi chieu
    // qua `isUniqueViolationOn` thay vi so chuoi trong thong diep; xem `config/storage-conflict.ts`.
    let conflict: unknown;
    try {
      await files.createLink(link);
    } catch (error) {
      conflict = error;
    }
    expect(
      isUniqueViolationOn(conflict, PLATFORM_FILE_ACTIVE_LINK),
      describeStorageError(conflict),
    ).toBe(true);

    // Go ra roi gan lai thi DUOC: unique la MOT PHAN, chi ap cho lien ket dang hieu luc.
    await files.withdraw(created.id, CREATED_BY, AT);
    expect(await files.createLink(link)).toMatchObject({ businessOwnerId: 'DOC-IT-1' });
  });

  /**
   * Neu `businessOwnerId` sua duoc thi mot to bien nhan cua don A se thoa man duoc don B — dung lo
   * hong ma `#279` O13 bai 8 va `#287` P11 deu ton tai de chan.
   */
  it('PF-IT-09 — mot lien ket da ghi khong tro sang doi tuong khac duoc, va khong xoa duoc', async () => {
    const created = await files.create(newFile());
    await files.activate(created.id, 'NOT_SCANNED', AT);
    const link = await files.createLink({
      fileId: created.id,
      businessOwnerType: OWNER_TYPE,
      businessOwnerId: 'DOC-IT-2',
      purpose: 'OPERATIONAL_DOCUMENT',
      createdBy: CREATED_BY,
    });

    await expect(
      prisma.platformFileLink.update({
        where: { id: link.id },
        data: { businessOwnerId: 'DOC-IT-KHAC' },
      }),
    ).rejects.toThrow(/platform_file_link_append_only/);

    await expect(prisma.platformFileLink.delete({ where: { id: link.id } })).rejects.toThrow(
      /platform_file_link_append_only/,
    );
  });

  /* ---------------------------------------------------------------- *
   * DONG THOI — `#287` P12 bai 16
   * ---------------------------------------------------------------- */
  /**
   * HAI LAN RUT DEN CUNG LUC: dung MOT lan thang.
   *
   * `updateMany` voi bo loc tren `state` sinh ra DUNG MOT lenh `UPDATE ... WHERE`, nen CSDL la
   * trong tai. Mot duong doc-roi-ghi se de ca hai lan ghi di qua, va ten nguoi rut that su bi ghi
   * de — mot mat mat KHONG mot bai kiem tuan tu nao nhin thay.
   */
  it('PF-IT-10 — hai lan rut dong thoi: dung mot lan thang', async () => {
    const created = await files.create(newFile());
    await files.activate(created.id, 'NOT_SCANNED', AT);

    const outcomes = await Promise.all([
      files.withdraw(created.id, 'nguoi-thu-nhat', new Date()),
      files.withdraw(created.id, 'nguoi-thu-hai', new Date()),
    ]);

    const winners = outcomes.filter((outcome) => outcome !== null);
    expect(winners).toHaveLength(1);

    const stored = await files.findById(created.id);
    expect(stored?.state).toBe('WITHDRAWN');
    expect(stored?.withdrawnBy).toBe(winners[0]?.withdrawnBy);
  });

  /** Cung ly le cho lan kich hoat: hai lan den cung luc, mot lan thang. */
  it('PF-IT-11 — hai lan kich hoat dong thoi: dung mot lan thang', async () => {
    const created = await files.create(newFile());

    const outcomes = await Promise.all([
      files.activate(created.id, 'CLEAN', new Date()),
      files.activate(created.id, 'NOT_SCANNED', new Date()),
    ]);

    expect(outcomes.filter((outcome) => outcome !== null)).toHaveLength(1);
    expect((await files.findById(created.id))?.state).toBe('ACTIVE');
  });

  /**
   * `#287` P3 bat bien 2: rut tep va go lien ket la MOT don vi cong viec.
   *
   * Neu chung la hai lan goi, se co mot cua so ma tep da rut nhung lien ket van hieu luc — va dung
   * cua so do, mot lan doc di qua cong nghiep vu se thay mot bang chung hop le.
   */
  it('PF-IT-12 — rut tep va go lien ket nam trong MOT giao dich', async () => {
    const created = await files.create(newFile());
    await files.activate(created.id, 'NOT_SCANNED', AT);
    await files.createLink({
      fileId: created.id,
      businessOwnerType: OWNER_TYPE,
      businessOwnerId: 'DOC-IT-3',
      purpose: 'OPERATIONAL_DOCUMENT',
      createdBy: CREATED_BY,
    });

    await files.withdraw(created.id, CREATED_BY, new Date());

    expect(await files.activeLinksOf(created.id)).toHaveLength(0);
    // LICH SU O LAI, mang gio va ten nguoi go.
    const kept = await files.linksOf(created.id);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ state: 'WITHDRAWN', withdrawnBy: CREATED_BY });
  });

  /**
   * MOT LAN RUT KHONG THANH CONG KHONG DUOC CHAM VAO LIEN KET.
   *
   * Do la nua con lai cua bat bien 2, va la nua de mat: neu lan `UPDATE` thu nhat khong khop hang
   * nao ma lenh thu hai van chay, thi mot tep DA RUT TU TRUOC se bi go them mot lan — ghi de ten
   * nguoi go that su.
   */
  it('PF-IT-13 — lan rut thu hai khong cham vao lien ket', async () => {
    const created = await files.create(newFile());
    await files.activate(created.id, 'NOT_SCANNED', AT);
    await files.createLink({
      fileId: created.id,
      businessOwnerType: OWNER_TYPE,
      businessOwnerId: 'DOC-IT-4',
      purpose: 'OPERATIONAL_DOCUMENT',
      createdBy: CREATED_BY,
    });
    await files.withdraw(created.id, 'nguoi-go-that-su', new Date());

    expect(await files.withdraw(created.id, 'nguoi-den-sau', new Date())).toBeNull();

    const kept = await files.linksOf(created.id);
    expect(kept[0]?.withdrawnBy).toBe('nguoi-go-that-su');
  });
});
