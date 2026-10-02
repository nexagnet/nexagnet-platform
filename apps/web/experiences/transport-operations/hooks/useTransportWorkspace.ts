'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '../../../components/auth/AuthGate';
import { FORBIDDEN_IS_ANSWER_META } from '../../../components/auth/session-signals';
import { useTenantRuntime } from '../../../lib/tenant-runtime-context';
import type { FuelDocumentListQuery } from '../fuel-review-types';
import { shouldProbeStakeholderScope, type NavigationInput } from '../navigation';
import { isActionNotPermitted, SECTION_ACCESS_REVOKED } from '../permission-notes';
import type { TollSpendReportQuery } from '../toll-report-types';
import { canPerform, type TransportAction } from '../transport-actions';
import { transportApi } from '../transport-api';
import type {
  FuelEntryInboxQuery,
  GeoPoint,
  LegTransitionTarget,
  SettlementFlow,
  TollCandidateQuery,
  TollProvider,
} from '../transport-types';

/**
 * Duong DUY NHAT de mot khung nhin lay du lieu.
 *
 * MOT query cho MOT nguon, va CO Y khong gop lai: mot muc chet khong duoc lam trang mot muc dang
 * song. Do la ly do `b2b-sales-operations/hooks/useWorkspaceData.ts:10-20` neu ra, va o day no con
 * dung hon — bay muc vay quanh mot API khong co duong tong hop nao.
 *
 * Moi query deu bi CHAN o `enabled` theo nang luc + hanh dong, nen mot vai khong co quyen se khong
 * ban ra mot yeu cau chac chan bi 403. Do la chan LANG PHI, khong phai chan bao mat: cong that nam
 * o may chu.
 */

/**
 * Nguoi dang xem = vai + TAP QUYEN HIEU LUC tu `/auth/me` (`#395`). `permissions` di CUNG vai vao
 * moi cong cua man hinh (`allowed`, `canPerform(navigation, ...)`): mot `MANAGER` duoc cap nhom
 * "Đội xe & lái xe" phai THAY man do va du lieu cua no, dung nhu may chu dang cho phep.
 *
 * `AuthGate` giu tap quyen ON DINH danh tinh khi noi dung khong doi, nen memo o day khong bi pha
 * moi lan lam tuoi `/auth/me`.
 */
export function useNavigationInput(): NavigationInput {
  const tenant = useTenantRuntime();
  const { user, permissions } = useAuth();
  const role = user?.role ?? null;
  const base = useMemo<NavigationInput>(
    () => ({
      capabilities: tenant.capabilities,
      role,
      permissions,
      blockedCapabilityKeys: tenant.readiness.blockedCapabilities.map((entry) => entry.key),
    }),
    [tenant.capabilities, tenant.readiness.blockedCapabilities, role, permissions],
  );
  const stakeholderLinked = useStakeholderScopeProbe(base);
  return useMemo(
    () => (stakeholderLinked ? { ...base, stakeholderLinked: true } : base),
    [base, stakeholderLinked],
  );
}

/**
 * "NGUOI NAY CO PHAI BEN GOP VON KHONG" — hoi CHINH may chu (`#395`).
 *
 * `/auth/me` khong mang pham vi nay (no den tu mot hang lien ket, khong tu vai hay quyen rieng), nen
 * cau tra loi duy nhat la `GET /transport/me/vehicles`: du lieu = co, `403` = khong. CUNG khoa voi
 * `useMyStakeholderVehicles` — man "Xe tôi có cổ phần" mo ra la co ngay danh sach tu lan hoi nay
 * (roi tu lam moi theo luat cua chinh man do).
 *
 * Mot lan moi phien: `403` la cau tra loi binh thuong cua nguoi khong gop von, nen khong thu lai,
 * khong hoi lai khi gan man moi hay quay lai tab, va khong lam `AuthGate` doc lai `/auth/me`.
 */
function useStakeholderScopeProbe(input: NavigationInput): boolean {
  const probe = useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.myVehicles,
    queryFn: () => transportApi.stakeholderSelf.myVehicles(),
    enabled: shouldProbeStakeholderScope(input),
    retry: false,
    retryOnMount: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    meta: FORBIDDEN_IS_ANSWER_META,
  });
  return probe.isSuccess;
}

export const TRANSPORT_QUERY_KEYS = {
  trips: ['transport', 'trips'],
  vehicles: ['transport', 'vehicles'],
  drivers: ['transport', 'drivers'],
  assetStakeholders: ['transport', 'asset-ownership', 'stakeholders'],
  myVehicleActivity: ['transport', 'me', 'vehicles', 'activity'],
  ownershipRegister: ['transport', 'asset-ownership', 'register'],
  myVehicles: ['transport', 'me', 'vehicles'],
  customers: ['transport', 'customers'],
  partners: ['transport', 'partners'],
  fuelSuppliers: ['transport', 'fuel', 'suppliers'],
  reconciliations: ['transport', 'fuel', 'reconciliations'],
  tollProviders: ['transport', 'toll', 'providers'],
  tollAccounts: ['transport', 'toll', 'accounts'],
  driverTrips: ['transport', 'me', 'trips'],
  /**
   * `#340` — viec hien truong (vong chay) cua CHINH lai xe. PHAI trung khoa ma man Hien truong
   * (`driver/FieldScreen.tsx`) dung: trang chu va man do la MOT lan doc, mot o nho — khong phai hai
   * anh chup lech nhau cua cung mot cau hoi "toi co viec gi".
   */
  driverFieldWork: ['transport', 'me', 'field-work'],
  driverFund: ['transport', 'me', 'fund'],
  driverFuel: ['transport', 'me', 'fuel'],
  driverPayslips: ['transport', 'me', 'payslips'],
  driverExpenseCategories: ['transport', 'me', 'expense-categories'],
  /** `TX-07b` — bang quyet toan cua chinh lai xe dang dang nhap. */
  driverSettlement: ['transport', 'me', 'settlement'],
  /** `TX-07b` — mot dong so du cho moi lai xe (be mat ke toan). */
  settlementBalances: ['transport', 'driver-settlement', 'balances'],
  orders: ['transport', 'orders'],
  runs: ['transport', 'runs'],
  /** `#294` — che do gom nhom cua khach. Doi khi khach doi cau hinh, tuc gan nhu khong bao gio. */
  planningPolicy: ['transport', 'planning', 'policy'],
  expenseClaims: ['transport', 'expense-claims'],
  orderCompletion: ['transport', 'order-completion'],
  /** Lane N — bao cao mot vong chay; `#376` doc giai doan hien truong tung chang tu day. */
  journey: ['transport', 'journey'],
  /** Lane G — MOT khoa cho CA bang: mot lan goi, mot khung nhin. */
  controlTower: ['transport', 'control-tower'],
  /** Lane G — sau con so tai chinh, cung mot lan doc. */
  financeSummary: ['transport', 'finance', 'summary'],
  /** `#385` — hieu qua tung viec, cung ham gop voi `financeSummary`. */
  financeMargin: ['transport', 'finance', 'margin'],
  /** `#379` — dia diem da biet (bai xe, nha may/kho) cho man tao don. */
  knownPlaces: ['transport', 'places', 'known'],
} as const;

