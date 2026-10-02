import type { PrismaClient } from '@prisma/client';
import { normalizePlaceLabel } from '../dispatch/place-resolution.js';
import { loadDemoMonthDataset } from './demo-dataset.js';
import { assertTransportDemoTenant } from './demo-guard.js';
import { DEMO_SEED_ACTOR } from './demo-seed.js';

/**
 * DIEM DIA DIEM MAU cho man tao don (#379) — bai xe + hai dia diem cua hai phap nhan.
 *
 * ---------------------------------------------------------------------------
 * VI SAO CAN: man tao don moi doi TOA DO cho diem lay/giao, va "dia diem da biet" doc tu hang rao
 * (`TransportGeofence`). Ban xem truoc chua co hang rao nao, nen danh sach do rong va buoi trinh
 * dien phai bam tay len ban do cho moi don. Ba diem nay la "cho ta hay lay/giao hang" cua bo du
 * lieu mau — va la mau cho nguoi van hanh thay mot hang rao nhin ra sao.
 *
 * ---------------------------------------------------------------------------
 * TOA DO TONG HOP, KHONG PHAI TOA DO KHAO SAT.
 *
 * Ba diem gan dung vung (Thanh Tri/Ha Noi, KCN Dinh Vu, Phu Luong/Thai Nguyen) nhung KHONG ai do
 * tai hien truong. Moi dong mang `note` noi dung dieu do, va nguoi ghi la `demo-seed` — mot ban
 * ghi nhat ky kiem toan khong duoc de ai tuong day la mot lan khao sat that.
 *
 * ---------------------------------------------------------------------------
 * MOI DIEM GIEO TOI DA MOT LAN — VI RAILWAY CHAY HAM NAY O MOI LAN KHOI DONG.
 *
 * Lenh reset khong xoa hang rao, phap nhan hay dia diem (`TRANSPORT_TABLES_CHILD_FIRST`), va stack
 * xem truoc goi ham nay truoc moi lan api len. Nen dau vet "da gieo" la chinh HANG RAO cua may gieo
 * (`recordedBy = demo-seed` + nhan cua diem, MOI trang thai): con no thi diem do bo qua TRON VEN,
 * khong tim-hoac-tao lai phap nhan hay dia diem. Nho vay nguoi van hanh doi ten dia diem, doi ma so
 * thue phap nhan, hay nghi hang rao — lan khoi dong sau khong de lai mot ban sao nao.
 *
 * `#395`: Giam doc doi ten mot dia diem van hanh thi nhan hang rao VA ten dia diem doi CUNG luc — dau
 * vet theo nhan mat. Nen diem dia diem con mot dau vet ON DINH: phap nhan cua khach mau (tim theo ma
 * so thue / ten nhu cu) da co mot dia diem mang hang rao cua may gieo (MOI trang thai) -> da gieo.
 * Bai xe: co BAT KY hang rao `DEPOT` nao (moi trang thai) -> bai xe da duoc quan ly o man "Dia diem
 * van hanh", may gieo khong them bai thu hai (`DEPOT_ALREADY_MANAGED`). Hai chi muc cua DB
 * (toi da mot bai dang bat, ma bai khong trung) chan them mot lan nua neu hai ben ghi chong nhau: lan
 * thu lai doc thay bai vua ghi va bo qua.
 *
 * ---------------------------------------------------------------------------
 * KHONG BAO GIO TAO MOT NHAN MO HO.
 *
 * Giai diem theo nhan (`resolvePlaceByLabel`) tra `PICKUP_LABEL_AMBIGUOUS` khi hai hang rao DANG
 * HOAT DONG trung nhan sau chuan hoa. Mot hang rao nguoi van hanh da dat ten "Bai xe Ha Noi" ma may
 * gieo them mot cai nua se lam CA HAI khong giai duoc. Nen trung nhan -> bo qua, co ly do.
 *
 * ---------------------------------------------------------------------------
 * KHONG TAO LIEN KET KHACH.
 *
 * Ban truoc gan phap nhan voi khach mau cung ma so thue va "sua" lien ket mo coi sau moi lan reset;
 * no tao lai dung lien ket ma nguoi van hanh da go. Man tao don khong can lien ket do, nen may gieo
 * khong cham toi bang lien ket nua.
 *
 * ---------------------------------------------------------------------------
 * HAI LAN CHAY SONG SONG KHONG DE LAI BAN SAO.
 *
 * Moi diem tim-hoac-tao trong MOT giao dich `Serializable`. Hai lan khoi dong chong nhau thi mot ben
 * commit, ben kia nhan loi xung dot (P2034, hoac P2002 tren ma so thue) va chay lai toi da
 * `MAX_MARKER_ATTEMPTS` lan, cach nhau mot quang co do lech — lan doc sau thay hang rao ben kia vua
 * ghi va bo qua. Loi con lai sau lan cuoi thi nem: nguoi goi (script gieo) ghi log va de api khoi dong
 * tiep, vi diem mau la tien ich trinh dien.
 *
 * Chi Prisma, khong SQL tho — cung rang buoc #196 voi `demo-seed.ts`: moi dong di qua CHECK cua
 * bang nhu mot dong san pham tao ra.
 *
 * ---------------------------------------------------------------------------
 * NHAN KHONG MANG CHU "mau/xem truoc/demo": nhan hien tren be mat khach, va cong quet chinh sach be
 * mat cam cac tu do. Dieu "day la du lieu mau" nam o `note` va `recordedBy`, khong o nhan.
 */

