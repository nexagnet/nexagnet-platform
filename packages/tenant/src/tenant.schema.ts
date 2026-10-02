import {
  contentImportManifestSchema,
  DEALER_TIERS,
  POLICY_TYPES,
  type ContentImportManifest,
} from '@netviet/shared';
import { z } from 'zod';
import { workflowEngineIntegrationSchema } from './workflow-binding.schema.js';

/**
 * Schema GOI KHACH (`tenants/<slug>/`). Goi khach la DU LIEU doc luc chay chu khong phai code,
 * nen phai validate nhu moi nguon la khac (CLAUDE.md — "khong tin du lieu ngoai"). Sai schema =>
 * nem ngay luc boot, KHONG de he thong chay tiep voi nguon su that hong.
 *
 * LUU Y: day la HAT GIONG, khong phai nguon su that luc chay. Voi PERSISTENCE=prisma, sau lan
 * seed dau tien thi Postgres moi la nguon su that (sua qua /admin hoac MCP) — xem
 * docs/phat-trien/ke-hoach/nen-tang-da-khach.md §5.
 */

const nonEmpty = z.string().min(1);
export const retailPriceFieldSchema = z.enum([
  'wholesale',
  'minRetailPrice',
  'retailPrice',
  'listPrice',
]);

export const retailAdviceSchema = z
  .object({
    priceField: retailPriceFieldSchema,
    qualifier: nonEmpty,
  })
  .strict();

export const blockedCapabilitySchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]*$/)
      .max(100),
    label: nonEmpty.max(200),
    reason: nonEmpty.max(1_000),
  })
  .strict();

/**
 * MOT BAN TRIEN KHAI XEM TRUOC TU KHAI RA MINH LA XEM TRUOC.
 *
 * Truong nay KHONG doi hanh vi gi — no chi lam be mat noi that mot cau ma nguoi dung khong the
 * suy ra tu man hinh: "day khong phai ban cho khach dung". Mot ban dung de lay y kien som trong
 * rat giong mot ban that, va do dung la cho nguy hiem: nguoi xem de tuong nghiep vu da chay du.
 *
 * De o `readiness` vi no cung ho voi `blockedCapabilities` — ca hai deu la LOI TU THU cua goi
 * khach ve gioi han cua chinh no, khong phai trang thai ky thuat luc chay.
 *
 * TUY CHON. Vang mat ⇒ khong hien gi, nen moi goi khach dang co khong doi mot pixel nao.
 */
export const previewNoticeSchema = z
  .object({
    /** Nhan ngan hien tren dai bang — vd "BAN XEM TRUOC". */
    label: nonEmpty.max(40),
    /** Mot cau noi ro day la gi va KHONG phai gi. */
    note: nonEmpty.max(300),
  })
  .strict();

export const tenantReadinessSchema = z
  .object({
    /** Cac blocker nghiep vu do tenant khai bao; core chi hien thi, khong suy dien hanh vi. */
    blockedCapabilities: z.array(blockedCapabilitySchema).max(100),
    previewNotice: previewNoticeSchema.optional(),
    /**
     * GOI NAY LA GOI MAU/THAM CHIEU, khong phai mot khach hang that.
     *
     * KHONG BAO GIO HIEN RA MAN HINH. Khac han `previewNotice` o dung diem do: cai kia la mot cau
     * chu HUONG NGUOI DUNG, con day la mot su that KY THUAT de cac cong bao ve doc.
     *
     * Vi sao can mot truong rieng: cong chan nghiep vu van tai phai tra loi duoc cau "goi nay co
     * phai khach that khong". Truoc day no suy ra dieu do tu `previewNotice` — tuc rang buoc mot
     * tinh chat ky thuat vao mot DAI BANG KHACH NHIN THAY, va he qua la khong go duoc dai bang ma
     * khong pha cong. Tach ra thi hai thu doc lap: mot goi mau co the trong nhu mot san pham binh
     * thuong ma cong bao ve van dung.
     *
     * Vang mat ⇒ `false` ⇒ mot goi khach that. Moi goi khach dang co giu nguyen hanh vi.
     */
    demoTenant: z.boolean().optional(),
  })
  .strict();

export const orderAutomationSchema = z
  .object({
    /** Policy kinh doanh cua tenant; AUTO_SEND runtime chi la kill switch van hanh. */
    enabled: z.boolean(),
    /** Tong so luong toi da duoc tu xac nhan, tinh inclusive tren tat ca dong hang. */
    maxAutoConfirmQuantity: z.number().int().positive().max(1_000_000),
  })
  .strict();

/**
 * BAO LAU thi mot viec ban giao cho Sale bi coi la "chua ai dong toi".
 *
 * DAY LA CHINH SACH CUA KHACH, khong phai hang so cua nen tang — va do la ca ly do no nam trong
 * goi khach chu khong nam trong code. Mot khach chot don theo ca lam viec va mot khach truc 24/7
 * co nguong khac han nhau; chon ho mot con so roi goi do la "SLA" la bia ra nghiep vu.
 *
 * `null` (mac dinh) = KHONG theo doi. Fail-safe co chu y: khach chua noi bao lau la du lau thi
 * he thong khong duoc tu quyet, va khong theo doi thi khong bao gio nhac nham.
 *
 * PHAM VI CUA v1: het gio thi DANH DAU de nguoi nhin thay — KHONG day ERP, KHONG nhan tin ra
 * ngoai. Viec cua workflow dau tien la "viec ban giao khong bi quen", khong phai "thay nguoi
 * bang tu dong hoa".
 */
/**
 * KHOA cua khuon workflow thuc thi viec theo doi nay.
 *
 * Mot HANG SO o day chu khong phai mot chuoi go tay trong `superRefine`: no la mot phan cua HOP
 * DONG giua goi khach va ban dang chay (`apps/api/src/workflow/workflow-registry.ts` khai cung
 * khoa nay). Hai ben lech nhau thi goi khach hop le se tro thanh mot bao dam khong ai thuc hien.
 */
export const SALES_HANDOFF_FOLLOWUP_WORKFLOW = 'sales-handoff-followup';

export const salesHandoffFollowupSchema = z
  .object({
    enabled: z.boolean(),
    /**
     * Tinh tu `salesHandoff.createdAt`. Tran 30 ngay de mot so go nham khong sinh ra mot lan cho
     * dai hon vong doi luu tru cua engine.
     */
    remindAfterSeconds: z.number().int().positive().max(2_592_000),
  })
  .strict();

/**
 * He thong ban hang/kho cua khach. NEN TANG chi biet cong `ErpPort`; ten nha cung cap chi duoc
 * xuat hien o DAY (du lieu cua khach) va trong chinh thu muc adapter — khong o nhan (G1-12).
 * Them khach dung ERP khac = them mot hien thuc + mot gia tri enum, khong sua nhan.
 */
export const erpAdapterSchema = z.enum([
  /** Khach chua noi ERP nao: doc tra rong, day don thi NEM. Mac dinh — fail-closed. */
  'none',
  /** Gia lap trong bo nho cho khach dung KiotViet khi ben do chua bat API. */
  'kiotviet_mock',
]);

export const erpConfigSchema = z.object({ adapter: erpAdapterSchema }).strict();