/** Nang luc + hanh dong deu phai dat truoc khi ban mot yeu cau. */
const allowed = (
  input: NavigationInput,
  capability: string | null,
  action: TransportAction,
): boolean => {
  if (capability !== null && !(input.capabilities as readonly string[]).includes(capability)) {
    return false;
  }
  return canPerform(input, action);
};

export function useTrips(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.trips,
    queryFn: () => transportApi.trips.list(),
    enabled: allowed(input, 'transport-core', 'transport.trip.read'),
  });
}

/**
 * THAP DIEU HANH — mot `useQuery` cho CA bang (Lane G, #244).
 *
 * Khong tach lam ba hook cho bang/hang viec/doi xe du tep nay von theo luat "mot nguon mot hook":
 * luat do ton tai de mot nguon chet khong lam trang mot nguon con song, con o day CA BA den tu MOT
 * lan goi va may chu da tu xu ly viec mot nguon vang hay hong (`unavailableSources`). Tach ra chi
 * tao them ba anh chup lech nhau.
 *
 * `transport-core` la capability duy nhat can co: bang song trong do, va ba nguon con lai vang mat
 * mot cach co cong bo chu khong lam hong lan goi.
 */
export function useControlTower(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.controlTower,
    queryFn: () => transportApi.controlTower.view(),
    enabled: allowed(input, 'transport-core', 'transport.control_tower.read'),
  });
}

/**
 * BAO CAO BAN DO VONG CHAY (Lane N, #278 N5) — HAI hook, hai ma quyen.
 *
 * Day la ngoai le NGUOC voi `useControlTower`: o do mot lan goi la dung vi ba nguon deu nam sau
 * CUNG mot ma quyen. O day thi khong — toa do di sau `transport.location.history.read`, ma ke toan
 * KHONG co (`transport-actions.ts`). Gop hai lan goi lam mot se buoc may chu tra toa do duoi ma
 * quyen cua bao cao.
 *
 * `enabled` chi la phep tranh mot yeu cau chac chan 403; cong that van o may chu. Nho vay ke toan
 * mo bao cao ra thi khong ban lan goi do, con quan tri thi ban ca hai.
 */
export function useRunJourney(input: NavigationInput, runRef: string | null) {
  return useQuery({
    queryKey: ['transport', 'journey', 'run', runRef ?? 'none'],
    queryFn: () => transportApi.journey.run(runRef ?? ''),
    enabled: runRef !== null && allowed(input, 'transport-core', 'transport.run.read'),
    /* 404 la mot cau tra loi nghiep vu ("khong co vong chay do"), khong phai mot su co mang. */
    retry: false,
  });
}

export function useRunJourneyMap(input: NavigationInput, runRef: string | null) {
  return useQuery({
    queryKey: ['transport', 'journey', 'map', runRef ?? 'none'],
    queryFn: () => transportApi.journey.map(runRef ?? ''),
    enabled: runRef !== null && allowed(input, 'transport-core', 'transport.location.history.read'),
    retry: false,
  });
}

/**
 * BANG DOI XE + BAO CAO TUYEN (Lane N, #278 N6/N7).
 *
 * Khoa co CA khoang ngay trong no. Bo khoang ra khoi khoa se lam TanStack Query tra lai ban da nho
 * cua thang truoc khi nguoi dung doi sang thang nay — mot bao cao dung hinh dang nhung sai ky.
 */
export function useFleetInsight(input: NavigationInput, range: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['transport', 'insight', 'fleet', range.from ?? 'auto', range.to ?? 'auto'],
    queryFn: () => transportApi.insight.fleet(range),
    enabled: allowed(input, 'transport-core', 'transport.analytics.read'),
  });
}

/**
 * CHE DO GOM NHOM cua khach — `#294 S-OWNER-02`.
 *
 * `useQuery` chu khong `useMutation`, nguoc han voi `useDispatchSuggestions()` ngay ben duoi, va
 * ly do la cai gia cua moi lan goi: day la mot lan DOC cau hinh, khong cham nha cung cap dinh
 * tuyen nao va khong ton mot dong nao. No chay khi mo man hinh, va no PHAI chay truoc — man hinh
 * can biet co nen moi nguoi dung bam "Tim xe" hay khong.
 *
 * Ma quyen la `transport.run.read` vi do dung la ma ma route `GET /transport/planning/policy` da
 * doi tu `#276`. KHONG che ra mot ma moi cho cung mot su that: hai ma cho mot cong se lech nhau
 * dung vao ngay ai do doi bang phan quyen.
 */
export function useTransportPlanningPolicy(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.planningPolicy,
    queryFn: () => transportApi.planning.policy(),
    enabled: allowed(input, 'transport-core', 'transport.run.read'),
  });
}

/**
 * DE NGHI DIEU XE (Lane M, #277) — mot `useMutation`, va do la co y.
 *
 * KHONG phai `useQuery`: lan goi la `POST`, co `@Throttle`, va co the goi mot nha cung cap dinh
 * tuyen that. Mot `useQuery` se tu chay lai khi cua so lay lai tieu diem, khi mang noi lai, khi
 * khoa doi — moi lan la mot chi phi that ma khong ai bam nut. Nguoi dung bam "Tim xe", va CHI luc
 * do mot lan hoi duoc gui.
 */
export function useDispatchSuggestions() {
  return useMutation({
    mutationFn: (input: { orderId: string; requiredPickupAt?: string | null }) =>
      transportApi.dispatch.suggest(input.orderId, {
        requiredPickupAt: input.requiredPickupAt ?? null,
      }),
  });
}

/**
 * BOSS DA CHON — lenh gan xe. Ma quyen KHAC (`transport.run.manage`).
 *
 * `#278` N3: *"Boss chooses; map does not auto-assign."* Khong mot cho nao trong man hinh goi ham
 * nay thay nguoi dung: no chi chay tu mot `onClick` tren dung mot chiec xe da duoc chon.
 */
export function useDispatchAssignment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { orderId: string; vehicleId: string }) =>
      transportApi.dispatch.assign(input.orderId, { vehicleId: input.vehicleId }),
    onSuccess: () => {
      /* Vong chay vua doi — bang dieu hanh va danh sach vong chay phai doc lai. */
      void client.invalidateQueries({ queryKey: TRANSPORT_QUERY_KEYS.runs });
      void client.invalidateQueries({ queryKey: TRANSPORT_QUERY_KEYS.controlTower });
    },
  });
}