export const SYNTHETIC_POINT_NOTE = 'toa do tong hop cho du lieu mau, khong phai toa do khao sat';

/** Phap nhan khong co toa do — ghi chu cua no chi noi hang nay tu dau ra. */
export const DEMO_COUNTERPARTY_NOTE = 'tao boi may gieo du lieu mau kem diem dia diem mau';

interface DemoPoint {
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMetres: number;
}

/**
 * Bai xe cua doi xe mau. Tu `#395` hang rao nay LA bai xe cua khau lap ke hoach (danh ba bai xe doc
 * hang rao `DEPOT`; goi xem truoc khong con khai `transportPlanning.depots`): chang RONG do he thong
 * len ke hoach mang dung nhan nay, va dong vong chay so dung nhan nay. Ma `DEPOT-HN` giu nguyen ma
 * cua cau hinh cu, nen lich su chang rong cu van cung mot danh tinh.
 */
export const DEMO_DEPOT_MARKER = {
  subjectId: 'DEPOT-HN',
  label: 'Bãi xe Hà Nội',
  point: { latitude: 20.9652, longitude: 105.8468, radiusMetres: 250 },
} as const satisfies { subjectId: string; label: string; point: DemoPoint };

export interface DemoSiteMarker {
  /** Ma khach trong `demo-month.json` — ten, ma so thue, dia chi lay tu DO, khong chep lai o day. */
  readonly customerRef: string;
  readonly siteName: string;
  readonly point: DemoPoint;
}

export const DEMO_SITE_MARKERS: readonly DemoSiteMarker[] = [
  {
    customerRef: 'KH02',
    siteName: 'Nhà máy thép Đình Vũ',
    point: { latitude: 20.8264, longitude: 106.7752, radiusMetres: 300 },
  },
  {
    customerRef: 'KH03',
    siteName: 'Kho Nhựa Tân Phú Hưng',
    point: { latitude: 21.617, longitude: 105.817, radiusMetres: 250 },
  },
];

/** Nhung bang ham nay cham toi TRONG mot giao dich. Khong bang khach, khong bang lien ket. */
export type DemoPlacesTx = Pick<
  PrismaClient,
  'transportCounterparty' | 'transportCounterpartySite' | 'transportGeofence'
>;

export interface DemoPlacesTransactionOptions {
  readonly isolationLevel: 'Serializable';
  readonly maxWait: number;
  readonly timeout: number;
}

/** Cua vao cua ham: chi can mo giao dich — de bai kiem don vi truyen mot Prisma gia nho. */
export interface DemoPlacesPrisma {
  $transaction<R>(
    work: (tx: DemoPlacesTx) => Promise<R>,
    options: DemoPlacesTransactionOptions,
  ): Promise<R>;
}

