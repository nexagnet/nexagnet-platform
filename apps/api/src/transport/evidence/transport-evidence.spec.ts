import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import type { CapabilityId } from '@netviet/tenant';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { LocalMediaStore } from '../../media/local-media.store.js';
import type { MediaObject } from '../../media/media-store.js';
import { NoopMediaStore } from '../../media/noop-media.store.js';
import { presetIncludes } from '../transport-actions.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_EVIDENCE_KEY_PREFIX } from './evidence-policy.js';
import { TransportEvidenceService } from './transport-evidence.service.js';

/**
 * `#169` — bien gioi media cua bang chung van tai.
 *
 * Byte trong bo test la SYNTHETIC, sinh tai cho: khong mot tep bang chung that nao di vao Git
 * (acceptance 10). Mot "anh" o day la vai byte co header dung — du de chung minh duong di, va khong
 * mang mot manh du lieu khach nao.
 */

/** Header PNG that + vai byte — du de phan biet voi mot Buffer rong. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const MAX = 15_000_000;

describe('TransportEvidenceService', () => {
  let root: string;
  let store: LocalMediaStore;
  let service: TransportEvidenceService;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'transport-evidence-'));
    store = new LocalMediaStore(root);
    service = new TransportEvidenceService(store, MAX, undefined, () => new Date('2026-09-04Z'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('acceptance 1: tai len mot anh hop le -> dinh vi DUC nam trong khu van tai', async () => {
    const stored = await service.put({ bytes: PNG, contentType: 'image/png' });

    expect(stored.locator.startsWith(TRANSPORT_EVIDENCE_KEY_PREFIX)).toBe(true);
    expect(stored.contentType).toBe('image/png');
    expect(stored.byteSize).toBe(PNG.byteLength);
  });

  /**
   * "Duc": nguoi goi khong dat ten khoa va khong hoc duoc gi ve cau truc kho. Dac biet, TEN TEP gui
   * len khong xuat hien o dau ca.
   */
  it('dinh vi KHONG mang ten tep nguoi dung gui len', async () => {
    const stored = await service.put({ bytes: PNG, contentType: 'image/png' });
    expect(stored.locator).not.toContain('hoa-don');
    expect(stored.locator.endsWith('.png')).toBe(true);
  });

  it('hai lan tai len cho hai dinh vi khac nhau — khong lan de nhau', async () => {
    const a = await service.put({ bytes: PNG, contentType: 'image/png' });
    const b = await service.put({ bytes: PNG, contentType: 'image/png' });
    expect(a.locator).not.toBe(b.locator);
  });

  it('acceptance 3: doc lai bang mot THE HIEN MOI van ra dung byte', async () => {
    const stored = await service.put({ bytes: PNG, contentType: 'image/png' });

    // "Tai lai trang / phien moi": mot service moi, mot kho moi tro cung thu muc.
    const fresh = new TransportEvidenceService(new LocalMediaStore(root), MAX);
    const result = await fresh.read(stored.locator);

    expect(result.kind).toBe('FOUND');
    expect((result as { object: MediaObject }).object.body.equals(PNG)).toBe(true);
    expect((result as { object: MediaObject }).object.contentType).toBe('image/png');
  });

  it('acceptance 8: tep sai loai / rong / qua lon bi tu choi CO MA RIENG', async () => {
    await expect(service.put({ bytes: PNG, contentType: 'image/svg+xml' })).rejects.toMatchObject({
      reason: 'EVIDENCE_CONTENT_TYPE_NOT_ALLOWED',
    });

    await expect(
      service.put({ bytes: Buffer.alloc(0), contentType: 'image/png' }),
    ).rejects.toMatchObject({ reason: 'EVIDENCE_EMPTY' });

    const tiny = new TransportEvidenceService(store, 4);
    await expect(tiny.put({ bytes: PNG, contentType: 'image/png' })).rejects.toMatchObject({
      reason: 'EVIDENCE_TOO_LARGE',
    });
  });

  /**
   * DOC TUY Y bi chan o tang service, khong chi o controller: `locator` la mot cot chuoi tu do va
   * da nhan gia tri tu truoc khi co duong tai len nay.
   */
  it('tu choi dinh vi tro ra ngoai khu bang chung van tai', async () => {
    for (const bad of [
      'media/2026/08/anh-tin-nhan-cua-khach.webp',
      `${TRANSPORT_EVIDENCE_KEY_PREFIX}../../.env`,
      '/etc/passwd',
    ]) {
      await expect(service.read(bad), bad).rejects.toMatchObject({
        reason: 'EVIDENCE_LOCATOR_OUT_OF_SCOPE',
      });
    }
  });

  /**
   * acceptance 9 — co dong trong Postgres nhung khong con object trong kho.
   *
   * Mot trang thai NGHIEP VU doc duoc, KHONG phai mot ngoai le cua SDK luu tru do ra ngoai.
   */
  it('acceptance 9: object bien mat -> trang thai MISSING, khong phai loi ha tang', async () => {
    const result = await service.read(`${TRANSPORT_EVIDENCE_KEY_PREFIX}2026/09/khong-co-that.png`);
    expect(result).toEqual({ kind: 'MISSING' });
  });

  /**
   * FAIL-CLOSED khi kho dang tat.
   *
   * `NoopMediaStore.put()` khong nem gi ca. Neu cu chay tiep thi nguoi dung thay "tai len xong", mot
   * dong bang chung duoc ghi vao Postgres, va anh KHONG TON TAI o dau — lo ra dung luc ke toan mo
   * no ra de doi chieu, co the la vai tuan sau.
   */
  it('kho tat (MEDIA_STORE=none) thi TU CHOI, khong nhan roi vut', async () => {
    const disabled = new TransportEvidenceService(new NoopMediaStore(), MAX);

    await expect(disabled.put({ bytes: PNG, contentType: 'image/png' })).rejects.toMatchObject({
      reason: 'EVIDENCE_STORE_DISABLED',
    });
  });

  it('kho tat thi DOC ra trang thai MISSING, khong sap', async () => {
    const disabled = new TransportEvidenceService(new NoopMediaStore(), MAX);
    const result = await disabled.read(`${TRANSPORT_EVIDENCE_KEY_PREFIX}2026/09/x.png`);
    expect(result).toEqual({ kind: 'MISSING' });
  });

  it('service KHONG biet ai dang goi — quyen thuoc ve chung tu nghiep vu', () => {
    // Mot cai nhin vao chinh chu ky: neu ai do them `authUserId` vao day, bai nay do — vi luc do se
    // co HAI phep kiem quyen trong he thong, va chung se lech nhau.
    expect(TransportEvidenceService.prototype.put.toString()).not.toContain('authUser');
    expect(TransportEvidenceService.prototype.read.toString()).not.toContain('authUser');
  });
});