export function useCorridorInsight(input: NavigationInput, range: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['transport', 'insight', 'corridors', range.from ?? 'auto', range.to ?? 'auto'],
    queryFn: () => transportApi.insight.corridors(range),
    enabled: allowed(input, 'transport-core', 'transport.analytics.read'),
  });
}

/**
 * BANG TAI CHINH — mot `useQuery` cho ca sau con so (Lane G, #244 G5).
 *
 * Dung `transport.settlement.report.read`: bang khong phoi mot su that nao ma quyen do chua cho
 * xem, nen no khong can mot ma quyen thu hai. Xem khoi chu thich cua `FinanceController`.
 */
export function useFinanceSummary(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.financeSummary,
    queryFn: () => transportApi.finance.summary(),
    enabled: allowed(input, 'transport-settlement', 'transport.settlement.report.read'),
  });
}

export function useFinanceMargin(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.financeMargin,
    queryFn: () => transportApi.finance.margin(),
    enabled: allowed(input, 'transport-settlement', 'transport.settlement.report.read'),
  });
}

export function useVehicles(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.vehicles,
    queryFn: () => transportApi.fleet.vehicles(),
    enabled: allowed(input, 'transport-core', 'transport.vehicle.read'),
  });
}

export function useDrivers(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.drivers,
    queryFn: () => transportApi.fleet.drivers(),
    enabled: allowed(input, 'transport-core', 'transport.driver.read'),
  });
}

/**
 * Lich su lai xe phu trach CUA MOT xe. `Vehicle` khong mang nguoi dang phu trach, va khong co duong
 * nao tra ve cho ca doi xe — nen chi goi khi da MO mot xe, giong `useTripAssignments`.
 * Khoa nam duoi `TRANSPORT_QUERY_KEYS.vehicles`: lam tuoi doi xe thi lam tuoi luon lich su nay.
 */
export function useVehicleDriverHistory(input: NavigationInput, vehicleId: string | null) {
  return useQuery({
    queryKey: [...TRANSPORT_QUERY_KEYS.vehicles, vehicleId, 'driver-history'],
    queryFn: () => transportApi.fleet.vehicleDriverHistory(vehicleId as string),
    enabled: vehicleId !== null && allowed(input, 'transport-core', 'transport.vehicle.read'),
  });
}

/**
 * SUC KHOE VI TRI cua MOT xe (`#297`) — `transport.tracking.read`, route cua `transport-proof`.
 *
 * Truoc `#395` query nay nam THANG trong `FleetView` va KHONG co cong: nguoi chi duoc xem ho so xe
 * bam mot xe la nhan `403` in giua trang. Chi goi khi da MO mot xe, giong `useVehicleDriverHistory`.
 */
export function useVehicleLocationHealth(input: NavigationInput, vehicleId: string | null) {
  return useQuery({
    queryKey: ['transport', 'vehicles', vehicleId, 'location-health'],
    queryFn: () => transportApi.fleet.locationHealth(vehicleId ?? ''),
    enabled: vehicleId !== null && allowed(input, 'transport-proof', 'transport.tracking.read'),
  });
}

/* ------------------------------------------------------------------ *
 * `TX-08` SO HUU TAI SAN (#242 Lane E)
 * ------------------------------------------------------------------ */

export function useAssetStakeholders(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.assetStakeholders,
    queryFn: () => transportApi.assetOwnership.stakeholders(),
    enabled: allowed(input, 'transport-core', 'transport.asset_ownership.read'),
  });
}

export function useOwnershipRegister(input: NavigationInput, vehicleId: string | null) {
  return useQuery({
    queryKey: [...TRANSPORT_QUERY_KEYS.ownershipRegister, vehicleId],
    queryFn: () => transportApi.assetOwnership.register(vehicleId ?? ''),
    enabled:
      vehicleId !== null && allowed(input, 'transport-core', 'transport.asset_ownership.read'),
  });
}

/**
 * "Xe toi co co phan" — be mat CUA CHINH NGUOI DANG DANG NHAP.
 *
 * KHONG dung `allowed(...)` o day, va do la co y. `allowed` hoi `canPerform(role, action)`, ma
 * `transport.stakeholder.self.vehicle.read` KHONG duoc cap qua vai nao ca (xem
 * `STAKEHOLDER_SCOPE_ACTIONS`) — nen `allowed` se luon tra `false` va query se khong bao gio chay.
 *
 * Cau hoi dung o day khong phai "vai nay lam duoc gi", ma "nguoi nay co phai ben huu quan khong" —
 * va cau do CHI may chu tra loi duoc, tu mot hang `TransportAssetStakeholder.authUserId`. Nen dieu
 * kien duy nhat o phia man hinh la khach co bat `transport-core` hay khong; con lai de `403` cua
 * may chu noi. Doan truoc o client se hoac chan nham mot co dong that, hoac hua hen mot man hinh
 * ma may chu se tu choi.
 */
export function useMyStakeholderVehicles(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.myVehicles,
    queryFn: () => transportApi.stakeholderSelf.myVehicles(),
    enabled: (input.capabilities as readonly string[]).includes('transport-core'),
    retry: false,
  });
}

/**
 * HOAT DONG cua nhung chiec xe do (`#278` N9).
 *
 * CUNG mot dieu kien `enabled` voi `useMyStakeholderVehicles`, va cung mot ly do: cau hoi "nguoi
 * nay co phai ben huu quan khong" chi may chu tra loi duoc. Doan truoc o client se hoac chan nham
 * mot co dong that, hoac hua mot man hinh ma may chu se tu choi.
 *
 * KHONG truyen khoang ngay: may chu tu chot 30 ngay gan nhat theo mui gio tenant. Neu man hinh tu
 * tinh bang `new Date()`, hai nguoi o hai mui gio se doc ra hai bang khac nhau — `#278` N10.
 */
export function useMyVehicleActivity(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.myVehicleActivity,
    queryFn: () => transportApi.stakeholderSelf.activity(),
    enabled: (input.capabilities as readonly string[]).includes('transport-core'),
    retry: false,
  });
}

/* ------------------------------------------------------------------ *
 * MO HINH VAN CHUYEN v2 -- hai truc doc lap (`D-01`)
 * ------------------------------------------------------------------ */

export function useTransportOrders(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.orders,
    queryFn: () => transportApi.movement.orders(),
    enabled: allowed(input, 'transport-core', 'transport.order.read'),
  });
}

