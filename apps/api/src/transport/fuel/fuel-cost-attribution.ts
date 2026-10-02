import type { BusinessDate } from '../business-date.js';
import type { FuelVerificationStatus } from './fuel-lifecycle.js';

/**
 * PHAN BO GIA THANH NHIEN LIEU — `#364`, LOP RIENG khoi su that "xe vua do dau".
 *
 * ===========================================================================
 * HAI SU THAT, HAI BANG, HAI CAU HOI
 *
 * ```text
 * TransportFuelEntry            "xe A do 100 L luc 11:30"             su that van hanh (tai xe/ke toan)
 * TransportFuelCostAttribution  "2.100.000 d nay thuoc cong viec nao"  quyet dinh ke toan, co nguoi ky
 * ```
 *
 * Ngu canh van hanh cua phieu (`runId`/`legId`) KHONG phai phan bo: `runId = X` khong co nghia toan
 * bo tien la gia thanh cua X (`OWNER_DECISIONS_2026_09_22`). Dau do trong vong chay X co the chay
 * het o vong chay ke tiep; mot phieu co the chia cho hai chang. Nen phan bo la mot lan GHI RIENG, co
 * nguoi, co ly do, co khoa chong ghi trung — va mot phieu co the co NHIEU dong.
 *
 * ===========================================================================
 * QUY TAC "NGUON NAO CONG VAO BAO CAO NAO" — MOT PHIEU, MOT SO CAI
 *
 * ```text
 * phieu co tripId (chuyen v1)   -> so cai = TransportTripExpense (TX-03), noi bang costExpenseId
 *                                  LEGACY_TRIP. Bang phan bo KHONG co dong nao (trigger chan).
 * phieu khong tripId (Run-first) -> so cai = TransportFuelCostAttribution (RUN / LEG).
 *                                  TX-03 KHONG co dong nao (FuelService.postFuelCost bo qua; va
 *                                  TransportTripExpense.tripId NOT NULL).
 * ```
 *
 * Hai so cai KHONG GIAO NHAU theo cau truc, nen:
 *
 *   · bao cao gia thanh CHUYEN (TX-03, bien loi nhuan chuyen) doc `TransportTripExpense` — nhu
 *     truoc, khong doi mot dong;
 *   · tong hop tai chinh / hieu qua (`#385`, `finance/company-margin.ts`) cong CA HAI: chuyen cu qua
 *     TX-03, don Run-first qua bang nay (doc bang `runMargin`) — moi phieu vao dung mot dong;
 *   · bao cao phan bo VONG CHAY/CHANG doc `TransportFuelCostAttribution` (`FuelCostAttributionReadService`);
 *   · KHONG bao cao nao cong ca hai cho CUNG MOT phieu — va khong the, vi mot phieu chi co mat o
 *     mot ben. Mot bao cao tuong lai muon gop (vd bien loi nhuan vong chay) cong duoc hai ben ma
 *     khong dem trung, chinh vi hai tap phieu roi nhau.
 *   · Cong no nha cung cap (`FUEL_SUPPLIER`) di tu doi soat bang ke — khong doc bang nao o tren.
 *   · Quy lai xe la mot so cai THU BA, khong phai gia thanh: phieu chuyen v1 `DRIVER_CASH` co chan
 *     quy qua `TX-03`, phieu Run-first `DRIVER_CASH` co but toan `RUN_EXPENSE` rieng (`#369` R-4).
 *     Ca hai deu KHONG vao bang nay, va bang nay khong tru quy cua ai.
 *
 * LEGACY_TRIP vi vay la mot kieu dich CO THAT trong khung nhin (`FuelCostLedger`), nhung KHONG phai
 * mot gia tri cua bang phan bo: chep no vao day se sinh mot nguon su that thu hai, va nguon do lech
 * ngay lan dau ke toan dao khoan chi o `TX-03` (duong sua phieu da tin cua `GD-10`).
 */

export const FUEL_COST_TARGET_KINDS = ['RUN', 'LEG'] as const;
export type FuelCostTargetKind = (typeof FUEL_COST_TARGET_KINDS)[number];

export const FUEL_COST_ATTRIBUTION_KINDS = ['ALLOCATION', 'REVERSAL'] as const;
export type FuelCostAttributionKind = (typeof FUEL_COST_ATTRIBUTION_KINDS)[number];

/** Mot dong cua bang phan bo — CHI GHI THEM. */
export interface FuelCostAttribution {
  readonly id: string;
  readonly fuelEntryId: string;
  readonly kind: FuelCostAttributionKind;
  readonly targetKind: FuelCostTargetKind;
  /** Vong chay dich — co ca voi dich `LEG` (vong chay cua chang), de bao cao vong chay cong thang. */
  readonly runId: string;
  readonly legId: string | null;
  /** SO NGUYEN DONG, co dau: cap phat duong, dao am. */
  readonly signedAmount: number;
  readonly currencyCode: string;
  readonly reversalOfId: string | null;
  readonly correlationKey: string;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly createdAt: string;
}