/** Ly do mot diem KHONG duoc tao — moi duong bo qua mot ma rieng. */
export type DemoPlaceSkipReason =
  /** Hang rao cua may gieo voi nhan nay da co (moi trang thai): diem da gieo, khong gieo lai. */
  | 'MARKER_ALREADY_SEEDED'
  /** Bai xe da co hang rao (co the do nguoi van hanh khai, ke ca da nghi) — giu nguyen. */
  | 'DEPOT_ALREADY_FENCED'
  /**
   * Da co MOT hang rao `DEPOT` khac (moi trang thai) — bai xe dang duoc quan ly o man "Dia diem van
   * hanh"; them bai mau se la bai thu hai (`#395`).
   */
  | 'DEPOT_ALREADY_MANAGED'
  /** Dia diem tim thay da co hang rao cua no — khong them cai thu hai. */
  | 'SITE_ALREADY_FENCED'
  /** Mot hang rao DANG HOAT DONG trung nhan sau chuan hoa — them nua la tao nhan mo ho. */
  | 'LABEL_TAKEN_BY_ACTIVE_GEOFENCE'
  /** Bo du lieu mau khong con khach nay — khong co ten phap nhan de gan dia diem, khong bia. */
  | 'CUSTOMER_MISSING_FROM_DATASET';

export interface DemoPlaceSkip {
  readonly label: string;
  readonly reason: DemoPlaceSkipReason;
}

export interface DemoPlacesCreated {
  readonly counterparty: number;
  readonly counterpartySite: number;
  readonly geofence: number;
}

export interface DemoPlacesResult {
  readonly created: DemoPlacesCreated;
  readonly skipped: readonly DemoPlaceSkip[];
}

/** Ket qua cua MOT diem — chi co that khi giao dich cua no da commit. */
interface MarkerOutcome {
  readonly created: DemoPlacesCreated;
  readonly skipped: DemoPlaceSkip | null;
}

interface DemoCustomerFacts {
  readonly name: string;
  readonly taxCode: string | null;
  readonly address: string;
}

type MarkerPlan =
  | {
      readonly kind: 'DEPOT';
      readonly label: string;
      readonly subjectId: string;
      readonly point: DemoPoint;
    }
  | {
      readonly kind: 'SITE';
      readonly label: string;
      readonly point: DemoPoint;
      readonly customer: DemoCustomerFacts;
    };

/** Nhieu hon thoi gian mac dinh cua Prisma (2 s / 5 s): lan khoi dong dau tren DB lanh doc cham. */
const TRANSACTION_OPTIONS: DemoPlacesTransactionOptions = {
  isolationLevel: 'Serializable',
  maxWait: 10_000,
  timeout: 20_000,
};

const NOTHING_CREATED: DemoPlacesCreated = { counterparty: 0, counterpartySite: 0, geofence: 0 };

export async function backfillDemoPlaceMarkers(
  prisma: DemoPlacesPrisma,
): Promise<DemoPlacesResult> {
  assertTransportDemoTenant('gieo diem dia diem mau');

  const customers = new Map(
    loadDemoMonthDataset().customers.map((customer) => [customer.ref, customer]),
  );
  const outcomes: MarkerOutcome[] = [];
  outcomes.push(
    await seedMarkerOnce(prisma, {
      kind: 'DEPOT',
      label: DEMO_DEPOT_MARKER.label,
      subjectId: DEMO_DEPOT_MARKER.subjectId,
      point: DEMO_DEPOT_MARKER.point,
    }),
  );
  for (const marker of DEMO_SITE_MARKERS) {
    const customer = customers.get(marker.customerRef);
    outcomes.push(
      customer === undefined
        ? skip(marker.siteName, 'CUSTOMER_MISSING_FROM_DATASET')
        : await seedMarkerOnce(prisma, {
            kind: 'SITE',
            label: marker.siteName,
            point: marker.point,
            customer,
          }),
    );
  }
  return summarise(outcomes);
}

/**
 * Tieu chi TIM phap nhan cua mot khach mau: theo ma so thue (cot duy nhat) khi co, khong thi theo
 * DUNG ten. Tach ra de bai kiem khoa duoc nhanh "khong ma so thue" ma bo du lieu hom nay khong co.
 */
export function counterpartyLookup(
  customer: Pick<DemoCustomerFacts, 'name' | 'taxCode'>,
):
  | { readonly by: 'taxCode'; readonly taxCode: string }
  | { readonly by: 'name'; readonly name: string } {
  const taxCode = customer.taxCode?.trim() ?? '';
  return taxCode === '' ? { by: 'name', name: customer.name } : { by: 'taxCode', taxCode };
}