/**
 * DIA DIEM DA BIET (`#379`) — CHI doc khi man tao don DANG MO.
 *
 * `isComposerOpen` nam trong `enabled`, khong phai mot lua chon trinh bay: danh sach don duoc mo
 * hang chuc lan moi ngay de XEM, va moi lan mo ma ban them mot lan doc hang rao la mot lan goi
 * khong ai can (bo e2e `office-leg-lifecycle` con khoa dieu nay bang `world.unhandled`).
 *
 * Ma quyen la `transport.order.manage` vi do dung la ma cua route — nguoi khong tao duoc don thi
 * cung khong can danh sach cho de chon.
 */
export function useKnownPlaces(input: NavigationInput, isComposerOpen: boolean) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.knownPlaces,
    queryFn: () => transportApi.places.known(),
    enabled: isComposerOpen && allowed(input, 'transport-core', 'transport.order.manage'),
    /*
     * DOC LAI MOI LAN MO man tao don (`#395`). Truoc day hang rao "doi theo tuan" nen o nho giu 5
     * phut; tu khi Giam doc them/tat dia diem o "Địa điểm vận hành", mot ke toan vua mo man tao don
     * se khong thay dia diem moi toi 5 phut. Mot GET re moi lan mo la dung gia.
     */
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/**
 * TIM DIA DIEM theo chu (`#379`) — `useMutation`, cung ly do voi `useDispatchSuggestions()`.
 *
 * Mot `useQuery` se tu chay lai khi cua so lay lai tieu diem hay mang noi lai: moi lan la mot luot
 * cua nha cung cap ngoai (Nominatim cam tu dong hoan thanh). Nguoi dung bam "Tìm" hoac Enter, va
 * CHI luc do mot yeu cau duoc gui.
 */
export function usePlaceSearch() {
  return useMutation({
    mutationFn: (query: string) => transportApi.places.search(query),
  });
}

/**
 * TIM NGUOC mot diem vua bam tren ban do (`#379`). Nguoi goi giu MA LUOT cua tung lan bam
 * (`workspace/order-draft.ts`) — ket qua ve muon cua lan bam cu khong duoc ghi de lan bam moi.
 */
export function usePlaceReverse() {
  return useMutation({
    mutationFn: (point: GeoPoint) => transportApi.places.reverse(point),
  });
}

export function useVehicleRuns(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.runs,
    queryFn: () => transportApi.movement.runs(),
    enabled: allowed(input, 'transport-core', 'transport.run.read'),
  });
}

/** Chang cua MOT vong chay. Chi goi khi da MO mot vong chay, khong goi cho ca bang. */
export function useVehicleRunDetail(input: NavigationInput, runId: string | null) {
  return useQuery({
    queryKey: ['transport', 'runs', runId ?? 'none'],
    queryFn: () => transportApi.movement.run(runId as string),
    enabled: runId !== null && allowed(input, 'transport-core', 'transport.run.read'),
  });
}

/**
 * KM co hang vs km rong CUA MOT vong chay.
 *
 * May chu tinh, man hinh chi hien. Neu mot ngay nao do co mot phep cong km o tep nay thi hai
 * cach tinh se lech nhau -- va ban tren man hinh la ban khong ai doi chieu duoc.
 */
export function useRunDistance(input: NavigationInput, runId: string | null) {
  return useQuery({
    queryKey: ['transport', 'runs', runId ?? 'none', 'distance'],
    queryFn: () => transportApi.movement.distance(runId as string),
    enabled: runId !== null && allowed(input, 'transport-core', 'transport.run.read'),
  });
}

/**
 * DA DI vs DU DINH cua mot vong chay (#276 L6).
 *
 * Doc rieng khoi `useRunDistance`: hai be mat tra loi HAI cau hoi khac nhau, va gop chung se lam
 * doc gia dang co cua `:id/distance` nhan mot con so mang y nghia khac.
 */
export function useRunMovement(input: NavigationInput, runId: string | null) {
  return useQuery({
    queryKey: ['transport', 'runs', runId ?? 'none', 'movement'],
    queryFn: () => transportApi.movement.movementSummary(runId as string),
    enabled: runId !== null && allowed(input, 'transport-core', 'transport.run.read'),
  });
}

/**
 * CHANG PHUC VU MOT DON — duong doc ORDER-FIRST.
 *
 * `#274` chot sep/ke toan lam viec voi don. Cau hoi thuong gap cua ho la *"don nay dang di den
 * dau"*, khong phai *"vong chay so may co nhung chang nao"* — nen man hinh phai tra loi duoc cau
 * do ma khong bat ho tim vong chay truoc.
 */
export function useOrderLegs(input: NavigationInput, orderId: string | null) {
  return useQuery({
    queryKey: ['transport', 'orders', orderId ?? 'none', 'legs'],
    queryFn: () => transportApi.movement.orderLegs(orderId as string),
    enabled: orderId !== null && allowed(input, 'transport-core', 'transport.order.read'),
  });
}

/** Lich su lap ke hoach cua mot don — noi don voi vong chay ma khong phai quet ca danh sach. */
export function useOrderRunPlans(input: NavigationInput, orderId: string | null) {
  return useQuery({
    queryKey: ['transport', 'orders', orderId ?? 'none', 'plans'],
    queryFn: () => transportApi.planning.plans(orderId as string),
    enabled: orderId !== null && allowed(input, 'transport-core', 'transport.run.read'),
  });
}

/**
 * VONG CHAY DONG DUOC CHUA — be mat CHAN DOAN chi doc (`#293` R1), cung bang chan voi duong he thong
 * dung de dong. Khoa nam DUOI `['transport','runs', runId]` nen moi lan lam tuoi vong chay lam tuoi
 * luon cau tra loi nay.
 */
export function useRunClosure(input: NavigationInput, runId: string | null) {
  return useQuery({
    queryKey: ['transport', 'runs', runId ?? 'none', 'closure'],
    queryFn: () => transportApi.planning.closure(runId as string),
    enabled: runId !== null && allowed(input, 'transport-core', 'transport.run.read'),
  });
}

/**
 * NHUNG NGUON MOT LAN GHI VONG DOI DON/CHANG LAM CU — `#376`.
 *
 * Tien mot chang doi: chang cua don va cua vong chay, trang thai vong chay (`PLANNED -> ACTIVE`,
 * lan dong cua he thong), cot tren Bang dieu hanh, dong thoi gian cua bao cao vong chay. Xac nhan
 * don da giao xong doi: danh sach don (the "Don dang mo" cua Tong quan) va hang cho "Ket thuc don".
 * Mot danh sach cho CA HAI lenh — lam tuoi thua mot nguon re hon han mot man hinh noi sai.
 */
const LIFECYCLE_AFFECTED_KEYS = [
  TRANSPORT_QUERY_KEYS.orders,
  TRANSPORT_QUERY_KEYS.runs,
  TRANSPORT_QUERY_KEYS.journey,
  TRANSPORT_QUERY_KEYS.controlTower,
  TRANSPORT_QUERY_KEYS.orderCompletion,
] as const;