/** Dich cua mot lan cap phat, o dang nguoi goi noi — chang thi chua biet vong chay cua no. */
export type FuelCostAttributionTarget =
  | { readonly kind: 'RUN'; readonly runId: string }
  | { readonly kind: 'LEG'; readonly legId: string };

/** Tong DANG HIEU LUC — cong thang cot co dau, dong dao tu tru di cap phat ma no dao. */
export const attributedTotal = (
  rows: readonly Pick<FuelCostAttribution, 'signedAmount'>[],
): number => rows.reduce((total, row) => total + row.signedAmount, 0);

/**
 * CAP PHAT MOI co duoc phep khong — ham THUAN, chay tren trang thai DOC TU HANG PHIEU DA KHOA.
 *
 * Ba ly do tu choi, ba viec khac nhau nguoi dung phai lam: phieu gan chuyen v1 (khong co gi de lam
 * — gia thanh da o chuyen), phieu chua duyet (cho duyet), va vuot so tien (giam so tien hoac dao
 * mot dong cu truoc). Cung mot ham cho kho trong bo nho va kho Prisma: hai kho, mot luat.
 */
export type FuelCostAllocationDeniedReason =
  | 'FUEL_COST_ATTRIBUTION_LEGACY_TRIP_PROJECTED'
  | 'FUEL_COST_ATTRIBUTION_ENTRY_NOT_VERIFIED'
  | 'FUEL_COST_ATTRIBUTION_EXCEEDS_ENTRY';

export type FuelCostAllocationDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: FuelCostAllocationDeniedReason };

export function evaluateFuelCostAllocation(input: {
  readonly entry: {
    readonly tripId: string | null;
    readonly verificationStatus: FuelVerificationStatus;
    readonly amount: number;
  };
  /** Tong dang hieu luc TRUOC lan ghi nay, doc duoi khoa. */
  readonly attributedSoFar: number;
  /** So tien cap phat — duong. */
  readonly amount: number;
}): FuelCostAllocationDecision {
  if (input.entry.tripId !== null) {
    return { allowed: false, reason: 'FUEL_COST_ATTRIBUTION_LEGACY_TRIP_PROJECTED' };
  }
  if (input.entry.verificationStatus !== 'VERIFIED') {
    return { allowed: false, reason: 'FUEL_COST_ATTRIBUTION_ENTRY_NOT_VERIFIED' };
  }
  if (input.amount <= 0 || input.attributedSoFar + input.amount > input.entry.amount) {
    return { allowed: false, reason: 'FUEL_COST_ATTRIBUTION_EXCEEDS_ENTRY' };
  }
  return { allowed: true };
}

/**
 * DANH TINH cua mot lan cap phat — de phan biet GUI LAI voi DUNG LAI KHOA (cung khuon voi
 * `fuelEntryIdentityOf`). Ghi chu KHONG nam trong danh tinh: sua mot chu trong ghi chu roi gui
 * lai van la lan gui lai cua CUNG mot quyet dinh tien.
 */
export interface FuelCostAllocationIdentity {
  readonly fuelEntryId: string;
  readonly targetKind: FuelCostTargetKind;
  readonly runId: string;
  readonly legId: string | null;
  readonly amount: number;
}

export const allocationIdentityOf = (
  row: Pick<
    FuelCostAttribution,
    'fuelEntryId' | 'targetKind' | 'runId' | 'legId' | 'signedAmount' | 'kind'
  >,
): FuelCostAllocationIdentity | null =>
  row.kind === 'ALLOCATION'
    ? {
        fuelEntryId: row.fuelEntryId,
        targetKind: row.targetKind,
        runId: row.runId,
        legId: row.legId,
        amount: row.signedAmount,
      }
    : null;

export function allocationIdentityDifferences(
  existing: FuelCostAllocationIdentity,
  incoming: FuelCostAllocationIdentity,
): readonly (keyof FuelCostAllocationIdentity)[] {
  const keys = Object.keys(existing) as (keyof FuelCostAllocationIdentity)[];
  return keys.filter((key) => existing[key] !== incoming[key]);
}

/** Khoa chong ghi trung TAT DINH cua lan dao — moi cap phat chi dao duoc mot lan (`reversalOfId` UNIQUE). */
export const fuelCostReversalCorrelationKey = (attributionId: string): string =>
  `fuel-cost-attribution:${attributionId}:reversal`;