/**
 * acceptance 2/5 — QUYEN SO HUU o tang controller, va THU TU cua no.
 *
 * Phep thu that o day khong phai "co nem loi khong", ma la "co GHI khong". Neu phep kiem quyen so
 * huu chay SAU lenh ghi, bai se van thay mot loi nem ra — nhung mot object da nam trong bucket va
 * mot hang bang chung da gan vao phieu cua dong nghiep.
 */
describe('#169 — DriverFuelEvidenceController giu quyen so huu TRUOC khi ghi', () => {
  function harness(ownedSlipIds: readonly string[]) {
    const order: string[] = [];
    const read = {
      getMyFuelSlip: (_authUserId: string, id: string) => {
        order.push(`own:${id}`);
        if (!ownedSlipIds.includes(id)) {
          return Promise.reject(
            TransportDomainError.denied('SELF_FUEL_SCOPE_NOT_OWNED', 'phieu cua nguoi khac'),
          );
        }
        return Promise.resolve({ id, evidenceCount: 1 });
      },
      myFuelSlipEvidence: (_authUserId: string, id: string, evidenceId: string) => {
        order.push(`row:${id}/${evidenceId}`);
        if (!ownedSlipIds.includes(id)) {
          return Promise.reject(
            TransportDomainError.denied('SELF_FUEL_SCOPE_NOT_OWNED', 'phieu cua nguoi khac'),
          );
        }
        return Promise.resolve({
          id: evidenceId,
          locator: `${TRANSPORT_EVIDENCE_KEY_PREFIX}x.png`,
        });
      },
    };
    const evidence = {
      put: () => {
        order.push('store');
        return Promise.resolve({
          locator: `${TRANSPORT_EVIDENCE_KEY_PREFIX}2026/09/new.png`,
          contentType: 'image/png',
          byteSize: PNG.byteLength,
        });
      },
      read: () => {
        order.push('fetch');
        return Promise.resolve({
          kind: 'FOUND' as const,
          object: { body: PNG, contentType: 'image/png' },
        });
      },
    };
    const fuel = {
      attachEvidence: (id: string) => {
        order.push(`attach:${id}`);
        return Promise.resolve({ id: 'ev-1' });
      },
    };
    return { order, read, evidence, fuel };
  }

  const controllerOf = async (h: ReturnType<typeof harness>) => {
    const { DriverFuelEvidenceController } = await import('./driver-fuel-evidence.controller.js');
    return new DriverFuelEvidenceController(
      h.evidence as never,
      h.fuel as never,
      h.read as never,
    ) as unknown as {
      upload(request: unknown, id: string, file: unknown): Promise<unknown>;
      serve(request: unknown, id: string, evidenceId: string, response: unknown): Promise<void>;
    };
  };

  const session = { authUser: { id: 'user-lai-xe-a', role: 'SALE' } };
  const file = { buffer: PNG, mimetype: 'image/png', size: PNG.byteLength, originalname: 'x.png' };

  it('acceptance 2: anh cua chinh minh -> kiem quyen, luu, gan, roi doc lai', async () => {
    const h = harness(['phieu-cua-toi']);
    await (await controllerOf(h)).upload(session, 'phieu-cua-toi', file);

    expect(h.order).toEqual([
      'own:phieu-cua-toi',
      'store',
      'attach:phieu-cua-toi',
      'own:phieu-cua-toi',
    ]);
  });

  it('acceptance 5: phieu cua nguoi khac bi chan TRUOC khi mot byte nao duoc ghi', async () => {
    const h = harness(['phieu-cua-toi']);
    await expect(
      (await controllerOf(h)).upload(session, 'phieu-cua-dong-nghiep', file),
    ).rejects.toThrow();

    expect(h.order).toEqual(['own:phieu-cua-dong-nghiep']);
    expect(h.order).not.toContain('store');
    expect(h.order.some((step) => step.startsWith('attach:'))).toBe(false);
  });

  it('acceptance 5: XEM anh cua nguoi khac cung bi chan truoc khi cham kho', async () => {
    const h = harness(['phieu-cua-toi']);
    const response = { setHeader: () => {}, end: () => {} };

    await expect(
      (await controllerOf(h)).serve(session, 'phieu-cua-dong-nghiep', 'ev-1', response),
    ).rejects.toThrow();

    expect(h.order).toEqual(['row:phieu-cua-dong-nghiep/ev-1']);
    expect(h.order).not.toContain('fetch');
  });

  it('thieu tep multipart la 400 CO CAU CHU, khong phai mot loi runtime', async () => {
    const h = harness(['phieu-cua-toi']);
    const controller = await controllerOf(h);

    // `uploadedBytes()` nem NGAY o bien gioi, truoc ca phep kiem quyen so huu — nen khong lan goi
    // nao xuong toi kho.
    expect(() => controller.upload(session, 'phieu-cua-toi', undefined)).toThrow(
      BadRequestException,
    );
    expect(h.order).toEqual([]);
  });
});