/**
 * Lam tuoi o `onSettled`, KHONG chi `onSuccess`: mot lan bi tu choi la MAY CHU dang noi mo hinh tren
 * man hinh da cu (nguoi khac vua tien chang, he thong vua dong vong chay) — cung ly le `#333` cua
 * man Hien truong. Doc lai khong dung vao ket qua cua lan ghi.
 */
function useLifecycleRefresh(): () => void {
  const client = useQueryClient();
  return () => {
    for (const queryKey of LIFECYCLE_AFFECTED_KEYS) void client.invalidateQueries({ queryKey });
  };
}

/** Van phong tien mot chang (`#376`). Cong that — quyen, hien truong, ghi de — nam o may chu. */
export function useLegTransition() {
  const refresh = useLifecycleRefresh();
  return useMutation({
    mutationFn: (input: {
      readonly runId: string;
      readonly legId: string;
      readonly to: LegTransitionTarget;
      readonly overrideReason?: string;
    }) =>
      transportApi.movement.transitionLeg(input.runId, input.legId, {
        to: input.to,
        ...(input.overrideReason === undefined ? {} : { overrideReason: input.overrideReason }),
      }),
    onSettled: refresh,
  });
}

/** Van phong xac nhan don da giao xong: `OPEN -> FULFILLED` (`#376`). Khong tu suy tu moc. */
export function useOrderFulfilment() {
  const refresh = useLifecycleRefresh();
  return useMutation({
    mutationFn: (orderId: string) => transportApi.movement.fulfilOrder(orderId),
    onSettled: refresh,
  });
}

/** DE NGHI CHI cho ke toan duyet (`D-06`). */
export function useExpenseClaims(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.expenseClaims,
    queryFn: () => transportApi.claims.list(),
    enabled: allowed(input, 'transport-costing', 'transport.expense.claim.read'),
  });
}

/**
 * HANG CHO KET THUC DON — `#275` K4.
 *
 * `enabled` doi CA capability `transport-acceptance` LAN quyen `transport.commercial_acceptance
 * .read`. Vai lai xe (`SALE`) khong co ma do, nen hook nay khong bao gio ban mot yeu cau ma may chu
 * se tu choi — nhung cong that van nam o may chu, khong o day (`#275` K8 bai 1).
 */
export function useOrderCompletionQueue(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.orderCompletion,
    queryFn: () => transportApi.orderCompletion.queue(),
    enabled: allowed(input, 'transport-acceptance', 'transport.commercial_acceptance.read'),
  });
}

export function useCustomers(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.customers,
    queryFn: () => transportApi.fleet.customers(),
    enabled: allowed(input, 'transport-core', 'transport.customer.read'),
  });
}

export function usePartners(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.partners,
    queryFn: () => transportApi.fleet.partners(),
    enabled: allowed(input, 'transport-core', 'transport.partner.read'),
  });
}

/**
 * Phan cong CUA MOT chuyen. Phai goi theo tung chuyen vi `Trip` khong mang phan cong dang hieu luc
 * — `Trip` chi tra ve khoa ngoai. Nen chi goi khi da MO mot chuyen, khong goi cho ca bang.
 */
export function useTripAssignments(input: NavigationInput, tripId: string | null) {
  return useQuery({
    queryKey: ['transport', 'trips', tripId, 'assignments'],
    queryFn: () => transportApi.trips.assignments(tripId as string),
    enabled: tripId !== null && allowed(input, 'transport-core', 'transport.trip.read'),
  });
}

export function useTripCost(input: NavigationInput, tripId: string | null) {
  return useQuery({
    queryKey: ['transport', 'costing', 'trips', tripId],
    queryFn: () => transportApi.costing.tripExpenses(tripId as string),
    enabled:
      tripId !== null && allowed(input, 'transport-costing', 'transport.costing.expense.read'),
  });
}

export function useTripFuelEntries(input: NavigationInput, tripId: string | null) {
  return useQuery({
    queryKey: ['transport', 'fuel', 'trips', tripId],
    queryFn: () => transportApi.fuel.tripEntries(tripId as string),
    enabled: tripId !== null && allowed(input, 'transport-fuel', 'transport.fuel.entry.read'),
  });
}

/**
 * MOT phieu do dau kem BANG CHUNG.
 *
 * Doc rieng thay vi lay tu danh sach: `GET /transport/fuel/trips/:id/entries` tra `FuelEntry[]`
 * KHONG kem anh, con `GET /transport/fuel/entries/:id` tra `{ entry, evidence[] }`. Ke toan can
 * nhin anh phieu TRUOC khi bam xac thuc, nen man hinh phai co duong doc that su mang `evidence`.
 */
export function useFuelEntryDetail(input: NavigationInput, entryId: string | null) {
  return useQuery({
    queryKey: ['transport', 'fuel', 'entries', entryId],
    queryFn: () => transportApi.fuel.entry(entryId as string),
    enabled: entryId !== null && allowed(input, 'transport-fuel', 'transport.fuel.entry.read'),
  });
}

export function useFundStatement(input: NavigationInput, driverId: string | null) {
  return useQuery({
    queryKey: ['transport', 'costing', 'fund', driverId],
    queryFn: () => transportApi.costing.fundStatement(driverId as string),
    enabled:
      driverId !== null &&
      allowed(input, 'transport-costing', 'transport.costing.driver_fund.read'),
  });
}

export function useFundPeriods(input: NavigationInput, driverId: string | null) {
  return useQuery({
    queryKey: ['transport', 'costing', 'fund', driverId, 'periods'],
    queryFn: () => transportApi.costing.fundPeriods(driverId as string),
    enabled:
      driverId !== null && allowed(input, 'transport-costing', 'transport.costing.period.read'),
  });
}

export function useFuelSuppliers(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.fuelSuppliers,
    queryFn: () => transportApi.fuel.suppliers(),
    enabled: allowed(input, 'transport-fuel', 'transport.fuel.entry.read'),
  });
}

/**
 * HOP THU PHIEU NHIEN LIEU cua CA DOI — #222 P1-B.
 *
 * `queryKey` mang CA BO LOC: hai bo loc khac nhau la hai cau hoi khac nhau, va dung chung mot o nho
 * se lam man hinh hien ket qua cua lan hoi truoc trong khi nguoi dung da doi dieu kien.
 *
 * Nam duoi tien to `['transport','fuel']` de moi lenh ghi cua man Nhien lieu (`invalidateQueries`
 * theo tien to do) tu dong lam moi hop thu — khong phai nho don le tung cho.
 */
