import type { TransportCostingErrorReason } from './costing/costing-errors.js';
import type { TransportCostingDecisionReason } from './costing/costing-decisions.js';
import type { TransportFuelDecisionReason } from './fuel/fuel-decisions.js';
import type { TransportFuelErrorReason } from './fuel/fuel-errors.js';
import type { TransportSettlementDecisionReason } from './settlement/settlement-decisions.js';
import type { TransportAssetComplianceDecisionReason } from './asset-compliance/asset-compliance-decisions.js';
import type { TransportAssetComplianceErrorReason } from './asset-compliance/asset-compliance-errors.js';
import type { TransportWorkforceDecisionReason } from './workforce/workforce-decisions.js';
import type { TransportWorkforceErrorReason } from './workforce/workforce-errors.js';
import type { TransportDriverSettlementDecisionReason } from './driver-settlement/driver-settlement-decisions.js';
import type { TransportDriverSettlementErrorReason } from './driver-settlement/driver-settlement-errors.js';
import type { TransportSettlementErrorReason } from './settlement/settlement-errors.js';
import type { TransportEvidenceDecisionReason } from './evidence/evidence-decisions.js';
import type { TransportExpenseClaimDecisionReason } from './claims/claim-decisions.js';
import type { TransportExpenseClaimErrorReason } from './claims/claim-errors.js';
import type { TransportMovementDecisionReason } from './movement/movement-decisions.js';
import type { TransportMovementErrorReason } from './movement/movement-errors.js';
import type { TransportPlanningDecisionReason } from './planning/planning-decisions.js';
import type { TransportPlanningErrorReason } from './planning/planning-errors.js';
import type { TransportCounterpartyDecisionReason } from './counterparty/counterparty-decisions.js';
import type { TransportCounterpartyErrorReason } from './counterparty/counterparty-errors.js';
import type { TransportProofDecisionReason } from './proof/proof-decisions.js';
import type { TransportCheckpointDecisionReason } from './checkpoint/checkpoint-decisions.js';
import type { TransportDocumentDecisionReason } from './document/document-decisions.js';
import type { TransportWaitingAllowanceDecisionReason } from './waiting/allowance-decisions.js';
import type { TransportWaitingDecisionReason } from './waiting/waiting-decisions.js';
import type { TransportSiteIntakeDecisionReason } from './site-intake/site-intake-decisions.js';
import type { TransportSiteIntakeErrorReason } from './site-intake/site-intake-errors.js';
import type { TransportCommercialAcceptanceDecisionReason } from './acceptance/acceptance-decisions.js';
import type { TransportCommercialAcceptanceErrorReason } from './acceptance/acceptance-errors.js';
import type { TransportAssetOwnershipDecisionReason } from './asset-ownership/asset-ownership-decisions.js';
import type { TransportAssetOwnershipErrorReason } from './asset-ownership/asset-ownership-errors.js';
import type { TransportTollDecisionReason } from './toll/toll-decisions.js';
import type { TollErrorReason } from './toll/toll-errors.js';
import type { TransportDispatchDecisionReason } from './dispatch/dispatch-decisions.js';
import type { TransportDispatchErrorReason } from './dispatch/dispatch.errors.js';
import type { TransportPlaceErrorReason } from './places/place-errors.js';
import type { TransportDecisionReason } from './transport-decisions.js';
import type { CustomerArErrorReason } from './customer-ar/customer-ar-errors.js';
import type { AccountLinkErrorReason } from './fleet/account-link-decisions.js';
import type { TransportAccessErrorReason } from './permissions/transport-access-errors.js';

/**
 * Ly do TU CHOI thuoc tang KIEM DAU VAO — khac han ma quyet dinh nghiep vu.
 *
 * Tach lam hai bo co chu y: ma o `transport-decisions.ts` tra loi "he thong da quyet dinh gi va vi
 * sao" (cai nguoi doc trace can); ma o day tra loi "nguoi goi da dua vao cai gi sai" (cai nguoi
 * dung API can). Tron lai thi bang loc trace se day nhung dong "thieu truong ten" — khong phai
 * quyet dinh nghiep vu nao ca.
 */
export const TRANSPORT_VALIDATION_REASONS = [
  'VEHICLE_NOT_FOUND',
  'VEHICLE_PLATE_TAKEN',
  'DRIVER_NOT_FOUND',
  'CUSTOMER_NOT_FOUND',
  'PARTNER_NOT_FOUND',
  /** Doi tac phai co it nhat mot vai — mot doi tac khong vai khong dung duoc vao viec gi. */
  'PARTNER_ROLES_EMPTY',
  /** Doi tac duoc chi dinh nhung khong mang dung vai can cho vi tri do (VT-054). */
  'PARTNER_ROLE_MISMATCH',
  'TRIP_NOT_FOUND',
  'TRIP_CODE_TAKEN',
  /** Ngay nghiep vu sai dang hoac khong co that. */
  'BUSINESS_DATE_INVALID',
  /** Han GPLX sai dang. */
  'LICENCE_EXPIRY_INVALID',
  /** Tien khong phai so nguyen dong, hoac am o cho khong duoc am. */
  'MONEY_INVALID',
] as const;
export type TransportValidationReason = (typeof TRANSPORT_VALIDATION_REASONS)[number];