/**
 * acceptance 5/7 — pham vi quyen.
 *
 * Bang chung KHONG co ma hanh dong rieng: no thua ke cong cua chung tu ma no gan vao. Bai nay khoa
 * lai dieu do o muc bang phan quyen; phep kiem quyen so huu tung dong nam o `FuelReadService`
 * (`SELF_FUEL_SCOPE_NOT_OWNED`, da co bai tu T4).
 */
describe('#169 — quyen cua hai be mat bang chung', () => {
  it('lai xe tai len/xem duoc bang chinh quyen nop va xem phieu cua minh', () => {
    expect(presetIncludes('SALE', 'transport.driver.self.fuel.submit')).toBe(true);
    expect(presetIncludes('SALE', 'transport.driver.self.fuel.read')).toBe(true);
  });

  it('lai xe KHONG cham duoc be mat van hanh cua bang chung', () => {
    expect(presetIncludes('SALE', 'transport.fuel.entry.read')).toBe(false);
    expect(presetIncludes('SALE', 'transport.fuel.entry.submit_for_driver')).toBe(false);
  });

  it('acceptance 7: vai KHONG duoc cap (MANAGER) bi tu choi ca hai be mat', () => {
    for (const action of [
      'transport.fuel.entry.read',
      'transport.fuel.entry.submit_for_driver',
      'transport.driver.self.fuel.read',
      'transport.driver.self.fuel.submit',
    ] as const) {
      expect(presetIncludes('MANAGER', action), action).toBe(false);
    }
  });

  it('ke toan xem va nop ho duoc — doi soat bang ke la viec cua ho', () => {
    expect(presetIncludes('ACCOUNTING', 'transport.fuel.entry.read')).toBe(true);
    expect(presetIncludes('ACCOUNTING', 'transport.fuel.entry.submit_for_driver')).toBe(true);
    // ...nhung khong mang pham vi "cua chinh minh" cua lai xe.
    expect(presetIncludes('ACCOUNTING', 'transport.driver.self.fuel.submit')).toBe(false);
  });
});