export function useFuelInbox(input: NavigationInput, query: FuelEntryInboxQuery) {
  return useQuery({
    queryKey: ['transport', 'fuel', 'inbox', query],
    queryFn: () => transportApi.fuel.inbox(query),
    enabled: allowed(input, 'transport-fuel', 'transport.fuel.entry.read'),
  });
}

export function useReconciliations(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.reconciliations,
    queryFn: () => transportApi.fuel.reconciliations(),
    enabled: allowed(input, 'transport-fuel', 'transport.fuel.reconciliation.read'),
  });
}

/**
 * HANG SOAT CHUNG TU MAY DOC (`#313`) — `transport.fuel.document.read`.
 *
 * Nam duoi `['transport','fuel']` nhu moi truy van nhien lieu khac: mot lan doc anh xong
 * (`invalidateQueries(['transport','fuel','documents'])`) thi hang soat tu lam moi.
 */
export function useFuelDocuments(input: NavigationInput, query: FuelDocumentListQuery) {
  return useQuery({
    queryKey: ['transport', 'fuel', 'documents', query],
    queryFn: () => transportApi.fuel.documents(query),
    enabled: allowed(input, 'transport-fuel', 'transport.fuel.document.read'),
  });
}

export function useFuelDocumentReview(input: NavigationInput, id: string | null) {
  return useQuery({
    queryKey: ['transport', 'fuel', 'documents', id, 'review'],
    queryFn: () => transportApi.fuel.documentReview(id as string),
    enabled: id !== null && allowed(input, 'transport-fuel', 'transport.fuel.document.read'),
  });
}

/** Drill-down tieu hao theo xe/ky (`#313`) — cung quyen doc voi hop thu phieu. */
export function useVehicleFuelConsumption(
  input: NavigationInput,
  request: { readonly vehicleId: string; readonly from: string; readonly to: string } | null,
) {
  return useQuery({
    queryKey: ['transport', 'fuel', 'consumption', request],
    queryFn: () => {
      if (request === null) throw new Error('Chưa chọn xe và kỳ.');
      return transportApi.fuel.vehicleConsumption(request.vehicleId, request);
    },
    enabled: request !== null && allowed(input, 'transport-fuel', 'transport.fuel.entry.read'),
  });
}

export function useReconciliation(input: NavigationInput, id: string | null) {
  return useQuery({
    queryKey: ['transport', 'fuel', 'reconciliations', id],
    queryFn: () => transportApi.fuel.reconciliation(id as string),
    enabled: id !== null && allowed(input, 'transport-fuel', 'transport.fuel.reconciliation.read'),
  });
}

/* --- be mat lai xe: khong duong nao nhan `:driverId` --- */

export function useDriverTrips(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.driverTrips,
    queryFn: () => transportApi.me.trips(),
    enabled: allowed(input, 'transport-core', 'transport.driver.self.trip.read'),
  });
}

/**
 * VIEC DUOC DIEU cua chinh lai xe — `#340`: trang chu doc CUNG nguon voi man Hien truong.
 *
 * Gac bang DUNG cap (nang luc, hanh dong) cua muc `field` trong `DRIVER_SCREENS` va cua
 * `DriverFieldController`: khach khong bat `transport-checkpoint` thi tuyen khong duoc gan, va mot
 * yeu cau o day chi nhan ve trang 404 cua Next.js.
 *
 * `refetchOnWindowFocus` bat rieng o day (ung dung tat no o cap goc, `app/providers.tsx`): lai xe
 * mo lai app sau khi van phong vua dieu viec phai thay viec do, khong phai mot trang chu cu.
 */
export function useDriverFieldWork(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.driverFieldWork,
    queryFn: () => transportApi.me.fieldWork(),
    enabled: allowed(input, 'transport-checkpoint', 'transport.driver.self.checkpoint.record'),
    refetchOnWindowFocus: true,
  });
}

export function useDriverFund(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.driverFund,
    queryFn: () => transportApi.me.fund(),
    enabled: allowed(input, 'transport-costing', 'transport.driver.self.fund.read'),
  });
}

export function useDriverFuelSlips(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.driverFuel,
    queryFn: () => transportApi.me.fuelSlips(),
    enabled: allowed(input, 'transport-fuel', 'transport.driver.self.fuel.read'),
  });
}

/* ------------------------------------------------------------------ *
 * Phi duong bo (ETC) — `#295` phan C
 * ------------------------------------------------------------------ */

/**
 * DO SAN SANG cua tung nha cung cap.
 *
 * Gac bang `transport.toll.account.read` chu khong bang mot ma rieng cho "do san sang": day la
 * mot phep DOC cau hinh tai khoan, va tach ra mot ma thu sau se buoc sua
 * `transport-actions.ts` — mang dang bi mot lane khac sua VA bi khoa theo thu tu boi hai spec.
 */
export function useTollProviders(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.tollProviders,
    queryFn: () => transportApi.toll.providers(),
    enabled: allowed(input, 'transport-toll', 'transport.toll.account.read'),
  });
}

export function useTollAccounts(input: NavigationInput, provider?: TollProvider | null) {
  return useQuery({
    queryKey: [...TRANSPORT_QUERY_KEYS.tollAccounts, provider ?? null],
    queryFn: () => transportApi.toll.accounts(provider ?? undefined),
    enabled: allowed(input, 'transport-toll', 'transport.toll.account.read'),
  });
}

/**
 * So xe nhan chi tra cua MOT tai khoan.
 *
 * `accountId === null` thi khong hoi — mot man hinh chua chon tai khoan nao khong co cau hoi de
 * hoi, va goi voi mot chuoi rong se tra ve loi cua may chu chu khong tra ve mot danh sach rong.
 */
export function useTollAccountLinks(input: NavigationInput, accountId: string | null) {
  return useQuery({
    queryKey: [...TRANSPORT_QUERY_KEYS.tollAccounts, accountId, 'links'],
    queryFn: () => transportApi.toll.links(accountId ?? ''),
    enabled: accountId !== null && allowed(input, 'transport-toll', 'transport.toll.account.read'),
  });
}

/**
 * LICH SU CAC LAN NAP bang ke ETC.
 *
 * Gac bang `transport.toll.review.read` chu khong `transport.toll.import`: doc lai xem ai da nap
 * gi la viec cua NGUOI DOI SOAT, con `import` la quyen GHI. Mot vai chi doi soat van phai thay
 * duoc nguon cua nhung dong minh dang xu ly — neu khong, mot dong sai khong truy nguoc duoc ve tep
 * da sinh ra no.
 */
export function useTollImports(input: NavigationInput, provider?: TollProvider | null) {
  return useQuery({
    queryKey: ['transport', 'toll', 'imports', provider ?? null],
    queryFn: () => transportApi.toll.imports(provider ?? undefined),
    enabled: allowed(input, 'transport-toll', 'transport.toll.review.read'),
  });
}

