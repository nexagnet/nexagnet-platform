import { publicApiBase } from '../../lib/api-base';
import { authFetch } from '../../lib/auth';
import type {
  TollDuplicatePeerListing,
  TollSpendReport,
  TollSpendReportQuery,
} from './toll-report-types';
import type {
  FuelDocument,
  FuelDocumentDetail,
  FuelDocumentListQuery,
  FuelDocumentReview,
  FuelVehicleConsumption,
  IngestFuelReceiptImageInput,
} from './fuel-review-types';
import type {
  CustomerArSummaryView,
  CustomerReconciliationBatchView,
  PendingArOrder,
} from './workspace/customer-ar';
import type { LocationHealthView } from './workspace/location-health';
import type {
  ApByCounterpartyRow,
  ArAgingReport,
  BusinessDate,
  ClosedFundPeriod,
  ConfirmSiteIntakeInput,
  RecordCheckpointInput,
  DriverTrackingSession,
  OpenTrackingSessionInput,
  ReportObservationInput,
  DriverLocationObservation,
  RecordDocumentInput,
  StartWaitingInput,
  ClosedReconciliationResult,
  ComplianceAlert,
  ComplianceDocument,
  ComplianceDocumentStatus,
  ComplianceDocumentType,
  ControlTowerView,
  CorridorInsightView,
  DispatchSuggestionView,
  FinanceMarginView,
  FinanceSummaryView,
  FleetInsightView,
  RunJourneyMapView,
  RunJourneyView,
  ComplianceSubjectKind,
  CorrelatedPosting,
  Driver,
  DriverPayslipView,
  EffectiveVehicleState,
  ExpenseCatalogue,
  ExpenseClaim,
  ExpenseClaimDetail,
  ExpenseClaimStatus,
  MaintenanceDue,
  MaintenancePlan,
  MaintenancePlanStatus,
  MaintenanceTriggerKind,
  MaintenanceWorkOrder,
  OperationalAlertFeed,
  OperationalDocumentView,
  OrderCompletionBasis,
  OrderCompletionDetail,
  OrderCompletionOutcome,
  OrderCompletionRow,
  OrderRunPlan,
  LegTransitionResult,
  LegTransitionTarget,
  RunClosureVerdict,
  RunDistanceSummary,
  RunMovementSummary,
  RunPlanProposal,
  RunLeg,
  RunLegKind,
  GeoPoint,
  KnownPlacesResponse,
  PlaceReverseResponse,
  PlaceSearchResponse,
  TransportOrder,
  TransportPlanningPolicyView,
  VehicleRun,
  VehicleRunDetail,
  PartnerPosition,
  PayrollPeriod,
  PayrollRun,
  Payslip,
  PayslipComponentKind,
  PayslipDetail,
  SiteIntakeLocationInput,
  SiteIntakeProposal,
  SiteIntakeResult,
  SettlementDocumentChain,
  SettlementFlow,
  DriverFuelRunView,
  DriverFuelSlipView,
  FuelEntryCostAttributionView,
  DriverFuelStation,
  DriverFuelSupplier,
  DriverFundEntry,
  DriverFundPeriod,
  DriverFieldWork,
  DriverFundStatement,
  DriverHandoverInput,
  DriverTripView,
  ExpenseFundingSource,
  FuelDiscrepancy,
  FuelDiscrepancyResolution,
  RevisableFuelResolution,
  FuelEntry,
  FuelEntryDetail,
  FuelEntryInboxPage,
  FuelEntryInboxQuery,
  FuelPaymentMethod,
  FuelReceiptEvidence,
  FuelReconciliation,
  FuelReconciliationWorkspace,
  FuelStatementFormat,
  FuelSupplier,
  FundPeriodSnapshot,
  ImportedStatement,
  MatchingRunResult,
  PartnerRoleKind,
  StatementImportPreview,
  // `TX-08` phi duong bo / ETC (Issue #295).
  ManualTollRowInput,
  TollAccount,
  TollAccountLinkCount,
  TollAccountLinkListing,
  TollAccountVehicleLink,
  TollCandidate,
  TollCandidateDetail,
  TollCandidatePage,
  TollCandidateQuery,
  TollCommittedImport,
  TollFileFormat,
  TollImport,
  TollImportPreview,
  TollProvider,
  TollProviderSurface,
  TollReviewAction,
  TollSourceKind,
  TransportCustomer,
  TransportPartner,
  Trip,
  TripAssignment,
  TripCostBreakdown,
  TripKind,
  TripStatus,
  AssetStakeholder,
  AssetStakeholderKind,
  PartyStatus,
  StakeholderActivityView,
  StakeholderVehicleView,
  Vehicle,
  VehicleDriverAssignment,
  VehicleOperationalControl,
  VehicleOwnershipInterest,
  VehicleOwnershipRegister,
  VehicleStatus,
  // `TX-07b` — quyet toan lai xe (Issue #237).
  DriverCashoutDetail,
  DriverSettlementBalance,
  DriverSettlementSelfStatement,
  DriverSettlementStatement,
  RecordCashoutInput,
} from './transport-types';

/**
 * Mot cua duy nhat ra `/transport/*`.
 *
 * BA dieu tep nay phai lam dung, vi khong lam thi khong man hinh nao chay dung duoc:
 *
 *   1. `authFetch` — KHONG dung `fetch` tran. Phien la cookie httpOnly (`credentials: 'include'`)
 *      va moi lenh ghi can `x-csrf-token`; `fetch` tran mat ca hai va se ra 401/403 kho hieu.
 *   2. `TransportApiError` — giu lai `status` va than loi. `lib/api.ts` co mot ham `toJson` lam
 *      viec nay nhung KHONG xuat ra, nen o day phai viet lai; nhan luon dip do de giu them
 *      `status`, thu ma ban cua `lib/api.ts` nem di.
 *   3. Doc phong ve — khi tenant khong bat `transport-core`, `/transport/*` KHONG duoc gan, va sau
 *      Caddy duong khong khop se roi ve Next.js tra ve mot trang HTML 404. `JSON.parse` mot trang
 *      HTML se nem `SyntaxError` chang noi len dieu gi; xem `readBody`.
 *
 * MA LOI MAY DOC DUOC: tu `#168 B7` than loi cua mien mang them `reason` CO KIEU (xem
 * `transportErrorBody` phia API). `TransportApiError.reason` giu no lai — va CHI de man hinh chon
 * CACH XU LY (vd `#376`: `LEG_FIELD_DELIVERY_NOT_RECORDED` mo duong ghi de co ly do). Loi khong
 * mang `reason` (zod, guard quyen, ha tang) thi man hinh van HIEN NGUYEN VAN cau cua may chu.
 */
export class TransportApiError extends Error {
  readonly status: number;
  /** `true` khi than loi khong phai JSON — thuong la nghiep vu chua duoc bat cho khach nay. */
  readonly isTransportRouteMissing: boolean;
  /** Ly do CO KIEU cua mien (`#168 B7`) — `null` khi than loi khong mang. */
  readonly reason: string | null;

  constructor(
    message: string,
    status: number,
    isTransportRouteMissing = false,
    reason: string | null = null,
  ) {
    super(message);
    this.name = 'TransportApiError';
    this.status = status;
    this.isTransportRouteMissing = isTransportRouteMissing;
    this.reason = reason;
  }
}

const BASE = publicApiBase();

const NOT_MOUNTED_MESSAGE = 'Nghiệp vụ vận tải chưa được bật cho doanh nghiệp này.';

const readBody = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  let parsed: unknown;
  let parsedOk = true;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsedOk = false;
  }

  if (!parsedOk) {
    // Than loi khong phai JSON. Voi 404 day gan nhu chac chan la trang HTML cua Next.js — tuc route
    // khong duoc gan, chu khong phai ban ghi khong ton tai. Hai chuyen do doi hai cau tra loi khac
    // nhau tren man hinh, nen phai phan biet o day.
    if (response.status === 404) throw new TransportApiError(NOT_MOUNTED_MESSAGE, 404, true);
    throw new TransportApiError(
      'Không đọc được phản hồi của hệ thống. Hãy thử lại.',
      response.status,
    );
  }

  if (!response.ok) {
    const body = parsed as { message?: string | readonly string[]; reason?: unknown } | null;
    const raw = body?.message;
    // Nest tra `message` la chuoi, hoac MOT MANG chuoi khi zod bat nhieu loi cung luc.
    const message = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join(', ') : '';
    throw new TransportApiError(
      message.length > 0 ? message : 'Không thực hiện được yêu cầu. Hãy thử lại.',
      response.status,
      false,
      typeof body?.reason === 'string' && body.reason.length > 0 ? body.reason : null,
    );
  }

  return parsed as T;
};

const get = async <T>(path: string): Promise<T> => readBody<T>(await authFetch(`${BASE}${path}`));

/**
 * DANH SACH NAM TRONG MOT PHONG BI, khong tra ve tran.
 *
 * `TX-06` va `TX-07` tra ve `{ plans }`, `{ due }`, `{ workOrders }`, `{ documents }`,
 * `{ alerts, gaps }`, `{ vehicles, conflicts }`, `{ periods }`, `{ runs }`, `{ payslips }` — mot
 * quyet dinh CO Y cua may chu: chung con cho them truong o canh (`gaps`, `conflicts`) ma khong pha
 * vo dang phan hoi.
 *
 * Client tung khai bao chung la MANG TRAN. Hau qua do duoc tren ban dang chay o T10: hai muc
 * "Bao duong & giay to" va "Luong" TRANG MAN voi `N.map is not a function` — khong phai mot o
 * trong, ma mot trang loi cua trinh duyet.
 *
 * Vi sao khong bai kiem nao bat: ca hai may chu gia cua bo e2e (`transport-operations.spec.ts` va
 * `lifecycle-server.ts`) deu tra ve mang tran, tuc chung khang dinh mot hop dong may chu KHONG CO
 * THAT. Mot bai kiem xanh tren mot phep do bia ra thi khong noi gi ve san pham.
 */
const getList = async <T>(path: string, key: string): Promise<readonly T[]> => {
  const body = await get<Record<string, unknown>>(path);
  const rows = body?.[key];
  if (!Array.isArray(rows)) {
    // Khong roi ve `[]`: mot danh sach rong tu mot phan hoi sai dang se hien ra man hinh nhu "chua
    // co du lieu", tuc dung mot cau noi doi de che mot loi hop dong. Bao len de nguoi dung thay
    // trang thai loi that va tang tren co cai de log.
    throw new TransportApiError(`Phản hồi của hệ thống cho ${path} không đúng dạng mong đợi.`, 502);
  }
  return rows as readonly T[];
};