/**
 * acceptance 4 — BANG CHUNG cho KHOAN CHI THUONG cua lai xe.
 *
 * Muc nay bi CHAN cho toi khi #179 dua `POST /transport/me/expenses` vao `main`; nay no da vao, nen
 * bo test khong con quyen ghi "⛔ chan" nua.
 *
 * Cung phep thu voi be mat phieu dau, va no van la phep thu quan trong nhat: khong phai "co nem loi
 * khong", ma la "co GHI khong". Chi khac mot dieu ve LUU TRU, va no doi mot thu tu khac:
 *
 *   phieu dau — bang chung o BANG CON  ⇒ kiem quyen → luu byte → GAN vao hang da co
 *   khoan chi — bang chung o mot COT   ⇒ kiem quyen → luu byte → GHI hang MOI kem dinh vi
 *
 * Khong co buoc "gan sau", vi gan sau nghia la SUA mot hang da ghi cua mot so cai append-only.
 */
describe('#169 acceptance 4 — bang chung cho khoan chi thuong cua lai xe', () => {
  function harness(assignedTripIds: readonly string[], ownedExpenseIds: readonly string[]) {
    const order: string[] = [];
    const costing = {
      assertSelfTripExpenseAllowed: (_authUserId: string, tripId: string) => {
        order.push(`allow:${tripId}`);
        if (!assignedTripIds.includes(tripId)) {
          return Promise.reject(
            TransportDomainError.denied('EXPENSE_DRIVER_NOT_ASSIGNED', 'chuyen cua nguoi khac'),
          );
        }
        return Promise.resolve();
      },
      recordSelfTripExpense: (
        _authUserId: string,
        input: { readonly tripId: string; readonly evidenceLocator?: string | null },
      ) => {
        order.push(`record:${input.tripId}:${input.evidenceLocator ?? 'KHONG-CO-DINH-VI'}`);
        return Promise.resolve({ expense: { id: 'chi-1' } });
      },
    };
    const read = {
      selfTripExpenseEvidence: (_authUserId: string, expenseId: string) => {
        order.push(`row:${expenseId}`);
        if (!ownedExpenseIds.includes(expenseId)) {
          return Promise.reject(
            TransportDomainError.notFound('TRIP_EXPENSE_NOT_FOUND', 'khong thay trong so cua ban'),
          );
        }
        return Promise.resolve({
          expenseId,
          locator: `${TRANSPORT_EVIDENCE_KEY_PREFIX}2026/09/da-co.png`,
        });
      },
    };
    const evidence = {
      put: () => {
        order.push('store');
        return Promise.resolve({
          locator: `${TRANSPORT_EVIDENCE_KEY_PREFIX}2026/09/moi.png`,
          contentType: 'image/png',
          byteSize: PNG.byteLength,
        });
      },
      read: () => {
        order.push('fetch');
        return Promise.resolve({
          kind: 'FOUND' as const,
          object: { body: PNG, contentType: 'image/png' },
        });
      },
    };
    return { order, costing, read, evidence };
  }

  const controllerOf = async (h: ReturnType<typeof harness>) => {
    const { DriverExpenseEvidenceController } =
      await import('./driver-expense-evidence.controller.js');
    return new DriverExpenseEvidenceController(
      h.evidence as never,
      h.costing as never,
      h.read as never,
    ) as unknown as {
      record(request: unknown, body: unknown, file: unknown): Promise<unknown>;
      serve(request: unknown, expenseId: string, response: unknown): Promise<void>;
    };
  };

  const session = { authUser: { id: 'user-lai-xe-a', role: 'SALE' } };
  const file = { buffer: PNG, mimetype: 'image/png', size: PNG.byteLength, originalname: 'x.png' };
  const body = { tripId: 'chuyen-cua-toi', categoryCode: 'BOT', amount: '120000' };

  it('anh + khoan chi vao lam MOT lan goi, va dinh vi den tu KHO chu khong tu client', async () => {
    const h = harness(['chuyen-cua-toi'], []);
    await (await controllerOf(h)).record(session, body, file);

    expect(h.order).toEqual([
      'allow:chuyen-cua-toi',
      'store',
      `record:chuyen-cua-toi:${TRANSPORT_EVIDENCE_KEY_PREFIX}2026/09/moi.png`,
    ]);
  });

  /**
   * `MediaStore` khong co lenh xoa. Neu phep kiem quyen chay SAU `put()`, moi lan tu choi de lai
   * mot object mo coi trong bucket ma khong ai don — nen thu tu o day la mot rang buoc that, khong
   * phai mot so thich.
   */
  it('chuyen cua dong nghiep bi chan TRUOC khi mot byte nao vao kho', async () => {
    const h = harness(['chuyen-cua-toi'], []);
    await expect(
      (await controllerOf(h)).record(session, { ...body, tripId: 'chuyen-nguoi-khac' }, file),
    ).rejects.toThrow();

    expect(h.order).toEqual(['allow:chuyen-nguoi-khac']);
    expect(h.order).not.toContain('store');
    expect(h.order.some((step) => step.startsWith('record:'))).toBe(false);
  });

  /**
   * Multipart mang MOI truong len duoi dang chuoi, nen `amount` phai duoc doi kieu o bien gioi. Bai
   * nay do neu ai do dung lai `driverSelfExpenseSchema` (ban JSON) cho duong nay: `"120000"` se
   * khong qua duoc `z.number()`, va nguoi dung nhan mot 400 kho hieu cho mot form dung.
   */
  it('so tien den duoi dang chuoi van qua duoc bien gioi multipart', async () => {
    const h = harness(['chuyen-cua-toi'], []);
    const controller = await controllerOf(h);
    await expect(
      controller.record(session, { ...body, amount: '250000' }, file),
    ).resolves.toBeDefined();
  });

  /**
   * Ca hai bai duoi dung `expect(() => ...)` chu khong `.rejects`, va do la mot khang dinh THAT ve
   * hinh dang cua controller: `parse()` va `uploadedBytes()` nem NGAY o than ham, truoc khi mot
   * `Promise` nao duoc tao. Neu ai do goi chung ben trong `this.guard(async () => ...)`, hai bai
   * nay do — va do la dieu can biet, vi luc do mot dau vao hong se di qua duoc phep kiem quyen.
   */
  it('client KHONG tu dat duoc dinh vi — truong la la 400, khong bi bo qua im lang', async () => {
    const h = harness(['chuyen-cua-toi'], []);
    const controller = await controllerOf(h);
    expect(() =>
      controller.record(
        session,
        { ...body, evidenceLocator: 'media/2026/08/anh-cua-khach.webp' },
        file,
      ),
    ).toThrow(BadRequestException);
    expect(h.order).toEqual([]);
  });

  it('thieu tep multipart la 400 CO CAU CHU, va khong lan goi nao xuong kho', async () => {
    const h = harness(['chuyen-cua-toi'], []);
    const controller = await controllerOf(h);
    expect(() => controller.record(session, body, undefined)).toThrow(BadRequestException);
    expect(h.order).toEqual([]);
  });

  it('doc lai anh cua khoan chi CUA CHINH MINH', async () => {
    const h = harness([], ['chi-cua-toi']);
    const response = { setHeader: () => {}, end: () => {} };
    await (await controllerOf(h)).serve(session, 'chi-cua-toi', response);
    expect(h.order).toEqual(['row:chi-cua-toi', 'fetch']);
  });

  it('acceptance 5: khoan chi cua lai xe khac bi chan TRUOC khi cham kho', async () => {
    const h = harness([], ['chi-cua-toi']);
    const response = { setHeader: () => {}, end: () => {} };
    await expect(
      (await controllerOf(h)).serve(session, 'chi-cua-dong-nghiep', response),
    ).rejects.toThrow();

    expect(h.order).toEqual(['row:chi-cua-dong-nghiep']);
    expect(h.order).not.toContain('fetch');
  });
});