export const CHANNEL_ADAPTERS = ['mock', 'bot', 'zca', 'hybrid'] as const;
export const PARSER_ADAPTERS = ['claude', 'deepseek', 'flowise'] as const;
export const CONTENT_SOURCE_ADAPTERS = ['local_manifest', 'google_drive'] as const;
export const CAPABILITY_IDS = [
  'knowledge',
  'messaging',
  /**
   * XU LY MOT LUOT — trung tinh ve nghiep vu: nhan mot tin, dung ngu canh, goi AI phan loai y
   * dinh + trich xuat, roi dinh tuyen ket qua. KHONG biet gia, don hay ERP.
   *
   * Tach khoi `sales-order` ngay 24/08/2026: truoc do mot khach chi muon tra loi tin nhan phai
   * bat ca `sales-order`, tuc phai khai bang gia, dai ly va chinh sach ban hang cho mot viec
   * khong lien quan gi den ban hang.
   */
  'turn-processing',
  'sales-order',
  'campaign',
  'operations',
  'notifications',
  /**
   * VAN TAI — LOI: doi xe (xe, lai xe, gan lai xe phu trach) va van hanh chuyen (chuyen, vong doi,
   * phan cong). Mien BAN GHI VA SO SACH, khong phai mien hoi thoai: mot khach van tai KHONG can
   * `messaging`, KHONG can `turn-processing`, va khong khai mot integration `parser` nao — nen no
   * cung khong bao gio dua mot quyet dinh tien nao cho LLM.
   *
   * `dependencies: []` co y: T1 §10.1 dat `transport-core` o goc cua cay van tai; cac capability
   * van tai sau (`transport-costing`, `transport-fuel`, ...) se phu thuoc NO, khong nguoc lai.
   */
  'transport-core',
  /**
   * VAN TAI — GIA THANH CHUYEN + SO QUY LAI XE (`TX-03`).
   *
   * `dependencies: ['transport-core']` di dung chieu ma T1 §10.1 dat ra: costing can chuyen va lai
   * xe de gan mot khoan chi vao; core khong can biet gi ve tien. Mot khach bat costing ma quen bat
   * core se bi chan NGAY LUC DOC GOI, truoc khi Nest kip dung do thi module — thay vi boot xong roi
   * chet o lan ghi khoan chi dau tien.
   *
   * KHONG co chieu nguoc lai: mot khach van tai chi muon theo doi doi xe va chuyen van chay duoc ma
   * khong co mot bang so cai nao.
   */
  'transport-costing',
  /**
   * VAN TAI — NHIEN LIEU + DOI SOAT BANG KE CAY XANG (`TX-04`).
   *
   * `dependencies: ['transport-core', 'transport-costing']` la mot QUAN HE THAT, khong phai mot
   * thu tu cho dep: T1 §10.1 ghi ro chi phi dau phai vao gia thanh chuyen (VT-034, VT-040), nen
   * mot khach bat `transport-fuel` ma tat `transport-costing` se co phieu dau KHONG DI DAU CA —
   * lai xe nhap moi ngay, ke toan duyet moi tuan, va khong con so nao doi ra tien.
   *
   * Chan o day, luc DOC GOI KHACH, chu khong o lan duyet phieu dau dau tien: mot cau hinh tu mau
   * thuan ma boot duoc se de lai mot he thong "chay binh thuong" cho toi luc co nguoi hoi vi sao
   * chuyen nao cung re hon thuc te 35-45% — dung ty trong ma nguon khach ghi cho nhien lieu.
   */
  'transport-fuel',
  /**
   * VAN TAI — QUYET TOAN AR/AP, DOI TAC, HOA HONG, BIEN TRUC TIEP (`TX-05`).
   *
   * `dependencies` co BA phan tu, va ca ba la quan he THAT chu khong phai thu tu cho dep:
   *
   *   · `transport-fuel` — dong thu nhat trong nam dong tien ma Issue #87 bat buoc giu rieng la
   *     "cong ty va cay xang", va no chi ton tai neu co ban giao cua `TX-04` de doc. Bat
   *     `transport-settlement` ma tat fuel se cho ra mot he thong co BON dong thay vi nam, va dong
   *     thieu la dong mang so tien lon nhat.
   *   · `transport-costing` — bien truc tiep cua chuyen XE NHA la
   *     `doanh thu - chi phi truc tiep - hoa hong`; so hang thu hai den tu `TX-03`.
   *   · `transport-core` — nguon cua chuyen, khach hang va doi tac.
   *
   * Chan o day, LUC DOC GOI KHACH, chu khong o lan ghi cong no dau tien: mot cau hinh tu mau thuan
   * ma boot duoc se de lai mot he thong bao cao cong no thieu han mot dong tien, va khong ai phat
   * hien ra cho toi luc doi chieu voi cay xang cuoi thang.
   */
  'transport-settlement',
  /**
   * TAI SAN + TUAN THU (`TX-06`) — bao duong, giay to phap ly va TRANG THAI HIEU LUC cua xe.
   *
   * Phu thuoc DUY NHAT `transport-core`, khac ba capability van tai truoc no. Do la mot khang
   * dinh: mot khach chi muon theo doi han dang kiem va lich bao duong khong phai bat so quy lai
   * xe, khong phai bat phieu dau, va khong phai khai mot dong cong no nao.
   */
  'transport-asset-compliance',
  /**
   * NHAN SU (`TX-07`) — ky luong, phieu luong, thanh phan luong.
   *
   * Phu thuoc `transport-costing` vi phieu luong HIEN THI so du quy lai xe (VT-062 muon nguoi
   * duyet nhin thay no truoc khi quyet). HIEN THI, khong tru: `GD-12` tat khau tru tu dong, va
   * rang buoc `TransportPayslipComponent_deduction_manual_only` giu dieu do o tang luu tru.
   */
  'transport-workforce',
  /**
   * BAM VI TRI VA CHUNG CU VAN HANH (Issue #235 Lane B) — phien bam vi tri, ban dinh vi, co rui
   * ro, hang rao dia ly, ma cai dat ung dung.
   *
   * MOT CAPABILITY RIENG chu khong phai mot phan cua `transport-core`, va do la mot khang dinh:
   * mot khach van tai phai chay duoc MA KHONG bam vi tri. Vi tri cua nguoi lao dong co dieu kien
   * phap ly rieng, co chi phi luu tru that (xem `docs/kien-truc/transport-geospatial.md` §5), va
   * co khach se lay tu hop GSHT tren xe thay vi tu dien thoai. Gop vao loi se bat moi khach van
   * tai mang theo ca tang do du ho khong bao gio bat no.
   *
   * KHONG mot co rui ro nao o day sinh ra cong no, tru luong hay ket luan gian lan (#232 D-02).
   */
  'transport-proof',
  /**
   * MOC VAN HANH, TAI LIEU HIEN TRUONG VA THOI GIAN CHO (Issue #243 Lane F) — moc gan vao
   * `VehicleRun`/`RunLeg`, phieu cong/can/giao, phien cho nguoi nhan, phu cap cho cua lai xe.
   *
   * MOT CAPABILITY RIENG, cung ly le voi `transport-proof` ngay tren: mot khach van tai phai chay
   * duoc MA KHONG co quy trinh cong/can/phieu giao. Quy trinh do la cua cong ty B; khach chi chay
   * chuyen le thi khong co cong de vao va khong co can de can. Gop chin loai moc vao
   * `transport-core` se bat moi khach van tai mang theo quy trinh cua dung mot khach.
   *
   * HAI phu thuoc, va ca hai deu that — xem `transport-checkpoint.module.ts`.
   */
  'transport-checkpoint',
  /**
   * NHAN VIEC TAI DIA DIEM A (Issue #267 Lane H) — dia diem van hanh cua phap nhan, nhan dang tu
   * hang rao, va duong lai xe tu xac nhan de mo mot vong chay toi thieu.
   *
   * MOT CAPABILITY RIENG, cung ly le voi `transport-proof` va `transport-checkpoint` ngay tren:
   * mot khach van tai phai chay duoc MA KHONG co duong lai xe tu tao chuyen. Cong ty B can no vi
   * lai xe cua ho den thang nha may A roi moi biet se cho gi di dau; mot khach dieu xe tu van
   * phong thi moi vong chay deu ra doi tu mot lenh dieu, va mot nut `Tao chuyen` tren dien thoai
   * lai xe la mot lo hong quy trinh chu khong phai mot tien ich.
   *
   * KHONG mot truong tien nao di qua duong nay (#267 H4).
   */
  'transport-site-intake',
  /**
   * VAN TAI — NAP DU LIEU ETC / PHI DUONG BO (`TX-08` mo rong, #269).
   *
   * `dependencies: ['transport-core']` va CHI the: doc mot sao ke ETC can doi xe de noi bien so ve
   * mot chiec xe, va khong can gi khac. KHONG phu thuoc `transport-costing`, va do la mot phat
   * bieu co y: ETC la CONG TY TRA (#229 §8), no khong di qua so quy lai xe, nen mot khach dung ETC
   * ma khong dung so quy van chay duoc.
   *
   * KHONG phu thuoc `transport-fuel` du hai ben giong nhau ve hinh dang nap tep: giong hinh dang
   * khong phai mot phu thuoc, va noi chung lai se bat mot khach chi muon doi soat ETC phai khai ca
   * dinh muc nhien lieu.
   */
  'transport-toll',
  /**
   * NGHIEM THU CHUNG TU / THUONG MAI (Issue #268 Lane I) — ho so nghiem thu cua mot vong chay,
   * lich su quyet dinh chi-ghi-them, va phep suy "du dieu kien di vao mot ky doi soat moi".
   *
   * MOT CAPABILITY RIENG, nhung KHAC ba capability truoc no o mot diem: no khong tuy chon doi voi
   * khach da bat `transport-settlement`. Xem khoi phu thuoc ben duoi — day la mot CONG TAI CHINH,
   * va mot cong tai chinh co che do tat thi khong con la mot cong.
   *
   * Van tach rieng chu khong nhet vao `transport-settlement`, vi chieu phu thuoc phai di mot chieu:
   * quyet toan DOC nghiem thu, nghiem thu khong bao gio nhin thay so tien.
   */
  'transport-acceptance',
] as const;
export const EXPERIENCE_IDS = [
  'operations-console',
  'knowledge-workspace',
  'agent-workforce',
  /**
   * Be mat VAN HANH VAN TAI (Giam doc / Ke toan) — `GD-23`.
   *
   * T1 §12 mo ta HAI be mat cho mot khach van tai: van hanh va lai xe. Nen tang hom nay chi khai
   * duoc MOT experience cho mot khach (`PG-01`), nen `GD-23` chon: dang ky be mat van hanh, con
   * be mat lai xe chay nhu route rieng co guard trong cung experience, va moi payload cua no di
   * qua `DriverTripView` — mot KIEU khong co truong doanh thu. Nho vay `INV-09` duoc giu bang
   * CAU TRUC DU LIEU ngay ca khi tang experience chua tach duoc.
   */
  'transport-operations',
  /**
   * Be mat BAN HANG B2B huong KHACH HANG — `U-UI0`.
   *
   * Ranh gioi voi `operations-console` la ranh gioi NGUOI DUNG, khong phai mot ban lam dep cua
   * cung mot man hinh. `operations-console` la be mat NOI BO cua Nexagent: hoat canh 6 agent,
   * trace, doc lai rule, chay lai mot luot — nhung thu mot ky su can va mot nhan vien Sale khong
   * bao gio nen phai nhin. Be mat nay la thu khach dung hang ngay: hoi thoai, duyet & gui, don
   * hang, dai ly, cham soc, canh bao, quan tri.
   *
   * HAI experience CUNG TON TAI co chu y, khong phai mot buoc chuyen tiep. Hop nhat chung se cho
   * ra mot man hinh vua bao "don vuot nguong tu xac nhan" vua phoi `traceId` — khong ai doc duoc.
   * Xoa be mat noi bo di thi mat luon duong lan vet khi mot don chay sai
   * (docs/phat-trien/van-hanh/debugging.md).
   *
   * TRUNG TINH VE KHACH: khong mot dong nao trong experience nay duoc biet ten mot khach cu the.
   * Thuong hieu, chinh sach va cac nang luc bi chan deu den tu goi khach (`tenants/<slug>/`).
   */
  'b2b-sales-operations',
] as const;