/**
 * SO XE DANG NHAN CHI TRA cua TUNG tai khoan.
 *
 * KHONG phu thuoc tai khoan dang chon, va do la ca ly do no ton tai: con so nay xuat hien o MOI
 * dong cua bang tai khoan, nen no khong duoc lay tu `useTollAccountLinks` — cai do chi tra loi ve
 * mot tai khoan.
 */
export function useTollLinkCounts(input: NavigationInput) {
  return useQuery({
    queryKey: [...TRANSPORT_QUERY_KEYS.tollAccounts, 'link-counts'],
    queryFn: () => transportApi.toll.linkCounts(),
    enabled: allowed(input, 'transport-toll', 'transport.toll.account.read'),
  });
}

/**
 * HANG CHO DOI SOAT. `queryKey` mang CA BO LOC — cung ly le voi hop thu nhien lieu: hai bo loc la
 * hai cau hoi khac nhau, va dung chung mot o nho se hien ket qua cua lan hoi truoc.
 */
export function useTollCandidates(input: NavigationInput, query: TollCandidateQuery) {
  return useQuery({
    queryKey: ['transport', 'toll', 'candidates', query],
    queryFn: () => transportApi.toll.candidates(query),
    enabled: allowed(input, 'transport-toll', 'transport.toll.review.read'),
  });
}

/*
 * `#314` — bon phep DOC moi. Moi khoa deu nam duoi `['transport', 'toll']`, nen MOI lan quyet / nap /
 * sua tai khoan (deu lam moi ca nhanh do) cung lam moi bao cao va dong doi ung — khong co mot o nho
 * nao con noi ve trang thai truoc lan quyet.
 */

/** Lich su nhan chi tra cua MOT xe qua moi tai khoan. `null` = chua chon xe, khong hoi. */
export function useTollVehicleLinks(input: NavigationInput, vehicleId: string | null) {
  return useQuery({
    queryKey: ['transport', 'toll', 'vehicles', vehicleId, 'links'],
    queryFn: () => transportApi.toll.vehicleLinks(vehicleId ?? ''),
    enabled: vehicleId !== null && allowed(input, 'transport-toll', 'transport.toll.account.read'),
  });
}

/** Mot dong kem LICH SU quyet dinh cua no — de nguoi doi soat thay ai da lam gi truoc khi quyet. */
export function useTollCandidateDetail(input: NavigationInput, candidateId: string | null) {
  return useQuery({
    queryKey: ['transport', 'toll', 'candidate-detail', candidateId],
    queryFn: () => transportApi.toll.candidate(candidateId ?? ''),
    enabled: candidateId !== null && allowed(input, 'transport-toll', 'transport.toll.review.read'),
  });
}

/** Dong doi ung (cung dau van) cua mot dong nghi trung. */
export function useTollDuplicatePeers(input: NavigationInput, candidateId: string | null) {
  return useQuery({
    queryKey: ['transport', 'toll', 'duplicate-peers', candidateId],
    queryFn: () => transportApi.toll.duplicatePeers(candidateId ?? ''),
    enabled: candidateId !== null && allowed(input, 'transport-toll', 'transport.toll.review.read'),
  });
}

/**
 * Chi phi ETC theo xe / ky. Gac bang `transport.toll.review.read` — cung ma voi route cua may chu.
 * `queryKey` mang CA ky + nha cung cap: hai ky la hai cau hoi, khong dung chung mot o nho.
 */
export function useTollSpendReport(input: NavigationInput, query: TollSpendReportQuery) {
  return useQuery({
    queryKey: ['transport', 'toll', 'spend-report', query],
    queryFn: () => transportApi.toll.spendReport(query),
    enabled: allowed(input, 'transport-toll', 'transport.toll.review.read'),
  });
}

/**
 * Cay xang ma LAI XE doc duoc. Gac bang hanh dong PHAM VI CUA CHINH MINH — `useFuelSuppliers` gac
 * bang `transport.fuel.entry.read`, nen voi vai lai xe no khong bao gio chay.
 */
export function useDriverFuelSuppliers(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'me', 'fuel', 'suppliers'],
    queryFn: () => transportApi.me.fuelSuppliers(),
    enabled: allowed(input, 'transport-fuel', 'transport.driver.self.fuel.submit'),
  });
}

/**
 * `#317` G1 — tram/diem do cua MOT cay xang, cho o chon cua lai xe. Chi chay khi da chon cay xang:
 * tram luon thuoc mot nha cung cap, va may chu tu choi tram cua nha cung cap khac.
 */
export function useDriverFuelStations(input: NavigationInput, supplierId: string) {
  return useQuery({
    queryKey: ['transport', 'me', 'fuel', 'stations', supplierId],
    queryFn: () => transportApi.me.fuelStations(supplierId),
    enabled:
      supplierId !== '' && allowed(input, 'transport-fuel', 'transport.driver.self.fuel.submit'),
  });
}

export function useDriverPayslips(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.driverPayslips,
    queryFn: () => transportApi.me.payslips(),
    enabled: allowed(input, 'transport-workforce', 'transport.driver.self.payslip.read'),
  });
}

/**
 * `TX-07b` — bang quyet toan CUA CHINH LAI XE dang dang nhap.
 *
 * Khong tham so `driverId`: danh tinh den tu phien o may chu. Mot tham so o day se la duong de mot
 * lai xe doc bang cua dong nghiep bang cach doi mot chuoi tren URL.
 */
export function useDriverSettlement(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.driverSettlement,
    queryFn: () => transportApi.me.settlement(),
    enabled: allowed(input, 'transport-workforce', 'transport.driver.self.settlement.read'),
  });
}

/** `TX-07b` — mot dong so du cho moi lai xe dang lam viec (be mat ke toan). */
export function useSettlementBalances(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.settlementBalances,
    queryFn: () => transportApi.driverSettlement.balances(),
    enabled: allowed(input, 'transport-workforce', 'transport.driver_settlement.read'),
  });
}

/** `TX-07b` — bang cua MOT lai xe: cac thang, cac lan chi kem phan bo, canh bao cua so. */
export function useSettlementStatement(input: NavigationInput, driverId: string | null) {
  return useQuery({
    queryKey: ['transport', 'driver-settlement', 'drivers', driverId],
    queryFn: () => transportApi.driverSettlement.statement(driverId as string),
    enabled:
      driverId !== null &&
      allowed(input, 'transport-workforce', 'transport.driver_settlement.read'),
  });
}

/**
 * DANH MUC NHOM CHI PHI cua chinh lai xe (`#168 B4`).
 *
 * `staleTime` dai co chu dich: danh muc la CAU HINH cua khach, khong phai so lieu chay. Tai lai no
 * moi lan mo bieu mau la mot vong goi khong doi lay gi.
 */