/* ------------------------------------------------------------------ *
 * KHUNG NHIN — khong phai bang
 * ------------------------------------------------------------------ */

/**
 * SO CAI giu phan bo cua MOT phieu — hai gia tri, loai tru nhau (xem khoi dau tep).
 *
 * `LEGACY_TRIP_EXPENSE` = phieu gan chuyen v1; phan bo LEGACY_TRIP cua no la dong gia thanh o
 * `TX-03`. `FUEL_COST_ATTRIBUTION` = phieu Run-first; phan bo nam o bang rieng.
 */
export type FuelCostLedger = 'LEGACY_TRIP_EXPENSE' | 'FUEL_COST_ATTRIBUTION';

/** Mot dong phan bo o dang man hinh doc duoc — co MA vong chay va SO THU TU chang. */
export interface FuelCostAttributionLine {
  readonly id: string;
  readonly kind: FuelCostAttributionKind;
  readonly targetKind: FuelCostTargetKind;
  readonly runId: string;
  readonly runCode: string | null;
  readonly legId: string | null;
  readonly legSequence: number | null;
  readonly signedAmount: number;
  readonly reversalOfId: string | null;
  /** Dong DAO cap phat nay, neu co — `null` = cap phat con hieu luc (hoac day la mot dong dao). */
  readonly reversedById: string | null;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly createdAt: string;
}

/**
 * PHAN BO CUA MOT PHIEU — cai ke toan doc TRUOC khi quyet, va doc lai SAU khi quyet.
 *
 * `attributedAmount`/`unattributedAmount` duoc tinh o may chu tu CHINH cac dong, de man hinh khong
 * phai tu viet lai phep cong (hai ban sao cua mot phep tinh tien som muon lech nhau).
 */
export interface FuelEntryCostAttributionView {
  readonly fuelEntryId: string;
  readonly amount: number;
  readonly currencyCode: string;
  readonly verificationStatus: FuelVerificationStatus;
  readonly businessDate: BusinessDate;
  readonly vehicleId: string;
  readonly ledger: FuelCostLedger;
  /**
   * Phieu chuyen v1: chuyen nhan chi phi qua `TX-03`, va dong gia thanh da ghi (`null` = da duyet
   * nhung chua kip ghi, hoac chua duyet). `null` o moi phieu Run-first.
   */
  readonly legacyTrip: {
    readonly tripId: string;
    readonly tripCode: string | null;
    readonly projectedExpenseId: string | null;
  } | null;
  /** Ngu canh van hanh cua phieu — de ke toan DE XUAT dich, KHONG phai mot phan bo. */
  readonly context: {
    readonly runId: string | null;
    readonly runCode: string | null;
    readonly legId: string | null;
    readonly legSequence: number | null;
  };
  /**
   * Tong DANG HIEU LUC va phan CON LAI — chi co nghia voi so cai `FUEL_COST_ATTRIBUTION`.
   *
   * `null` voi phieu chuyen v1: con so THAT cua no (ke ca lan dao o `TX-03`) thuoc bao cao gia thanh
   * chuyen. Dien `amount` vao day se la mot ban sao lech ngay khi ke toan dao khoan chi o `TX-03`.
   */
  readonly attributedAmount: number | null;
  readonly unattributedAmount: number | null;
  readonly lines: readonly FuelCostAttributionLine[];
}

/**
 * BAO CAO PHAN BO NHIEN LIEU CUA MOT VONG CHAY — `#364` test 26.
 *
 * Chi doc `TransportFuelCostAttribution` (phieu Run-first). Chi phi nhien lieu cua CHUYEN v1 da
 * chieu sang vong chay nay (`TransportTripRunLegLink`) van o bao cao gia thanh chuyen (`TX-03`) —
 * xem quy tac o dau tep. `legacyTripExpenseIncluded: false` noi dieu do ra, thay vi de nguoi doc
 * tuong con so nay la TOAN BO dau cua vong chay.
 */
export interface FuelRunCostAttributionReport {
  readonly runId: string;
  readonly runCode: string;
  readonly vehicleId: string;
  readonly currencyCode: string;
  /** Tong DANG HIEU LUC = `runLevelAmount` + tong cac chang. */
  readonly totalAmount: number;
  /** Phan bo dich `RUN` (khong chi toi chang nao). */
  readonly runLevelAmount: number;
  readonly legs: readonly {
    readonly legId: string;
    readonly sequence: number | null;
    readonly amount: number;
  }[];
  /** Tung phieu da dong gop, va dong gop DANG HIEU LUC cua no vao vong chay nay. */
  readonly entries: readonly {
    readonly fuelEntryId: string;
    readonly businessDate: BusinessDate | null;
    readonly amount: number;
  }[];
  readonly legacyTripExpenseIncluded: false;
}