/**
 * acceptance 6 — mot khach khong bat nghiep vu nhien lieu KHONG nap mot manh nao cua bang chung.
 *
 * Day la hinh dang cua "cach ly khach" tren nen tang nay: moi khach mot stack, va ranh gioi doc
 * duoc la CAPABILITY. Mot khach ban hang khong co bang chung van tai de ma doc nham.
 */
/**
 * `#295` Lane V — CANH CON THIEU giua bang chung DA LUU va bo doc.
 *
 * Truoc lane nay, `FuelReceiptExtractionPort.extract()` chi voi toi duoc tu mot route nhan
 * `contentBase64` trong than yeu cau. Anh phieu do lai xe TAI LEN — da nam ben vung trong kho anh,
 * co dinh vi, co dau vet — khong bao gio doc duoc. Bo bai duoi do CHINH canh vua noi.
 */
describe('#295 Lane V — doc mot tam anh DA LUU, khong qua base64', () => {
  const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

  function harness(options: { readonly missing?: boolean } = {}) {
    const order: string[] = [];
    const seen: { sourceRef?: string; mediaType?: string; content?: Buffer } = {};

    const read = {
      fuelEntryEvidence: (entryId: string, evidenceId: string) => {
        order.push(`resolve:${entryId}/${evidenceId}`);
        return Promise.resolve({
          id: evidenceId,
          locator: `${TRANSPORT_EVIDENCE_KEY_PREFIX}2026/09/da-luu.png`,
        });
      },
    };
    const evidence = {
      read: (locator: string) => {
        order.push(`fetch:${locator}`);
        return Promise.resolve(
          options.missing
            ? ({ kind: 'MISSING' } as const)
            : ({ kind: 'FOUND', object: { body: PNG_BYTES, contentType: 'image/png' } } as const),
        );
      },
    };
    const documents = {
      ingestReceiptImage: (image: { sourceRef: string; mediaType: string; content: Buffer }) => {
        order.push('extract');
        seen.sourceRef = image.sourceRef;
        seen.mediaType = image.mediaType;
        seen.content = image.content;
        return Promise.resolve({ id: 'doc-1' });
      },
    };
    return { order, seen, read, evidence, documents };
  }

  const controllerOf = async (h: ReturnType<typeof harness>) => {
    const { FuelEvidenceController } = await import('./fuel-evidence.controller.js');
    return new FuelEvidenceController(
      h.evidence as never,
      {} as never,
      h.read as never,
      h.documents as never,
    ) as unknown as {
      extract(request: unknown, id: string, evidenceId: string): Promise<unknown>;
    };
  };

  const session = { authUser: { id: 'user-ke-toan', role: 'ACCOUNTING' } };

  it('dinh vi duoc TRA CUU o phia may chu, roi byte moi di vao bo doc', async () => {
    const h = harness();

    await (await controllerOf(h)).extract(session, 'phieu-1', 'ev-9');

    expect(h.order).toEqual([
      'resolve:phieu-1/ev-9',
      `fetch:${TRANSPORT_EVIDENCE_KEY_PREFIX}2026/09/da-luu.png`,
      'extract',
    ]);
    expect(h.seen.content).toBe(PNG_BYTES);
    expect(h.seen.mediaType).toBe('image/png');
  });

  /**
   * Cung lane nay vua cat `locator` khoi moi DTO. Neu no quay lai qua `sourceRef` — mot truong doc
   * ra o mau kiem duyet — thi viec cat o kia tro nen vo nghia.
   */
  it('`sourceRef` mang id cua tam anh, KHONG mang dinh vi kho', async () => {
    const h = harness();

    await (await controllerOf(h)).extract(session, 'phieu-1', 'ev-9');

    expect(h.seen.sourceRef).toBe('fuel-evidence:ev-9');
    expect(h.seen.sourceRef).not.toContain(TRANSPORT_EVIDENCE_KEY_PREFIX);
  });

  it('byte khong con trong kho: bo doc KHONG duoc goi', async () => {
    const h = harness({ missing: true });

    await expect((await controllerOf(h)).extract(session, 'phieu-1', 'ev-9')).rejects.toThrow();

    expect(h.order).not.toContain('extract');
  });
});