const send = async <T>(
  method: 'POST' | 'PATCH' | 'PUT',
  path: string,
  body?: unknown,
): Promise<T> =>
  readBody<T>(
    await authFetch(`${BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

/**
 * XOA — mot method rieng chu khong nhet vao `send`.
 *
 * `DELETE` KHONG mang than yeu cau o day (moi thu can biet deu nam tren duong dan), nen gop no vao
 * `send` se de lai mot tham so `body` khong bao gio dung — va mot tham so nhu vay la loi moi cho
 * lan sau ai do gui mot than yeu cau ma may chu khong doc.
 */
const remove = async <T>(path: string): Promise<T> =>
  readBody<T>(await authFetch(`${BASE}${path}`, { method: 'DELETE' }));

/**
 * BO LOC -> QUERY STRING. Truong rong/`null`/`undefined` KHONG di kem.
 *
 * Gui `?verification=` (rong) la mot cau hoi khac han voi khong gui gi: may chu `catch(null)` nen
 * ket qua giong nhau hom nay, nhung mot dia chi mang nam tham so rong la mot dia chi khong ai doc
 * duoc va khong ai dan cho nhau duoc.
 */
const toQuery = (params: Record<string, string | number | null | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query.length > 0 ? `?${query}` : '';
};

/**
 * MULTIPART — cho duong tai anh bang chung (#169).
 *
 * KHONG dat `content-type`: trinh duyet phai tu dat `multipart/form-data; boundary=...`, va mot
 * `content-type` viet tay se thieu boundary, lam may chu doc ra mot than rong. `authFetch` van gan
 * cookie phien + `x-csrf-token` nhu moi lenh ghi khac.
 */
const sendForm = async <T>(path: string, form: FormData): Promise<T> =>
  readBody<T>(await authFetch(`${BASE}${path}`, { method: 'POST', body: form }));

/**
 * DIA CHI ANH de dat vao `<img src>`.
 *
 * Byte di qua mot route CO XAC THUC chu khong phai URL ky (xem #169): kho anh la bucket PRIVATE
 * chua PII, va mot URL ky la mot manh giay uy quyen roi khoi he thong — no con song sau khi phien
 * het han va di duoc vao lich su duyet, log proxy hay mot tin nhan chuyen tiep.
 *
 * Vi vay day tra ve duong dan THUONG; cookie phien di kem theo `credentials` cua chinh the `<img>`
 * khi cung goc. Do la ly do khong co ham `fetch` o day.
 */
export const evidenceUrls = {
  driverFuelSlip: (slipId: string, evidenceId: string): string =>
    `${BASE}/transport/me/fuel/slips/${encodeURIComponent(slipId)}/evidence/${encodeURIComponent(evidenceId)}`,
  fuelEntry: (entryId: string, evidenceId: string): string =>
    `${BASE}/transport/fuel/entries/${encodeURIComponent(entryId)}/evidence/${encodeURIComponent(evidenceId)}`,
  driverExpense: (expenseId: string): string =>
    `${BASE}/transport/me/expenses/${encodeURIComponent(expenseId)}/evidence`,
} as const;

/**
 * Khoa tuong quan cho MOT lan bam nut, tao mot lan roi giu qua cac lan thu lai.
 *
 * Day la co che chan trung DUY NHAT cua API, va dung lai khoa voi noi dung khac la 409 dut khoat
 * (`FUEL_CORRELATION_KEY_REUSED`). Khong co duong "tra ve ban ghi da co" — nen sinh moi khoa cho
 * moi lan bam, va truyen lai DUNG khoa do khi mang loi va nguoi dung bam lai.
 */
export const newCorrelationKey = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/* ------------------------------------------------------------------ *
 * Than yeu cau
 * ------------------------------------------------------------------ */

export interface PlanTripInput {
  readonly code: string;
  readonly kind: TripKind;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly businessDate?: BusinessDate;
  readonly cargoDescription?: string | null;
  readonly customerId?: string | null;
  readonly carrierPartnerId?: string | null;
  readonly referrerPartnerId?: string | null;
  readonly freightAmount?: number | null;
  readonly distanceKm?: number | null;
}

/** `code`, `kind`, `businessDate` KHONG sua duoc sau khi lap chuyen. */
export type UpdateTripInput = Partial<Omit<PlanTripInput, 'code' | 'kind' | 'businessDate'>>;

/**
 * TAO DON (`#379`). Hai toa do la su that cua hai dau tuyen; hai nhan la chu in tren don.
 *
 * `originPoint`/`destinationPoint` BAT BUOC o day chu khong tuy chon: bien HTTP cua may chu doi ca
 * hai, va mot kieu tuy chon o client la mot loi moi de mot man hinh nao do gui don chi co chu.
 */
export interface CreateOrderInput {
  readonly code: string;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly originPoint: GeoPoint;
  readonly destinationPoint: GeoPoint;
  readonly businessDate?: BusinessDate;
  readonly customerId?: string | null;
  readonly cargoDescription?: string | null;
  readonly freightAmount?: number | null;
}

/**
 * KHOAN CHI CUA CHINH LAI XE (`#168 B3`).
 *
 * `driverId` va `fundedBy` CO Y vang mat: ca hai la 400 tuong minh o may chu (`.strict()`), khong
 * phai truong bi bo qua im lang. Danh tinh den tu phien, va nguon tien luon la quy cua chinh nguoi
 * dang dang nhap.
 */
export interface DriverSelfExpenseInput {
  readonly tripId: string;
  readonly categoryCode: string;
  /** DO LON, so nguyen DONG. Khong bao gio am — dau do may chu quyet theo loai but toan. */
  readonly amount: number;
  readonly businessDate?: BusinessDate;
  readonly note?: string | null;
  readonly correlationKey?: string;
}

export interface CreateMaintenancePlanInput {
  readonly vehicleId: string;
  readonly name: string;
  readonly triggerKind: MaintenanceTriggerKind;
  readonly intervalKm?: number | null;
  readonly intervalDays?: number | null;
  readonly baselineOdoKm: number;
  readonly baselineDate: BusinessDate;
}

export type UpdateMaintenancePlanInput = Partial<
  Pick<CreateMaintenancePlanInput, 'name' | 'triggerKind' | 'intervalKm' | 'intervalDays'>
> & { readonly status?: MaintenancePlanStatus };

/**
 * `planId` la BAT BUOC CO MAT nhung duoc phep `null` — schema may chu la `nonEmpty.nullable()`,
 * khong phai `.optional()`. Kieu o day phai noi dung dieu do, neu khong mot lan bo quen truong se
 * ra 400 luc chay thay vi do luc bien dich. Cung the voi `subjectId` cua giay to.
 */
export interface OpenWorkOrderInput {
  readonly vehicleId: string;
  readonly planId: string | null;
  readonly description: string;
  readonly openedDate: BusinessDate;
  readonly openedOdoKm: number;
  readonly note?: string | null;
}

export interface CompleteWorkOrderInput {
  readonly completedDate: BusinessDate;
  readonly completedOdoKm: number;
  readonly costAmount?: number | null;
  readonly costingExpenseRef?: string | null;
  readonly note?: string | null;
}

export interface RegisterComplianceDocumentInput {
  readonly subjectKind: ComplianceSubjectKind;
  readonly subjectId: string | null;
  readonly documentType: ComplianceDocumentType;
  readonly documentNo?: string | null;
  readonly validFrom: BusinessDate;
  readonly validTo: BusinessDate;
  readonly evidenceRef?: string | null;
  readonly note?: string | null;
}

export interface OpenPayrollPeriodInput {
  readonly label: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
}

/** Mot khoan cong/tru NHAP TAY cho mot lai xe trong lan chay. Man hinh KHONG tu tinh khoan nao. */
export interface ManualPayrollComponentInput {
  readonly kind: PayslipComponentKind;
  readonly label: string;
  /** DO LON, so nguyen DONG. Dau do `kind` quyet, khong phai dau cua so nay. */
  readonly amount: number;
  readonly note?: string | null;
}

/**
 * CHAY LUONG cho ca ky. KHONG co `driverIds`: may chu chay cho moi lai xe co phat sinh trong ky,
 * va mot bo loc o client se lam hai lan chay cung mot ky cho ra hai bang luong khac nhau.
 */
export interface RunPayrollInput {
  readonly periodId: string;
  /** Khoa la `driverId`. Vang mat = khong co khoan nhap tay nao. */
  readonly manualComponents?: Readonly<Record<string, readonly ManualPayrollComponentInput[]>>;
}

/** Phat mot phieu BU/DAO. Ly do BAT BUOC — mot lan sua tien phai noi duoc vi sao. */
export interface CorrectPayslipInput {
  readonly kind: 'SUPPLEMENTAL' | 'REVERSAL';
  readonly reason: string;
  readonly components?: readonly ManualPayrollComponentInput[];
}

/** CA HAI khoa deu BAT BUOC co mat (duoc phep `null`). Than thieu khoa la 400. */
export interface AssignTripInput {
  readonly vehicleId: string | null;
  readonly driverId: string | null;
}

export interface CreateVehicleInput {
  readonly registrationPlate: string;
  readonly vehicleClass: string;
  readonly allowedPayloadKg?: number | null;
  readonly currentOdoKm?: number;
  readonly status?: VehicleStatus;
}

/** Bien so KHONG sua duoc — gui kem la 400 vi schema `.strict()`. */
export type UpdateVehicleInput = Partial<Omit<CreateVehicleInput, 'registrationPlate'>>;

/**
 * KHONG co `authUserId` (`#395`): may chu tu choi truong do bang `400` o ca tao lan sua ho so. Noi
 * tai khoan dang nhap voi ho so lai xe CHI qua `PUT /transport/drivers/:id/account`
 * (`accountLinksApi.linkDriver`) — mot duong co quyen rieng (chi Giam doc) va co lich su.
 */
export interface CreateDriverInput {
  readonly fullName: string;
  readonly phone: string;
  readonly licenceClass: string;
  readonly licenceExpiry: BusinessDate;
  readonly status?: 'ACTIVE' | 'INACTIVE';
}

export interface CreateCustomerInput {
  readonly name: string;
  readonly phone?: string | null;
  readonly address?: string | null;
  readonly taxCode?: string | null;
  readonly status?: 'ACTIVE' | 'INACTIVE';
}

export interface CreatePartnerInput {
  readonly name: string;
  readonly phone?: string | null;
  readonly roles: readonly PartnerRoleKind[];
  readonly status?: 'ACTIVE' | 'INACTIVE';
}

/** Luon gui DO LON duong; dau do server quyet theo `kind` (`ADVANCE` +1, `RETURN` −1). */
export interface FundMovementInput {
  readonly driverId: string;
  readonly amount: number;
  readonly businessDate?: BusinessDate;
  readonly tripId?: string | null;
  readonly note?: string | null;
  readonly correlationKey?: string;
}

/** Rieng dieu chinh nhan gia tri CO DAU, va khac 0. */
export interface AdjustFundInput {
  readonly driverId: string;
  readonly signedAmount: number;
  readonly businessDate?: BusinessDate;
  readonly tripId?: string | null;
  readonly note?: string | null;
  readonly correlationKey?: string;
}

export interface RecordTripExpenseInput {
  readonly tripId: string;
  readonly categoryCode: string;
  readonly amount: number;
  readonly fundedBy: ExpenseFundingSource;
  /** BAT BUOC khi `fundedBy = 'DRIVER_FUND'` — server cong dieu kien nay. */
  readonly driverId?: string | null;
  readonly businessDate?: BusinessDate;
  readonly evidenceLocator?: string | null;
  readonly note?: string | null;
  readonly correlationKey?: string;
}

export interface OpenFundPeriodInput {
  readonly driverId: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
}

export interface FuelEntryFields {
  readonly supplierId: string;
  /** `#317` G1 — tram/diem do; phai thuoc `supplierId` va dang hop tac, khong thi 403 co ma. */
  readonly stationId?: string | null;
  /** So la number hoac chuoi thap phan toi 3 chu so — server nhan ca hai. */
  readonly liters: number | string;
  readonly amount: number;
  readonly odometerKm: number;
  /** ISO-8601 va BAT BUOC co offset mui gio. */
  readonly occurredAt: string;
  readonly businessDate?: BusinessDate;
  readonly paymentMethod: FuelPaymentMethod;
  readonly invoiceNo?: string | null;
  readonly note?: string | null;
}

/**
 * `#364` — NGU CANH cua lenh nop: chuyen v1 (tuong thich) HOAC vong xe (+ chang). May chu kiem lai
 * tat ca; phieu theo vong xe khong can `vehicleId` (xe LA xe cua vong xe).
 */
export interface FuelEntryContextFields {
  readonly tripId?: string | null;
  readonly runId?: string | null;
  readonly legId?: string | null;
  readonly vehicleId?: string | null;
}

export interface SubmitFuelEntryInput extends FuelEntryFields, FuelEntryContextFields {
  readonly driverId: string;
  readonly correlationKey?: string;
}

/** Duong cua LAI XE: khong co `driverId` — danh tinh den tu phien dang nhap. */
export interface DriverFuelSubmitInput extends FuelEntryFields, FuelEntryContextFields {
  readonly correlationKey?: string;
}

/** `#364` — CAP PHAT gia thanh mot phieu Run-first vao MOT vong xe hoac MOT chang. */
export interface RecordFuelCostAttributionInput {
  readonly target:
    | { readonly kind: 'RUN'; readonly runId: string }
    | { readonly kind: 'LEG'; readonly legId: string };
  readonly amount: number;
  readonly note?: string | null;
  /** BAT BUOC — mot lan bam lai khong duoc thanh mot dong phan bo thu hai. */
  readonly correlationKey: string;
}

/**
 * Bang chung dang CHUOI DINH VI — mot tham chieu toi byte da nam san trong kho.
 *
 * Cau "API khong nhan `multipart/form-data` o bat cu dau" o day da SAI tu #169: `uploadFuelEvidence`
 * va `recordExpenseWithEvidence` deu gui tep that. Giu lai cau do la ly do nguoi ta khong ngo hai
 * ham cung tro toi mot URL — va do dung la cach route tai anh bi che khuat cho toi khi T9 do no
 * tren ban dang chay.
 */
export interface AttachFuelEvidenceInput {
  readonly locator: string;
  readonly contentType?: string | null;
  readonly byteSize?: number | null;
  readonly capturedAt?: string | null;
}

export interface ImportStatementInput {
  readonly supplierId: string;
  readonly periodStart: BusinessDate;
  readonly periodEnd: BusinessDate;
  readonly filename: string;
  readonly format: FuelStatementFormat;
  /** Tep di trong than JSON dang base64, toi da ~7.000.000 ky tu. */
  readonly contentBase64: string;
}

/**
 * Voi `AMBIGUOUS_CANDIDATES` + `MATCH_CONFIRMED`, PHAI chi ro ca `statementLineId` va `fuelEntryId`
 * lay tu `candidateLineIds`/`candidateEntryIds`, khong thi 400 `FUEL_MATCH_TARGET_REQUIRED`.
 */
export interface ResolveDiscrepancyInput {
  readonly resolution: FuelDiscrepancyResolution;
  readonly note?: string | null;
  readonly statementLineId?: string;
  readonly fuelEntryId?: string;
}

/**
 * `#317` G0 — doi y ve mot quyet dinh DA GHI. `reason` BAT BUOC (400 neu rong). Ky DA DONG phai mo
 * lai truoc (403 `RECONCILIATION_FROZEN`); sua mot ban cu da bi thay the -> 409 `DECISION_NOT_CURRENT`.
 */
export interface ReviseDiscrepancyInput {
  readonly resolution: RevisableFuelResolution;
  readonly reason: string;
}

/** Ket qua doi y: quyet dinh MOI (hieu luc) va quyet dinh CU (van trong lich su). */
export interface RevisedDecisionResult {
  readonly revision: FuelDiscrepancy;
  readonly superseded: FuelDiscrepancy;
  readonly replayed: boolean;
}

/* --- `TX-08` phi duong bo / ETC (#295) --- */

export interface CreateTollAccountInput {
  readonly provider: TollProvider;
  readonly accountNo: string;
  readonly holderName: string | null;
}

/**
 * MO mot doan noi xe <-> tai khoan giao thong.
 *
 * `effectiveTo` co mat NGAY LUC MO vi mot doan noi da ket thuc van phai khai lai duoc (nhap lai lich
 * su cua thang truoc). May chu tu choi `effectiveTo < effectiveFrom` bang `TOLL_LINK_PERIOD_INVALID`.
 */
export interface OpenTollLinkInput {
  readonly vehicleId: string;
  /** ND 119 Phu luc — "ma dinh danh the dau cuoi". Tuy chon: chua do duoc no co tren tep xuat khong. */
  readonly providerVehicleRef: string | null;
  readonly effectiveFrom: BusinessDate;
  readonly effectiveTo: BusinessDate | null;
}

/**
 * MOT LENH NAP. HAI duong loai tru nhau, va may chu kiem dieu do bang `superRefine`:
 * `STATEMENT_FILE` phai co `contentBase64`, `MANUAL` phai co it nhat mot dong `rows`.
 */
export interface TollImportInput {
  readonly provider: TollProvider;
  readonly sourceKind: TollSourceKind;
  readonly sourceLabel: string;
  readonly periodStart: BusinessDate | null;
  readonly periodEnd: BusinessDate | null;
  readonly format?: TollFileFormat;
  readonly contentBase64?: string;
  readonly rows?: readonly ManualTollRowInput[];
}

/**
 * MOT LAN QUYET cua nguoi doi soat.
 *
 * `note` la CHU CHO NGUOI DOC; ly do co ma do may chu sinh tu `action`, nen khong mot cau tu do nao
 * cua client di duoc vao lich su kiem toan.
 */
export interface TollReviewInput {
  readonly action: TollReviewAction;
  readonly vehicleId: string | null;
  readonly duplicateOfCandidateId: string | null;
  readonly note: string | null;
}

/* ------------------------------------------------------------------ *
 * Be mat van hanh
 * ------------------------------------------------------------------ */

export const transportApi = {
  files: {
    uploadOperationalDocument: (
      file: File,
    ): Promise<{
      readonly id: string;
      readonly filename: string;
      readonly contentType: string;
      readonly byteSize: number;
      readonly state: string;
    }> => {
      const form = new FormData();
      form.append('file', file);
      form.append('purpose', 'OPERATIONAL_DOCUMENT');
      return sendForm('/files', form);
    },
  },
  customerAr: {
    pending: (
      customerId?: string | null,
    ): Promise<{ readonly orders: readonly PendingArOrder[] }> =>
      get(`/transport/customer-ar/pending${toQuery({ customerId })}`),
    batches: (
      customerId?: string | null,
    ): Promise<{ readonly batches: readonly CustomerReconciliationBatchView[] }> =>
      get(`/transport/customer-ar/batches${toQuery({ customerId })}`),
    summary: (asOf: string, customerId?: string | null): Promise<CustomerArSummaryView> =>
      get(`/transport/customer-ar/summary${toQuery({ asOf, customerId })}`),
    confirmOrder: (
      orderId: string,
      input: {
        confirmedAmount: number;
        currencyCode: string;
        businessDate: string;
        differenceReason?: string | null;
        confirmationReference?: string | null;
        evidenceRefs?: readonly string[];
        idempotencyKey: string;
      },
    ): Promise<unknown> =>
      send(
        'POST',
        `/transport/customer-ar/orders/${encodeURIComponent(orderId)}/confirmations`,
        input,
      ),
    createBatch: (input: {
      customerId: string;
      orderIds: readonly string[];
      currencyCode: string;
      periodStart?: string | null;
      periodEnd?: string | null;
      reference?: string | null;
      note?: string | null;
      idempotencyKey: string;
    }): Promise<unknown> => send('POST', '/transport/customer-ar/batches', input),
    resolveBatch: (
      batchId: string,
      input: {
        decisions: readonly (
          | {
              lineId: string;
              action: 'CONFIRM';
              confirmedAmount: number;
              businessDate: string;
              differenceReason?: string | null;
              confirmationReference?: string | null;
              evidenceRefs?: readonly string[];
            }
          | { lineId: string; action: 'DEFER'; reason: string }
        )[];
        idempotencyKey: string;
      },
    ): Promise<unknown> =>
      send(
        'POST',
        `/transport/customer-ar/batches/${encodeURIComponent(batchId)}/resolutions`,
        input,
      ),
    recordPayment: (input: {
      customerId: string;
      amount: number;
      currencyCode: string;
      receivedAt: string;
      businessDate: string;
      externalRef?: string | null;
      note?: string | null;
      idempotencyKey: string;
    }): Promise<{
      readonly payment: { readonly id: string };
      readonly replayed: boolean;
    }> => send('POST', '/transport/customer-ar/payments', input),
    allocatePayment: (
      paymentId: string,
      input: {
        documentId: string;
        amount: number;
        businessDate: string;
        note?: string | null;
        idempotencyKey: string;
      },
    ): Promise<unknown> =>
      send(
        'POST',
        `/transport/customer-ar/payments/${encodeURIComponent(paymentId)}/allocations`,
        input,
      ),
  },
  operationalDocuments: {
    forOrder: (orderId: string): Promise<readonly OperationalDocumentView[]> =>
      get(`/transport/orders/${encodeURIComponent(orderId)}/documents`),
  },
  trips: {
    /** KHONG phan trang, KHONG bo loc, KHONG tim kiem — tra ve toan bo bang. */
    list: (): Promise<readonly Trip[]> => get('/transport/trips'),
    detail: (id: string): Promise<Trip> => get(`/transport/trips/${encodeURIComponent(id)}`),
    /** Tra `200 []` cho id khong ton tai — KHONG dung lam phep thu ton tai. */
    assignments: (id: string): Promise<readonly TripAssignment[]> =>
      get(`/transport/trips/${encodeURIComponent(id)}/assignments`),
    plan: (input: PlanTripInput): Promise<Trip> => send('POST', '/transport/trips', input),
    update: (id: string, input: UpdateTripInput): Promise<Trip> =>
      send('PATCH', `/transport/trips/${encodeURIComponent(id)}`, input),
    assign: (id: string, input: AssignTripInput): Promise<TripAssignment> =>
      send('POST', `/transport/trips/${encodeURIComponent(id)}/assignment`, input),
    /**
     * KHONG truyen `'CANCELLED'` qua duong nay. May trang thai cho phep, nhung `setStatus` khong
     * ghi `cancelledAt`/`cancellationReason`, nen se sinh ra mot chuyen da huy KHONG CO LY DO — va
     * no di duong vong qua quyen `transport.trip.cancel`. Dung `cancel()`.
     */
    transition: (id: string, to: Exclude<TripStatus, 'CANCELLED'>): Promise<Trip> =>
      send('POST', `/transport/trips/${encodeURIComponent(id)}/transition`, { to }),
    cancel: (id: string, reason: string): Promise<Trip> =>
      send('POST', `/transport/trips/${encodeURIComponent(id)}/cancel`, { reason }),
  },

  /**
   * `TX-08` SO HUU TAI SAN (#242 Lane E).
   *
   * Hai NHOM tren cung mot doi tuong, va chung KHONG duoc gop: `assetOwnership.*` la be mat quan
   * tri (doi hoi `transport.asset_ownership.*`), con `myVehicles`/`myVehicle` la be mat CUA CHINH
   * NGUOI DANG DANG NHAP. Cai thu hai khong nhan `stakeholderId` o bat ky duong nao — danh tinh den
   * tu phien, va may chu loc theo dung tap xe cua nguoi do.
   */
  assetOwnership: {
    stakeholders: (): Promise<readonly AssetStakeholder[]> =>
      get('/transport/asset-ownership/stakeholders'),
    createStakeholder: (input: {
      kind: AssetStakeholderKind;
      displayName: string;
      note?: string | null;
    }): Promise<AssetStakeholder> => send('POST', '/transport/asset-ownership/stakeholders', input),
    updateStakeholder: (
      id: string,
      input: { displayName?: string; note?: string | null; status?: PartyStatus },
    ): Promise<AssetStakeholder> =>
      send('PATCH', `/transport/asset-ownership/stakeholders/${encodeURIComponent(id)}`, input),
    /** `authUserId: null` la GO cau noi — mot gia tri MINH THI, khong phai truong bo trong. */
    setAccount: (id: string, authUserId: string | null): Promise<AssetStakeholder> =>
      send('PUT', `/transport/asset-ownership/stakeholders/${encodeURIComponent(id)}/account`, {
        authUserId,
      }),

    register: (vehicleId: string): Promise<VehicleOwnershipRegister> =>
      get(`/transport/asset-ownership/vehicles/${encodeURIComponent(vehicleId)}`),
    recordInterest: (
      vehicleId: string,
      input: {
        stakeholderId: string;
        ownershipBasisPoints: number;
        effectiveFrom: string;
        note?: string | null;
      },
    ): Promise<VehicleOwnershipInterest> =>
      send(
        'POST',
        `/transport/asset-ownership/vehicles/${encodeURIComponent(vehicleId)}/interests`,
        input,
      ),
    closeInterest: (
      interestId: string,
      input: { effectiveTo: string; note?: string | null },
    ): Promise<VehicleOwnershipInterest> =>
      send(
        'POST',
        `/transport/asset-ownership/interests/${encodeURIComponent(interestId)}/close`,
        input,
      ),
    declareRegister: (vehicleId: string, complete: boolean): Promise<VehicleOwnershipRegister> =>
      send('PUT', `/transport/asset-ownership/vehicles/${encodeURIComponent(vehicleId)}/register`, {
        complete,
      }),
    setOperationalControl: (
      vehicleId: string,
      operationalControl: VehicleOperationalControl,
    ): Promise<VehicleOwnershipRegister> =>
      send(
        'PUT',
        `/transport/asset-ownership/vehicles/${encodeURIComponent(vehicleId)}/operational-control`,
        { operationalControl },
      ),
  },

  /** BE MAT CUA CHINH MINH — ben huu quan. Khong duong nao nhan `stakeholderId`. */
  stakeholderSelf: {
    myVehicles: (): Promise<readonly StakeholderVehicleView[]> => get('/transport/me/vehicles'),
    myVehicle: (vehicleId: string): Promise<StakeholderVehicleView> =>
      get(`/transport/me/vehicles/${encodeURIComponent(vehicleId)}`),
    /**
     * HOAT DONG cua chinh nhung chiec xe do (`#278` N9).
     *
     * `/activity` la mot duong CO DINH, khong phai mot `vehicleId`. May chu khai no TRUOC route
     * tham so, nen chuoi nay khong bao gio bi doc thanh ma xe — xem
     * `stakeholder-activity.composition.spec.ts`.
     */
    activity: (range?: {
      readonly from?: string;
      readonly to?: string;
    }): Promise<StakeholderActivityView> =>
      get(`/transport/me/vehicles/activity${toQuery({ from: range?.from, to: range?.to })}`),
  },

  fleet: {
    vehicles: (): Promise<readonly Vehicle[]> => get('/transport/vehicles'),
    vehicle: (id: string): Promise<Vehicle> => get(`/transport/vehicles/${encodeURIComponent(id)}`),
    locationHealth: (id: string): Promise<LocationHealthView> =>
      get(`/transport/vehicles/${encodeURIComponent(id)}/location-health`),
    createVehicle: (input: CreateVehicleInput): Promise<Vehicle> =>
      send('POST', '/transport/vehicles', input),
    updateVehicle: (id: string, input: UpdateVehicleInput): Promise<Vehicle> =>
      send('PATCH', `/transport/vehicles/${encodeURIComponent(id)}`, input),
    assignVehicleDriver: (id: string, driverId: string): Promise<VehicleDriverAssignment> =>
      send('POST', `/transport/vehicles/${encodeURIComponent(id)}/driver`, { driverId }),
    vehicleDriverHistory: (id: string): Promise<readonly VehicleDriverAssignment[]> =>
      get(`/transport/vehicles/${encodeURIComponent(id)}/driver-history`),

    drivers: (): Promise<readonly Driver[]> => get('/transport/drivers'),
    driver: (id: string): Promise<Driver> => get(`/transport/drivers/${encodeURIComponent(id)}`),
    createDriver: (input: CreateDriverInput): Promise<Driver> =>
      send('POST', '/transport/drivers', input),
    updateDriver: (id: string, input: Partial<CreateDriverInput>): Promise<Driver> =>
      send('PATCH', `/transport/drivers/${encodeURIComponent(id)}`, input),

    customers: (): Promise<readonly TransportCustomer[]> => get('/transport/customers'),
    createCustomer: (input: CreateCustomerInput): Promise<TransportCustomer> =>
      send('POST', '/transport/customers', input),
    updateCustomer: (id: string, input: Partial<CreateCustomerInput>): Promise<TransportCustomer> =>
      send('PATCH', `/transport/customers/${encodeURIComponent(id)}`, input),

    partners: (): Promise<readonly TransportPartner[]> => get('/transport/partners'),
    createPartner: (input: CreatePartnerInput): Promise<TransportPartner> =>
      send('POST', '/transport/partners', input),
    updatePartner: (id: string, input: Partial<CreatePartnerInput>): Promise<TransportPartner> =>
      send('PATCH', `/transport/partners/${encodeURIComponent(id)}`, input),
  },

  costing: {
    /** Tra ve TOAN BO lich su so quy cua mot lai xe — khong co khoang ngay, khong co phan trang. */
    fundStatement: (driverId: string): Promise<DriverFundStatement> =>
      get(`/transport/costing/driver-fund/accounts/${encodeURIComponent(driverId)}`),
    fundPeriods: (driverId: string): Promise<readonly DriverFundPeriod[]> =>
      get(`/transport/costing/driver-fund/accounts/${encodeURIComponent(driverId)}/periods`),
    advance: (input: FundMovementInput): Promise<DriverFundEntry> =>
      send('POST', '/transport/costing/driver-fund/advances', input),
    returnFund: (input: FundMovementInput): Promise<DriverFundEntry> =>
      send('POST', '/transport/costing/driver-fund/returns', input),
    adjust: (input: AdjustFundInput): Promise<DriverFundEntry> =>
      send('POST', '/transport/costing/driver-fund/adjustments', input),
    /** Sua lich su so quy CHI bang mot but toan dao — khong co `UPDATE`, khong co `DELETE`. */
    reverseFundEntry: (id: string, reason: string): Promise<CorrelatedPosting> =>
      send('POST', `/transport/costing/driver-fund/entries/${encodeURIComponent(id)}/reversal`, {
        reason,
      }),
    openPeriod: (input: OpenFundPeriodInput): Promise<DriverFundPeriod> =>
      send('POST', '/transport/costing/driver-fund/periods', input),
    /**
     * Goi lai tren mot ky dang `CLOSING` la DUONG PHUC HOI chinh thuc, khong phai mot lan bam trung.
     * Dong ky la hai lan commit; chet giua hai lan de ky nam o `CLOSING`.
     */
    closePeriod: (id: string): Promise<ClosedFundPeriod> =>
      send('POST', `/transport/costing/driver-fund/periods/${encodeURIComponent(id)}/close`),
    reopenPeriod: (id: string, reason: string): Promise<DriverFundPeriod> =>
      send('POST', `/transport/costing/driver-fund/periods/${encodeURIComponent(id)}/reopen`, {
        reason,
      }),
    periodSnapshots: (id: string): Promise<readonly FundPeriodSnapshot[]> =>
      get(`/transport/costing/driver-fund/periods/${encodeURIComponent(id)}/snapshots`),

    tripExpenses: (tripId: string): Promise<TripCostBreakdown> =>
      get(`/transport/costing/trips/${encodeURIComponent(tripId)}/expenses`),
    recordExpense: (input: RecordTripExpenseInput): Promise<CorrelatedPosting> =>
      send('POST', '/transport/costing/expenses', input),
    /** "Xoa mot khoan chi" tren man hinh phai anh xa vao DAY. Khong co `DELETE`. */
    reverseExpense: (id: string, reason: string): Promise<CorrelatedPosting> =>
      send('POST', `/transport/costing/expenses/${encodeURIComponent(id)}/reversal`, { reason }),
  },

  fuel: {
    suppliers: (): Promise<readonly FuelSupplier[]> => get('/transport/fuel/suppliers'),
    /**
     * HOP THU cua CA DOI — #222 P1-B.
     *
     * MOT loi goi may chu, co bo loc va co phan trang. Truoc duong nay, "danh sach phieu cua doi
     * xe" chi lam duoc bang cach mo tung chuyen mot — nen no khong ton tai.
     */
    inbox: (query: FuelEntryInboxQuery = {}): Promise<FuelEntryInboxPage> =>
      get(
        `/transport/fuel/entries${toQuery({
          verification: query.verification,
          reconciliation: query.reconciliation,
          tripCode: query.tripCode,
          runCode: query.runCode,
          driverId: query.driverId,
          vehicleId: query.vehicleId,
          supplierId: query.supplierId,
          from: query.from,
          to: query.to,
          limit: query.limit,
          offset: query.offset,
        })}`,
      ),
    tripEntries: (tripId: string): Promise<readonly FuelEntry[]> =>
      get(`/transport/fuel/trips/${encodeURIComponent(tripId)}/entries`),
    entry: (id: string): Promise<FuelEntryDetail> =>
      get(`/transport/fuel/entries/${encodeURIComponent(id)}`),
    submitEntry: (input: SubmitFuelEntryInput): Promise<FuelEntry> =>
      send('POST', '/transport/fuel/entries', input),
    amendEntry: (id: string, input: FuelEntryFields): Promise<FuelEntry> =>
      send('PATCH', `/transport/fuel/entries/${encodeURIComponent(id)}`, input),
    attachEvidence: (id: string, input: AttachFuelEvidenceInput): Promise<FuelReceiptEvidence> =>
      send('POST', `/transport/fuel/entries/${encodeURIComponent(id)}/evidence`, input),
    verifyEntry: (id: string): Promise<FuelEntry> =>
      send('POST', `/transport/fuel/entries/${encodeURIComponent(id)}/verify`),
    rejectEntry: (id: string, reason: string): Promise<FuelEntry> =>
      send('POST', `/transport/fuel/entries/${encodeURIComponent(id)}/reject`, { reason }),
    /** `REJECTED -> DECLARED` qua dung vong doi da co (`#168 B5`), be mat VAN HANH. */
    resubmitEntry: (id: string): Promise<FuelEntry> =>
      send('POST', `/transport/fuel/entries/${encodeURIComponent(id)}/resubmit`),
    /** `#364` — tien cua MOT phieu dang nam o dau (so cai chuyen v1, hoac cac dong phan bo). */
    costAttribution: (id: string): Promise<FuelEntryCostAttributionView> =>
      get(`/transport/fuel/entries/${encodeURIComponent(id)}/cost-attribution`),
    attributeCost: (
      id: string,
      input: RecordFuelCostAttributionInput,
    ): Promise<FuelEntryCostAttributionView> =>
      send('POST', `/transport/fuel/entries/${encodeURIComponent(id)}/cost-attributions`, input),
    /** DAO mot dong phan bo — them dong am, lich su giu nguyen. */
    reverseCostAttribution: (
      attributionId: string,
      reason: string,
    ): Promise<FuelEntryCostAttributionView> =>
      send(
        'POST',
        `/transport/fuel/cost-attributions/${encodeURIComponent(attributionId)}/reverse`,
        { reason },
      ),

    /*
     * CHUNG TU MAY DOC + UNG VIEN (`#313`). Moi duong duoi day da co tren may chu tu Lane C;
     * truoc `#313` khong man hinh nao goi toi chung. Ung vien la thu MAY doc ra — khong duong nao o
     * day sua mot phieu hay tao mot dong tien.
     *
     * `GET documents` tra MANG TRAN (khong phong bi) — dung hinh dang cua controller.
     */
    documents: (query: FuelDocumentListQuery = {}): Promise<readonly FuelDocument[]> =>
      get(
        `/transport/fuel/documents${toQuery({
          status: query.status,
          supplierId: query.supplierId,
          limit: query.limit,
          offset: query.offset,
        })}`,
      ),
    documentReview: (id: string): Promise<FuelDocumentReview> =>
      get(`/transport/fuel/documents/${encodeURIComponent(id)}/review`),
    /** Cung byte gui lai = phat lai chung tu cu theo dau van tay, KHONG goi bo doc lan hai. */
    ingestReceiptImage: (input: IngestFuelReceiptImageInput): Promise<FuelDocumentDetail> =>
      send('POST', '/transport/fuel/documents/image', input),
    /**
     * DOC MOT ANH CHUNG TU DA LUU — `#317`, route may chu cua `#308`.
     *
     * KHONG THAN YEU CAU: may chu tu tra `evidenceId` ra byte trong kho, doi chieu voi DUNG phieu, roi
     * dua vao bo doc. Byte khong di qua trinh duyet, nen anh lon khong con vuong tran than JSON cua
     * API; va client khong can biet, khong gui duoc mot dinh vi kho nao.
     */
    extractStoredEvidence: (entryId: string, evidenceId: string): Promise<FuelDocumentDetail> =>
      send(
        'POST',
        `/transport/fuel/entries/${encodeURIComponent(entryId)}/evidence/${encodeURIComponent(evidenceId)}/extract`,
      ),
    /** Drill-down tieu hao theo xe/ky (`#313`) — chi doc. */
    vehicleConsumption: (
      vehicleId: string,
      range: { readonly from: BusinessDate; readonly to: BusinessDate },
    ): Promise<FuelVehicleConsumption> =>
      get(
        `/transport/fuel/vehicles/${encodeURIComponent(vehicleId)}/consumption${toQuery({
          from: range.from,
          to: range.to,
        })}`,
      ),

    /** Xem truoc KHONG ghi gi — an de chay truoc khi nhap that. */
    previewStatement: (input: ImportStatementInput): Promise<StatementImportPreview> =>
      send('POST', '/transport/fuel/statements/preview', input),
    importStatement: (input: ImportStatementInput): Promise<ImportedStatement> =>
      send('POST', '/transport/fuel/statements', input),

    reconciliations: (): Promise<readonly FuelReconciliation[]> =>
      get('/transport/fuel/reconciliations'),
    reconciliation: (id: string): Promise<FuelReconciliationWorkspace> =>
      get(`/transport/fuel/reconciliations/${encodeURIComponent(id)}`),
    /** KHONG tra ve trang thai moi cua ky — phai doc lai workspace sau khi chay. */
    runMatching: (id: string): Promise<MatchingRunResult> =>
      send('POST', `/transport/fuel/reconciliations/${encodeURIComponent(id)}/match`),
    /** Duong nay nam duoi `/discrepancies/`, KHONG long trong ky doi soat. */
    resolveDiscrepancy: (id: string, input: ResolveDiscrepancyInput): Promise<FuelDiscrepancy> =>
      send('POST', `/transport/fuel/discrepancies/${encodeURIComponent(id)}/resolve`, input),
    /** `#317` G0 — THEM mot quyet dinh thay the; tong cong no doi o lan DONG KY ke tiep. */
    reviseDiscrepancy: (
      id: string,
      input: ReviseDiscrepancyInput,
    ): Promise<RevisedDecisionResult> =>
      send('POST', `/transport/fuel/discrepancies/${encodeURIComponent(id)}/revise`, input),
    /** Bi chan khi con `pendingDiscrepancyCount > 0`. */
    closeReconciliation: (id: string): Promise<ClosedReconciliationResult> =>
      send('POST', `/transport/fuel/reconciliations/${encodeURIComponent(id)}/close`),
    reopenReconciliation: (id: string, reason: string): Promise<FuelReconciliation> =>
      send('POST', `/transport/fuel/reconciliations/${encodeURIComponent(id)}/reopen`, { reason }),
  },

  /**
   * `TX-08` PHI DUONG BO / ETC — #295 Lane V. Muoi ba duong cua `TollController`.
   *
   * ==============================================================================================
   * KHONG MOT DUONG XOA NAO, va do la mot quyet dinh chu khong mot thieu sot.
   *
   * May chu khong mo `DELETE` o dau: mot lan nap la mot su kien da xay ra, va go no di se lam moi
   * quyet dinh doi soat truoc do tro vao hu khong. Sua mot dong sai = GHI THEM mot quyet dinh
   * (`review`). Nen o day cung khong co ham nao goi `remove`.
   *
   * ==============================================================================================
   * DANH SACH TRA VE MANG TRAN, nen dung `get` chu khong `getList`.
   *
   * `getList` ton tai cho nhung duong goi phong bi (`{ plans }`, `{ payslips }`, …). `TollController`
   * tra thang mang cho tai khoan/doan noi/lan nap, va CHI hang doi soat moi co phong bi
   * (`{ items, total, limit, offset }`) vi no co phan trang. Goi `getList` len mot mang tran se nem
   * `502` cho mot phan hoi hoan toan dung hop dong.
   */
  toll: {
    providers: (): Promise<TollProviderSurface> => get('/transport/toll/providers'),

    accounts: (provider?: TollProvider | null): Promise<readonly TollAccount[]> =>
      get(`/transport/toll/accounts${toQuery({ provider })}`),
    createAccount: (input: CreateTollAccountInput): Promise<TollAccount> =>
      send('POST', '/transport/toll/accounts', input),
    setAccountActive: (id: string, active: boolean): Promise<TollAccount> =>
      send('PATCH', `/transport/toll/accounts/${encodeURIComponent(id)}`, { active }),

    /**
     * So doan noi cua MOT tai khoan — kem `effective` DA duoc may chu cham cho tung doan.
     *
     * Tra ve mot bao (`{ onDate, links }`) chu khong mot mang tran: con so va moc ngay phai di
     * cung nhau, neu khong man hinh se hien mot ket luan ma khong noi duoc no tinh vao ngay nao.
     */
    links: (accountId: string): Promise<TollAccountLinkListing> =>
      get(`/transport/toll/accounts/${encodeURIComponent(accountId)}/links`),
    /**
     * So xe dang nhan chi tra cua TUNG tai khoan — MOT lan hoi cho ca bang.
     *
     * Ton tai vi `links(accountId)` chi tra loi ve MOT tai khoan: dem tren ket qua cua no roi hien
     * cho moi dong se cho `0` o moi tai khoan chua duoc chon. Va mot vong lap goi `links()` cho
     * tung dong la N yeu cau cho mot con so.
     */
    linkCounts: (): Promise<readonly TollAccountLinkCount[]> =>
      get('/transport/toll/accounts/link-counts'),
    openLink: (accountId: string, input: OpenTollLinkInput): Promise<TollAccountVehicleLink> =>
      send('POST', `/transport/toll/accounts/${encodeURIComponent(accountId)}/links`, input),
    /**
     * DONG mot doan noi — `PATCH`, khong `DELETE`.
     *
     * "Xe doi tai khoan" phai giu duoc CA HAI doan: mot luot qua tram thang truoc thuoc ve tai khoan
     * CU. Xoa doan cu se lam moi dong cu tro thanh `VEHICLE_UNRESOLVED` — mot lich su bi viet lai
     * boi mot thao tac hom nay.
     */
    closeLink: (linkId: string, effectiveTo: BusinessDate): Promise<TollAccountVehicleLink> =>
      send('PATCH', `/transport/toll/links/${encodeURIComponent(linkId)}`, { effectiveTo }),
    /**
     * `#314` — lich su nhan chi tra cua MOT XE qua MOI tai khoan, `effective` do may chu cham.
     *
     * La cau tra loi cho `TOLL_VEHICLE_ALREADY_LINKED`: xe nay DANG o tai khoan nao, tu ngay nao.
     */
    vehicleLinks: (vehicleId: string): Promise<TollAccountLinkListing> =>
      get(`/transport/toll/vehicles/${encodeURIComponent(vehicleId)}/links`),

    /** DOC THU — khong ghi mot hang nao. An toan de bam bao nhieu lan cung duoc. */
    previewImport: (input: TollImportInput): Promise<TollImportPreview> =>
      send('POST', '/transport/toll/imports/preview', input),
    commitImport: (input: TollImportInput): Promise<TollCommittedImport> =>
      send('POST', '/transport/toll/imports', input),
    imports: (provider?: TollProvider | null): Promise<readonly TollImport[]> =>
      get(`/transport/toll/imports${toQuery({ provider })}`),

    candidates: (query: TollCandidateQuery = {}): Promise<TollCandidatePage> =>
      get(
        `/transport/toll/candidates${toQuery({
          provider: query.provider,
          importId: query.importId,
          accountId: query.accountId,
          matchState: query.matchState,
          reviewState: query.reviewState,
          limit: query.limit,
          offset: query.offset,
        })}`,
      ),
    candidate: (id: string): Promise<TollCandidateDetail> =>
      get(`/transport/toll/candidates/${encodeURIComponent(id)}`),
    /**
     * `#314` — dong CUNG nha cung cap + CUNG dau van, de chon DUNG MOT dong khi noi "trung". CHI DOC:
     * may chu khong chon ho, va quyet dinh van chi di qua `review`.
     */
    duplicatePeers: (id: string): Promise<TollDuplicatePeerListing> =>
      get(`/transport/toll/candidates/${encodeURIComponent(id)}/duplicate-peers`),
    review: (id: string, input: TollReviewInput): Promise<TollCandidate> =>
      send('POST', `/transport/toll/candidates/${encodeURIComponent(id)}/review`, input),

    /**
     * `#314` — CHI PHI ETC THEO XE / KY, do MAY CHU cong. Vang `from`/`to` thi may chu lay thang
     * nghiep vu hien tai theo mui gio khach — man hinh KHONG tu dat "thang nay" tu dong ho trinh duyet.
     */
    spendReport: (query: TollSpendReportQuery = {}): Promise<TollSpendReport> =>
      get(
        `/transport/toll/reports/spend${toQuery({
          from: query.from,
          to: query.to,
          provider: query.provider,
        })}`,
      ),
  },

  /**
   * Be mat CUA CHINH MINH. Khong mot duong nao o day nhan `:driverId` — danh tinh den tu phien, va
   * do la cach `INV-09` duoc cuong che bang CAU TRUC chu khong bang bo loc.
   */
  me: {
    trips: (): Promise<readonly DriverTripView[]> => get('/transport/me/trips'),

    /**
     * NHAN VIEC TAI DIA DIEM A — `#267` H2/H4.
     *
     * `POST` cho ca duong DOC, va do khong phai mot nham lan REST: than yeu cau mang toa do cua mot
     * con nguoi, va mot chuoi truy van se nam trong nhat ky may chu, trong `Referer`, va trong
     * lich su trinh duyet. Quy uoc bao mat cua repo cam dua du lieu ca nhan vao URL.
     *
     * HAI ham RIENG, khong mot ham co co `create: true`: `proposeSite` KHONG ghi mot hang nao,
     * `confirmSite` tao mot vong chay. Do la ranh gioi ma ca `#267` xoay quanh, va no phai nhin
     * thay duoc ngay o day.
     */
    proposeSite: (input: SiteIntakeLocationInput = {}): Promise<SiteIntakeProposal> =>
      send('POST', '/transport/me/site-intake/proposals', input),
    /**
     * `clientEventId` la KHOA CHONG LAP, va no phai on dinh qua cac lan thu lai cua CUNG mot cham.
     * Sinh moi o moi lan goi lai se bien mot lan mat song thanh hai vong chay — nen no den tu tang
     * goi, khong tu day.
     */
    confirmSite: (input: ConfirmSiteIntakeInput): Promise<SiteIntakeResult> =>
      send('POST', '/transport/me/site-intake/confirmations', input),
    trip: (id: string): Promise<DriverTripView> =>
      get(`/transport/me/trips/${encodeURIComponent(id)}`),
    /** Lai xe chi dat duoc `IN_TRANSIT` hoac `DELIVERED`. `RECONCILED` doi mot lan chuyen tay khac. */
    setTripStatus: (id: string, to: 'IN_TRANSIT' | 'DELIVERED'): Promise<DriverTripView> =>
      send('PATCH', `/transport/me/trips/${encodeURIComponent(id)}/status`, { to }),
    /**
     * VIEC HIEN TRUONG (`#279` O9) — MOT lan doc, tra ve danh sach NUT ma may chu da tinh.
     *
     * Man hinh KHONG tu suy ra nut tu mot enum trang thai: quy tac thu tu moc, chinh sach chung cu
     * vi tri va chinh sach chung tu deu song o may chu. Lam lai chung o day se cho ra HAI ban luat,
     * va ban tren dien thoai se cu roi lai sau moi lan luat doi.
     */
    fieldWork: (): Promise<DriverFieldWork> => get('/transport/me/field-work'),
    /**
     * BON DUONG GHI cua man hinh hien truong. `clientEventId` den tu TANG GOI, khong sinh o day —
     * mot lan thu lai phai mang DUNG khoa cu, neu khong may chu se ghi mot hang thu hai.
     */
    recordCheckpoint: (input: RecordCheckpointInput): Promise<unknown> =>
      send('POST', '/transport/me/checkpoints', input),
    /**
     * BAM VI TRI — hai duong, va ca hai la DUONG CUA CHINH LAI XE (`#327`).
     *
     * ==========================================================================================
     * KHONG MOT `driverId` HAY `vehicleId` NAO O DAY
     * ==========================================================================================
     *
     * Danh tinh den tu phien dang nhap; chiec xe do MAY CHU doc tu vong chay (hoac tu ban phan
     * cong chuyen). Neu hai truong do di qua duoc bien nay, mot lai xe gan duoc chuoi toa do cua
     * minh vao ten dong nghiep hoac vao mot chiec xe bat ky — va khong lop kiem quyen nao ben tren
     * bat duoc, vi nguoi goi VAN dang dung quyen cua chinh ho.
     *
     * `openTrackingSession` la IDEMPOTENT o may chu: goi lai tren dung chu the do tra ve DUNG
     * phien cu. Nen man hinh khong phai nho trang thai phien qua cac lan tai lai — no cu goi.
     */
    openTrackingSession: (input: OpenTrackingSessionInput): Promise<DriverTrackingSession> =>
      send('POST', '/transport/me/tracking/sessions', input),
    /**
     * MOT LO, va `clientEventId` den tu TANG GOI.
     *
     * May chu tra ve mot mang CUNG DO DAI voi dau vao, theo thu tu — nen mot lan gui lai mot phan
     * la an toan: ban da co tra ve ban cu (cung `id`), ban moi duoc ghi.
     */
    reportObservations: (
      sessionId: string,
      observations: readonly ReportObservationInput[],
    ): Promise<readonly DriverLocationObservation[]> =>
      send(
        'POST',
        `/transport/me/tracking/sessions/${encodeURIComponent(sessionId)}/observations`,
        { observations },
      ),
    startWaiting: (input: StartWaitingInput): Promise<unknown> =>
      send('POST', '/transport/me/waiting-sessions', input),
    recordDocument: (input: RecordDocumentInput): Promise<unknown> =>
      send('POST', '/transport/me/documents', input),
    recordReceiptHandover: (input: DriverHandoverInput): Promise<unknown> =>
      send('POST', '/transport/me/receipt-handovers', input),
    fund: (): Promise<DriverFundStatement> => get('/transport/me/fund'),
    /**
     * CAY XANG ma lai xe duoc doc — `GET /transport/me/fuel/suppliers`.
     *
     * KHONG dung `fuel.suppliers()`: duong do doi `transport.fuel.entry.read`, mot quyen van hanh.
     * Lai xe goi vao do se an 403, va o chon cay xang tren be mat cua ho se rong vinh vien.
     */
    fuelSuppliers: (): Promise<readonly DriverFuelSupplier[]> =>
      get('/transport/me/fuel/suppliers'),
    /**
     * TRAM/DIEM DO cua mot cay xang — `GET /transport/me/fuel/stations?supplierId=` (`#317` G1).
     *
     * Cung ly do voi `fuelSuppliers`: danh muc tram cua van hanh doi `transport.fuel.station.read`.
     */
    fuelStations: (supplierId: string): Promise<readonly DriverFuelStation[]> =>
      get(`/transport/me/fuel/stations${toQuery({ supplierId })}`),
    /**
     * `#364` — VIEC DUOC DIEU lai xe khai phieu dau duoc (vong xe dang mo + bien so + chang).
     * Chi de DE XUAT tren o khai phieu; lenh nop van bi may chu kiem lai.
     */
    fuelRuns: (): Promise<readonly DriverFuelRunView[]> => get('/transport/me/fuel/runs'),
    fuelSlips: (): Promise<readonly DriverFuelSlipView[]> => get('/transport/me/fuel/slips'),
    fuelSlip: (id: string): Promise<DriverFuelSlipView> =>
      get(`/transport/me/fuel/slips/${encodeURIComponent(id)}`),
    submitFuelSlip: (input: DriverFuelSubmitInput): Promise<DriverFuelSlipView> =>
      send('POST', '/transport/me/fuel/slips', input),
    attachFuelEvidence: (id: string, input: AttachFuelEvidenceInput): Promise<DriverFuelSlipView> =>
      send('POST', `/transport/me/fuel/slips/${encodeURIComponent(id)}/evidence`, input),
    /**
     * TAI ANH THAT (#169). Mot lan goi: byte vao kho roi gan vao phieu, khong de object mo coi.
     *
     * `/upload` chu KHONG phai `/evidence`: `attachFuelEvidence` ngay tren da chiem duong do o may
     * chu, va hai route cung method + cung path thi Nest chi gan MOT cai. Ban truoc goi cung mot
     * URL, nen moi lan tai anh deu tra 400 `body: expected object, received undefined` — do duoc
     * tren ban DA TRIEN KHAI o T9, khong phai suy dien tu ma nguon.
     */
    uploadFuelEvidence: (id: string, file: File): Promise<DriverFuelSlipView> => {
      const form = new FormData();
      form.append('file', file);
      return sendForm(`/transport/me/fuel/slips/${encodeURIComponent(id)}/evidence/upload`, form);
    },

    /**
     * GO MOT CHUNG TU DA TAI NHAM — #222 P1-C.
     *
     * `DELETE` chu khong `POST .../withdraw`: day dung la mot lan go mot tai nguyen co dia chi, va
     * dung dung method cua no lam duong nay tu mo ta duoc trong log proxy va trong bang route.
     *
     * KHONG mot `driverId` nao tren duong dan — danh tinh den tu phien (`INV-09`). May chu tra ve
     * phieu DA CAP NHAT, nen man hinh khong phai doan trang thai moi.
     */
    removeFuelEvidence: (slipId: string, evidenceId: string): Promise<DriverFuelSlipView> =>
      remove(
        `/transport/me/fuel/slips/${encodeURIComponent(slipId)}/evidence/${encodeURIComponent(evidenceId)}`,
      ),
    /** `REJECTED -> DECLARED` qua dung vong doi da co (`#168 B5`). */
    resubmitFuelSlip: (id: string): Promise<DriverFuelSlipView> =>
      send('POST', `/transport/me/fuel/slips/${encodeURIComponent(id)}/resubmit`),

    /** `#168 B4` — danh muc de CHON, khong de go thu roi doi may chu bao sai. */
    expenseCategories: (): Promise<ExpenseCatalogue> => get('/transport/me/expense-categories'),
    /** `#168 B3`. Than KHONG nhan `driverId`/`fundedBy` — ca hai la 400 tuong minh. */
    recordExpense: (input: DriverSelfExpenseInput): Promise<CorrelatedPosting> =>
      send('POST', '/transport/me/expenses', input),
    /**
     * `#169` acceptance 4 — khoan chi KEM ANH, MOT lan goi.
     *
     * Khong co duong "gan anh sau": `TripExpense.evidenceLocator` la mot COT duoc dat luc `INSERT`,
     * va so cai append-only khong cho sua mot hang da ghi (`INV-22`).
     */
    recordExpenseWithEvidence: (
      input: DriverSelfExpenseInput,
      file: File,
    ): Promise<CorrelatedPosting> => {
      const form = new FormData();
      form.append('tripId', input.tripId);
      form.append('categoryCode', input.categoryCode);
      form.append('amount', String(input.amount));
      if (input.businessDate) form.append('businessDate', input.businessDate);
      if (input.note) form.append('note', input.note);
      if (input.correlationKey) form.append('correlationKey', input.correlationKey);
      form.append('file', file);
      return sendForm('/transport/me/expenses/with-evidence', form);
    },

    /** `#168 B8` — CHI DOC, chi phieu DA CONG BO. Khong tham so, khong `:driverId`. */
    payslips: (): Promise<readonly DriverPayslipView[]> => get('/transport/me/payslips'),
    payslip: (id: string): Promise<DriverPayslipView> =>
      get(`/transport/me/payslips/${encodeURIComponent(id)}`),

    /**
     * `TX-07b` — bang quyet toan CUA CHINH TOI. CHI DOC, khong tham so, khong `:driverId`.
     *
     * Khong co ham nao o day ghi mot lan chi: mot nguoi tu chi tien cho chinh minh la dung cai ma
     * kiem soat noi bo sinh ra de chan. Neu mot ham nhu the xuat hien o khoi nay, do la mot loi.
     */
    settlement: (): Promise<DriverSettlementSelfStatement> => get('/transport/me/settlement'),
  },

  /**
   * `TX-05` — BAO CAO quyet toan. CHI DOC, khong mot lenh ghi nao (`#168 B1`).
   *
   * `SettlementService` co du lenh ghi tai chinh nhung khong lenh nao duoc phoi ra hay gan quyen.
   * Neu mot ham o day doc len nhu mot lenh ghi, do la mot loi — khong phai mot tinh nang thieu.
   */
  settlement: {
    /** `asOf` BAT BUOC: mot mac dinh im lang lam hai nguoi mo cung man qua nua dem doc hai bang. */
    arAging: (asOf: BusinessDate, customerId?: string | null): Promise<ArAgingReport> => {
      const params = new URLSearchParams({ asOf });
      if (customerId) params.set('customerId', customerId);
      return get(`/transport/settlement/ar-aging?${params.toString()}`);
    },
    /** `flow` BAT BUOC — `GD-15` o tang HTTP: khong co ban "tat ca cac dong". */
    apByFlow: (flow: SettlementFlow): Promise<readonly ApByCounterpartyRow[]> =>
      get(`/transport/settlement/ap?flow=${encodeURIComponent(flow)}`),
    partnerPosition: (partnerId: string): Promise<PartnerPosition> =>
      get(`/transport/settlement/partners/${encodeURIComponent(partnerId)}/position`),
    documentChain: (originalId: string): Promise<SettlementDocumentChain> =>
      get(`/transport/settlement/documents/${encodeURIComponent(originalId)}/chain`),
  },

  /** `TX-06` — bao duong, giay to, trang thai hieu luc, bang canh bao. */
  assets: {
    plans: (): Promise<readonly MaintenancePlan[]> =>
      getList('/transport/maintenance/plans', 'plans'),
    createPlan: (input: CreateMaintenancePlanInput): Promise<MaintenancePlan> =>
      send('POST', '/transport/maintenance/plans', input),
    updatePlan: (id: string, input: UpdateMaintenancePlanInput): Promise<MaintenancePlan> =>
      send('PATCH', `/transport/maintenance/plans/${encodeURIComponent(id)}`, input),
    /** MAY CHU tinh den han. Man hinh khong duoc tinh lai — xem `#170 §4.B`. */
    due: (): Promise<readonly MaintenanceDue[]> => getList('/transport/maintenance/due', 'due'),
    workOrders: (): Promise<readonly MaintenanceWorkOrder[]> =>
      getList('/transport/maintenance/work-orders', 'workOrders'),
    openWorkOrder: (input: OpenWorkOrderInput): Promise<MaintenanceWorkOrder> =>
      send('POST', '/transport/maintenance/work-orders', input),
    completeWorkOrder: (id: string, input: CompleteWorkOrderInput): Promise<MaintenanceWorkOrder> =>
      send('POST', `/transport/maintenance/work-orders/${encodeURIComponent(id)}/complete`, input),
    cancelWorkOrder: (id: string, reason: string): Promise<MaintenanceWorkOrder> =>
      send('POST', `/transport/maintenance/work-orders/${encodeURIComponent(id)}/cancel`, {
        reason,
      }),

    complianceDocuments: (): Promise<readonly ComplianceDocument[]> =>
      getList('/transport/compliance/documents', 'documents'),
    registerComplianceDocument: (
      input: RegisterComplianceDocumentInput,
    ): Promise<ComplianceDocument> => send('POST', '/transport/compliance/documents', input),
    setComplianceDocumentStatus: (
      id: string,
      status: ComplianceDocumentStatus,
    ): Promise<ComplianceDocument> =>
      send('PATCH', `/transport/compliance/documents/${encodeURIComponent(id)}/status`, { status }),
    complianceAlerts: (): Promise<readonly ComplianceAlert[]> =>
      getList('/transport/compliance/alerts', 'alerts'),

    fleetStatus: (): Promise<readonly EffectiveVehicleState[]> =>
      getList('/transport/fleet-status', 'vehicles'),
    /** BANG CANH BAO GOM CHUNG — `unavailableSources` phai duoc hien, khong duoc bo. */
    operationalAlerts: (): Promise<OperationalAlertFeed> => get('/transport/alerts'),
  },

  /** `TX-07` — ky luong va phieu luong. Man hinh KHONG BAO GIO tu tinh mot khoan luong nao. */
  payroll: {
    periods: (): Promise<readonly PayrollPeriod[]> =>
      getList('/transport/payroll/periods', 'periods'),
    openPeriod: (input: OpenPayrollPeriodInput): Promise<PayrollPeriod> =>
      send('POST', '/transport/payroll/periods', input),
    closePeriod: (id: string): Promise<PayrollPeriod> =>
      send('POST', `/transport/payroll/periods/${encodeURIComponent(id)}/close`),
    runs: (periodId: string): Promise<readonly PayrollRun[]> =>
      getList(`/transport/payroll/periods/${encodeURIComponent(periodId)}/runs`, 'runs'),
    run: (input: RunPayrollInput): Promise<PayrollRun> =>
      send('POST', '/transport/payroll/runs', input),
    /**
     * BOC HAI LOP. May chu tra `{ payslips: [{ payslip, components }] }` — moi hang la mot phieu
     * KEM cac khoan cong/tru cua no. Man hinh bang phieu luong chi can phan `payslip`; ai can
     * `components` thi doc chi tiet mot phieu (`payslip(id)`), va do la mot lan goi khac.
     */
    payslipsOfRun: async (runId: string): Promise<readonly Payslip[]> => {
      const rows = await getList<{ readonly payslip?: Payslip } | Payslip>(
        `/transport/payroll/runs/${encodeURIComponent(runId)}/payslips`,
        'payslips',
      );
      return rows.map((row) => ('payslip' in row && row.payslip ? row.payslip : (row as Payslip)));
    },
    payslip: (id: string): Promise<PayslipDetail> =>
      get(`/transport/payroll/payslips/${encodeURIComponent(id)}`),
    approvePayslip: (id: string): Promise<Payslip> =>
      send('POST', `/transport/payroll/payslips/${encodeURIComponent(id)}/approve`),
    payPayslip: (id: string): Promise<Payslip> =>
      send('POST', `/transport/payroll/payslips/${encodeURIComponent(id)}/pay`),
    /** SUA mot phieu DA CHOT = phat mot phieu bu/dao, KHONG sua so cu (`INV-20`). */
    correctPayslip: (id: string, input: CorrectPayslipInput): Promise<Payslip> =>
      send('POST', `/transport/payroll/payslips/${encodeURIComponent(id)}/corrections`, input),
  },

  /**
   * `TX-07b` — chi tien cho lai xe va phan bo theo thang (Issue #237).
   *
   * KHONG co ham `update`/`delete` nao, va do la `INV-20` viet thanh hinh dang cua chinh doi tuong
   * nay: sua mot lan chi da ghi chi co MOT duong, va duong do la `reverseCashout`.
   */
  driverSettlement: {
    balances: (): Promise<readonly DriverSettlementBalance[]> =>
      getList('/transport/driver-settlement/balances', 'balances'),
    statement: (driverId: string): Promise<DriverSettlementStatement> =>
      get(`/transport/driver-settlement/drivers/${encodeURIComponent(driverId)}`),
    recordCashout: async (input: RecordCashoutInput): Promise<DriverCashoutDetail> => {
      const body = await send<{ readonly cashout: DriverCashoutDetail }>(
        'POST',
        '/transport/driver-settlement/cashouts',
        input,
      );
      return body.cashout;
    },
    reverseCashout: async (id: string, reason: string): Promise<DriverCashoutDetail> => {
      const body = await send<{ readonly cashout: DriverCashoutDetail }>(
        'POST',
        `/transport/driver-settlement/cashouts/${encodeURIComponent(id)}/reversal`,
        { reason },
      );
      return body.cashout;
    },
  },

  /**
   * MO HINH VAN CHUYEN v2 — HAI TRUC DOC LAP (`D-01`).
   *
   * Danh sach o day tra ve MANG TRAN, dung nhu `transport-core` da lam cho chuyen va doi xe.
   * Chin duong cua `TX-06`/`TX-07` dung phong bi la mot lua chon RIENG cua chung, khong phai
   * mot quy uoc chung — xem `transport-api-envelope.spec.ts`.
   */
  movement: {
    orders: (): Promise<readonly TransportOrder[]> => get('/transport/orders'),
    order: (id: string): Promise<TransportOrder> =>
      get(`/transport/orders/${encodeURIComponent(id)}`),
    /**
     * `#379` — hai TOA DO la BAT BUOC: may chu (`createOrderSchema`) tu choi mot don moi chi co nhan
     * chu. Nhan chi con de hien thi; dieu xe doc toa do cua don, khong suy tu chu.
     */
    createOrder: (input: CreateOrderInput): Promise<TransportOrder> =>
      send('POST', '/transport/orders', input),
    fulfilOrder: (id: string): Promise<TransportOrder> =>
      send('POST', `/transport/orders/${encodeURIComponent(id)}/transition`, { to: 'FULFILLED' }),
    cancelOrder: (id: string, reason: string): Promise<TransportOrder> =>
      send('POST', `/transport/orders/${encodeURIComponent(id)}/cancel`, { reason }),

    runs: (): Promise<readonly VehicleRun[]> => get('/transport/runs'),
    run: (id: string): Promise<VehicleRunDetail> =>
      get(`/transport/runs/${encodeURIComponent(id)}`),
    /** Tra ca `complete` — man hinh phai noi ra khi con chang thieu km. */
    distance: (id: string): Promise<RunDistanceSummary> =>
      get(`/transport/runs/${encodeURIComponent(id)}/distance`),
    /** #276 L6 — DA DI vs DU DINH, hai o rieng. Man hinh KHONG duoc cong chung lai. */
    movementSummary: (id: string): Promise<RunMovementSummary> =>
      get(`/transport/runs/${encodeURIComponent(id)}/movement`),
    /** Chang phuc vu mot don — cach doc ORDER-FIRST "don nay dang di den dau". */
    orderLegs: (orderId: string): Promise<readonly RunLeg[]> =>
      get(`/transport/orders/${encodeURIComponent(orderId)}/legs`),
    createRun: (input: {
      code: string;
      vehicleId: string;
      businessDate?: string;
    }): Promise<VehicleRun> => send('POST', '/transport/runs', input),
    addLeg: (
      runId: string,
      input: {
        sequence: number;
        kind: RunLegKind;
        originLabel: string;
        destinationLabel: string;
        orderId?: string | null;
        distanceKm?: number | null;
      },
    ): Promise<unknown> => send('POST', `/transport/runs/${encodeURIComponent(runId)}/legs`, input),
    startRun: (id: string): Promise<VehicleRun> =>
      send('POST', `/transport/runs/${encodeURIComponent(id)}/transition`, { to: 'ACTIVE' }),
    assignRun: (id: string, driverId: string): Promise<unknown> =>
      send('POST', `/transport/runs/${encodeURIComponent(id)}/assignment`, { driverId }),
    /**
     * VAN PHONG TIEN MOT CHANG — `#376`: `PLANNED -> IN_TRANSIT -> COMPLETED`.
     *
     * `overrideReason` chi di kem khi nguoi dung GHI DE TUONG MINH trai hien truong (`#332`) — mot
     * truong vang mat thi `JSON.stringify` bo han, dung hop dong `.strict()` cua may chu. Phan xu
     * dong vong chay chay SAU lan ghi va tra ve trong `closure`: web khong co duong nao dong vong
     * chay (`#293`).
     */
    transitionLeg: (
      runId: string,
      legId: string,
      input: { readonly to: LegTransitionTarget; readonly overrideReason?: string },
    ): Promise<LegTransitionResult> =>
      send(
        'POST',
        `/transport/runs/${encodeURIComponent(runId)}/legs/${encodeURIComponent(legId)}/transition`,
        input.overrideReason === undefined
          ? { to: input.to }
          : { to: input.to, overrideReason: input.overrideReason },
      ),
  },

  /**
   * LAP KE HOACH VONG CHAY DO HE THONG QUAN (#276 Lane L).
   *
   * Moi duong GHI o day bat dau bang mot DON, khong bang mot vong chay — do la ca diem cua #274:
   * sep/ke toan lam viec voi don, con vong chay la su that van hanh he thong tu dung lay.
   *
   * `closure` KHONG phai nut "dong vong chay": no chay lai phan xu tat dinh va thi hanh ket qua.
   * Goi tren mot vong chay chua du dieu kien tra `closed: false` kem ly do — khong phai mot loi.
   */
  planning: {
    /**
     * `Promise<unknown>` cho toi `#294`: khong man hinh nao doc ket qua nay, nen khong ai can mot
     * kieu. Man hinh dieu xe la nguoi doc dau tien — no can biet khach co o che do `MULTI_ORDER_RUN`
     * khong de noi truoc, thay vi de nguoi dung bam "Tim xe" roi nhan 403.
     */
    policy: (): Promise<TransportPlanningPolicyView> => get('/transport/planning/policy'),
    plans: (orderId: string): Promise<readonly OrderRunPlan[]> =>
      get(`/transport/planning/orders/${encodeURIComponent(orderId)}/plans`),
    /** KHONG ghi mot hang nao. Goi bao nhieu lan cung duoc. */
    preview: (
      orderId: string,
      input: { vehicleId: string; plannedEmptyKm?: number | null; plannedLoadedKm?: number | null },
    ): Promise<RunPlanProposal> =>
      send('POST', `/transport/planning/orders/${encodeURIComponent(orderId)}/preview`, input),
    commit: (
      orderId: string,
      input: {
        vehicleId: string;
        idempotencyKey: string;
        plannedEmptyKm?: number | null;
        plannedLoadedKm?: number | null;
      },
    ): Promise<unknown> =>
      send('POST', `/transport/planning/orders/${encodeURIComponent(orderId)}/plan`, input),
    cancelPlan: (planId: string, reason: string): Promise<OrderRunPlan> =>
      send('POST', `/transport/planning/plans/${encodeURIComponent(planId)}/cancel`, { reason }),
    projection: (vehicleId: string): Promise<unknown> =>
      get(`/transport/planning/vehicles/${encodeURIComponent(vehicleId)}/projection`),
    closure: (runId: string): Promise<RunClosureVerdict> =>
      get(`/transport/planning/runs/${encodeURIComponent(runId)}/closure`),
  },

  /** DE NGHI CHI + CONG DUYET (`D-06`). Duyet va tu choi la HAI duong rieng. */
  claims: {
    list: (status?: ExpenseClaimStatus): Promise<readonly ExpenseClaim[]> =>
      get(
        status === undefined
          ? '/transport/expense-claims'
          : `/transport/expense-claims?status=${encodeURIComponent(status)}`,
      ),
    get: (id: string): Promise<ExpenseClaimDetail> =>
      get(`/transport/expense-claims/${encodeURIComponent(id)}`),
    submit: (input: {
      driverId: string;
      categoryCode: string;
      claimedAmount: number;
      tripId?: string | null;
      runId?: string | null;
      note?: string | null;
    }): Promise<ExpenseClaim> => send('POST', '/transport/expense-claims', input),
    approve: (
      id: string,
      input: { reasonCode: string; approvedAmount?: number; note?: string | null },
    ): Promise<ExpenseClaimDetail> =>
      send('POST', `/transport/expense-claims/${encodeURIComponent(id)}/approve`, input),
    reject: (
      id: string,
      input: { reasonCode: string; note?: string | null },
    ): Promise<ExpenseClaimDetail> =>
      send('POST', `/transport/expense-claims/${encodeURIComponent(id)}/reject`, input),
  },

  /**
   * THAP DIEU HANH (Lane G, #244) — MOT lan goi, MOT khung nhin.
   *
   * `get` chu khong `getList`: may chu tra ve mot DOI TUONG (`ControlTowerView`), khong phai mot
   * phong bi bao quanh mot mang. Xem `control-tower.controller.ts` — mot route `@Get()` duy nhat,
   * va do la co y: ba lan goi cho `/board`, `/queue`, `/fleet` se cho ra ba anh chup o ba khoanh
   * khac khac nhau, roi man hinh se tu mau thuan voi chinh no.
   */
  controlTower: {
    view: (): Promise<ControlTowerView> => get('/transport/control-tower'),
  },

  /**
   * BANG TAI CHINH (Lane G, #244 G5) — mot DOI TUONG, nen `get` chu khong `getList`.
   *
   * Khong co bien the `?combined=true`: `SettlementBuckets` co y khong co truong tong, va mot tham
   * so gop se dung lai chinh cai cong ma `GD-15` da dong o tang duoi.
   */
  finance: {
    summary: (): Promise<FinanceSummaryView> => get('/transport/finance/summary'),
    /**
     * `#381`/`#385` — hieu qua TUNG viec (chuyen cu + don theo vong xe) kem tong CUA MAY CHU. Man
     * hinh doc `totals`, khong goi N lan theo vong xe roi tu cong.
     */
    margin: (): Promise<FinanceMarginView> => get('/transport/finance/margin'),
  },

  /**
   * BAO CAO BAN DO VONG CHAY (Lane N, #278 N5) — HAI lan goi, va do la co y.
   *
   * `run()` di sau `transport.run.read`; `map()` di sau `transport.location.history.read`, ma ke
   * toan KHONG co. Gop hai lan goi lam mot se buoc may chu tra toa do duoi ma quyen thu nhat —
   * tuc am tham cap cho ke toan dung cai quyen ma ma tran vai da tu choi ho.
   *
   * Nen man hinh goi rieng, va mot `403` o `map()` la mot cau tra loi DUNG: bao cao van ve, chi
   * khong co ban do.
   *
   * `runRef` la MA vong chay (`navigation.ts` cam mot `id` ky thuat len dia chi), nhung may chu
   * nhan ca hai — xem `JourneyController`.
   */
  journey: {
    run: (runRef: string): Promise<RunJourneyView> =>
      get(`/transport/journey/runs/${encodeURIComponent(runRef)}`),
    map: (runRef: string): Promise<RunJourneyMapView> =>
      get(`/transport/journey/runs/${encodeURIComponent(runRef)}/map`),
  },

  /**
   * DE NGHI DIEU XE (Lane M, #277) — `POST`, va do KHONG phai mot lan ghi.
   *
   * `POST` vi lan goi mang mot the yeu cau (diem lay hang, han gio, tai trong) va co the goi mot
   * nha cung cap dinh tuyen that — no co chi phi, co `@Throttle`, va khong dat vao mot URL duoc.
   * `assignmentCreated: false` trong DTO nhac lai rang khong gi bi ghi.
   *
   * `assign()` la mot LENH KHAC: ma quyen khac (`transport.run.manage`), va no chi duoc goi sau khi
   * mot con nguoi bam. Man hinh khong bao gio goi no thay nguoi dung.
   */
  /**
   * DIA DIEM cho man tao don (`#379`) — ca ba deu CHI chay khi nguoi dung mo man tao don.
   *
   * `search`/`reverse` la `POST` du chi doc: moi lan co the goi mot nha cung cap ngoai co gioi han
   * luot (`@Throttle` + cong 1 lan/giay o may chu), nen chung khong duoc nam trong mot URL de trinh
   * duyet tu goi lai. Than chi co CHUOI nguoi dung go hoac TOA DO nguoi dung bam — khong mot ma
   * khach, ma don hay ma nguoi dung nao di theo ra nha cung cap.
   *
   * That bai (tat, ban, nha cung cap sap) la mot `status` trong than 200, khong phai mot loi HTTP.
   */
  places: {
    known: (): Promise<KnownPlacesResponse> => get('/transport/places/known'),
    search: (query: string): Promise<PlaceSearchResponse> =>
      send('POST', '/transport/places/search', { query }),
    reverse: (point: GeoPoint): Promise<PlaceReverseResponse> =>
      send('POST', '/transport/places/reverse', {
        latitude: point.latitude,
        longitude: point.longitude,
      }),
  },

  dispatch: {
    suggest: (
      orderId: string,
      body: Readonly<Record<string, unknown>> = {},
    ): Promise<DispatchSuggestionView> =>
      send('POST', `/transport/orders/${encodeURIComponent(orderId)}/dispatch-suggestions`, body),
    assign: (orderId: string, body: Readonly<Record<string, unknown>>): Promise<unknown> =>
      send('POST', `/transport/orders/${encodeURIComponent(orderId)}/dispatch-assignment`, body),
  },

  /**
   * BANG DOI XE + BAO CAO TUYEN (Lane N, #278 N6/N7).
   *
   * `from`/`to` la NGAY NGHIEP VU (`YYYY-MM-DD`), khong phai moc thoi gian. Bo trong thi may chu tu
   * chot 30 ngay gan nhat theo mui gio tenant — man hinh KHONG duoc tu tinh khoang bang
   * `new Date()`, vi mot nguoi mo bao cao luc 00:30 gio Viet Nam se ra mot khoang lech mot ngay.
   */
  insight: {
    fleet: (range?: { readonly from?: string; readonly to?: string }): Promise<FleetInsightView> =>
      get(`/transport/insight/fleet${toQuery({ from: range?.from, to: range?.to })}`),
    corridors: (range?: {
      readonly from?: string;
      readonly to?: string;
    }): Promise<CorridorInsightView> =>
      get(`/transport/insight/corridors${toQuery({ from: range?.from, to: range?.to })}`),
  },

  /**
   * KET THUC DON (`#275` Lane K) — hanh dong ma ke toan thay la `Da ket thuc`.
   *
   * Duong di key bang `orderId`, KHONG bang `runId`: `#275` K4 noi ro *"Normal boss/accounting
   * surface should not ask them for a Run ID"*. Vong chay chi xuat hien trong mot dong hang cho
   * lam NGU CANH, va no `null` duoc.
   *
   * `POST .../decisions` chu khong `.../approve` + `.../reject`: ba ket qua di qua CUNG mot cong
   * nghiep vu voi cung mot bo luat, va tach thanh ba route se tao ba cho de mot lan sua sau nay
   * quen mot dieu kien. Tai nguyen duoc tao la MOT QUYET DINH — dung thu duoc them vao lich su.
   */
  orderCompletion: {
    /**
     * HANG CHO — CA danh sach, khong tham so loc.
     *
     * May chu CO `?state=` (`acceptanceQuerySchema`), nhung hang cho nay chi chua nhung don DA GIAO
     * XONG nen no bi chan tren tu ban chat. Loc trong bo nho khong ton mot vong mang nao va cho ra
     * mot man hinh doi ngay khi bam — mot lan goi lai chi de bo bot dong la mot lan cho khong can.
     */
    queue: (): Promise<readonly OrderCompletionRow[]> =>
      getList('/transport/commercial-acceptance', 'acceptances'),
    get: (orderId: string): Promise<OrderCompletionDetail> =>
      get(`/transport/commercial-acceptance/orders/${encodeURIComponent(orderId)}`),
    decide: (
      orderId: string,
      input: {
        outcome: OrderCompletionOutcome;
        reasonCode: string;
        basis: OrderCompletionBasis;
        evidenceRefs?: readonly string[];
        externalNote?: string | null;
        counterpartyId?: string | null;
        supersedesId?: string | null;
        idempotencyKey: string;
      },
    ): Promise<OrderCompletionDetail> =>
      send(
        'POST',
        `/transport/commercial-acceptance/orders/${encodeURIComponent(orderId)}/decisions`,
        input,
      ),
  },
} as const;