export function useDriverExpenseCategories(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.driverExpenseCategories,
    queryFn: () => transportApi.me.expenseCategories(),
    enabled: allowed(input, 'transport-costing', 'transport.driver.self.expense.record'),
    staleTime: 5 * 60_000,
  });
}

/* --- `TX-05` quyet toan: CHI DOC, khong mot mutation nao --- */

/**
 * `asOf` la THAM SO, khong phai mac dinh im lang — no di thang vao `queryKey` de doi moc thi doc
 * lai, va de hai moc khac nhau khong dung chung mot o nho.
 */
export function useArAging(input: NavigationInput, asOf: string, customerId: string | null) {
  return useQuery({
    queryKey: ['transport', 'settlement', 'ar-aging', asOf, customerId],
    queryFn: () => transportApi.settlement.arAging(asOf, customerId),
    enabled: allowed(input, 'transport-settlement', 'transport.settlement.report.read'),
  });
}

export function useApByFlow(input: NavigationInput, flow: SettlementFlow) {
  return useQuery({
    queryKey: ['transport', 'settlement', 'ap', flow],
    queryFn: () => transportApi.settlement.apByFlow(flow),
    enabled: allowed(input, 'transport-settlement', 'transport.settlement.report.read'),
  });
}

export function usePartnerPosition(input: NavigationInput, partnerId: string | null) {
  return useQuery({
    queryKey: ['transport', 'settlement', 'partners', partnerId],
    queryFn: () => transportApi.settlement.partnerPosition(partnerId as string),
    enabled:
      partnerId !== null &&
      allowed(input, 'transport-settlement', 'transport.settlement.report.read'),
  });
}

/** Quyen RIENG: lich su SUA mot con so tien khac voi "con no bao nhieu". */
export function useDocumentChain(input: NavigationInput, originalId: string | null) {
  return useQuery({
    queryKey: ['transport', 'settlement', 'documents', originalId],
    queryFn: () => transportApi.settlement.documentChain(originalId as string),
    enabled:
      originalId !== null &&
      allowed(input, 'transport-settlement', 'transport.settlement.document.read'),
    retry: false,
  });
}

/* --- `TX-06` bao duong, giay to, canh bao --- */

export function useMaintenanceDue(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'maintenance', 'due'],
    queryFn: () => transportApi.assets.due(),
    enabled: allowed(input, 'transport-asset-compliance', 'transport.maintenance.plan.read'),
  });
}

export function useMaintenancePlans(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'maintenance', 'plans'],
    queryFn: () => transportApi.assets.plans(),
    enabled: allowed(input, 'transport-asset-compliance', 'transport.maintenance.plan.read'),
  });
}

export function useWorkOrders(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'maintenance', 'work-orders'],
    queryFn: () => transportApi.assets.workOrders(),
    enabled: allowed(input, 'transport-asset-compliance', 'transport.maintenance.plan.read'),
  });
}

export function useComplianceDocuments(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'compliance', 'documents'],
    queryFn: () => transportApi.assets.complianceDocuments(),
    enabled: allowed(input, 'transport-asset-compliance', 'transport.compliance.document.read'),
  });
}

export function useComplianceAlerts(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'compliance', 'alerts'],
    queryFn: () => transportApi.assets.complianceAlerts(),
    enabled: allowed(input, 'transport-asset-compliance', 'transport.compliance.document.read'),
  });
}

export function useFleetStatus(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'fleet-status'],
    queryFn: () => transportApi.assets.fleetStatus(),
    enabled: allowed(input, 'transport-asset-compliance', 'transport.fleet_status.read'),
  });
}

export function useOperationalAlerts(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'alerts'],
    queryFn: () => transportApi.assets.operationalAlerts(),
    enabled: allowed(input, 'transport-asset-compliance', 'transport.alerts.read'),
  });
}

/* --- `TX-07` luong --- */

export function usePayrollPeriods(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'payroll', 'periods'],
    queryFn: () => transportApi.payroll.periods(),
    enabled: allowed(input, 'transport-workforce', 'transport.payroll.period.read'),
  });
}

export function usePayrollRuns(input: NavigationInput, periodId: string | null) {
  return useQuery({
    queryKey: ['transport', 'payroll', 'periods', periodId, 'runs'],
    queryFn: () => transportApi.payroll.runs(periodId as string),
    enabled:
      periodId !== null && allowed(input, 'transport-workforce', 'transport.payroll.period.read'),
  });
}

export function useRunPayslips(input: NavigationInput, runId: string | null) {
  return useQuery({
    queryKey: ['transport', 'payroll', 'runs', runId, 'payslips'],
    queryFn: () => transportApi.payroll.payslipsOfRun(runId as string),
    enabled:
      runId !== null && allowed(input, 'transport-workforce', 'transport.payroll.period.read'),
  });
}

export function usePayslipDetail(input: NavigationInput, payslipId: string | null) {
  return useQuery({
    queryKey: ['transport', 'payroll', 'payslips', payslipId],
    queryFn: () => transportApi.payroll.payslip(payslipId as string),
    enabled:
      payslipId !== null && allowed(input, 'transport-workforce', 'transport.payroll.period.read'),
  });
}

/**
 * Cau tra loi cho mot query — gom lai de moi khung nhin khong tu dien dat lai bon trang thai.
 * `isBlocked` la truong hop rieng va quan trong: query bi chan tu dau, nen KHONG phai "dang tai".
 */
export interface SectionQuery<T> {
  readonly data: T | undefined;
  readonly isLoading: boolean;
  readonly isBlocked: boolean;
  readonly errorMessage: string | null;
  readonly refetch: () => void;
}

export const toSectionQuery = <T>(query: UseQueryResult<T>): SectionQuery<T> => ({
  data: query.data,
  // `isPending` + `fetchStatus === 'idle'` la dau hieu query bi `enabled: false` chan lai.
  isLoading: query.isPending && query.fetchStatus !== 'idle',
  isBlocked: query.isPending && query.fetchStatus === 'idle',
  errorMessage: errorMessageOf(query.error),
  refetch: () => void query.refetch(),
});

/**
 * `403 ACTION_NOT_PERMITTED` cua cong hanh dong (`#395`) noi mot cau NGHIEP VU, khong phai "Bạn
 * không có quyền thực hiện thao tác này." (cau cua mot THAO TAC) va khong bao gio la "chua co du
 * lieu". Moi query da gac bang dung ma cua route, nen dieu nay chi xay ra khi quyen vua bi doi —
 * `AuthGate` doc lai `/auth/me` ngay sau mot `403` va danh muc tu cap nhat.
 */
const errorMessageOf = (error: Error | null): string | null =>
  error === null ? null : isActionNotPermitted(error) ? SECTION_ACCESS_REVOKED : error.message;