/**
 * Toi da bao nhieu LAN CHAY cho mot diem khi va voi mot lan chay song song.
 *
 * MOT lan thu lai la KHONG DU (do 24/09 tren CI exact-main): moi giao dich doc CA bang hang rao (kiem
 * nhan trung), nen lan thu lai cua diem 1 ben B co the va tiep voi giao dich diem 2 dang ghi cua ben
 * A. Vai lan thu, cach nhau mot quang ngan co do lech, cho ben kia di qua; sau do lan doc thay hang rao
 * da commit va dung lai bang `MARKER_ALREADY_SEEDED`.
 */
const MAX_MARKER_ATTEMPTS = 6;
const RETRY_BACKOFF_MS = 40;

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Chay mot diem trong giao dich `Serializable`, THU LAI co gioi han khi va voi mot lan chay song song.
 * Lan thu sau doc trang thai DA COMMIT, nen thuong ket thuc bang `MARKER_ALREADY_SEEDED`. Loi khong
 * phai xung dot, hoac xung dot van con sau lan cuoi, thi nem cho script gieo ghi log.
 */
async function seedMarkerOnce(prisma: DemoPlacesPrisma, plan: MarkerPlan): Promise<MarkerOutcome> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction((tx) => seedMarker(tx, plan), TRANSACTION_OPTIONS);
    } catch (error) {
      if (!isConcurrentWriteConflict(error) || attempt >= MAX_MARKER_ATTEMPTS) throw error;
      /* Do lech ngau nhien: hai ben cung lui mot quang bang nhau se lai dung nhau lan nua. */
      await pause(RETRY_BACKOFF_MS * attempt + Math.floor(Math.random() * RETRY_BACKOFF_MS));
    }
  }
}

async function seedMarker(tx: DemoPlacesTx, plan: MarkerPlan): Promise<MarkerOutcome> {
  const seeded = await tx.transportGeofence.findFirst({
    where: { recordedBy: DEMO_SEED_ACTOR, label: plan.label },
    select: { id: true },
  });
  if (seeded) return skip(plan.label, 'MARKER_ALREADY_SEEDED');

  if (plan.kind === 'DEPOT') {
    const fenced = await tx.transportGeofence.findFirst({
      where: { subjectKind: 'DEPOT', subjectId: plan.subjectId },
      select: { id: true },
    });
    if (fenced) return skip(plan.label, 'DEPOT_ALREADY_FENCED');
    const managed = await tx.transportGeofence.findFirst({
      where: { subjectKind: 'DEPOT' },
      select: { id: true },
    });
    if (managed) return skip(plan.label, 'DEPOT_ALREADY_MANAGED');
  }

  if (await labelTakenByActiveFence(tx, plan.label)) {
    return skip(plan.label, 'LABEL_TAKEN_BY_ACTIVE_GEOFENCE');
  }

  if (plan.kind === 'DEPOT') {
    await tx.transportGeofence.create({
      data: fenceData('DEPOT', plan.subjectId, plan.label, plan.point),
    });
    return { created: { ...NOTHING_CREATED, geofence: 1 }, skipped: null };
  }
  return seedSiteMarker(tx, plan);
}