describe('#169 — composition cua be mat bang chung', () => {
  const namesFor = (capabilities: readonly CapabilityId[]): string[] =>
    buildAppComposition(capabilities).controllers.map((controller) => controller.name);

  const FUEL_EVIDENCE = ['DriverFuelEvidenceController', 'FuelEvidenceController'];

  it('bat transport-fuel thi ca hai be mat bang chung phieu dau co mat', () => {
    const names = namesFor(['transport-core', 'transport-costing', 'transport-fuel']);
    for (const artefact of FUEL_EVIDENCE) expect(names, artefact).toContain(artefact);
  });

  it('KHONG bat nhien lieu thi khong be mat bang chung PHIEU DAU nao duoc nap', () => {
    const names = namesFor(['transport-core', 'transport-costing']);
    for (const artefact of FUEL_EVIDENCE) expect(names, artefact).not.toContain(artefact);
    expect(names).toContain('TripsController');
  });

  it('mot khach BAN HANG khong nap mot manh nao cua bang chung van tai', () => {
    const names = namesFor(['knowledge', 'messaging', 'turn-processing', 'sales-order']);
    for (const artefact of FUEL_EVIDENCE) expect(names, artefact).not.toContain(artefact);
    expect(names).not.toContain('DriverExpenseEvidenceController');
  });

  /**
   * KHO ANH THUOC `transport-core`, KHONG thuoc `transport-fuel` — va bai nay la ly do.
   *
   * Tu acceptance 4 co HAI nguoi tieu thu `TransportEvidenceService` o hai capability khac nhau.
   * Neu kho van ghim vao `transport-fuel` thi mot khach bat gia thanh ma khong bat nhien lieu se
   * KHONG DUNG NOI do thi Nest — chet luc boot vi thieu token, chu khong phai mat mot tinh nang.
   */
  it('khach co gia thanh nhung KHONG co nhien lieu van co be mat anh khoan chi VA co kho anh', () => {
    const composition = buildAppComposition(['transport-core', 'transport-costing']);
    const names = composition.controllers.map((controller) => controller.name);
    expect(names).toContain('DriverExpenseEvidenceController');

    // `provide` la mot LOP, khong phai mot chuoi — `String(class)` tra ve ca ma nguon, nen phai
    // doc `.name`. Doc nham cho ra mot bai LUON DO ma thong bao khong noi len dieu do.
    const provides = composition.providers.map((provider) => {
      const token: unknown =
        typeof provider === 'function' ? provider : (provider as { provide?: unknown }).provide;
      return typeof token === 'function' ? token.name : String(token ?? '');
    });
    expect(provides).toContain('TransportEvidenceService');
  });

  it('be mat anh khoan chi bien mat cung `transport-costing`', () => {
    const names = namesFor(['transport-core', 'transport-fuel']);
    expect(names).not.toContain('DriverExpenseEvidenceController');
    expect(names).toContain('DriverFuelEvidenceController');
  });
});