export const capabilityIdSchema = z.enum(CAPABILITY_IDS);
export const experienceIdSchema = z.enum(EXPERIENCE_IDS);
export const channelAdapterSchema = z.enum(CHANNEL_ADAPTERS);
export const parserAdapterSchema = z.enum(PARSER_ADAPTERS);
export const contentSourceAdapterSchema = z.enum(CONTENT_SOURCE_ADAPTERS);

const uniqueNonEmptyArray = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .min(1)
    .refine((items) => new Set(items).size === items.length, 'khong duoc khai bao trung');

export const channelIntegrationSchema = z
  .object({ allowedAdapters: uniqueNonEmptyArray(channelAdapterSchema) })
  .strict();

export const parserIntegrationSchema = z
  .object({ allowedAdapters: uniqueNonEmptyArray(parserAdapterSchema) })
  .strict();

export const contentSourceIntegrationSchema = z
  .object({ adapter: contentSourceAdapterSchema })
  .strict();

/** Duong dan trong goi tenant: tuong doi, khong duoc thoat khoi tenantDir(). */
export const bootstrapPathSchema = nonEmpty
  .max(500)
  .refine((path) => !/^(?:[\\/]|[A-Za-z]:)/.test(path), 'phai la duong dan tuong doi')
  .refine(
    (path) => !path.split(/[\\/]/).some((segment) => segment === '..'),
    'khong duoc chua thanh phan ..',
  );

const bootstrapEntrySchema = z.object({ path: bootstrapPathSchema }).strict();

export const tenantBootstrapSchema = z
  .object({
    knowledge: bootstrapEntrySchema.optional(),
    salesOrder: bootstrapEntrySchema.optional(),
    content: bootstrapEntrySchema.optional(),
    demoMessages: bootstrapEntrySchema.optional(),
    /**
     * THANG VAN HANH MAU cua mot GOI MAU — bo du lieu van tai tat dinh (T8/#90).
     *
     * KHONG cung loai voi bon muc tren. Ba muc dau gieo cai ma khach DA CO SAN (danh muc, dai ly,
     * noi dung), con muc nay gieo mot thang lam viec DUOC NGHI RA: xe, lai xe, chuyen, phieu dau,
     * cong no, luong. Do la ly do no khong duoc phep xuat hien tren mot goi khach that.
     *
     * Cong bao ve KHONG nam o day. Schema chi biet mot duong dan hop le; no khong biet duong ghi
     * nao se doc duong dan do, nen no khong the tu choi dung luc. Cuong che nam o
     * `assertTransportDemoTenant()` cua mien van tai, chay ngay truoc khi ghi — va no doc chinh
     * `readiness.demoTenant`, co ma `transport-tenant-allowlist.spec.ts` da chung minh khong goi
     * khach that nao mang.
     */
    transportDemo: bootstrapEntrySchema.optional(),
  })
  .strict();

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'gio phai co dang HH:mm');

export const campaignConfigSchema = z
  .object({
    defaultWindow: z
      .object({ start: timeOfDaySchema, end: timeOfDaySchema })
      .strict()
      .refine((window) => window.end > window.start, 'campaign.defaultWindow.end phai sau start'),
    minSpacingSeconds: z.number().int().positive().max(86_400),
    maxTargets: z.number().int().positive().max(100_000),
    rateLimitPerMinute: z.number().int().positive().max(10_000),
    claimLeaseSeconds: z.number().int().positive().max(3_600),
    tickIntervalSeconds: z.number().int().positive().max(300),
    retry: z
      .object({
        maxAttempts: z.number().int().positive().max(20),
        baseBackoffSeconds: z.number().int().positive().max(86_400),
      })
      .strict(),
    features: z.object({ lunarCalendarEnabled: z.boolean() }).strict(),
  })
  .strict();

/**
 * TIN NHAN MAU cho smoke test luc deploy.
 *
 * Vi sao nam trong GOI KHACH chu khong nam trong script deploy: parser lam viec trong TU DIEN DONG
 * cua tung khach (SKU, dai ly, glossary rieng). Truoc 17/08/2026 smoke-test.mjs cam cung mot cau
 * cua mot khach cu the — cau do la don hop le voi khach do, con voi khach khac thi parser tra
 * `khac` va deploy chet du he thong hoan toan binh thuong. Mot chuoi mang ten dai ly va SKU cua
 * mot khach cung khong duoc phep nam trong base (CLAUDE.md muc 6).
 *
 * KHONG khai bao (`null`) = khach chua co nguon su that de dat hang duoc, vi du goi vua dung.
 * Luc do smoke chi kiem duoc phan ha tang; xem smoke-test.mjs.
 */
export const smokeFixtureSchema = z
  .object({
    /** Mot don HOP LE theo dung nguon su that cua khach nay — phai ra intent `dat_don`. */
    orderText: nonEmpty,
    /** So luong ma rules engine phai tinh ra tu `orderText`. Smoke doi dung mot dong hang. */
    expectedQuantity: z.number().int().positive(),
  })
  .strict();

const salesOrderPolicySchema = z
  .object({
    supportedDealerPolicies: uniqueNonEmptyArray(z.enum(POLICY_TYPES)),
    /** Null = chua phe duyet policy tu dong, fail-closed. */
    automation: orderAutomationSchema.nullable(),
    retailAdvice: retailAdviceSchema,
    /**
     * Null (va cung la mac dinh khi khong khai) = KHONG theo doi viec ban giao. Tuy chon co chu
     * y: moi goi khach dang co van hop le sau thay doi nay, va khach nao chua chon nguong thi
     * khong bi he thong chon ho.
     */
    handoffFollowup: salesHandoffFollowupSchema.nullable().optional(),
  })
  .strict();