/** Phap nhan -> dia diem -> hang rao; moi buoc tim truoc roi moi tao. */
async function seedSiteMarker(
  tx: DemoPlacesTx,
  plan: Extract<MarkerPlan, { kind: 'SITE' }>,
): Promise<MarkerOutcome> {
  const lookup = counterpartyLookup(plan.customer);
  const foundParty =
    lookup.by === 'taxCode'
      ? await tx.transportCounterparty.findUnique({
          where: { taxCode: lookup.taxCode },
          select: { id: true },
        })
      : await tx.transportCounterparty.findFirst({
          where: { name: lookup.name },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
  if (foundParty && (await hasSeededSite(tx, foundParty.id))) {
    return skip(plan.label, 'MARKER_ALREADY_SEEDED');
  }
  const party =
    foundParty ??
    (await tx.transportCounterparty.create({
      data: {
        name: plan.customer.name,
        taxCode: lookup.by === 'taxCode' ? lookup.taxCode : null,
        note: DEMO_COUNTERPARTY_NOTE,
      },
      select: { id: true },
    }));

  const foundSite = await tx.transportCounterpartySite.findUnique({
    where: { counterpartyId_name: { counterpartyId: party.id, name: plan.label } },
    select: { id: true },
  });
  const site =
    foundSite ??
    (await tx.transportCounterpartySite.create({
      data: {
        counterpartyId: party.id,
        name: plan.label,
        address: plan.customer.address,
        note: SYNTHETIC_POINT_NOTE,
        recordedBy: DEMO_SEED_ACTOR,
      },
      select: { id: true },
    }));

  const created: DemoPlacesCreated = {
    counterparty: foundParty ? 0 : 1,
    counterpartySite: foundSite ? 0 : 1,
    geofence: 0,
  };
  const siteFence = await tx.transportGeofence.findFirst({
    where: { subjectKind: 'COUNTERPARTY_SITE', subjectId: site.id },
    select: { id: true },
  });
  if (siteFence) return { created, skipped: { label: plan.label, reason: 'SITE_ALREADY_FENCED' } };

  await tx.transportGeofence.create({
    data: fenceData('COUNTERPARTY_SITE', site.id, plan.label, plan.point),
  });
  return { created: { ...created, geofence: 1 }, skipped: null };
}

/**
 * DAU VET ON DINH cua mot diem dia diem (`#395`): phap nhan nay da co mot dia diem mang hang rao cua
 * may gieo (moi trang thai). Khong doc nhan hay ten — Giam doc doi ca hai o man "Dia diem van hanh",
 * va may gieo khong duoc "sua lai" lan doi ten do bang mot ban sao mang ten cu.
 */
async function hasSeededSite(tx: DemoPlacesTx, counterpartyId: string): Promise<boolean> {
  const sites = await tx.transportCounterpartySite.findMany({
    where: { counterpartyId },
    select: { id: true },
  });
  if (sites.length === 0) return false;
  const fence = await tx.transportGeofence.findFirst({
    where: {
      recordedBy: DEMO_SEED_ACTOR,
      subjectKind: 'COUNTERPARTY_SITE',
      subjectId: { in: sites.map((site) => site.id) },
    },
    select: { id: true },
  });
  return fence !== null;
}

/**
 * Doc MOI nhan hang rao dang hoat dong roi so sau chuan hoa — cung ham chuan hoa ma giai theo nhan
 * dung, nen "trung" o day nghia dung la "se thanh mo ho" o do. So hang rao cua mot khach la vai
 * chuc, khong phai mot bang lon.
 */
async function labelTakenByActiveFence(tx: DemoPlacesTx, label: string): Promise<boolean> {
  const key = normalizePlaceLabel(label);
  const active = await tx.transportGeofence.findMany({
    where: { status: 'ACTIVE' },
    select: { label: true },
  });
  return active.some((fence) => normalizePlaceLabel(fence.label) === key);
}

/**
 * Loi cua mot lan chay SONG SONG, dang thu lai: P2034 (Prisma: xung dot ghi / tuan tu hoa), P2002
 * (unique — vd ma so thue phap nhan vua duoc ben kia tao), hoac ma Postgres 40001 khi Prisma khong
 * dich duoc no sang ma rieng.
 */
function isConcurrentWriteConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { readonly code?: unknown }).code;
  if (code === 'P2034' || code === 'P2002') return true;
  const message = (error as { readonly message?: unknown }).message;
  return (
    typeof message === 'string' &&
    (message.includes('40001') || message.includes('could not serialize access'))
  );
}

function skip(label: string, reason: DemoPlaceSkipReason): MarkerOutcome {
  return { created: NOTHING_CREATED, skipped: { label, reason } };
}

function summarise(outcomes: readonly MarkerOutcome[]): DemoPlacesResult {
  return {
    created: outcomes.reduce<DemoPlacesCreated>(
      (total, outcome) => ({
        counterparty: total.counterparty + outcome.created.counterparty,
        counterpartySite: total.counterpartySite + outcome.created.counterpartySite,
        geofence: total.geofence + outcome.created.geofence,
      }),
      NOTHING_CREATED,
    ),
    skipped: outcomes.flatMap((outcome) => (outcome.skipped === null ? [] : [outcome.skipped])),
  };
}

function fenceData(
  subjectKind: 'DEPOT' | 'COUNTERPARTY_SITE',
  subjectId: string,
  label: string,
  point: DemoPoint,
) {
  return {
    label,
    subjectKind,
    subjectId,
    latitude: point.latitude,
    longitude: point.longitude,
    radiusMetres: point.radiusMetres,
    note: SYNTHETIC_POINT_NOTE,
    recordedBy: DEMO_SEED_ACTOR,
  };
}