/**
 * Ly do VA CHAM LUC GHI — nhom thu ba, khong phai kiem dau vao lan quyet dinh nghiep vu.
 *
 * Mot ma o day khong noi "nguoi goi dua vao cai gi sai" (dau vao hoan toan hop le) va cung khong
 * noi "he thong da quyet dinh gi" (khong cong nghiep vu nao dong). No noi: co NGUOI KHAC vua ghi
 * xong truoc ban mot phan nghin giay, va DB da tu choi ban ghi thu hai.
 *
 * Tach ra thanh nhom rieng vi cach xu ly khac han hai nhom kia: nguoi dung khong sua duoc dau vao
 * de qua duoc, ho phai TAI LAI roi quyet lai tren trang thai moi. Tron vao `VALIDATION` se dat mot
 * ma khong-the-sua vao dung cai bang ma giao dien dung de chi cho nguoi dung "sua o day".
 */
export const TRANSPORT_CONFLICT_REASONS = [
  /** Mot chuyen chi co MOT ban phan cong dang hieu luc; hai lan ghi cung luc thi mot lan thua. */
  'TRIP_ACTIVE_ASSIGNMENT_CONFLICT',
  /** Nhu tren, cho ban ghi lai xe phu trach mot XE. */
  'VEHICLE_ACTIVE_ASSIGNMENT_CONFLICT',
] as const;
export type TransportConflictReason = (typeof TRANSPORT_CONFLICT_REASONS)[number];

/**
 * MOI ly do tu choi cua mien van tai — gop tu CA HAI capability.
 *
 * Hai dong `costing/*` la `import type`, tuc bien mat hoan toan khi sinh JavaScript. Do la chu y:
 *
 *   · luc CHAY, lo trinh import van di dung mot chieu `costing -> core`, khong co vong, va mot
 *     khach chi bat `transport-core` khong nap mot byte nao cua costing;
 *   · luc BIEN DICH, ma cua costing van nam trong union nay, nen `TransportDomainError.denied(...)`
 *     go sai mot chu la khong build duoc — thay vi phai noi long `reason` thanh `string` va mat
 *     dung cai bao dam ma tep nay sinh ra de giu.
 *
 * Tu vung van thuoc ve capability so huu no (`costing/costing-errors.ts`,
 * `costing/costing-decisions.ts`, `fuel/fuel-errors.ts`, `fuel/fuel-decisions.ts`); day chi la cho
 * GOP LAI de mot lop loi dung chung con noi duoc kieu.
 *
 * `transport-fuel` (T4) them hai dong theo dung khuon do — va chinh viec no chi ton hai dong la
 * bang chung rang khuon nay dung: mot capability van tai thu tu se lam y het, va khong tep nao
 * khac phai doi.
 */
export type TransportErrorReason =
  | TransportDecisionReason
  | TransportValidationReason
  | TransportConflictReason
  | TransportCostingDecisionReason
  | TransportCostingErrorReason
  | TransportFuelDecisionReason
  | TransportFuelErrorReason
  | TransportSettlementDecisionReason
  | TransportSettlementErrorReason
  | TransportAssetComplianceDecisionReason
  | TransportAssetComplianceErrorReason
  | TransportWorkforceDecisionReason
  | TransportWorkforceErrorReason
  | TransportDriverSettlementDecisionReason
  | TransportDriverSettlementErrorReason
  | TransportEvidenceDecisionReason
  | TransportCounterpartyDecisionReason
  | TransportCounterpartyErrorReason
  | TransportMovementDecisionReason
  | TransportMovementErrorReason
  | TransportPlanningDecisionReason
  | TransportPlanningErrorReason
  | TransportExpenseClaimDecisionReason
  | TransportExpenseClaimErrorReason
  | TransportProofDecisionReason
  | TransportCheckpointDecisionReason
  | TransportWaitingDecisionReason
  | TransportWaitingAllowanceDecisionReason
  | TransportDocumentDecisionReason
  | TransportSiteIntakeDecisionReason
  | TransportSiteIntakeErrorReason
  | TransportAssetOwnershipDecisionReason
  | TransportAssetOwnershipErrorReason
  | TransportTollDecisionReason
  | TollErrorReason
  | TransportCommercialAcceptanceDecisionReason
  | TransportCommercialAcceptanceErrorReason
  | TransportDispatchDecisionReason
  | TransportDispatchErrorReason
  | TransportPlaceErrorReason
  | CustomerArErrorReason
  | AccountLinkErrorReason
  | TransportAccessErrorReason;

/**
 * Loai loi quyet dinh MA HTTP o controller. Nam o day chu khong o controller vi cung mot tinh
 * huong nghiep vu phai tra cung mot ma du goi tu route nao.
 */
export type TransportErrorKind = 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'DENIED';

/**
 * Loi cua mien van tai.
 *
 * Mang `reason` CO KIEU chu khong chi mot cau tieng Viet: cau chu de nguoi doc, `reason` de may
 * loc — va de bai test khang dinh dung duong tu choi nao da dong, thay vi chi biet "co nem".
 */
export class TransportDomainError extends Error {
  constructor(
    readonly kind: TransportErrorKind,
    readonly reason: TransportErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'TransportDomainError';
  }

  static notFound(reason: TransportErrorReason, message: string): TransportDomainError {
    return new TransportDomainError('NOT_FOUND', reason, message);
  }

  static conflict(reason: TransportErrorReason, message: string): TransportDomainError {
    return new TransportDomainError('CONFLICT', reason, message);
  }

  static invalid(reason: TransportErrorReason, message: string): TransportDomainError {
    return new TransportDomainError('INVALID', reason, message);
  }

  static denied(reason: TransportErrorReason, message: string): TransportDomainError {
    return new TransportDomainError('DENIED', reason, message);
  }
}