/**
 * Chinh sach cua `transport-core`.
 *
 * `timeZone` nam o day chu khong o tang danh tinh tenant vi nen tang CHUA co mui gio tenant
 * (`PG-08`, do tren main: mui gio chi ton tai trong cau hinh lap lich campaign). Day la cho tay
 * lai co gioi han CO Y — khi `PG-08` dong thi doi cho DOC, khong doi hinh dang du lieu, vi ngay
 * nghiep vu da la mot cot rieng tren tung ban ghi ngay tu T2 (`INV-25`).
 *
 * Khong khai = dung mac dinh `Asia/Ho_Chi_Minh` (`GD-04`) thay vi hong luc boot: mot khach van tai
 * Viet Nam khong nen phai go lai mot hang so ai cung biet.
 */
const transportCorePolicySchema = z
  .object({
    /** Ten mui gio IANA. Vd `Asia/Ho_Chi_Minh`. */
    timeZone: nonEmpty.optional(),
  })
  .strict();

/**
 * Chinh sach LAP KE HOACH VONG CHAY — #276 (Lane L).
 *
 * Ba khoi, va ca ba deu TUY CHON, cung ly le voi `transportCore`: bat mot khach van tai phai go
 * mot khoi rong chi de he thong khoi chet la mot yeu cau khong phuc vu ai. Mac dinh cua tung khoi
 * nam trong `run-grouping.ts` / `depot.policy.ts` / `run-closure.ts` cua mien, khong o day; schema
 * nay chi noi cai gi HOP LE.
 *
 * ============================================================================================
 * `runGrouping` — MAC DINH LA CAI KHONG DOI GI
 * ============================================================================================
 *
 * `#276` L1 doi *"safe default must preserve current behavior for existing deployments"*. Hanh vi
 * hom nay cua moi khach dang chay la KHONG co lan lap ke hoach nao gom hai don vao mot vong chay.
 * Nen mac dinh la `ONE_ORDER_PER_RUN`, va mot khach khong khai gi se khong bao gio thay hai don
 * cua minh nam chung mot vong chay chi vi ai do nang cap phien ban.
 *
 * ============================================================================================
 * `depots` LA MOT MANG DU HOM NAY CHI DUNG DUOC MOT
 * ============================================================================================
 *
 * `#276` L5 doi hai thu cung luc: *"current tenant can have exactly one active depot"* VA
 * *"data model/API must not make future multi-depot impossible"*. Mot truong `depot` don le se
 * dong cua thu hai lai; mot mang gioi han `max(1)` cung vay. Nen day la mot mang khong gioi han,
 * con quy tac "dung mot bai dang hoat dong" song o TANG MIEN (`resolveDepot()`), noi no bao
 * `DEPOT_AMBIGUOUS` thay vi doan bua mot bai khi khach khai hai.
 *
 * Bai xe la CO SO VAN HANH CUA B, khong phai mot `TransportCounterparty` — L5 goi ten dung cho de
 * nham lan nay. Nen no la cau hinh cua goi khach chu khong mot hang trong danh muc phap nhan.
 *
 * `#395` — `depots` LA CAU HINH KHOI DAU CU. Tu #395 Giam doc khai bai xe tren man "Dia diem van
 * hanh" (hang rao `DEPOT`, capability `transport-proof`), va do la nguon su that: co BAT KY hang rao
 * `DEPOT` nao (ke ca da tat) thi khoi nay bi BO QUA hoan toan. Khoi nay chi con dung cho khach CHUA
 * co bai xe nao duoc quan ly — vd khach chi bat `transport-core`, khong co so hang rao. Goi khach moi
 * co `transport-proof` khong nen khai no.
 *
 * ============================================================================================
 * `closure.idleHours` KHONG CO MAC DINH — VA DO LA CAU TRA LOI TRUNG THUC
 * ============================================================================================
 *
 * `#276` L4 cho phep mot quy tac dong theo thoi gian nghi, roi rang buoc ngay: *"The exact default
 * must be conservative and documented; do not invent a financial meaning. If no source-backed
 * default can be selected safely, expose the rule as required transport policy for preview and use
 * a clearly synthetic preview value, not a hidden magic constant."*
 *
 * Khong co nguon nao noi mot chiec xe nghi bao lau thi coi la het vong chay — khach chua tra loi.
 * Nen khong khai `idleHours` = KHONG BAO GIO dong vi het gio; chi con duong dong khi xe ve bai.
 * Do la mac dinh bao thu nhat co the: khong doan gi ca. Ban xem truoc
 * (`tenants/transport-preview`) khai mot con so TONG HOP va noi ro no la tong hop.
 */
const transportPlanningPolicySchema = z
  .object({
    runGrouping: z.enum(['ONE_ORDER_PER_RUN', 'MULTI_ORDER_RUN']).optional(),
    depots: z
      .array(
        z
          .object({
            /** Ma on dinh cua bai. Vd `DEPOT-HN`. */
            code: nonEmpty,
            /**
             * Nhan doc duoc, va la CHUOI DUOC DUNG LAM diem dau/cuoi cua chang rong. Phai trung
             * voi cach van phong go dia diem tren don, neu khong he thong se thay "bai xe" va
             * "diem lay hang" la hai cho khac nhau roi sinh mot chang rong khong co that.
             */
            label: nonEmpty,
            /** Khong khai = dang hoat dong. Tat mot bai la doi cau hinh, khong phai xoa dong. */
            active: z.boolean().optional(),
          })
          .strict(),
      )
      .optional(),
    closure: z
      .object({
        /**
         * Xe khong co viec trong bao nhieu GIO thi he thong dong vong chay. Khong khai = khong
         * dong vi het gio. Tran 720 gio (30 ngay) la chan mot con so go nham, khong phai mot
         * gioi han nghiep vu.
         */
        idleHours: z.number().int().min(1).max(720).optional(),
      })
      .strict()
      .optional(),
    /**
     * NHIP CUA LUOT QUET DINH KY (`#293` R3) — hai so VAN HANH, khong phai hai nguong nghiep vu.
     *
     * Khac han `closure.idleHours`: khong con so nao o day quyet dinh mot vong chay CO duoc dong
     * hay khong. Chung chi quyet dinh *bao lau hoi lai mot lan* va *moi lan hoi bao nhieu vong
     * chay*, nen khach khong khai thi van co mot luot quet chay dung — va do la khac biet giua
     * "khong co cau hinh" va "khong co co che".
     *
     * Tran cua ca hai la chan mot con so go nham: mot luot quet moi 5 giay khong phai mot nhu cau
     * van hanh, va mot trang 10.000 vong chay khong con la mot trang.
     */
    sweep: z
      .object({
        /** Khoang cach giua hai luot quet, tinh bang GIAY. */
        intervalSeconds: z.number().int().min(5).max(3_600).optional(),
        /** So vong chay toi da moi luot quet. */
        batchSize: z.number().int().min(1).max(1_000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * Chinh sach cua `transport-costing`.
 *
 * Ca hai truong deu TUY CHON, cung ly le voi `transportCore`: bat mot khach van tai phai go mot
 * khoi rong chi de he thong khoi chet la mot yeu cau khong phuc vu ai.
 *
 * `expenseCategories` mac dinh RONG = khong gioi han. Mot danh muc do CHUNG TA nghi ra se bi doc
 * nhu la danh muc CUA KHACH ngay lan dau ai do mo giao dien ra xem — nen khong bia san.
 *
 * `advanceApprovalRequired` giu hinh dang cho `INV-10`/VT-085 (duyet tam ung hai buoc), nhung ban
 * demo T3 CHUA hien thuc trang thai cho duyet. Bat len se lam `tenantTransportCostingPolicy()` nem
 * ngay luc boot — im lang bo qua mot co duyet TIEN la kieu hong te nhat co the co o cho nay.
 */
const transportCostingPolicySchema = z
  .object({
    expenseCategories: z.array(nonEmpty).optional(),
    advanceApprovalRequired: z.boolean().optional(),
  })
  .strict();

/**
 * Chinh sach cua `transport-fuel` — `GD-07`, `GD-08`, va dinh muc tieu hao cua VT-046.
 *
 * BA NHOM, va ca ba deu la LUA CHON CUA KHACH chu khong phai luat cua mien:
 *
 *   · `matching`  — dung sai so khop (`GD-08`: tien +-1.000d, ngay +-1, xe khop tuyet doi);
 *   · `statement` — anh xa COT cua file bang ke (`GD-07`: moi cay xang mot mau file);
 *   · `consumption` — dinh muc L/100km theo HANG XE, khong theo tung xe va khong theo tung khach.
 *
 * TAT CA TUY CHON, cung ly le voi `transportCore`/`transportCosting`: bat mot khach van tai phai
 * go mot khoi rong chi de he thong khoi chet la mot yeu cau khong phuc vu ai. Mac dinh cua ca ba
 * nam trong `fuel-policy.ts` cua mien, khong nam o day — schema nay chi noi cai gi HOP LE.
 *
 * VI SAO `vehicleMatch` KHONG CO O DAY du `GD-08` goi ca ba la config: dung sai xe duy nhat ma ban
 * demo hien thuc la KHOP TUYET DOI (bien so). Khai mot cho de noi long no ma khong hien thuc gi
 * ben duoi la hua mot cai khoa khong ton tai — dung kieu hong ma `advanceApprovalRequired` cua T3
 * da chon fail-fast de tranh. Khi co duong khop mo (bien so viet tat, xe thue), day la mot truong
 * duoc THEM, khong phai mot cau truc phai doi.
 */
const transportFuelPolicySchema = z
  .object({
    matching: z
      .object({
        /** `GD-08` — chenh lech tien toi da van coi la khop. So nguyen DONG, khong am. */
        amountToleranceVnd: z.number().int().min(0).max(100_000_000).optional(),
        /** `GD-08` — lech ngay nghiep vu toi da (ca dem qua nua dem). */
        businessDateToleranceDays: z.number().int().min(0).max(31).optional(),
      })
      .strict()
      .optional(),
    /**
     * `GD-07` — TEN COT trong file bang ke cua cay xang. Khai o goi khach vi moi cay xang mot mau.
     *
     * Gia tri la ten cot DOC DUOC TRONG FILE (hang tieu de), khong phai ten truong cua mien: nguoi
     * cau hinh nhin vao file Excel cua ho, khong nhin vao schema cua chung ta.
     */
    statement: z
      .object({
        columns: z
          .object({
            vehiclePlate: nonEmpty.optional(),
            businessDate: nonEmpty.optional(),
            liters: nonEmpty.optional(),
            amount: nonEmpty.optional(),
            invoiceNo: nonEmpty.optional(),
            note: nonEmpty.optional(),
          })
          .strict()
          .optional(),
        /** Dang ngay trong file. `iso` = `YYYY-MM-DD`, `dmy` = `DD/MM/YYYY` (mau Viet Nam). */
        dateFormat: z.enum(['iso', 'dmy']).optional(),
      })
      .strict()
      .optional(),
    consumption: z
      .object({
        /** Dinh muc L/100km theo `vehicleClass`. Hang xe khong khai = khong co dinh muc de so. */
        normsByVehicleClass: z.record(nonEmpty, z.number().positive().max(1000)).optional(),
        /** Vuot dinh muc bao nhieu phan tram thi danh dau can kiem tra (VT-046). */
        tolerancePercent: z.number().min(0).max(500).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * Chinh sach cua `transport-asset-compliance` — `GD-18` (nguong canh bao het han).
 *
 * TUY CHON toan bo, cung ly le voi ba capability van tai truoc no. Mac dinh nam trong
 * `asset-compliance-policy.ts` cua mien, khong o day; schema nay chi noi cai gi HOP LE.
 *
 * `expiryWarningDaysByType` cho phep dat rieng theo loai giay to — `GD-18` ghi ro dieu do. Bao
 * hiem thuong can bao som hon dang kiem vi phai lam viec voi mot ben thu ba.
 */
const transportCompliancePolicySchema = z
  .object({
    expiryWarningDays: z.number().int().min(0).max(365).optional(),
    expiryWarningDaysByType: z.record(nonEmpty, z.number().int().min(0).max(365)).optional(),
    maintenance: z
      .object({
        dueSoonKm: z.number().int().min(0).max(1_000_000).optional(),
        dueSoonDays: z.number().int().min(0).max(365).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * Chinh sach cua `transport-workforce` — tham so luong (VT-060).
 *
 * NGUON KHACH CHI CHO CAU TRUC, KHONG CHO THAM SO: VT-060 mo ta "luong co ban + khoan theo
 * chuyen/km + thuong tiet kiem dau", va muc "Quy che luong lai xe hien hanh" nam trong danh sach
 * DU LIEU CON THIEU cua T0. Nen moi con so o day la MOT LUA CHON CUA KHACH phai duoc nhap, va
 * mac dinh cua mien la `0` — khong bia mot muc luong nao.
 *
 * DEMO: tham so ap CHUNG cho moi lai xe. Luong rieng tung nguoi la mot cot tren ho so lai xe, va
 * do la du lieu nhan su that — khong phai mot khoi cau hinh cua goi khach. Khi khach dua quy che
 * luong that, day la cho de DOI, khong phai cho de mo rong.
 *
 * KHONG CO truong nao cho khau tru tu dong. `GD-12` tat duong do, va mot o cau hinh de san se la
 * loi moi bat no len ma khong ai doc lai C-02.
 */
const transportPayrollPolicySchema = z
  .object({
    baseSalaryVnd: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    perTripVnd: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    perKmVnd: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    /** Thuong tiet kiem dau, dong tren moi lit duoi dinh muc. `0`/khong khai = tat. */
    fuelSavingBonusVndPerLiter: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();
const tollProviderMappingSchema = z
  .object({
    /**
     * TEN COT DOC DUOC TRONG TEP cua nha cung cap.
     *
     * KHONG co bo mac dinh nao — khac han `transportFuel`, va khac CO CHU DICH. Ten cot cua VETC va
     * ePass deu dang o muc `CUSTOMER SAMPLE REQUIRED`
     * (`docs/kien-truc/transport-etc-ingestion.md` §2.3), va #269 cam bia mot dinh dang ra. Chua
     * khai thi duong chay cua CHINH nha cung cap do tra `BLOCKED_SAMPLE_REQUIRED`.
     */
    columns: z
      .object({
        accountNo: nonEmpty.optional(),
        kind: nonEmpty.optional(),
        vehiclePlate: nonEmpty.optional(),
        passedAt: nonEmpty.optional(),
        businessDate: nonEmpty.optional(),
        amount: nonEmpty.optional(),
        station: nonEmpty.optional(),
        providerRef: nonEmpty.optional(),
      })
      .strict(),
    dateFormat: z.enum(['iso', 'dmy']).default('dmy'),
    /** CHU cua nha cung cap -> loai giao dich cua ta. Khong co trong bang = dong bi tu choi. */
    kinds: z
      .record(nonEmpty, z.enum(['TOLL_PASS', 'TOP_UP', 'ACCOUNT_FEE', 'ADJUSTMENT']))
      .default({}),
    /** Dung khi tep KHONG co cot loai. Suy ho nguoi khai la doan. */
    defaultKind: z
      .enum(['TOLL_PASS', 'TOP_UP', 'ACCOUNT_FEE', 'ADJUSTMENT'])
      .nullable()
      .default(null),
  })
  .strict();

/**
 * Chinh sach cua `transport-toll` — `TX-08` mo rong (#269).
 *
 * TUY CHON toan bo: mot khach bat ETC nhung chua co ban mau nao cua nha cung cap van boot duoc, va
 * duong chay cua tung nha cung cap bao `BLOCKED_SAMPLE_REQUIRED` rieng.
 */
const transportTollPolicySchema = z
  .object({
    providers: z
      .object({
        VETC: tollProviderMappingSchema.optional(),
        EPASS: tollProviderMappingSchema.optional(),
        OTHER: tollProviderMappingSchema.optional(),
      })
      .strict()
      .optional(),
    /** Chan mot tep nham, khong phai mot gioi han nghiep vu (#269 J9). */
    maxSourceBytes: z.number().int().min(1_000).max(64_000_000).optional(),
    maxRows: z.number().int().min(1).max(200_000).optional(),
  })
  .strict();

const tenantPoliciesSchema = z
  .object({
    salesOrder: salesOrderPolicySchema.optional(),
    campaign: campaignConfigSchema.optional(),
    transportCore: transportCorePolicySchema.optional(),
    transportPlanning: transportPlanningPolicySchema.optional(),
    transportCosting: transportCostingPolicySchema.optional(),
    transportFuel: transportFuelPolicySchema.optional(),
    transportCompliance: transportCompliancePolicySchema.optional(),
    transportPayroll: transportPayrollPolicySchema.optional(),
    transportToll: transportTollPolicySchema.optional(),
    readiness: tenantReadinessSchema,
  })
  .strict();

const tenantIntegrationsSchema = z
  .object({
    /** Runtime env chon mot adapter trong allowlist nay; API se fail-fast neu nam ngoai. */
    channel: channelIntegrationSchema.optional(),
    parser: parserIntegrationSchema.optional(),
    /** ERP la mot adapter active; `none` giu fail-closed cho GĐ1. */
    erp: erpConfigSchema.optional(),
    contentSource: contentSourceIntegrationSchema.optional(),
    /**
     * Workflow engine ben ngoai. TUY CHON co chu dich: khach khong khai bao thi nhan
     * `DisabledWorkflowEngineAdapter` va boot binh thuong — quan sat/nghiep vu khong phu thuoc
     * vao viec co engine hay khong. Xem `workflow-binding.schema.ts`.
     */
    workflowEngine: workflowEngineIntegrationSchema.optional(),
  })
  .strict();

const tenantPersonaSchema = z
  .object({
    messaging: z.object({ botName: nonEmpty, mentionName: nonEmpty }).strict().optional(),
    /** Loi mo dau prompt parser. Thuoc turn-processing: parser chay ca khi khach khong ban gi. */
    turnProcessing: z.object({ parserIntro: nonEmpty }).strict().optional(),
    knowledge: z.object({ productFallbackDescription: nonEmpty }).strict().optional(),
  })
  .strict();

const capabilityRequirements = {
  knowledge: { dependencies: [] },
  messaging: { dependencies: [], integration: 'channel', persona: 'messaging' },
  'turn-processing': {
    dependencies: ['knowledge', 'messaging'],
    integration: 'parser',
    persona: 'turnProcessing',
  },
  /**
   * `sales-order` la mot NGUOI DUNG cua turn-processing, khong phai chu cua no. Quan he phu
   * thuoc di dung mot chieu: ban hang can duong xu ly luot, duong xu ly luot khong can ban hang.
   */
  'sales-order': {
    dependencies: ['knowledge', 'messaging', 'turn-processing'],
    policy: 'salesOrder',
  },
  campaign: { dependencies: ['messaging'], policy: 'campaign' },
  operations: { dependencies: [] },
  notifications: { dependencies: ['messaging'] },
  /**
   * KHONG khai `policy: 'transportCore'`: khai nhu vay se bien mot khoi cau hinh HOAN TOAN TUY
   * CHON thanh dieu kien boot, va moi khach van tai phai go mot khoi rong chi de he thong khoi
   * chet. Mui gio co mac dinh dung cho khach Viet Nam; khong co gi de bat buoc.
   */
  'transport-core': { dependencies: [] },
  /**
   * KHONG khai `policy: 'transportCosting'`, cung ly le voi `transport-core`: khoi cau hinh do hoan
   * toan tuy chon, va khai o day se bien no thanh dieu kien boot.
   */
  'transport-costing': { dependencies: ['transport-core'] },
  /**
   * KHONG khai `policy: 'transportFuel'`, cung ly le voi hai capability van tai truoc no: khoi
   * cau hinh do hoan toan tuy chon (dung sai, anh xa cot va dinh muc deu co mac dinh dung duoc),
   * va khai o day se bien no thanh dieu kien boot cho moi khach van tai co phieu dau.
   *
   * `dependencies` co HAI phan tu, va do la khac biet dau tien trong cay van tai. Khai ca
   * `transport-core` du `transport-costing` da keo no theo: danh sach nay la mot HOP DONG doc
   * duoc, khong phai mot phep tinh toi gian. Ngay ai do doi chieu phu thuoc cua costing, phu thuoc
   * that cua fuel van con nguyen o day thay vi bien mat cung mot dong bi xoa.
   */
  'transport-fuel': { dependencies: ['transport-core', 'transport-costing'] },
  /**
   * KHONG khai `policy`, cung ly le voi ba capability van tai truoc no: dieu khoan thanh toan va
   * han muc tin dung la du lieu CUA TUNG KHACH HANG (bang `TransportCustomerTerms`), khong phai
   * mot khoi cau hinh cua goi khach — khai o day se bien no thanh dieu kien boot.
   *
   * BA phu thuoc, khai TUONG MINH du `transport-fuel` da keo hai cai kia theo: danh sach nay la
   * mot HOP DONG doc duoc, khong phai mot phep tinh toi gian. Ngay ai do doi phu thuoc cua fuel,
   * phu thuoc that cua settlement van con nguyen o day thay vi bien mat cung mot dong bi xoa.
   */
  'transport-settlement': {
    dependencies: ['transport-core', 'transport-costing', 'transport-fuel', 'transport-acceptance'],
  },
  /**
   * MOT phu thuoc, va do la khac biet lon nhat trong cay van tai.
   *
   * T1 §10.1 dat `transport-asset-compliance` canh `transport-core` chu khong noi tiep chuoi
   * costing -> fuel -> settlement: bao duong va giay to khong dinh gi den tien. Mot khach chi
   * muon theo doi han dang kiem se bat DUNG hai capability, va do la mot cau hinh phai chay duoc.
   *
   * KHONG khai `policy: 'transportCompliance'`, cung ly le voi bon capability van tai truoc no:
   * nguong canh bao co mac dinh dung duoc (`GD-18` = 30 ngay), nen khai o day se bien mot khoi
   * cau hinh hoan toan tuy chon thanh mot dieu kien boot.
   */
  'transport-asset-compliance': { dependencies: ['transport-core'] },
  /**
   * HAI phu thuoc, ca hai deu la quan he THAT:
   *
   *   · `transport-core`     — so chuyen va so km cua ky luong den tu `TX-02`;
   *   · `transport-costing`  — phieu luong HIEN THI so du quy lai xe (VT-062).
   *
   * Phu thuoc thu hai la cho de nham lan nhat trong ca cay nay, nen noi cho ro: no o day de
   * nguoi duyet NHIN THAY so du truoc khi quyet, KHONG phai de he thong tru vao luong. `GD-12`
   * tat duong do, va rang buoc `TransportPayslipComponent_deduction_manual_only` duoi Postgres
   * lam cho mot khoan tru tu dong KHONG GHI DUOC vao bang.
   *
   * `transport-fuel` CO Y khong nam trong danh sach du thuong tiet kiem dau can du lieu cua no.
   * Nguon do la TUY CHON: khong bat fuel thi khong co thanh phan thuong, va lan chay luong ghi
   * `FUEL_SAVING_UNAVAILABLE` vao `missingInputs` thay vi lang le tinh ra so khong. Bat fuel
   * thanh phu thuoc cung se bat mot khach chi tra luong co ban phai dung ca doi soat bang ke.
   */
  'transport-workforce': { dependencies: ['transport-core', 'transport-costing'] },
  /**
   * MOT phu thuoc. Bam vi tri can chuyen va lai xe (`transport-core`) va KHONG can gi khac: no
   * khong dong vao tien, khong dong vao phieu dau, khong dong vao luong.
   *
   * KHONG khai `policy`, cung ly le voi sau capability van tai truoc no: moi nguong cua no
   * (do chinh xac, nguong toc do, lech dong ho, so ngay giu du lieu) deu co mac dinh dung duoc,
   * nen khai o day se bien mot khoi hoan toan tuy chon thanh mot dieu kien boot.
   */
  'transport-proof': { dependencies: ['transport-core'] },
  /**
   * HAI phu thuoc, khac han `transport-proof` ngay tren — va cai thu hai la co y.
   *
   * `transport-core` thi hien nhien: moc gan vao `VehicleRun`/`RunLeg`.
   *
   * `transport-proof` thi khong hien nhien, nen ghi ro: `#243` F3 goi nut `Da den noi` la mot hanh
   * dong *"backed by accepted location proof"*, va `#241` goi ca khoi nay la mot
   * *"proof-bearing checkpoint timeline"*. Mot dong thoi gian khong chung minh duoc lan den noi
   * KHONG tra loi duoc cau hoi ma ca hai van ban dat ra — nen phu thuoc nay la mot phan cua dinh
   * nghia, khong phai mot tien nghi. Khai no o day bien dieu do thanh dieu kien boot thay vi mot
   * cot `null` phat hien ra sau ba thang.
   *
   * KHONG khai `policy`: moi mac dinh cua no (loai moc doi vi tri) deu dung duoc ngay cho ho so B,
   * nen khai se bien mot khoi tuy chon thanh mot dieu kien boot. Cung ly le voi `transport-proof`.
   */
  'transport-checkpoint': { dependencies: ['transport-core', 'transport-proof'] },
  /**
   * HAI phu thuoc, va ca hai deu that.
   *
   * `transport-core` thi hien nhien: dia diem la mot mat cua ho so phap nhan, va vong chay toi
   * thieu duoc tao qua chinh `MovementService` cua Lane A.
   *
   * `transport-proof` thi khong hien nhien, nen ghi ro: `#267` H2 doi *"geofence/distance is
   * deterministic"* va noi vi tri phai di qua ban dinh vi da duoc chap nhan khi ha tang co the
   * noi no. Bo phu thuoc nay thi khong con gi de DE NGHI — man hinh se hien danh sach toan bo kho
   * cua moi khach hang, va cau hoi *"Ban dang o Cong ty A?"* tro thanh mot o tim kiem.
   *
   * KHONG khai `policy`: ba nguong cua no (tran sai so, han tuoi ban dinh vi, so ung vien toi da)
   * deu co mac dinh dung duoc ngay cho ho so B — xem `transport-site-intake.module.ts`.
   */
  'transport-site-intake': { dependencies: ['transport-core', 'transport-proof'] },
  /**
   * MOT phu thuoc. Nap sao ke ETC can doi xe de noi bien so ve mot chiec xe, va khong can gi khac.
   *
   * KHONG khai `policy: 'transportToll'`, cung ly le voi ba capability van tai truoc no — va o day
   * co them mot ly do RIENG, manh hon.
   *
   * Khai `policy` lam khoi cau hinh do thanh BAT BUOC luc boot. Voi ETC dieu do sai han huong:
   * chinh cai chua co (bo cot cua nha cung cap) la thu ta chua duoc phep bia ra. Mot khach bat ETC
   * TRUOC khi xin duoc ban mau la trang thai BINH THUONG, va he thong phai boot duoc o do roi bao
   * `BLOCKED_SAMPLE_REQUIRED` RIENG cho tung nha cung cap — chu khong tu choi khoi dong.
   *
   * (Do duoc: khai `policy` o day lam `app.module.transport-toll.boot.spec.ts` do voi
   * *"transport-toll yeu cau policy transportToll"*, va se lam ca `tenants/transport-preview`
   * khong boot duoc.)
   */
  'transport-toll': { dependencies: ['transport-core'] },
  /**
   * MOT phu thuoc HOM NAY, va con so do la mot su that da do chu khong mot lua chon.
   *
   * `CommercialAcceptanceService` doc DUNG hai thu, ca hai deu thuoc `transport-core`: vong chay
   * (`MovementRepository`) va phap nhan (`CounterpartyRepository`). No KHONG doc moc van hanh —
   * `#243` F2 chua vao `main`, nen cong chung tu (`AcceptanceEvidenceFacts`) dang duoc buoc vao
   * mot adapter FAIL-CLOSED khong doc gi ca.
   *
   * Khai `transport-checkpoint` o day HOM NAY se bien mot phu thuoc CHUA CO THAT thanh mot dieu
   * kien boot — dung dieu ma bon khoi chu thich ben tren canh bao. Khi F2 hoan tat va adapter
   * chung tu duoc buoc that, dong nay them mot phan tu, va luc do no moi dung.
   */
  'transport-acceptance': { dependencies: ['transport-core'] },
} as const satisfies Record<
  z.infer<typeof capabilityIdSchema>,
  {
    dependencies: readonly z.infer<typeof capabilityIdSchema>[];
    integration?: keyof z.infer<typeof tenantIntegrationsSchema>;
    policy?: keyof z.infer<typeof tenantPoliciesSchema>;
    persona?: keyof z.infer<typeof tenantPersonaSchema>;
  }
>;

export const EXPERIENCE_REQUIREMENTS = {
  'operations-console': ['knowledge', 'messaging', 'turn-processing', 'sales-order', 'operations'],
  'knowledge-workspace': ['knowledge'],
  'agent-workforce': ['knowledge', 'operations'],
  'transport-operations': ['transport-core'],
  /**
   * CUNG bo yeu cau voi `operations-console`, va do la mot khang dinh chu khong phai mot phep sao
   * chep: hai be mat nhin cung MOT mien nghiep vu bang hai con mat khac nhau, nen chung phai doi
   * cung mot nen du lieu. Mot khach bat be mat ban hang ma tat `sales-order` se co mot thanh dieu
   * huong day muc khong bao gio co gi ben trong.
   *
   * `campaign` va `notifications` CO Y khong nam o day: cham soc/chien dich va canh bao la phan MO
   * RONG. Mot khach B2B chi chot don qua chat van dung duoc be mat nay — thanh dieu huong tu an
   * hai muc do di (`navigation.ts`), thay vi dan khach vao mot trang trong.
   */
  'b2b-sales-operations': [
    'knowledge',
    'messaging',
    'turn-processing',
    'sales-order',
    'operations',
  ],
} as const satisfies Record<
  z.infer<typeof experienceIdSchema>,
  readonly z.infer<typeof capabilityIdSchema>[]
>;

export const tenantConfigSchema = z
  .object({
    /** V2 la boundary pha vo co chu y; v1/unknown khong duoc silent migrate. */
    schemaVersion: z.literal(2),
    slug: z.string().regex(/^[a-z0-9-]+$/, 'slug: chi chu thuong, so va gach noi'),
    identity: z.object({ displayName: nonEmpty, shortName: nonEmpty }).strict(),
    branding: z
      .object({
        productName: nonEmpty,
        installName: nonEmpty,
        pageTitle: nonEmpty,
        pageDescription: nonEmpty,
        themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'themeColor: dang #rrggbb'),
        backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'backgroundColor: dang #rrggbb'),
        /** Tai nguyen logo cong khai duoc dong goi cung app; chi chap nhan duong dan tuyet doi an toan. */
        logoPath: z
          .string()
          .regex(
            /^\/[A-Za-z0-9][A-Za-z0-9._/-]*$/,
            'logoPath: phai la duong dan public bat dau bang /',
          )
          .refine(
            (path) => !path.split('/').some((segment) => segment === '..'),
            'logoPath: khong duoc chua thanh phan ..',
          )
          .optional(),
        monogram: z.string().min(1).max(3),
        composerPlaceholder: nonEmpty,
      })
      .strict(),
    experience: experienceIdSchema,
    capabilities: uniqueNonEmptyArray(capabilityIdSchema),
    policies: tenantPoliciesSchema,
    integrations: tenantIntegrationsSchema,
    persona: tenantPersonaSchema.default({}),
    bootstrap: tenantBootstrapSchema,
    smoke: smokeFixtureSchema.nullable().default(null),
  })
  .strict()
  .superRefine((config, ctx) => {
    const enabled = new Set(config.capabilities);

    for (const capability of config.capabilities) {
      const requirement = capabilityRequirements[capability];
      for (const dependency of requirement.dependencies) {
        if (!enabled.has(dependency)) {
          ctx.addIssue({
            code: 'custom',
            path: ['capabilities'],
            message: `${capability} yeu cau capability ${dependency}`,
          });
        }
      }
      if ('integration' in requirement && !config.integrations[requirement.integration]) {
        ctx.addIssue({
          code: 'custom',
          path: ['integrations', requirement.integration],
          message: `${capability} yeu cau integration ${requirement.integration}`,
        });
      }
      if ('policy' in requirement && !config.policies[requirement.policy]) {
        ctx.addIssue({
          code: 'custom',
          path: ['policies', requirement.policy],
          message: `${capability} yeu cau policy ${requirement.policy}`,
        });
      }
      if ('persona' in requirement && !config.persona[requirement.persona]) {
        ctx.addIssue({
          code: 'custom',
          path: ['persona', requirement.persona],
          message: `${capability} yeu cau persona ${requirement.persona}`,
        });
      }
    }

    if (enabled.has('knowledge') && !config.bootstrap.knowledge) {
      ctx.addIssue({
        code: 'custom',
        path: ['bootstrap', 'knowledge'],
        message: 'knowledge yeu cau bootstrap.knowledge',
      });
    }
    if (enabled.has('sales-order')) {
      if (!config.bootstrap.salesOrder) {
        ctx.addIssue({
          code: 'custom',
          path: ['bootstrap', 'salesOrder'],
          message: 'sales-order yeu cau bootstrap.salesOrder',
        });
      }
      if (!config.persona.knowledge) {
        ctx.addIssue({
          code: 'custom',
          path: ['persona', 'knowledge'],
          message: 'sales-order yeu cau persona knowledge',
        });
      }
    }

    /*
     * `handoffFollowup.enabled: true` = KHACH DOI MOT BAO DAM, khong phai "khach cho phep".
     *
     * Do la mot lua chon co y giua hai cach doc, va cach kia bi loai:
     *
     *   (A) policy chi CHO PHEP, binding moi bat thuc thi  -> bat `enabled` ma quen binding thi
     *       don van gui, khong ai theo doi, va he thong IM LANG. Dung che do hong ma ca khuon
     *       workflow nay sinh ra de xoa bo — nen no khong duoc phep la mac dinh cua mot loi go.
     *   (B) `enabled` la mot YEU CAU  -> thieu binding la CAU HINH TU MAU THUAN, va no phai hong
     *       to ngay luc boot.
     *
     * Chon (B). Cung khuon voi rang buoc da co o `workflowEngineIntegrationSchema`: "khai
     * adapter=none nhung van bat mot binding" cung bi tu choi vi cung mot ly do.
     *
     * Tat theo doi thi dat `enabled: false` (hoac bo han khoi goi khach) — ro rang va khong
     * mau thuan. `enabled: false` KHONG doi hoi binding nao.
     */
    if (config.policies.salesOrder?.handoffFollowup?.enabled) {
      const integration = config.integrations.workflowEngine;
      const bound = integration?.bindings.some(
        (binding) => binding.key === SALES_HANDOFF_FOLLOWUP_WORKFLOW && binding.enabled,
      );
      if (!bound) {
        ctx.addIssue({
          code: 'custom',
          path: ['policies', 'salesOrder', 'handoffFollowup', 'enabled'],
          message:
            `handoffFollowup.enabled=true doi mot rang buoc workflow dang bat cho ` +
            `'${SALES_HANDOFF_FOLLOWUP_WORKFLOW}' trong integrations.workflowEngine.bindings. ` +
            `Khong co no thi don van gui ma khong ai theo doi. Dat enabled=false neu khong muon ` +
            `theo doi.`,
        });
      }
    }

    for (const requiredCapability of EXPERIENCE_REQUIREMENTS[config.experience]) {
      if (!enabled.has(requiredCapability)) {
        ctx.addIssue({
          code: 'custom',
          path: ['experience'],
          message: `${config.experience} yeu cau capability ${requiredCapability}`,
        });
      }
    }
  });

export type TenantConfig = z.infer<typeof tenantConfigSchema>;
export type CapabilityId = z.infer<typeof capabilityIdSchema>;
export type ExperienceId = z.infer<typeof experienceIdSchema>;
export type TenantBootstrap = z.infer<typeof tenantBootstrapSchema>;
export type TenantIntegrations = z.infer<typeof tenantIntegrationsSchema>;
export type OrderAutomation = z.infer<typeof orderAutomationSchema>;
export type SalesHandoffFollowup = z.infer<typeof salesHandoffFollowupSchema>;
export type CampaignConfig = z.infer<typeof campaignConfigSchema>;
export type RetailAdvice = z.infer<typeof retailAdviceSchema>;
export type ErpConfig = z.infer<typeof erpConfigSchema>;
export type ErpAdapterName = z.infer<typeof erpAdapterSchema>;
export type TenantReadiness = z.infer<typeof tenantReadinessSchema>;
export type SmokeFixture = z.infer<typeof smokeFixtureSchema>;

/**
 * Hat giong nguon su that. Khop 1-1 voi interface `KnowledgeSnapshot` cua apps/api — ben do co
 * mot phep gan kiem kieu de hai hinh khong tro nhau luc nao khong biet.
 */
export const knowledgeSnapshotSchema = z.object({
  pricePeriod: z
    .object({
      validMonth: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .nullable(),
      status: z.enum(['draft', 'active', 'archived']),
      /**
       * NGUON GOC cua bieu gia — phai ghi khi `validMonth` KHONG trung thang in tren van ban goc
       * cua khach. Doi mot nhan thang tran, khong kem cau tra loi "can cu vao dau", la lam gia
       * bang gia: cong readiness `price.current_period` xanh len ma khong ai con lan duoc ve toi
       * to giay nao (CLAUDE.md quyet dinh #10).
       */
      note: z.string().min(1).max(500).optional(),
    })
    .strict()
    .nullable(),
  products: z.array(
    z.object({
      sku: nonEmpty,
      name: nonEmpty,
      aliases: z.array(z.string()),
      unit: nonEmpty,
      description: z.string().optional(),
    }),
  ),
  prices: z.array(
    z.object({
      sku: nonEmpty,
      wholesale: z.number(),
      listPrice: z.number().optional(),
      retailPrice: z.number().optional(),
      minRetailPrice: z.number().optional(),
    }),
  ),
  priceOverrides: z.array(
    z.object({
      dealerId: nonEmpty,
      sku: nonEmpty,
      price: z.number(),
      // Nguong so luong de deal co hieu luc; bo trong = ap moi so luong.
      minQuantity: z.number().int().positive().optional(),
    }),
  ),
  dealers: z.array(
    z.object({
      id: nonEmpty,
      name: nonEmpty,
      aliases: z.array(z.string()),
      tier: z.enum(DEALER_TIERS),
      defaultPolicy: z.enum(POLICY_TYPES),
    }),
  ),
  /**
   * Nhom duoc phep xu ly. `dealerId` la RANG BUOC CUA SALES-ORDER, khong phai cua nhom: mot khach
   * khong ban hang van co nhom can doc, va Prisma da cho `dealerId` null tu truoc (nhom `pending`).
   */
  groups: z.array(
    z.object({
      chatId: nonEmpty,
      dealerId: nonEmpty.optional(),
      branch: z.string(),
      name: z.string(),
    }),
  ),
  glossary: z.array(z.object({ term: nonEmpty, meaning: nonEmpty })),
});

/**
 * Knowledge-only tenant khong phai khai bao gia/dai ly/group cua sales-order. Loader se chuyen
 * boundary nay ve `TenantKnowledge` day du bang cac mang sales rong de consumer chung khong phai
 * re nhanh theo tenant.
 */
export const knowledgeOnlySnapshotSchema = z
  .object({
    products: z
      .array(
        z.object({
          sku: nonEmpty,
          name: nonEmpty,
          aliases: z.array(z.string()),
          unit: nonEmpty,
          description: z.string().optional(),
        }),
      )
      .default([]),
    glossary: z.array(z.object({ term: nonEmpty, meaning: nonEmpty })).default([]),
    /** Danh sach nhom duoc phep dua noi dung sang LLM — cong PII, khong phai map dai ly. */
    groups: z
      .array(z.object({ chatId: nonEmpty, name: z.string(), branch: z.string().default('') }))
      .default([]),
  })
  .strict();

export type TenantKnowledge = z.infer<typeof knowledgeSnapshotSchema>;

/**
 * Noi dung tu van cua khach (FAQ / bai tu van / link video-catalog / media) dong goi kem goi khach.
 * Dung LAI schema import cua nhan (`contentImportManifestSchema`) chu khong dinh nghia schema thu
 * hai: goi khach va man hinh `/settings` phai di qua CUNG mot cong kiem, neu khong thi du lieu hop
 * le o duong nay lai hong o duong kia.
 *
 * File nay TUY CHON — khach chua co noi dung thi khong co file, va agent tu van fail-closed
 * (`ContentService.productAdvice()` tra handoff) chu khong bia cau tra loi.
 */
export const tenantContentManifestSchema = contentImportManifestSchema;
export type TenantContentManifest = ContentImportManifest;

/** Tin nhan mau cho luong demo (`/demo/simulate`) — la vi du dat hang cua chinh khach. */
export const demoMessagesSchema = z.array(nonEmpty).min(1);
export type DemoMessages = z.infer<typeof demoMessagesSchema>;
