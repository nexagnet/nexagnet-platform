import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { MANAGER_HAS_NO_TRANSPORT_SCOPE } from '../../experiences/transport-operations/transport-actions';
import {
  BASEMAP_UNAVAILABLE_NOTICE,
  GOOGLE_BASEMAP_UNAVAILABLE_NOTICE,
  LOCAL_BASEMAP_NOTICE,
  OPENFREEMAP_LIBERTY_STYLE_URL,
} from '../../experiences/transport-operations/visual/map-style';
import { MAPLIBRE_WORKER_URL } from '../../experiences/transport-operations/visual/maplibre-worker-url';

/**
 * Be mat VAN HANH VAN TAI tren mot may chu that, voi API duoc chan o tang mang.
 *
 * May chu la THAT (`next dev` voi goi khach van tai), API la GIA. Do la dung khuon cua bo b2b, va
 * no cho phep chung minh hai thu ma test don vi khong voi tot: dia chi/back-forward tren trinh
 * duyet that, va NOI DUNG THAT DI TREN DUONG MANG — thu ma #161 §8 doi cho be mat lai xe.
 *
 * Mock co TRANG THAI: `transition` doi trang thai chuyen trong `Map`, nen lan doc sau tra ve so
 * lieu moi. Mot mock khong trang thai chi chung minh cai nut bam duoc, khong chung minh man hinh
 * da doi.
 */

type Role = 'SALE' | 'ACCOUNTING' | 'MANAGER' | 'ADMIN';

const json = async (route: Route, body: unknown, status = 200): Promise<void> => {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
};

/* --- TX-05 / TX-06: so tong hop, du de man hinh ve ra mot bang co noi dung --- */

const AR_AGING = {
  asOf: '2026-09-30',
  rows: [
    {
      documentId: 'doc-1',
      counterpartyId: 'cus-1',
      businessDate: '2026-09-01',
      dueDate: '2026-09-15',
      outstandingAmount: 11_500_000,
      daysOverdue: 15,
      bucket: 'D1_30',
      currencyCode: 'VND',
    },
  ],
  totalsByBucket: { CURRENT: 0, D1_30: 11_500_000, D31_60: 0, D60_PLUS: 0 },
  outstandingTotal: 11_500_000,
  overdueTotal: 11_500_000,
};

const AP_ROWS = [
  {
    counterpartyId: 'par-1',
    flow: 'CARRIER_SERVICE',
    documentCount: 2,
    outstandingAmount: 6_000_000,
    currencyCode: 'VND',
  },
];

const PARTNER_POSITION = {
  partnerId: 'par-1',
  receivableAmount: 3_000_000,
  carrierPayableAmount: 5_000_000,
  commissionPayableAmount: 1_000_000,
  netDisplay: -3_000_000,
  currencyCode: 'VND',
};

/**
 * `#381`/`#385` — tong CA CONG TY cua may chu: 2 chuyen cu + 1 don theo vong xe, 1 don chua dieu xe
 * (khong vao tong), 1 phieu dau chua phan bo. Moi so o day la tong con cua `basis`, man hinh khong cong.
 */
const MARGIN_TOTALS = {
  revenueAmount: 29_000_000,
  deductionAmount: 13_320_000,
  marginAmount: 15_680_000,
  marginBasisPoints: 5407,
  tripCount: 2,
  skippedTripCount: 0,
  fixedCostsIncluded: false,
  disclosure: 'Chưa gồm chi phí cố định',
  basis: {
    legacyTrips: {
      counted: 2,
      skipped: 0,
      revenueAmount: 23_000_000,
      deductionAmount: 12_000_000,
      marginAmount: 11_000_000,
    },
    runFirstOrders: {
      counted: 1,
      excluded: { FREIGHT_MISSING: 0, NO_RUN_YET: 1, SHARED_RUN: 0, COST_SOURCE_UNAVAILABLE: 0 },
      withoutRecordedCost: 0,
      revenueAmount: 6_000_000,
      deductionAmount: 1_320_000,
      marginAmount: 4_680_000,
    },
    projectedOrderCount: 2,
    pendingFuelCost: { amount: 500_000, entryCount: 1, rowCount: 1 },
    unassignedRunFirstCost: { amount: 0, runCount: 0 },
  },
};

const marginRow = (over: Record<string, unknown>) => ({
  tripId: null,
  orderId: null,
  runIds: [],
  runCodes: [],
  tripKind: null,
  orderStatus: null,
  customerId: 'cus-1',
  costs: { tripExpense: 0, carrierPayable: 0, commission: 0, fuelAttribution: 0 },
  counted: true,
  exclusion: null,
  pendingFuelCost: { amount: 0, entryCount: 0 },
  unexpectedInternalCost: false,
  currencyCode: 'VND',
  ...over,
});

const FINANCE_MARGIN = {
  generatedFor: '2026-09-23',
  totals: MARGIN_TOTALS,
  rows: [
    marginRow({
      key: 'ORDER:ord-cho',
      source: 'RUN_FIRST_ORDER',
      code: 'UAT-378-0923B',
      orderId: 'ord-cho',
      orderStatus: 'OPEN',
      businessDate: '2026-09-23',
      originLabel: 'Kho C',
      destinationLabel: 'Kho D',
      revenueAmount: 2_000_000,
      costs: null,
      deductionAmount: null,
      marginAmount: null,
      marginBasisPoints: null,
      counted: false,
      exclusion: 'NO_RUN_YET',
    }),
    marginRow({
      key: 'ORDER:ord-a',
      source: 'RUN_FIRST_ORDER',
      code: 'UAT-378-0923A',
      orderId: 'ord-a',
      runIds: ['run-a'],
      runCodes: ['RUN-S260923-BE4C94F9'],
      orderStatus: 'FULFILLED',
      businessDate: '2026-09-23',
      originLabel: 'Kho A',
      destinationLabel: 'Kho B',
      revenueAmount: 6_000_000,
      costs: { tripExpense: 0, carrierPayable: 0, commission: 0, fuelAttribution: 1_320_000 },
      deductionAmount: 1_320_000,
      marginAmount: 4_680_000,
      marginBasisPoints: 7800,
      pendingFuelCost: { amount: 500_000, entryCount: 1 },
    }),
    marginRow({
      key: 'TRIP:trip-1',
      source: 'LEGACY_TRIP',
      code: 'VT-2026-0913',
      tripId: 'trip-1',
      tripKind: 'OWN_DIRECT',
      businessDate: '2026-09-08',
      originLabel: 'Hà Nội',
      destinationLabel: 'Hải Phòng',
      revenueAmount: 11_500_000,
      costs: { tripExpense: 6_000_000, carrierPayable: 0, commission: 0, fuelAttribution: 0 },
      deductionAmount: 6_000_000,
      marginAmount: 5_500_000,
      marginBasisPoints: 4782,
    }),
    marginRow({
      key: 'TRIP:trip-2',
      source: 'LEGACY_TRIP',
      code: 'VT-2026-0914',
      tripId: 'trip-2',
      tripKind: 'OWN_DIRECT',
      businessDate: '2026-09-07',
      originLabel: 'Hà Nội',
      destinationLabel: 'Nam Định',
      revenueAmount: 11_500_000,
      costs: { tripExpense: 6_000_000, carrierPayable: 0, commission: 0, fuelAttribution: 0 },
      deductionAmount: 6_000_000,
      marginAmount: 5_500_000,
      marginBasisPoints: 4782,
    }),
  ],
};

const MAINTENANCE_DUE = [
  {
    planId: 'plan-1',
    vehicleId: 'veh-1',
    planName: 'Thay dầu máy',
    triggerKind: 'ODOMETER',
    state: 'OVERDUE',
    dueAtOdoKm: 120_000,
    dueOnDate: null,
    odoRemainingKm: -450,
    daysRemaining: null,
    reachedBy: 'ODOMETER',
    currentOdoKm: 120_450,
    lastServicedDate: '2026-06-01',
    lastServicedOdoKm: 110_000,
  },
];

const COMPLIANCE_ALERTS = [
  {
    documentId: 'doc-insp-1',
    subjectKind: 'VEHICLE',
    subjectId: 'veh-1',
    documentType: 'VEHICLE_INSPECTION',
    validTo: '2026-10-05',
    health: 'DUE_SOON',
    daysUntilExpiry: 5,
    thresholdDays: 30,
  },
];

const ALERT_FEED = {
  generatedFor: '2026-09-30',
  alerts: [
    {
      kind: 'MAINTENANCE_OVERDUE',
      severity: 'CRITICAL',
      subjectKind: 'VEHICLE',
      subjectId: 'veh-1',
      detail: { odoRemainingKm: -450 },
    },
  ],
  unavailableSources: [],
};

interface MockTrip {
  id: string;
  code: string;
  kind: 'OWN_DIRECT' | 'EXTERNAL_CARRIER' | 'PARTNER_REFERRED_INTERNAL_RUN';
  status: 'PLANNED' | 'IN_TRANSIT' | 'DELIVERED' | 'RECONCILED' | 'CANCELLED';
  businessDate: string;
  originLabel: string;
  destinationLabel: string;
  cargoDescription: string | null;
  customerId: string | null;
  carrierPartnerId: string | null;
  referrerPartnerId: string | null;
  freightAmount: number | null;
  currencyCode: string;
  distanceKm: number | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

const seedTrips = (): Map<string, MockTrip> =>
  new Map<string, MockTrip>([
    [
      'trip-1',
      {
        id: 'trip-1',
        code: 'VT-2026-0912',
        kind: 'OWN_DIRECT',
        status: 'PLANNED',
        businessDate: '2026-09-04',
        originLabel: 'Hà Nội',
        destinationLabel: 'Thái Nguyên',
        cargoDescription: 'Hàng gia dụng',
        customerId: 'cus-1',
        carrierPartnerId: null,
        referrerPartnerId: null,
        freightAmount: 11_500_000,
        currencyCode: 'VND',
        distanceKm: 78,
        createdAt: '2026-09-04T01:00:00.000Z',
        updatedAt: '2026-09-04T01:00:00.000Z',
        cancelledAt: null,
        cancellationReason: null,
      },
    ],
    [
      'trip-2',
      {
        id: 'trip-2',
        code: 'VT-2026-0913',
        kind: 'EXTERNAL_CARRIER',
        status: 'DELIVERED',
        businessDate: '2026-09-03',
        originLabel: 'Hà Nội',
        destinationLabel: 'Đà Nẵng',
        cargoDescription: null,
        customerId: 'cus-1',
        carrierPartnerId: 'par-1',
        referrerPartnerId: null,
        freightAmount: 24_000_000,
        currencyCode: 'VND',
        distanceKm: 763,
        createdAt: '2026-09-03T01:00:00.000Z',
        updatedAt: '2026-09-03T01:00:00.000Z',
        cancelledAt: null,
        cancellationReason: null,
      },
    ],
    // Dang thu BA — chuyen do NGUON DON gioi thieu nhung xe nha chay. Ba dang deu phai co mat,
    // vi cach doc tien cua ba dang khac nhau (hop dong mien §9).
    [
      'trip-3',
      {
        id: 'trip-3',
        code: 'VT-2026-0914',
        kind: 'PARTNER_REFERRED_INTERNAL_RUN',
        status: 'IN_TRANSIT',
        businessDate: '2026-09-04',
        originLabel: 'Hà Nội',
        destinationLabel: 'Hải Phòng',
        cargoDescription: 'Hàng điện máy',
        customerId: 'cus-1',
        carrierPartnerId: null,
        referrerPartnerId: 'par-2',
        freightAmount: 6_800_000,
        currencyCode: 'VND',
        distanceKm: 120,
        createdAt: '2026-09-04T00:30:00.000Z',
        updatedAt: '2026-09-04T04:00:00.000Z',
        cancelledAt: null,
        cancellationReason: null,
      },
    ],
    [
      'trip-4',
      {
        id: 'trip-4',
        code: 'VT-2026-0915',
        kind: 'OWN_DIRECT',
        status: 'RECONCILED',
        businessDate: '2026-09-02',
        originLabel: 'Hà Nội',
        destinationLabel: 'Nam Định',
        cargoDescription: 'Hàng gia dụng',
        customerId: 'cus-1',
        carrierPartnerId: null,
        referrerPartnerId: null,
        freightAmount: 4_200_000,
        currencyCode: 'VND',
        distanceKm: 90,
        createdAt: '2026-09-02T01:00:00.000Z',
        updatedAt: '2026-09-03T09:00:00.000Z',
        cancelledAt: null,
        cancellationReason: null,
      },
    ],
    // Mot chuyen DA HUY co ly do — man hinh khong bao gio tao ra trang thai nay, nhung phai chiu
    // duoc no khi noi khac tao ra (khoang cach `G-14`).
    [
      'trip-5',
      {
        id: 'trip-5',
        code: 'VT-2026-0916',
        kind: 'EXTERNAL_CARRIER',
        status: 'CANCELLED',
        businessDate: '2026-09-01',
        originLabel: 'Hà Nội',
        destinationLabel: 'Vinh',
        cargoDescription: null,
        customerId: 'cus-1',
        carrierPartnerId: 'par-1',
        referrerPartnerId: null,
        freightAmount: 15_000_000,
        currencyCode: 'VND',
        distanceKm: 300,
        createdAt: '2026-09-01T01:00:00.000Z',
        updatedAt: '2026-09-01T06:00:00.000Z',
        cancelledAt: '2026-09-01T06:00:00.000Z',
        cancellationReason: 'Khách hoãn giao',
      },
    ],
  ]);

/** Ba xe o BA trang thai khac nhau — mot doi xe mot dong khong cho thay phu hieu nao khac nhau. */
const VEHICLES = [
  {
    id: 'veh-1',
    registrationPlate: '29H-123.45',
    vehicleClass: 'Xe tải 5 tấn',
    allowedPayloadKg: 5000,
    currentOdoKm: 120_450,
    status: 'IDLE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'veh-2',
    registrationPlate: '29H-678.90',
    vehicleClass: 'Xe tải 8 tấn',
    allowedPayloadKg: 8000,
    currentOdoKm: 87_300,
    status: 'ON_TRIP',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-03T00:00:00.000Z',
  },
  {
    id: 'veh-3',
    registrationPlate: '29H-246.80',
    vehicleClass: 'Xe tải 2 tấn',
    allowedPayloadKg: 2000,
    currentOdoKm: 45_120,
    status: 'UNDER_MAINTENANCE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
  },
];

const DRIVERS = [
  {
    id: 'drv-1',
    fullName: 'Nguyễn Văn Bình',
    phone: '0900000001',
    licenceClass: 'FC',
    licenceExpiry: '2027-06-30',
    status: 'ACTIVE',
    authUserId: 'u-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  // Lai xe THU HAI ton tai de bat duoc mot loai loi ma mot fixture mot nguoi khong bao gio bat duoc:
  // phieu quy bi gui sang NGUOI KHAC vi o chon doi giua luc dang nhap.
  {
    id: 'drv-2',
    fullName: 'Trần Thị Mai',
    phone: '0900000002',
    licenceClass: 'FC',
    licenceExpiry: '2028-01-31',
    status: 'ACTIVE',
    authUserId: 'u-2',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  // Lai xe NGHI VIEC — de danh sach co it nhat mot dong khong o trang thai ACTIVE.
  {
    id: 'drv-3',
    fullName: 'Lê Quốc Hùng',
    phone: '0900000003',
    licenceClass: 'C',
    licenceExpiry: '2026-11-15',
    status: 'INACTIVE',
    authUserId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  },
];

/*
 * SO DOI SOAT KHACH HANG — ba duong DOC cua nua tren man `Cong no & quyet toan`.
 *
 * Thieu chung thi man hinh xuong che do loi o dung cai khoi ma no duoc dat ten theo, va bo anh
 * `chup bo anh o be rong may tinh va dien thoai` dua cho nguoi review mot man hinh HONG thay vi
 * man hinh that. Cac con so o day chi de ve ra mot trang co du lieu, khong phai cua khach nao.
 */
const CUSTOMER_AR_PENDING = [
  {
    orderId: 'ord-e2e-1',
    orderCode: 'DH-E2E-1',
    customerId: 'cus-1',
    proposedAmount: 5_000_000,
    currencyCode: 'VND',
    businessDate: '2026-09-12',
  },
];

const CUSTOMER_AR_SUMMARY = {
  asOf: '2026-09-30',
  customerId: null,
  pendingReconciliationAmount: 5_000_000,
  officialReceivableAmount: 23_500_000,
  outstandingAmount: 11_500_000,
  notYetDueAmount: 0,
  dueAmount: 0,
  overdueAmount: 11_500_000,
  paidAmount: 12_000_000,
  unallocatedCreditAmount: 2_000_000,
  receivables: [
    {
      reconciliation: { orderId: 'ord-e2e-1' },
      documentId: 'doc-1',
      customerId: 'cus-1',
      currencyCode: 'VND',
      grossAmount: 23_500_000,
      allocatedAmount: 12_000_000,
      outstandingAmount: 11_500_000,
      dueDate: '2026-09-15',
      status: 'OVERDUE',
    },
  ],
  payments: [
    {
      payment: {
        id: 'pay-e2e-1',
        customerId: 'cus-1',
        amount: 14_000_000,
        currencyCode: 'VND',
        receivedAt: '2026-09-20T02:00:00.000Z',
        businessDate: '2026-09-20',
        externalRef: 'NH-0001',
        note: null,
        recordedBy: 'e2e',
        sourceId: 'src-e2e-1',
        sourceFingerprint: 'fp-e2e-1',
        createdAt: '2026-09-20T02:00:00.000Z',
      },
      allocations: [],
      allocatedAmount: 12_000_000,
      unallocatedAmount: 2_000_000,
    },
  ],
};

const CUSTOMERS = [
  {
    id: 'cus-1',
    name: 'Công ty Đông Anh',
    phone: null,
    address: null,
    taxCode: null,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const PARTNERS = [
  {
    id: 'par-1',
    name: 'Nhà xe Trường Phát',
    phone: null,
    roles: ['CARRIER'],
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  // Doi tac HAI VAI — hop dong mien §9 noi ro khoa phan biet hai dong tien la VAI, khong phai
  // doi tac. Mot doi tac vua la nha xe vua la nguon don la truong hop that, khong phai ngoai le.
  {
    id: 'par-2',
    name: 'Logistics Bắc Hà',
    phone: null,
    roles: ['CARRIER', 'ORDER_REFERRER'],
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const FUEL_SUPPLIERS = [
  {
    id: 'sup-1',
    code: 'PVO-DA',
    name: 'Cây xăng Đông Anh',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'sup-2',
    code: null,
    name: 'Cây xăng Gia Lâm',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

/** Hai ky doi soat o hai trang thai — mot ky dang khop, mot ky da chot. */
const FUEL_RECONCILIATIONS = [
  {
    id: 'rec-1',
    supplierId: 'sup-1',
    statementId: 'stm-1',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-15',
    state: 'MATCHING',
    closedAt: null,
    closedBy: null,
    reopenedAt: null,
    reopenedBy: null,
    reopenReason: null,
    createdAt: '2026-09-03T02:00:00.000Z',
    updatedAt: '2026-09-04T02:00:00.000Z',
  },
  {
    id: 'rec-2',
    supplierId: 'sup-2',
    statementId: 'stm-2',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    state: 'CLOSED',
    closedAt: '2026-09-01T03:00:00.000Z',
    closedBy: 'accounting',
    reopenedAt: null,
    reopenedBy: null,
    reopenReason: null,
    createdAt: '2026-08-31T02:00:00.000Z',
    updatedAt: '2026-09-01T03:00:00.000Z',
  },
];

const ASSIGNMENT = {
  id: 'asg-1',
  tripId: 'trip-1',
  vehicleId: 'veh-1',
  driverId: 'drv-1',
  effectiveFrom: '2026-09-04T02:00:00.000Z',
  effectiveTo: null,
  assignedBy: 'operator',
  createdAt: '2026-09-04T02:00:00.000Z',
};

/** Khung nhin cua lai xe — KHONG co `freightAmount`. Do la diem cua bai kiem tra cach ly. */
const DRIVER_TRIPS = [
  {
    id: 'trip-1',
    code: 'VT-2026-0912',
    kind: 'OWN_DIRECT',
    status: 'IN_TRANSIT',
    businessDate: '2026-09-04',
    originLabel: 'Hà Nội',
    destinationLabel: 'Thái Nguyên',
    cargoDescription: 'Hàng gia dụng',
    distanceKm: 78,
    customerName: 'Công ty Đông Anh',
    vehicleRegistrationPlate: '29H-123.45',
    assignedAt: '2026-09-04T02:00:00.000Z',
    isCurrentAssignee: true,
  },
];

const DRIVER_FUND = {
  account: {
    id: 'acc-1',
    driverId: 'drv-1',
    currencyCode: 'VND',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-04T03:00:00.000Z',
  },
  driverId: 'drv-1',
  // 10.000.000 tam ung − 1.850.000 chi chuyen − 300.000 nop lai = 7.850.000.
  balance: 7_850_000,
  balanceStance: 'DRIVER_HOLDS_COMPANY_CASH',
  currencyCode: 'VND',
  entries: [
    {
      id: 'fe-1',
      accountId: 'acc-1',
      kind: 'ADVANCE',
      signedAmount: 10_000_000,
      currencyCode: 'VND',
      businessDate: '2026-09-04',
      tripId: null,
      correlationKey: 'corr-00000001',
      reversalOfId: null,
      note: 'Tạm ứng đầu tháng',
      recordedBy: 'accounting',
      createdAt: '2026-09-04T03:00:00.000Z',
    },
    // Mot khoan chi cua chuyen, va mot lan hoan quy — de so du khong phai mot dong duy nhat, va
    // de thay ca hai chieu dau cua `signedAmount`.
    {
      id: 'fe-2',
      accountId: 'acc-1',
      kind: 'TRIP_EXPENSE',
      signedAmount: -1_850_000,
      currencyCode: 'VND',
      businessDate: '2026-09-04',
      tripId: 'trip-1',
      correlationKey: 'corr-00000002',
      reversalOfId: null,
      note: 'Phí cầu đường + bốc xếp',
      recordedBy: 'accounting',
      createdAt: '2026-09-04T05:00:00.000Z',
    },
    {
      id: 'fe-3',
      accountId: 'acc-1',
      kind: 'RETURN',
      signedAmount: -300_000,
      currencyCode: 'VND',
      businessDate: '2026-09-03',
      tripId: null,
      correlationKey: 'corr-00000003',
      reversalOfId: null,
      note: 'Nộp lại tiền thừa',
      recordedBy: 'accounting',
      createdAt: '2026-09-03T10:00:00.000Z',
    },
  ],
};

/**
 * MOT VONG CHAY HAI CHANG: mot co hang, mot RONG. Day la hinh dang ma `#274` §4 mo ta.
 *
 * `plannedDistanceKm` lech `distanceKm` o chang dau de bai kiem doc duoc do lech ke hoach/thuc te.
 */
const JOURNEY = {
  run: {
    runId: 'r-1',
    runCode: 'RUN-E2E-1',
    vehicleId: 'v-1',
    vehiclePlate: '29H-111.11',
    status: 'COMPLETED',
    businessDate: '2026-09-08',
    startedAt: '2026-09-08T01:00:00.000Z',
    completedAt: '2026-09-08T12:00:00.000Z',
    driverId: 'd-1',
  },
  distance: {
    loadedKm: 105,
    emptyKm: 105,
    totalKm: 210,
    emptyRatio: 0.5,
    complete: true,
    legsMissingDistance: { loaded: 0, empty: 0 },
    countedLegs: 2,
  },
  orderCodes: ['ORD-E2E-1'],
  legs: [
    {
      legId: 'l-1',
      sequence: 1,
      kind: 'LOADED',
      status: 'COMPLETED',
      orderCode: 'ORD-E2E-1',
      originLabel: 'Hà Nội',
      destinationLabel: 'Hải Phòng',
      businessDate: '2026-09-08',
      distanceKm: 105,
      plannedDistanceKm: 100,
      startedAt: '2026-09-08T02:00:00.000Z',
      completedAt: '2026-09-08T06:00:00.000Z',
      phase: 'DELIVERED',
    },
    {
      legId: 'l-2',
      sequence: 2,
      kind: 'EMPTY',
      status: 'COMPLETED',
      orderCode: null,
      originLabel: 'Hải Phòng',
      destinationLabel: 'Hà Nội',
      businessDate: '2026-09-08',
      distanceKm: 105,
      plannedDistanceKm: null,
      startedAt: '2026-09-08T07:00:00.000Z',
      completedAt: '2026-09-08T11:00:00.000Z',
      phase: null,
    },
  ],
  timeline: [
    {
      kind: 'CHECKPOINT',
      code: 'DELIVERY_ACCEPTED',
      at: '2026-09-08T06:00:00.000Z',
      legId: 'l-1',
      hasLocationProof: true,
      subjectId: 'cp-1',
    },
  ],
  unavailableSources: [],
};

const JOURNEY_MAP = {
  runId: 'r-1',
  runCode: 'RUN-E2E-1',
  legs: [
    {
      legId: 'l-1',
      sequence: 1,
      kind: 'LOADED',
      origin: {
        point: { latitude: 21.0278, longitude: 105.8342 },
        source: 'CHECKPOINT_OBSERVATION',
        at: '2026-09-08T02:00:00.000Z',
      },
      originGap: null,
      destination: {
        point: { latitude: 20.8449, longitude: 106.6881 },
        source: 'CHECKPOINT_OBSERVATION',
        at: '2026-09-08T06:00:00.000Z',
      },
      destinationGap: null,
      paths: [
        { kind: 'PLANNED', points: [], gap: 'NO_ROUTE_PROVIDER', sampledFrom: 0 },
        {
          kind: 'CHECKPOINT_ANCHORED',
          points: [
            { latitude: 21.0278, longitude: 105.8342 },
            { latitude: 20.8449, longitude: 106.6881 },
          ],
          gap: null,
          sampledFrom: 2,
        },
      ],
    },
  ],
  unavailableSources: [],
};

/** Vong chay THU HAI, o mot noi khac han (Da Nang → Hue), de doi vong chay la doi khung nhin. */
const JOURNEY_MAP_DA_NANG_HUE = {
  runId: 'r-2',
  runCode: 'RUN-E2E-2',
  legs: [
    {
      legId: 'l-2',
      sequence: 1,
      kind: 'EMPTY',
      origin: {
        point: { latitude: 16.0544, longitude: 108.2022 },
        source: 'CHECKPOINT_OBSERVATION',
        at: '2026-09-09T02:00:00.000Z',
      },
      originGap: null,
      destination: {
        point: { latitude: 16.4637, longitude: 107.5909 },
        source: 'CHECKPOINT_OBSERVATION',
        at: '2026-09-09T05:00:00.000Z',
      },
      destinationGap: null,
      paths: [
        {
          kind: 'CHECKPOINT_ANCHORED',
          points: [
            { latitude: 16.0544, longitude: 108.2022 },
            { latitude: 16.4637, longitude: 107.5909 },
          ],
          gap: null,
          sampledFrom: 2,
        },
      ],
    },
  ],
  unavailableSources: [],
};

const FLEET_INSIGHT = {
  range: { from: '2026-08-10', to: '2026-09-08', businessDays: 30 },
  utilisationFormula: 'ngayCoChangKhongHuy / ngayLichTrongKhoang',
  vehicles: [
    {
      vehicleId: 'v-1',
      registrationPlate: '29H-111.11',
      status: 'IDLE',
      runCount: 3,
      activeBusinessDays: 6,
      utilisation: 0.2,
      loadedKm: 300,
      emptyKm: 150,
      totalKm: 450,
      emptyRatio: 1 / 3,
      legsMissingDistance: 0,
    },
  ],
  presence: { total: 1, idle: 1, onTrip: 0, underMaintenance: 0 },
  totals: { loadedKm: 300, emptyKm: 150, totalKm: 450, emptyRatio: 1 / 3, legsMissingDistance: 0 },
};

const CORRIDOR_INSIGHT = {
  range: { from: '2026-08-10', to: '2026-09-08', businessDays: 30 },
  grouping: 'FREE_TEXT_LABEL_COMPATIBILITY',
  emptyAttribution: 'PRECEDING_LOADED_LEG_IN_SAME_RUN',
  corridors: [
    {
      corridorKey: 'hà nội → hải phòng',
      originLabel: 'Hà Nội',
      destinationLabel: 'Hải Phòng',
      legCount: 3,
      orderCodes: ['ORD-E2E-1'],
      runCodes: ['RUN-E2E-1'],
      loadedKm: 315,
      medianLoadedKm: 105,
      attributedEmptyKm: 210,
      legsMissingDistance: 0,
    },
  ],
};

/**
 * THAP DIEU HANH sau Lane N: ba cot giai doan MO (khong con `AWAITING_CHECKPOINT_SOURCE`), va
 * `WAITING` van dong nhung bang mot ma RIENG.
 */
const CONTROL_TOWER = {
  generatedFor: '2026-09-08',
  board: [
    { column: 'PLANNED', cards: [], total: 0, unavailableReason: null },
    { column: 'PICKUP', cards: [], total: 0, unavailableReason: null },
    { column: 'LOADING', cards: [], total: 0, unavailableReason: null },
    {
      column: 'IN_TRANSIT',
      total: 1,
      unavailableReason: null,
      cards: [
        {
          runId: 'r-1',
          runCode: 'RUN-E2E-1',
          vehicleId: 'v-1',
          businessDate: '2026-09-08',
          driverId: 'd-1',
          loadedLegs: 1,
          emptyLegs: 1,
          totalKm: 210,
          emptyKm: 105,
          currentLeg: {
            legId: 'l-2',
            sequence: 2,
            kind: 'EMPTY',
            orderCode: null,
            phase: 'IN_TRANSIT',
          },
        },
      ],
    },
    { column: 'ARRIVED', cards: [], total: 0, unavailableReason: null },
    {
      column: 'WAITING',
      cards: [],
      total: 0,
      unavailableReason: 'AWAITING_WAITING_SESSION_SOURCE',
    },
    { column: 'DELIVERED', cards: [], total: 0, unavailableReason: null },
  ],
  fleet: { total: 1, idle: 0, onTrip: 1, underMaintenance: 0, activeDrivers: 1, runningRuns: 1 },
  queue: [
    {
      kind: 'RUN_LEG_MISSING_DISTANCE',
      severity: 'WARNING',
      subject: { kind: 'RUN_LEG', id: 'l-9', reference: 'RUN-E2E-1' },
      detail: {},
    },
  ],
  queueTotal: 1,
  unavailableSources: [],
  pendingWork: [
    { kind: 'RECEIVER_WAITING_ABOVE_THRESHOLD', reason: 'AWAITING_WAITING_SESSION_SOURCE' },
  ],
};

const FINANCE_SUMMARY = {
  generatedFor: '2026-09-08',
  buckets: {
    flows: {
      CUSTOMER_FREIGHT: 11_500_000,
      FUEL_SUPPLIER: 2_000_000,
      CARRIER_SERVICE: 6_000_000,
      PARTNER_COMMISSION: 1_000_000,
    },
    driverReimbursementOutstanding: 0,
    driverSettlementRemaining: 3_000_000,
  },
  directMargin: MARGIN_TOTALS,
  receivable: { outstandingTotal: 11_500_000, overdueTotal: 11_500_000 },
  currency: { codes: ['VND'], isSingle: true },
  unavailableSources: [],
};

/* --- `#294` — mot don MO de man hinh dieu xe co gi do chon --- */

const DISPATCH_ORDERS = [
  {
    id: 'ord-e2e-1',
    code: 'DH-E2E-1',
    status: 'OPEN',
    businessDate: '2026-09-12',
    customerId: 'cus-1',
    originLabel: 'Kho Hải Phòng',
    destinationLabel: 'Ninh Bình',
    cargoDescription: null,
    freightAmount: 5_000_000,
    currencyCode: 'VND',
    note: null,
    cancelledAt: null,
    cancellationReason: null,
  },
];

/** Mot bang de nghi TOI THIEU — du de man hinh ve mot dong, khong hon. */
const DISPATCH_SUGGESTION = {
  orderId: 'ord-e2e-1',
  orderCode: 'DH-E2E-1',
  pickup: {
    /* `#379` — diem lay hang la TOA DO cua don, khong con suy tu nhan hang rao. */
    place: {
      point: { latitude: 20.8449, longitude: 106.6881 },
      source: 'ORDER_PICKUP_POINT',
      label: 'Kho Hải Phòng',
      geofenceId: null,
      siteId: null,
    },
    resolution: 'PICKUP_FROM_ORDER_COORDINATES',
  },
  requiredPickupAt: null,
  generatedAt: '2026-09-12T03:00:00.000Z',
  orderingKeys: ['DEADLINE_FEASIBILITY', 'NO_WORK_INTERRUPTION', 'EMPTY_ROAD_DISTANCE'],
  candidates: [
    {
      vehicleId: 'veh-1',
      registrationPlate: '15C-123.45',
      mode: 'CURRENT_NEAR',
      origin: {
        point: { latitude: 20.85, longitude: 106.69 },
        pointRedacted: false,
        source: 'VEHICLE_OBSERVATION',
        label: 'Vị trí hiện tại',
        geofenceId: null,
        siteId: null,
      },
      availableAt: '2026-09-12T03:00:00.000Z',
      availableAtIsLowerBound: true,
      emptyRoadMetresToPickup: 4_200,
      roadSecondsToPickup: 600,
      pickupEtaAt: '2026-09-12T03:10:00.000Z',
      meetsRequiredPickupAt: null,
      suitability: [],
      currentLocation: {
        observedAt: '2026-09-12T02:58:00.000Z',
        ageSeconds: 120,
        freshness: 'FRESH',
        accuracyGrade: 'GOOD',
        source: 'DEVICE_GNSS',
        point: { latitude: 20.85, longitude: 106.69 },
        pointRedacted: false,
      },
      nextFree: null,
      truckProfile: { complete: false },
      route: {
        providerId: 'synthetic',
        quality: 'SYNTHETIC',
        estimated: true,
        fromCache: false,
        computedAt: '2026-09-12T03:00:00.000Z',
        reason: 'ROUTE_SYNTHETIC_ESTIMATE',
      },
      reasonSummary: 'Đang ở gần điểm lấy hàng',
    },
  ],
  excluded: [],
  assignmentCreated: false,
};

async function mockTransport(page: Page, role?: Role): Promise<void> {
  const trips = seedTrips();

  await page.route('**/auth/config', (route) => json(route, { mode: role ? 'session' : 'none' }));
  await page.route('**/auth/csrf', (route) => json(route, { csrfToken: 'e2e-csrf' }));
  await page.route('**/auth/me', (route) =>
    role
      ? json(route, {
          user: { id: 'u-1', username: 'e2e', name: `Người dùng ${role}`, role },
          roles: [role],
        })
      : json(route, { message: 'Chua dang nhap' }, 401),
  );

  await page.route('**/transport/vehicles', (route) => json(route, VEHICLES));
  /**
   * `TX-08` (#242) — be mat "Xe toi co co phan".
   *
   * `403` la cau tra loi THAT cua may chu cho moi nhan vat trong bo mock nay: pham vi ben huu quan
   * den tu mot hang `TransportAssetStakeholder.authUserId`, va khong nhan vat mau nao o day co hang
   * do. Mot vai khong co pham vi van hanh (`MANAGER`) roi vao chinh man nay, nen neu khong khai
   * route, yeu cau se roi ve trang 404 cua Next.js va man hinh se noi "nghiep vu chua duoc bat" —
   * mot cau SAI, va sai theo kieu lam bai test ben duoi do vi mot ly do no khong dinh do.
   */
  await page.route('**/transport/me/vehicles', (route) =>
    json(route, { message: 'Tài khoản này không có quyền xem xe đã yêu cầu' }, 403),
  );
  /*
   * `#278` N9 — duong HOAT DONG cua chinh be mat do. Cung mot `403`, va vi cung mot ly do: khong
   * nhan vat mau nao trong bo mock nay co hang `TransportAssetStakeholder.authUserId`. Khai rieng
   * vi day la mot duong dan SAU HON, khong khop voi mau tren.
   */
  await page.route('**/transport/me/vehicles/activity*', (route) =>
    json(route, { message: 'Tài khoản này không có quyền xem xe đã yêu cầu' }, 403),
  );
  await page.route('**/transport/drivers', (route) => json(route, DRIVERS));
  await page.route('**/transport/customers', (route) => json(route, CUSTOMERS));
  await page.route('**/transport/partners', (route) => json(route, PARTNERS));
  await page.route('**/transport/fuel/suppliers', (route) => json(route, FUEL_SUPPLIERS));
  await page.route('**/transport/fuel/reconciliations', (route) =>
    json(route, FUEL_RECONCILIATIONS),
  );
  await page.route('**/transport/me/trips', (route) => json(route, DRIVER_TRIPS));
  await page.route('**/transport/me/fund', (route) => json(route, DRIVER_FUND));
  await page.route('**/transport/me/fuel/slips', (route) => json(route, []));
  await page.route('**/transport/costing/driver-fund/accounts/*', (route) =>
    json(route, DRIVER_FUND),
  );
  await page.route('**/transport/costing/driver-fund/accounts/*/periods', (route) =>
    json(route, []),
  );

  /*
   * TX-05 / TX-06 / TX-07 — sau muc T7D noi vao. Mock o day de bo E2E chung minh man hinh DOC va
   * VE duoc du lieu that; noi dung deu la so tong hop, khong phai cua khach nao.
   */
  await page.route('**/transport/settlement/ar-aging*', (route) => json(route, AR_AGING));
  await page.route('**/transport/settlement/ap*', (route) => json(route, AP_ROWS));
  await page.route('**/transport/settlement/partners/*/position', (route) =>
    json(route, PARTNER_POSITION),
  );
  await page.route('**/transport/customer-ar/pending**', (route) =>
    json(route, { orders: CUSTOMER_AR_PENDING }),
  );
  await page.route('**/transport/customer-ar/batches**', (route) => json(route, { batches: [] }));
  await page.route('**/transport/customer-ar/summary**', (route) =>
    json(route, CUSTOMER_AR_SUMMARY),
  );
  // PHONG BI, khong mang tran. May chu that goi `{ due }`, `{ plans }`, `{ workOrders }`,
  // `{ documents }`, `{ alerts, gaps }`, `{ vehicles, conflicts }`. Cac may chu gia o day tung tra
  // ve mang tran, nen bo e2e xanh trong khi hai muc "Bao duong & giay to" va "Luong" TRANG MAN
  // tren ban that (`N.map is not a function`, do o T10 tren `e4fbf95`).
  await page.route('**/transport/maintenance/due', (route) =>
    json(route, { due: MAINTENANCE_DUE }),
  );
  await page.route('**/transport/maintenance/plans', (route) => json(route, { plans: [] }));
  await page.route('**/transport/maintenance/work-orders', (route) =>
    json(route, { workOrders: [] }),
  );
  await page.route('**/transport/compliance/documents', (route) => json(route, { documents: [] }));
  await page.route('**/transport/compliance/alerts', (route) =>
    json(route, { alerts: COMPLIANCE_ALERTS, gaps: [] }),
  );
  await page.route('**/transport/fleet-status', (route) =>
    json(route, { vehicles: [], conflicts: [] }),
  );
  await page.route('**/transport/alerts', (route) => json(route, ALERT_FEED));
  await page.route('**/transport/payroll/periods', (route) => json(route, { periods: [] }));
  await page.route('**/transport/me/payslips', (route) => json(route, []));
  await page.route('**/transport/me/expense-categories', (route) =>
    json(route, { categories: ['BOT', 'BAI_XE'], unrestricted: false }),
  );

  await page.route('**/transport/trips', (route) => json(route, [...trips.values()]));
  await page.route('**/transport/trips/*/assignments', (route) =>
    json(route, route.request().url().includes('trip-1') ? [ASSIGNMENT] : []),
  );

  // Mock CO TRANG THAI: chuyen trang thai that su doi du lieu, nen lan doc sau thay ket qua moi.
  await page.route('**/transport/trips/*/transition', async (route) => {
    const id = /trips\/([^/]+)\/transition/.exec(route.request().url())?.[1] ?? '';
    const trip = trips.get(id);
    if (trip === undefined) return json(route, { message: `Khong tim thay chuyen ${id}` }, 404);
    const body = route.request().postDataJSON() as { to: MockTrip['status'] };
    // `DELIVERED → RECONCILED` bi tu choi o day de kiem duong LOI: man hinh phai hien NGUYEN VAN
    // cau cua may chu, khong duoc dien dat lai.
    if (trip.status === 'DELIVERED' && body.to === 'RECONCILED') {
      return json(
        route,
        { statusCode: 403, error: 'Forbidden', message: 'Chuyen VT-2026-0913: chua doi soat duoc' },
        403,
      );
    }
    trips.set(id, { ...trip, status: body.to });
    return json(route, trips.get(id));
  });

  /*
   * Lane N (#278 N5) — BAO CAO va BAN DO la HAI tuyen, va do la ca diem cua bo mock nay.
   *
   * Tuyen ban do tra `403` cho ke toan y het may chu that (`transport.location.history.read` nam
   * trong `ACCOUNTING_DENIED`). Neu mock tra `200` cho moi vai thi bai kiem ranh gioi quyen ben
   * duoi se XANH ma khong chung minh gi ca.
   */
  await page.route('**/transport/journey/runs/*/map', (route) =>
    role === 'ADMIN'
      ? json(route, JOURNEY_MAP)
      : json(route, { message: 'Tài khoản không được xem lịch sử vị trí' }, 403),
  );
  await page.route('**/transport/journey/runs/*', (route) => json(route, JOURNEY));
  await page.route('**/transport/insight/fleet*', (route) => json(route, FLEET_INSIGHT));
  await page.route('**/transport/insight/corridors*', (route) => json(route, CORRIDOR_INSIGHT));
  /*
   * Hai nguon ma BANG DIEU HANH ghep lai. Chung phai co mat o day chinh vi man do KHONG co lan goi
   * API rieng nao — bo chung ra thi man hinh xuong che do loi, va do la hanh vi DUNG nhung khong
   * phai cai bai kiem ben duoi dang do.
   */
  await page.route('**/transport/control-tower', (route) => json(route, CONTROL_TOWER));
  await page.route('**/transport/finance/summary', (route) => json(route, FINANCE_SUMMARY));
  await page.route('**/transport/finance/margin', (route) => json(route, FINANCE_MARGIN));

  /*
   * `#294` — CHE DO GOM NHOM, va mac dinh o day la mac dinh CUA SAN PHAM.
   *
   * `ONE_ORDER_PER_RUN` chu khong phai `MULTI_ORDER_RUN`: mot bo mock de man hinh dieu xe bat san
   * se lam bai "che do mac dinh khong co bang de nghi" xanh o moi cach cai dat, ke ca cach sai.
   * Bai nao can che do MULTI thi tu khai de len — `page.route` dang ky sau se thang.
   */
  await page.route('**/transport/planning/policy', (route) =>
    json(route, { grouping: 'ONE_ORDER_PER_RUN', depots: [], closure: { idleHours: null } }),
  );
  await page.route('**/transport/orders', (route) => json(route, DISPATCH_ORDERS));
}

/**
 * CHE DO GOM NHOM tren TRINH DUYET THAT — `#294 S1`.
 *
 * Bo bai don vi o `dispatch.service.spec.ts` da chung minh CONG MAY CHU. Bo nay chung minh thu
 * khac han va khong thay the duoc: rang o che do mac dinh, man hinh KHONG GUI mot lan hoi de nghi
 * nao. Do la yeu cau *"opening/creating an Order does not trigger multi-order candidate fetching"*,
 * va cach duy nhat de do no la dem so lan goi that di tren duong mang.
 */
test.describe('che do gom nhom tren man hinh dieu xe (#294)', () => {
  test('che do mac dinh: noi ro ly do, va KHONG goi de nghi dieu xe lan nao', async ({ page }) => {
    await mockTransport(page, 'ADMIN');

    const suggestCalls: string[] = [];
    await page.route('**/transport/orders/*/dispatch-suggestions', async (route) => {
      suggestCalls.push(route.request().url());
      await json(route, DISPATCH_SUGGESTION);
    });

    await page.goto('/?section=dispatch');

    await expect(page.getByTestId('tx-dispatch-one-order')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Khách này chạy chế độ mỗi đơn một vòng chạy' }),
    ).toBeVisible();

    /* Khong co loi moi nao de bam — nut va o chon don deu khong duoc dung ra. */
    await expect(page.getByRole('button', { name: 'Tìm xe' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Đơn hàng' })).toHaveCount(0);

    /*
     * VA KHONG MOT LAN GOI NAO. Day la khang dinh quan trong nhat cua ca bai: mot man hinh co the
     * giau ket qua di ma van goi — tuc van ton mot lan hoi nha cung cap dinh tuyen that.
     */
    expect(suggestCalls).toEqual([]);
  });

  test('che do MULTI_ORDER_RUN: bang de nghi hien ra, va van chi la de nghi', async ({ page }) => {
    await mockTransport(page, 'ADMIN');

    /* Dang ky SAU `mockTransport` nen thang no — Playwright uu tien route dang ky sau. */
    await page.route('**/transport/planning/policy', (route) =>
      json(route, { grouping: 'MULTI_ORDER_RUN', depots: [], closure: { idleHours: null } }),
    );
    await page.route('**/transport/orders/*/dispatch-suggestions', (route) =>
      json(route, DISPATCH_SUGGESTION),
    );

    await page.goto('/?section=dispatch');

    await expect(page.getByTestId('tx-dispatch-one-order')).toHaveCount(0);

    await page.getByRole('combobox', { name: 'Đơn hàng' }).selectOption('ord-e2e-1');
    await page.getByRole('button', { name: 'Tìm xe' }).click();

    await expect(page.getByRole('region', { name: 'Xe phù hợp' })).toBeVisible();
    /* `rowheader` chu khong `cell`: cot bien so khai `isRowHeader: true` trong `DataTable`. */
    await expect(page.getByRole('rowheader', { name: '15C-123.45' })).toBeVisible();
    /* Km rong la con so DUONG BO, va no phai doc duoc tren man hinh chu khong chi trong DTO. */
    await expect(page.getByRole('cell', { name: '4,2 km' })).toBeVisible();
    /* `assignmentCreated: false` phai doc duoc bang mat, khong chi trong DTO. */
    await expect(page.getByText('Đây là ĐỀ NGHỊ, chưa gán xe cho đơn nào.')).toBeVisible();
  });
});

test.describe('vo va kien truc thong tin', () => {
  test('danh muc dung nhom, va HAI muc cua T6 hien theo nang luc goi khach', async ({ page }) => {
    await mockTransport(page);
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Điều hướng vận hành vận tải' });
    // #339 — don hang la duong chinh; `Chuyến xe` rut xuong loi phu "Cách làm trước đây".
    await expect(nav.getByRole('link', { name: 'Đơn hàng & vòng chạy' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Chuyến xe' })).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: 'Cách làm trước đây' }).getByRole('link', {
        name: 'Chuyến xe',
      }),
    ).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Đội xe & lái xe' })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Quỹ lái xe/ })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Nhiên liệu' })).toBeVisible();

    // First UAT cua Lane W co y de ETC ngoai pham vi, ke ca khi preview package van giu capability
    // de backend/runtime proof khong bi thay doi. An dieu huong khong phai mot cong quyen.
    await expect(nav.getByRole('link', { name: /Phí đường bộ/ })).toHaveCount(0);

    // Goi `transport-preview` bat ca `transport-asset-compliance` lan `transport-workforce`, nen
    // hai muc cua T6 HIEN — va nhom cua chung khong con mo coi. Chieu nguoc lai (khach khong bat
    // thi an) duoc khoa o `__tests__/navigation.spec.ts`, cho ca hai chieu.
    await expect(nav.getByRole('link', { name: /Bảo dưỡng/ })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Lương' })).toBeVisible();
    // #341 — `Bảo dưỡng` o nhom TÀI SẢN, `Lương` sang nhom tien cua lai xe.
    await expect(nav.getByText('TÀI SẢN', { exact: true })).toBeVisible();
    await expect(nav.getByText('QUỸ & LƯƠNG LÁI XE', { exact: true })).toBeVisible();
  });

  /**
   * BE MAT KHACH KHONG NOI NGON NGU NOI BO — quyet dinh cua chu so huu tren #202 / #196.
   *
   * Bai nay khoa HAI chieu cua cung mot yeu cau, va ca hai deu can:
   *
   *  · CHIEU CHU — `innerText` khong duoc chua mot tu nao trong bo tu vung bi cam. Bo tu vung do
   *    chep tu quyet dinh cua chu so huu, khong phai do bai test tu nghi ra.
   *  · CHIEU CAU TRUC — `.preview-ribbon` va `body[data-preview]` phai vang mat. Giu lai tu
   *    `5f47e12`, va no KHONG thua: mot dai bang ve ra bang icon, bang anh, hay bang chu bi
   *    `visibility:hidden` se lot qua chieu chu ma van con nguyen trong DOM.
   *
   * VA MOT CHIEU THU BA — khong ma so Issue/PR nao duoc ro ra man hinh. Truoc day goi khach mang
   * nhung cau nhu "Xem #168" trong `blockedCapabilities`; do la ghi chu ky thuat noi bo, va no
   * tung chay THAT tren stack cong khai.
   */
  test('KHONG con mot chu nao ve trang thai noi bo tren be mat khach', async ({ page }) => {
    await mockTransport(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Chieu CAU TRUC — mot dai bang khong co chu van la mot dai bang.
    await expect(page.locator('.preview-ribbon')).toHaveCount(0);
    await expect(page.locator('body[data-preview]')).toHaveCount(0);

    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const forbidden of [
      'bản xem trước',
      'xem trước',
      'vt mẫu',
      'preview',
      'uat',
      'synthetic',
      'demo tenant',
      'chờ api',
      'runtime-proven',
      'customer-ready',
      'business-proven',
      'chưa có khách hàng',
      'dữ liệu tổng hợp',
    ]) {
      expect(body, forbidden).not.toContain(forbidden);
    }

    // Ma so Issue/PR — `#168`, `#170`, … Neo bang KHUON chu khong bang danh sach, vi danh sach chi
    // bat duoc nhung so ai do da nho viet vao no.
    expect(body, 'ma so Issue/PR').not.toMatch(/#\d{2,}/);
  });

  /**
   * Muc Bao duong NOI VAO read model that — va bai nay kiem dung cai do, khong kiem "co chu tren
   * man hinh".
   *
   * Ba khang dinh duoi day chon co y: BIEN SO (`29H-123.45`) chung minh man hinh dich `vehicleId`
   * ra nhan nghiep vu thay vi in mot UUID; `Quá hạn` chung minh tinh trang la chu tieng Viet do
   * may chu suy ra chu khong phai mot khoa ky thuat; `Thay dầu máy` chung minh hang thuc su den
   * tu du lieu. Va `not.toContainText('chưa nối')` khoa chieu nguoc lai — cau xin loi cu khong
   * duoc quay lai bang mot lan revert.
   */
  test('muc Bao duong VE RA du lieu that cua may chu, khong phai mot cau xin loi', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=maintenance');

    await expect(page.getByRole('heading', { level: 1, name: /Bảo dưỡng/ })).toBeVisible();
    const main = page.locator('#tx-main');
    // BIEN SO chu khong phai `vehicleId`, va tinh trang doc bang chu tieng Viet.
    await expect(main).toContainText('29H-123.45');
    await expect(main).toContainText('Quá hạn');
    await expect(main).toContainText('Thay dầu máy');
    await expect(main).not.toContainText('chưa nối');
  });

  test('duong nhay ban phim dua tieu diem vao thang noi dung', async ({ page }) => {
    await mockTransport(page);
    await page.goto('/');
    // Khong khang dinh thu tu tab so voi lop phu cua `next dev` (chi co o che do dev) — khang dinh
    // dieu THAT SU quan trong: kich hoat duong nhay thi tieu diem vao khoi noi dung.
    const skip = page.getByRole('link', { name: /Bỏ qua danh mục/ });
    await skip.focus();
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page.locator('#tx-main')).toBeFocused();
  });

  test('MANAGER khong co thao tac nao, va man hinh noi that dieu do', async ({ page }) => {
    await mockTransport(page, 'MANAGER');
    await page.goto('/');
    /*
     * Bang bridge `GD-22` khai `MANAGER: []` co chu dich. Man hinh khong duoc bia mot anh xa quyen.
     *
     * Doi chieu voi CHINH HANG SO chu khong chep lai cau chu. Ban truoc chep tay "Vai Quan ly chua
     * duoc cap thao tac", roi cau hien thi duoc viet lai cho huong khach ma bai test thi khong —
     * nen bai nay DO vi mot ly do khong lien quan gi den dieu no muon giu. Neo vao hang so thi cau
     * chu sua bao nhieu lan cung duoc, con tinh chat "man hinh noi that voi MANAGER" van duoc khoa.
     */
    await expect(page.locator('#tx-main').getByRole('alert')).toContainText(
      MANAGER_HAS_NO_TRANSPORT_SCOPE,
    );
  });
});

test.describe('trang thai tren dia chi', () => {
  test('deep link mo dung muc, va Back tra ve muc truoc', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();

    // #339 — duong chinh la `Đơn hàng & vòng chạy`, nen lich su duoc do tren chinh muc do.
    const nav = page.getByRole('navigation', { name: 'Điều hướng vận hành vận tải' });
    await nav.getByRole('link', { name: 'Đơn hàng & vòng chạy' }).click();
    await expect(page).toHaveURL(/\?section=movement/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Đơn hàng & vòng chạy' }),
    ).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();

    await page.goForward();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Đơn hàng & vòng chạy' }),
    ).toBeVisible();
  });

  /**
   * #339 — `Chuyến xe` rut khoi danh muc chinh nhung KHONG thanh mot man mo coi.
   *
   * Mo tu loi phu thi ghi lich su y het mot muc chinh (Back/Forward van la "ra/vao man nay"), va
   * dau `aria-current` hien o loi phu — nguoi dung van biet minh dang o dau du muc nay khong con
   * nam tren danh muc chinh.
   */
  test('Chuyen xe mo tu loi phu "Cách làm trước đây" van giu Back/Forward', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();

    const older = page.getByRole('navigation', { name: 'Cách làm trước đây' });
    await expect(older).toContainText('Việc mới bắt đầu ở “Đơn hàng & vòng chạy”.');
    await older.getByRole('link', { name: 'Chuyến xe' }).click();
    await expect(page).toHaveURL(/\?section=trips/);
    await expect(page.getByRole('heading', { level: 1, name: 'Chuyến xe' })).toBeVisible();
    await expect(older.getByRole('link', { name: 'Chuyến xe' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const nav = page.getByRole('navigation', { name: 'Điều hướng vận hành vận tải' });
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(0);

    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();

    await page.goForward();
    await expect(page.getByRole('heading', { level: 1, name: 'Chuyến xe' })).toBeVisible();
  });

  test('dau trang cu toi mot chuyen van mo dung chuyen do, ke ca sau khi tai lai', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=trips&selected=VT-2026-0912');
    await expect(page.getByRole('heading', { level: 1, name: 'Chuyến xe' })).toBeVisible();
    await expect(page.getByRole('region', { name: /Chi tiết chuyến VT-2026-0912/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Chuyến xe' })).toBeVisible();
    await expect(page.getByRole('region', { name: /Chi tiết chuyến VT-2026-0912/ })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Cách làm trước đây' }).getByRole('link', {
        name: 'Chuyến xe',
      }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('mo thang mot dia chi sau va tai lai van ra dung man hinh', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=fuel');
    await expect(page.getByRole('heading', { level: 1, name: 'Nhiên liệu' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Nhiên liệu' })).toBeVisible();
  });

  test('muc khong ton tai roi ve Tong quan, khong ra trang trang', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=khong-ton-tai');
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();
  });
});

test.describe('chuyen xe', () => {
  test('bang chuyen doc ra TEN khach, va chon dong thi ma chuyen len dia chi', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=trips');

    await expect(page.getByRole('rowheader', { name: 'VT-2026-0912' })).toBeVisible();
    // Ten khach, khong phai `cus-1`.
    await expect(page.getByRole('cell', { name: 'Công ty Đông Anh' }).first()).toBeVisible();

    await page.getByRole('rowheader', { name: 'VT-2026-0912' }).click();
    await expect(page).toHaveURL(/selected=VT-2026-0912/);
    await expect(page.getByRole('region', { name: /Chi tiết chuyến VT-2026-0912/ })).toBeVisible();
  });

  /**
   * KHOI CHI TIET KHONG DUOC NAM O CUOI MOT DANH SACH DAI.
   *
   * Trieu chung nguoi dung bao cao: *"ô chi tiết lại hiện ra ở cuối và tôi phải cuộn mãi xuống
   * cuối để xem"*. Khoi chi tiet duoc ve SAU bang, nen bang cang dai thi no cang xa — voi 45
   * chuyen tren goi khach that thi bam dong dau roi phai cuon qua 44 dong nua.
   *
   * Ban sua: bam mot dong thi ma chuyen di vao O TIM KIEM, nen bang co lai dung mot dong va khoi
   * chi tiet nam ngay duoi no. Bai nay do CHINH dieu do — mot dong khac PHAI bien mat — chu khong
   * do vi tri pixel, vi vi tri pixel doi theo do phan giai con luat nay thi khong.
   */
  test('bam mot dong thi ma chuyen vao o tim kiem va danh sach co lai dung dong do', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=trips');
    await expect(page.getByRole('rowheader', { name: 'VT-2026-0913' })).toBeVisible();

    await page.getByRole('rowheader', { name: 'VT-2026-0912' }).click();

    await expect(page.getByLabel('Tìm chuyến')).toHaveValue('VT-2026-0912');
    await expect(page).toHaveURL(/q=VT-2026-0912/);
    // Danh sach da co lai: chuyen khac khong con tren bang, nen khoi chi tiet o ngay duoi dong.
    await expect(page.getByRole('rowheader', { name: 'VT-2026-0913' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: /Chi tiết chuyến VT-2026-0912/ })).toBeVisible();

    // Dong lai thi tra lai CA danh sach — o tim kiem khong duoc giu chu do chinh man hinh go vao.
    await page.getByRole('button', { name: 'Đóng' }).click();
    await expect(page.getByLabel('Tìm chuyến')).toHaveValue('');
    await expect(page).not.toHaveURL(/q=/);
    await expect(page.getByRole('rowheader', { name: 'VT-2026-0913' })).toBeVisible();
  });

  test('loc theo tu khoa khong dau tim ra dia danh co dau', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=trips');
    await page.getByLabel('Tìm chuyến').fill('da nang');
    await expect(page.getByRole('rowheader', { name: 'VT-2026-0913' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'VT-2026-0912' })).toHaveCount(0);
  });

  test('cho chay mot chuyen: xac nhan roi bang cap nhat', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=trips&selected=VT-2026-0912');

    const detail = page.getByRole('region', { name: /Chi tiết chuyến VT-2026-0912/ });
    await detail.getByRole('button', { name: 'Cho chạy' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cho chạy' }).click();

    // Mock co trang thai, nen dong bang phai doi THAT sang "Đang chạy".
    await expect(page.getByRole('cell', { name: 'Đang chạy' }).first()).toBeVisible();
  });

  test('may chu tu choi thi man hinh hien NGUYEN VAN cau cua may chu', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=trips&selected=VT-2026-0913');

    const detail = page.getByRole('region', { name: /Chi tiết chuyến VT-2026-0913/ });
    await detail.getByRole('button', { name: 'Chốt đối soát' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Chốt đối soát' }).click();

    await expect(detail.getByRole('alert')).toContainText('chua doi soat duoc');
  });

  test('Ke toan khong duoc bay nut huy chuyen', async ({ page }) => {
    await mockTransport(page, 'ACCOUNTING');
    await page.goto('/?section=trips&selected=VT-2026-0912');
    const detail = page.getByRole('region', { name: /Chi tiết chuyến VT-2026-0912/ });
    await expect(detail.getByRole('button', { name: 'Huỷ chuyến' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Cho chạy' })).toBeVisible();
  });
});

/**
 * CUNG MOT LUAT CHO CAC MAN KHONG CO O TIM KIEM.
 *
 * Man Chuyen xe co o tim kiem nen ma chuyen vao do la du. Cac man con lai khong co, va them mot o
 * tim kiem vao mot bang ba dong thi lam giao dien te di — nen chung co lai bang chinh dong dang
 * chon, kem duong `Xem tất cả` de mo lai.
 */
test.describe('chon mot dong thi bang co lai ve dong do', () => {
  test('ky doi soat: bang con mot dong, noi ro con bao nhieu, va mo lai duoc', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=fuel');

    const dongAnh = page.getByRole('rowheader', { name: 'Cây xăng Đông Anh' });
    const giaLam = page.getByRole('rowheader', { name: 'Cây xăng Gia Lâm' });
    await expect(dongAnh).toBeVisible();
    await expect(giaLam).toBeVisible();

    await dongAnh.click();

    await expect(giaLam).toHaveCount(0);
    // Bang KHONG duoc lang le bot dong: phai noi ro no dang thu hep, va noi bang mot con so.
    await expect(page.getByText('Đang xem 1 / 2 dòng')).toBeVisible();

    await page.getByRole('button', { name: 'Xem tất cả' }).click();
    await expect(giaLam).toBeVisible();
    await expect(dongAnh).toBeVisible();
  });
});

/**
 * #335 (UAT BUG-06) — man Doi xe hua "lich su phu trach" va bao "mo tung xe de xem nguoi dang phu
 * trach", nhung mo xe ra chi co Suc khoe vi tri. Bai nay khoa cau tra loi cho "xe nay hien ai dang
 * phu trach?" o CA hai phia: xe co nguoi, va xe chua co ai.
 */
test.describe('doi xe — xe nay hien ai dang phu trach', () => {
  const DRIVER_HISTORY: Readonly<Record<string, readonly unknown[]>> = {
    'veh-1': [
      {
        id: 'vda-1',
        vehicleId: 'veh-1',
        driverId: 'drv-2',
        effectiveFrom: '2026-06-01T01:00:00.000Z',
        effectiveTo: '2026-08-15T01:00:00.000Z',
        createdAt: '2026-06-01T01:00:00.000Z',
      },
      {
        id: 'vda-2',
        vehicleId: 'veh-1',
        driverId: 'drv-1',
        effectiveFrom: '2026-08-15T01:00:00.000Z',
        effectiveTo: null,
        createdAt: '2026-08-15T01:00:00.000Z',
      },
    ],
    'veh-3': [],
  };

  /** `.../vehicles/<id>/<duoi>` — ma xe la doan THU HAI tu cuoi. */
  const vehicleIdOf = (route: Route): string =>
    new URL(route.request().url()).pathname.split('/').at(-2) ?? '';

  const mockVehicleDetail = async (page: Page): Promise<void> => {
    await page.route('**/transport/vehicles/*/driver-history', (route) =>
      json(route, DRIVER_HISTORY[vehicleIdOf(route)] ?? []),
    );
    await page.route('**/transport/vehicles/*/location-health', (route) =>
      json(route, {
        vehicleId: vehicleIdOf(route),
        status: 'NOT_TRACKED',
        reason: 'NO_OBSERVATION',
        currentSource: null,
        lastReceivedAt: null,
        ageSeconds: null,
        sources: [
          {
            family: 'PHONE',
            status: 'NOT_CONFIGURED',
            source: null,
            lastReceivedAt: null,
            ageSeconds: null,
          },
        ],
        lastKnown: null,
      }),
    );
  };

  test('xe CO nguoi phu trach: hien TEN va lich su ngan, suc khoe vi tri van con', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    await mockVehicleDetail(page);
    await page.goto('/?section=fleet');

    await page.getByRole('rowheader', { name: '29H-123.45' }).click();

    const panel = page.getByRole('region', { name: 'Lái xe phụ trách xe 29H-123.45' });
    await expect(
      panel.getByRole('heading', { name: 'Lái xe phụ trách · 29H-123.45' }),
    ).toBeVisible();
    await expect(panel.getByText('Nguyễn Văn Bình')).toBeVisible();
    await expect(panel.getByText('Đang làm')).toBeVisible();
    await expect(panel.getByRole('list', { name: 'Lịch sử phụ trách' })).toContainText(
      'Trần Thị Mai',
    );
    await expect(panel).not.toContainText('Chưa có lái xe phụ trách');
    // Nhan chinh la TEN nguoi — khong mot `driverId` nao duoc lot ra man hinh.
    await expect(panel).not.toContainText('drv-');

    // Khoi Suc khoe vi tri giu nguyen, va dong vua chon that su duoc chon (bang co lai ve no).
    await expect(page.getByRole('region', { name: 'Sức khoẻ vị trí xe' })).toBeVisible();
    await expect(page.getByText('Đang xem 1 / 3 dòng')).toBeVisible();
  });

  test('xe CHUA co ai phu trach: noi thang ra, khong mang theo nguoi cua xe truoc', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    await mockVehicleDetail(page);
    await page.goto('/?section=fleet');

    await page.getByRole('rowheader', { name: '29H-123.45' }).click();
    await expect(page.getByText('Nguyễn Văn Bình')).toBeVisible();
    await page.getByRole('button', { name: 'Xem tất cả' }).click();
    await page.getByRole('rowheader', { name: '29H-246.80' }).click();

    const panel = page.getByRole('region', { name: 'Lái xe phụ trách xe 29H-246.80' });
    await expect(panel.getByText('Chưa có lái xe phụ trách')).toBeVisible();
    await expect(panel.getByText('Chưa có lượt phụ trách nào trước đó.')).toBeVisible();
    await expect(panel).not.toContainText('Nguyễn Văn Bình');
    await expect(page.getByRole('region', { name: 'Sức khoẻ vị trí xe' })).toBeVisible();
  });

  test('doc lich su HONG thi bao loi, KHONG noi "chua co lai xe phu trach"', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await mockVehicleDetail(page);
    await page.route('**/transport/vehicles/*/driver-history', (route) =>
      json(route, { message: 'Máy chủ đang bận' }, 503),
    );
    await page.goto('/?section=fleet');

    await page.getByRole('rowheader', { name: '29H-246.80' }).click();

    const panel = page.getByRole('region', { name: 'Lái xe phụ trách xe 29H-246.80' });
    await expect(panel.getByRole('button', { name: /thử lại/i })).toBeVisible();
    await expect(panel).not.toContainText('Chưa có lái xe phụ trách');
  });
});

test.describe('quy lai xe — phieu phai giu dung nguoi', () => {
  test('phieu tam ung ghim lai xe cua chinh no va noi ten nguoi do', async ({ page }) => {
    await mockTransport(page, 'ACCOUNTING');
    await page.goto('/?section=driver-fund');

    const picker = page.getByRole('combobox', { name: /^Lái xe/ });
    await expect(picker).toBeEnabled();
    await picker.selectOption('drv-1');

    await page.getByRole('button', { name: 'Tạm ứng' }).click();

    // Dau phieu phai NEU TEN — de neu o chon co doi thi phieu van noi ro no thuoc ve ai.
    await expect(
      page.getByRole('heading', { name: /Tạm ứng cho lái xe — Nguyễn Văn Bình/ }),
    ).toBeVisible();

    // Va o chon bi KHOA khi phieu dang mo: bo hoan toan duong gui tien sang nguoi khac.
    await expect(picker).toBeDisabled();
  });

  test('dong phieu thi o chon lai xe mo lai', async ({ page }) => {
    await mockTransport(page, 'ACCOUNTING');
    await page.goto('/?section=driver-fund');

    await page.getByRole('button', { name: 'Tạm ứng' }).click();
    await expect(page.getByRole('combobox', { name: /^Lái xe/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Quay lại' }).click();
    await expect(page.getByRole('combobox', { name: /^Lái xe/ })).toBeEnabled();
  });
});

test.describe('be mat lai xe — cach ly doanh thu', () => {
  test('lai xe khong thay muc van hanh nao, va mo duoc man cua chinh minh', async ({ page }) => {
    await mockTransport(page, 'SALE');
    await page.goto('/?surface=driver');

    await expect(page.getByRole('heading', { level: 1, name: 'Trang chủ' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Điều hướng lái xe' })).toBeVisible();
    // Khong co duong quay ra van hanh, vi vai nay khong co pham vi do.
    await expect(page.getByRole('button', { name: 'Về vận hành' })).toHaveCount(0);
  });

  test('NOI DUNG DI TREN DUONG MANG cua be mat lai xe khong chua gia cuoc', async ({ page }) => {
    await mockTransport(page, 'SALE');

    const payloads: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/transport/me/')) {
        void response
          .text()
          .then((text) => payloads.push(text))
          .catch(() => undefined);
      }
    });

    await page.goto('/?surface=driver');
    await expect(page.getByRole('heading', { level: 1, name: 'Trang chủ' })).toBeVisible();
    await page.getByRole('link', { name: 'Quỹ' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Quỹ của bạn' })).toBeVisible();

    expect(payloads.length).toBeGreaterThan(0);
    // #161 §8: khong phai "bi CSS che di" — khong co trong payload.
    for (const payload of payloads) {
      expect(payload).not.toContain('freightAmount');
      expect(payload).not.toContain('marginAmount');
      expect(payload).not.toContain('11500000');
    }
  });

  /**
   * O TAI KHOAN PHAI DONG DUOC — va truoc ban nay thi khong.
   *
   * `AccountMenu` dat `hidden={!isOpen}`, nhung `.tx-account__panel { display: flex }` GHI DE luat
   * `[hidden] { display: none }` cua trinh duyet. Hau qua o 390px: khoi nay la `position: absolute`
   * nen nut `Đăng xuất` ghim de len noi dung ngay tu luc mo trang va khong cach nao cat di. Nguoi
   * dung bao cao dung cau *"dang xuat cua tk lai xe dang bi ghim giua man hinh giao dien dien
   * thoai"*.
   *
   * Bai nay do `Đăng xuất` chu khong do mot lop CSS: mot ban viet lai vo o tai khoan van phai giu
   * dung tinh chat nay.
   */
  test('o tai khoan tren dien thoai DONG cho toi khi bam, va dong lai duoc', async ({ page }) => {
    await mockTransport(page, 'SALE');
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto('/?surface=driver');
    await expect(page.getByRole('heading', { level: 1, name: 'Trang chủ' })).toBeVisible();

    const signOut = page.getByRole('button', { name: 'Đăng xuất' });
    const trigger = page.getByRole('button', { name: /Người dùng SALE/ });

    await expect(signOut).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();
    await expect(signOut).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await trigger.click();
    await expect(signOut).toBeHidden();
  });

  test('lai xe go tay dia chi cua man hinh van hanh thi khong vao duoc', async ({ page }) => {
    await mockTransport(page, 'SALE');
    await page.goto('/?section=driver-fund');
    // Khong co muc van hanh nao hien ra, nen vo bay cau noi that thay vi mot bang trong.
    await expect(page.locator('#tx-main').getByRole('alert')).toContainText('Vai Lái xe');
  });
});

test.describe('be rong man hinh', () => {
  test('o be rong dien thoai, danh muc thanh ngan keo va trang khong tran ngang', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto('/?section=trips');

    const drawer = page.getByRole('button', { name: 'Danh mục' });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('aria-expanded', 'false');
    await drawer.click();
    await expect(page.getByRole('button', { name: 'Đóng danh mục' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    // Than trang KHONG duoc tran ngang; tran ngang phai nam trong khung bang.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  /**
   * #339 — ngan keo o 390px dan dung duong chinh, va loi phu van o trong ngan keo.
   *
   * Dia chi mo dau la `?section=trips` co y: day la dau trang cu cua mot nguoi dung dien thoai, va
   * no phai mo ra dung man, voi loi phu danh dau dang o dau, thay vi mot trang trang.
   */
  test('o be rong dien thoai, ngan keo dan toi Don hang, loi phu van con', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto('/?section=trips');
    await expect(page.getByRole('heading', { level: 1, name: 'Chuyến xe' })).toBeVisible();

    await page.getByRole('button', { name: 'Danh mục' }).click();
    const older = page.getByRole('navigation', { name: 'Cách làm trước đây' });
    await expect(older.getByRole('link', { name: 'Chuyến xe' })).toBeVisible();
    await expect(older.getByRole('link', { name: 'Chuyến xe' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    const nav = page.getByRole('navigation', { name: 'Điều hướng vận hành vận tải' });
    await nav.getByRole('link', { name: 'Đơn hàng & vòng chạy' }).click();
    await expect(page).toHaveURL(/\?section=movement/);
    // Bam mot muc thi ngan keo tu dong lai — khong de nguoi dung phai dong tay.
    await expect(page.getByRole('button', { name: 'Danh mục' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(
      page.getByRole('heading', { level: 1, name: 'Đơn hàng & vòng chạy' }),
    ).toBeVisible();
  });
});

test.describe('o loc danh muc', () => {
  /**
   * #339 — o loc van la loi tat cua danh muc chinh, va KHONG keo muc cu len lai canh don hang.
   * Luat thuan cua no khoa o `navigation.spec.ts`; bai nay do tren trinh duyet that.
   */
  test('go "don hang" ra muc chinh, go "chuyen xe" khong keo muc cu len danh muc', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/');
    const filter = page.getByRole('searchbox', { name: 'Lọc danh mục vận hành vận tải' });
    const nav = page.getByRole('navigation', { name: 'Điều hướng vận hành vận tải' });

    await filter.fill('don hang');
    await expect(nav.getByRole('link')).toHaveCount(1);
    await expect(nav.getByRole('link', { name: 'Đơn hàng & vòng chạy' })).toBeVisible();

    await filter.fill('chuyen xe');
    await expect(nav.getByRole('link')).toHaveCount(0);
    await expect(nav).toContainText('Không có mục nào khớp');
    // Loi phu nam ngoai o loc, nen muc cu van tim thay duoc — chi khong dung canh don hang.
    await expect(
      page.getByRole('navigation', { name: 'Cách làm trước đây' }).getByRole('link', {
        name: 'Chuyến xe',
      }),
    ).toBeVisible();

    await filter.fill('');
    await expect(nav.getByRole('link', { name: 'Bảng điều hành' })).toBeVisible();
  });
});

test.describe('anh chup lam bang chung', () => {
  test('chup bo anh o be rong may tinh va dien thoai', async ({ page }, testInfo) => {
    // Muoi anh `fullPage` tren `next dev` (bien dich tung route lan dau) khong vua trong 30 giay
    // mac dinh. Bai nay CHUP chu khong khang dinh toc do, nen noi rong thoi gian la dung viec —
    // moi khang dinh ve hanh vi van nam o cac bai khac, voi thoi gian mac dinh.
    test.setTimeout(300_000);
    await mockTransport(page, 'ADMIN');

    await page.setViewportSize({ width: 1440, height: 900 });
    // `maintenance` va `payroll` nam trong bo anh vi goi xem truoc BAT hai nang luc T6 — nguoi
    // review can thay ca cac muc chua noi vao may chu, dung nhu chung dang hien ra.
    for (const section of [
      '',
      // `control-tower` la man DAY NHAT cua be mat nay — the so, bang bay cot, hang viec va ngan
      // ghi chu, tat ca tren mot trang. Neu mot lan sua lam nhip trang hong o dau thi hong o day
      // truoc tien, nen no phai co trong bo anh nguoi review nhin.
      'control-tower',
      'trips',
      'fleet',
      'driver-fund',
      'fuel',
      'settlement',
      'maintenance',
      'payroll',
    ]) {
      await page.goto(section === '' ? '/' : `/?section=${section}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`desktop-${section === '' ? 'overview' : section}.png`),
        fullPage: true,
      });
    }

    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto('/?section=trips');
    await expect(page.getByRole('heading', { level: 1, name: 'Chuyến xe' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('mobile-trips.png'), fullPage: true });

    await mockTransport(page, 'SALE');
    await page.goto('/?surface=driver');
    await expect(page.getByRole('heading', { level: 1, name: 'Trang chủ' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('mobile-driver-home.png'), fullPage: true });

    await page.goto('/?surface=driver&screen=trip');
    await expect(page.getByRole('heading', { level: 1, name: 'Chuyến' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('mobile-driver-trip.png'), fullPage: true });
  });
});

/** Moi may chu ma Maps JavaScript API goi toi (script, tile, font, anh dieu khien). */
const GOOGLE_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(googleapis|gstatic)\.com\//;

/** Instance CONG KHAI cua OpenFreeMap: style, TileJSON, o tile, sprite, phong chu — mot may chu. */
const OPENFREEMAP_HOST = 'tiles.openfreemap.org';
const OPENFREEMAP_URLS = /^https:\/\/tiles\.openfreemap\.org\//;

/**
 * Che do nen cua MAY CHU e2e — cung phep tinh voi `playwright.transport.config.ts`: khong dat (hay
 * dat rong) la `local`, nen CI bat buoc khong bao gio ra Internet.
 */
const MAP_PROVIDER = (
  process.env.NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER?.trim() || 'local'
).toLowerCase();

/**
 * Ghi lai moi yeu cau http(s) RA KHOI may chu web. API da bi chan bang `page.route` tren cung
 * origin, nen "ra ngoai" o day chi con la nen ban do — dung thu ma `#374` §9 bai 16–18 doi dem.
 */
function recordExternalRequests(page: Page): Array<{ url: string; referer: string | undefined }> {
  const external: Array<{ url: string; referer: string | undefined }> = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return;
    external.push({ url: request.url(), referer: request.headers()['referer'] });
  });
  return external;
}

/**
 * Chunk JS cua nha cung cap Google tai tu chinh may chu web. `next dev` dat ten chunk theo duong
 * dan module (`…visual_GoogleBasemap_tsx.js`, `…google-maps-loader_ts.js`), nen ten co chu `google`
 * la dau vet cua ma Google. Khoi `@google-basemap` do chieu nguoc lai: bat Google thi PHAI thay no.
 */
function recordGoogleCodeChunks(page: Page): string[] {
  const chunks: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/_next/') && /google/i.test(url.pathname))
      chunks.push(url.pathname);
  });
  return chunks;
}

/**
 * DEM DIEM ANH MANG MAU TUYEN tren anh chup khung ban do (#374).
 *
 * "Co mot canvas" khong chung minh tuyen da duoc ve: ngay 23/09/2026, khi Google tu choi khoa SAU
 * khi da ve, nen cuc bo hien ra day du canvas ma KHONG co tuyen nao. Dem diem anh gan `--tx-go`
 * (co hang) va `--tx-stop` (rong) thi do duoc dieu nguoi xem thay. Trinh duyet tu giai ma PNG —
 * khong them thu vien nao vao bo e2e.
 */
interface RoutePixels {
  readonly loaded: number;
  readonly empty: number;
  /** Trong tam cac diem anh tuyen (ca hai mau), tinh bang diem anh cua khung ban do. */
  readonly centroid: { readonly x: number; readonly y: number } | null;
}

async function routePixels(page: Page, map: Locator): Promise<RoutePixels> {
  const png = await map.screenshot();
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context === null) return { loaded: 0, empty: 0, centroid: null };
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const near = (index: number, [r, g, b]: readonly [number, number, number]): boolean =>
      Math.abs((data[index] ?? 0) - r) +
        Math.abs((data[index + 1] ?? 0) - g) +
        Math.abs((data[index + 2] ?? 0) - b) <
      60;
    let loaded = 0;
    let empty = 0;
    let sumX = 0;
    let sumY = 0;
    for (let index = 0; index < data.length; index += 4) {
      const isLoaded = near(index, [0x1c, 0x6b, 0x47]);
      const isEmpty = !isLoaded && near(index, [0x94, 0x27, 0x1e]);
      if (!isLoaded && !isEmpty) continue;
      if (isLoaded) loaded += 1;
      else empty += 1;
      const pixel = index / 4;
      sumX += pixel % canvas.width;
      sumY += Math.floor(pixel / canvas.width);
    }
    const count = loaded + empty;
    const centroid = count === 0 ? null : { x: sumX / count, y: sumY / count };
    return { loaded, empty, centroid };
  }, png.toString('base64'));
}

/** Mot doan tuyen day 5px dai hang tram diem anh — 200 la san an toan, khong phai mot con so do. */
const ROUTE_PIXELS_MIN = 200;

/**
 * ===========================================================================
 * LANE N (#278 N5/N12) — BAN DO VONG CHAY TREN TRINH DUYET THAT.
 *
 * `#278` N12 doi bang chung o muc TRINH DUYET, khong phai o muc kieu: *"Add browser/build tests
 * that actually load the map/chart bundle; TypeScript-only proof is insufficient."*
 *
 * Ba dieu duoc do o day ma khong bai `.ts` nao do duoc:
 *
 *   1. goi ban do nap duoc that (`dynamic(ssr:false)` + MapLibre + deck.gl khoi tao trong DOM);
 *   2. chang RONG doc ra duoc bang CHU, khong chi bang mau;
 *   3. ranh gioi quyen: ke toan mo dung man hinh do va KHONG thay ban do, nhung van thay bao cao.
 */
test.describe('ban do vong chay (Lane N)', () => {
  test('ban do nap that, va chang RONG doc ra duoc bang chu', async ({ page }, testInfo) => {
    /*
     * `#374` §9 bai 17/18: CI bat buoc KHONG phu thuoc Internet — dem MOI yeu cau ra khoi may chu
     * web (OpenFreeMap, Google, bat ky ai), va moi chunk ma Google tai ve.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    const external = recordExternalRequests(page);
    const googleChunks = recordGoogleCodeChunks(page);
    /*
     * Worker cua MapLibre 6 phai duoc phuc vu tu CHINH may chu web. Thieu no, nen OpenFreeMap tai
     * style ma khong mot o tile nao hien (do 23/09/2026) — va nen cuc bo cua CI khong co tile nao
     * de lo ra dieu do. MapLibre dung worker cho MOI style, nen bai nay bat duoc ngay trong CI.
     */
    const worker = page.waitForResponse((response) => response.url().endsWith(MAPLIBRE_WORKER_URL));
    await mockTransport(page, 'ADMIN');
    const pageResponse = await page.goto('/?section=journey&selected=RUN-E2E-1');
    /*
     * Nen mac dinh cua san pham goi ra `tiles.openfreemap.org`; dia chi trang mang ma vong chay.
     * Chinh sach nay (khai trong `next.config.mjs`) giu `Referer` gui ra ngoai chi la origin.
     */
    expect(pageResponse?.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');

    await expect(page.getByRole('heading', { level: 1, name: 'Bản đồ vòng chạy' })).toBeVisible();

    /* Goi ban do NAP THAT: the `img` chi xuat hien sau khi component dong nap da chay. */
    const map = page.getByRole('img', { name: 'Bản đồ vòng chạy RUN-E2E-1' });
    await expect(map).toBeVisible({ timeout: 30_000 });
    /*
     * Nen cuc bo DO MAY CHU e2e KHAI (`provider=local`), khong phai do thieu cau hinh: nen mac
     * dinh cua san pham la OpenFreeMap, va CI khong duoc goi no.
     */
    await expect(map).toHaveAttribute('data-basemap', 'LOCAL_FALLBACK');
    await expect(map).toHaveAttribute('data-basemap-fallback', 'LOCAL_SELECTED');
    await expect(map).toHaveAttribute('aria-busy', 'false');
    const workerResponse = await worker;
    expect(workerResponse.status()).toBe(200);
    expect(workerResponse.headers()['content-type']).toMatch(/javascript/);
    /* `#278` N1: nen trong phai NOI RA la nen trong, khong de nguoi xem tuong mat dat trong tron. */
    await expect(page.getByTestId('tx-map-notice')).toHaveText(LOCAL_BASEMAP_NOTICE);
    /* Lop deck.gl ve tren canvas cua MapLibre — ban do da khoi tao WebGL that. */
    await expect(map.locator('canvas').first()).toBeVisible();
    /*
     * Va lop do THAT SU ve: vong nay chi co chang CO HANG, nen phai co diem anh mau co hang va
     * KHONG mot diem mau chang rong nao — mau den tu `role` cua du lieu, khong tu nen.
     */
    await expect
      .poll(async () => (await routePixels(page, map)).loaded, { timeout: 15_000 })
      .toBeGreaterThan(ROUTE_PIXELS_MIN);
    expect((await routePixels(page, map)).empty).toBe(0);

    /*
     * `#278` N13 bai 4 — chang RONG phai phan biet duoc ma KHONG can den mau. Neu mot ngay co
     * nguoi bo chu "RỖNG" di va chi de lai mot lop CSS, bai nay do.
     */
    await expect(page.getByText('RỖNG', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Chặng RỖNG (chạy không hàng)')).toBeVisible();

    /* Tuyen ke hoach chua co nha cung cap dan duong — man hinh NOI RA thay vi ve mot doan thang. */
    await expect(page.getByText(/nhà cung cấp dẫn đường/)).toBeVisible();

    /* Ke hoach vs thuc te: 100 -> 105 la lech +5 km. */
    await expect(page.getByText('+5 km')).toBeVisible();

    expect(external).toEqual([]);
    expect(googleChunks).toEqual([]);

    /* Bang chung #374 (D): che do CI, 1440×900, khong mot yeu cau nao ra Internet. */
    await page.getByRole('region', { name: 'Bản đồ vòng chạy' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('journey-map-local.png') });
  });

  /*
   * `#374` §8 bai 10 — doi vong chay thi ban do ve theo khung cua VONG MOI. `data-bounds` la khung
   * du lieu ma camera dang fit (`boundsKey`), nen bai nay do duoc ca duong model → camera tren trinh
   * duyet that ma khong phai doc pixel.
   */
  test('doi vong chay → ban do ve lai dung khung cua vong moi', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.route('**/transport/runs', (route) =>
      json(route, [
        { id: 'r-1', code: 'RUN-E2E-1' },
        { id: 'r-2', code: 'RUN-E2E-2' },
      ]),
    );
    await page.route('**/transport/journey/runs/RUN-E2E-2/map', (route) =>
      json(route, JOURNEY_MAP_DA_NANG_HUE),
    );
    await page.route('**/transport/journey/runs/RUN-E2E-2', (route) =>
      json(route, { ...JOURNEY, run: { ...JOURNEY.run, runId: 'r-2', runCode: 'RUN-E2E-2' } }),
    );
    await page.goto('/?section=journey&selected=RUN-E2E-1');

    await expect(page.getByRole('img', { name: 'Bản đồ vòng chạy RUN-E2E-1' })).toHaveAttribute(
      'data-bounds',
      '105.8342,20.8449,106.6881,21.0278',
      { timeout: 30_000 },
    );

    await page.getByRole('combobox', { name: 'Vòng chạy', exact: true }).selectOption('RUN-E2E-2');

    const second = page.getByRole('img', { name: 'Bản đồ vòng chạy RUN-E2E-2' });
    await expect(second).toHaveAttribute('data-bounds', '107.5909,16.0544,108.2022,16.4637', {
      timeout: 30_000,
    });
    await expect(page.getByRole('img', { name: 'Bản đồ vòng chạy RUN-E2E-1' })).toHaveCount(0);
    /* Vong moi chi co chang RONG: tuyen do hien ra trong khung moi, khong con vet xanh cua vong cu. */
    await expect
      .poll(async () => (await routePixels(page, second)).empty, { timeout: 15_000 })
      .toBeGreaterThan(ROUTE_PIXELS_MIN);
    expect((await routePixels(page, second)).loaded).toBe(0);
  });

  /*
   * `#374` §8 bai 15 — co nen duong sa that thi cang de doc nham vet GPS tho thanh "tuyen xe da
   * chay tren duong". Cau noi ro day la toa do THO, chua khop ban do, phai con nguyen.
   */
  test('vet GPS tho van noi ro la toa do tho, khong phai tuyen da khop ban do', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    const [leg] = JOURNEY_MAP.legs;
    await page.route('**/transport/journey/runs/*/map', (route) =>
      json(route, {
        ...JOURNEY_MAP,
        legs: [
          {
            ...leg,
            paths: [
              ...(leg?.paths ?? []),
              {
                kind: 'RAW_OBSERVED',
                points: [
                  { latitude: 21.0278, longitude: 105.8342 },
                  { latitude: 20.94, longitude: 106.33 },
                  { latitude: 20.8449, longitude: 106.6881 },
                ],
                gap: null,
                sampledFrom: 412,
              },
            ],
          },
        ],
      }),
    );
    await page.goto('/?section=journey&selected=RUN-E2E-1');

    await expect(page.getByRole('img', { name: 'Bản đồ vòng chạy RUN-E2E-1' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Vệt GPS thô: 412 bản định vị/)).toBeVisible();
    await expect(page.getByText(/không phải tuyến đã khớp bản đồ/)).toBeVisible();
  });

  test('bieu do km co hang vs km rong nap that', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=journey&selected=RUN-E2E-1');

    await expect(
      page.getByRole('img', {
        name: 'Biểu đồ km có hàng và km rỗng theo chặng của vòng chạy RUN-E2E-1',
      }),
    ).toBeVisible({ timeout: 30_000 });
  });

  /*
   * `#278` N13 bai 6/8 tinh than: mot vai khong duoc nhin thay thu ma ma tran vai da tu choi ho.
   * `transport.location.history.read` nam trong `ACCOUNTING_DENIED`, nen ke toan mo dung man hinh
   * nay phai thay BAO CAO ma KHONG thay ban do.
   */
  test('ke toan khong thay ban do, nhung van thay bao cao day du', async ({ page }) => {
    await mockTransport(page, 'ACCOUNTING');
    await page.goto('/?section=journey&selected=RUN-E2E-1');

    await expect(page.getByText(/không được xem lịch sử vị trí/)).toBeVisible();
    await expect(page.getByRole('img', { name: /^Bản đồ vòng chạy/ })).toHaveCount(0);

    /* Bao cao VAN day du: chang, km, ma don. */
    await expect(page.getByText('ORD-E2E-1').first()).toBeVisible();
    await expect(page.getByText('RỖNG', { exact: true }).first()).toBeVisible();
  });

  test('bang doi xe va bao cao tuyen mo duoc, va noi ro cach doc so lieu', async ({ page }) => {
    await mockTransport(page, 'ADMIN');

    await page.goto('/?section=fleet-dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Bảng đội xe' })).toBeVisible();
    /* Cong thuc ty le su dung di CUNG con so — `#278` N7 cam mot ty le khong noi tu so/mau so. */
    await expect(page.getByText(/số NGÀY xe có chặng chưa huỷ/)).toBeVisible();

    await page.goto('/?section=routes');
    await expect(page.getByRole('heading', { level: 1, name: 'Báo cáo tuyến' })).toBeVisible();
    await expect(page.getByText(/gom theo NHÃN địa điểm/)).toBeVisible();
    /* Moi tuyen mo thang sang ban do cua mot vong chay CO THAT. */
    await expect(page.getByRole('link', { name: 'RUN-E2E-1' })).toBeVisible();
  });

  test('bang dieu hanh ghep ba nguon, va khong goi lai mot ma quyen nao moi', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=executive');

    /*
     * `Tổng hợp giám đốc`, KHONG phai `Bảng điều hành`.
     *
     * Hai muc — `control-tower` va `executive` — tung cung mang nhan `Bảng điều hành` va cung hien
     * tren mot thanh ben, nen nguoi dung thay hai dong chu giong het nhau va khong doan duoc bam
     * cai nao. Khang dinh nay khoa lai ket qua: mo dia chi cua `executive` phai ra mot ten RIENG.
     */
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng hợp giám đốc' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Vận hành' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Hiệu quả chạy xe' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Việc cần xử lý' })).toBeVisible();
  });

  /*
   * `#336` BUG-07 — tren CUNG mot man, "Đang chạy" chi con MOT nghia, va moi con so kem DON VI.
   *
   * Mock `CONTROL_TOWER` co mot vong chay dang chay (cot `IN_TRANSIT`) va `fleet.onTrip = 1`. UAT
   * tung thay the so "Đang chạy 0" canh mot cot "Đang chạy" co hai the. Bai nay khoa o muc TRINH
   * DUYET: the so dem XE, loi tom tat tren bang dem VONG CHAY, va khong cot nao con mang chu
   * "Đang chạy" cho mot PHAN cua tap do.
   */
  test('#336: the so "Xe đang chạy" va bang noi cung mot con so', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=control-tower');

    const stats = page.getByRole('region', { name: 'Đội xe và việc đang chờ' });
    await expect(stats.getByRole('link', { name: /^Xe đang chạy\s*1$/ })).toBeVisible();

    const board = page.getByRole('region', { name: 'Bảng vòng chạy' });
    await expect(board.getByText(/^Vòng chạy đang chạy: 1 trên 1 xe — /)).toBeVisible();
    await expect(board.getByRole('heading', { level: 3, name: 'Trên đường' })).toBeVisible();
    await expect(board.getByRole('heading', { level: 3, name: 'Đang chạy' })).toHaveCount(0);
  });

  /*
   * Review PR `#344` — MOT xe mo HAI vong chay `ACTIVE`. Khong rang buoc nao cam truong hop do (vong
   * chay cu cho ve bai trong khi vong chay moi da bat dau). Khi ca the so lan loi tom tat cung mang
   * nhan tran "Đang chạy", man nay doc ra "Đang chạy 1" canh "Đang chạy: 2 vòng chạy trên 1 xe".
   * Gio moi con so noi ro no dem XE hay dem VONG CHAY, va chu "Đang chạy" khong con dung tran.
   */
  test('#344: 1 xe mo 2 vong chay — the so dem XE, bang dem VONG CHAY', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    const secondRunSameVehicle = {
      runId: 'r-2',
      runCode: 'RUN-E2E-2',
      vehicleId: 'v-1',
      businessDate: '2026-09-08',
      driverId: 'd-1',
      loadedLegs: 1,
      emptyLegs: 0,
      totalKm: 80,
      emptyKm: 0,
      currentLeg: null,
    };
    const twoRunsOneVehicle = {
      ...CONTROL_TOWER,
      board: CONTROL_TOWER.board.map((entry) =>
        entry.column === 'IN_TRANSIT'
          ? { ...entry, total: 2, cards: [...entry.cards, secondRunSameVehicle] }
          : entry,
      ),
      fleet: { ...CONTROL_TOWER.fleet, total: 1, onTrip: 1, idle: 0, runningRuns: 2 },
    };
    await page.route('**/transport/control-tower', (route) => json(route, twoRunsOneVehicle));
    await page.goto('/?section=control-tower');

    const stats = page.getByRole('region', { name: 'Đội xe và việc đang chờ' });
    await expect(stats.getByRole('link', { name: /^Xe đang chạy\s*1$/ })).toBeVisible();

    const board = page.getByRole('region', { name: 'Bảng vòng chạy' });
    await expect(board.getByText(/^Vòng chạy đang chạy: 2 trên 1 xe — /)).toBeVisible();
    await expect(
      board.getByRole('article', { name: 'Trên đường' }).getByRole('listitem'),
    ).toHaveCount(2);

    /* Khong con chu "Đang chạy" tran nao: moi lan xuat hien deu dung sau "Xe" hoac "Vòng chạy". */
    await expect(stats.getByText(/Đang chạy/)).toHaveCount(0);
    await expect(board.getByText(/Đang chạy/)).toHaveCount(0);
  });

  /* `#278` N12 — 390px la be mat lai xe/dien thoai; ban do phai thap lai chu khong bien mat. */
  test('tren man 390px ban do van ve duoc va trang khong tran ngang', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=journey&selected=RUN-E2E-1');

    await expect(page.getByRole('img', { name: 'Bản đồ vòng chạy RUN-E2E-1' })).toBeVisible({
      timeout: 30_000,
    });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

/**
 * ===========================================================================
 * #374 — NEN GOOGLE MAPS, nha cung cap TUY CHON. CI bat buoc khong bao gio chay khoi nay.
 *
 * `NEXT_PUBLIC_*` duoc nuong vao goi JS luc `next dev` bien dich, nen che do nen la cua MAY CHU,
 * khong phai cua tung bai. May chu e2e cua CI chay `provider=local`, nen ca khoi bi bo qua va bai
 * Lane N o tren chung minh khong mot yeu cau nao ra Internet. Chay tay:
 *
 *   NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER=google NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_API_KEY=<khoa> \
 *     pnpm exec playwright test --config playwright.transport.config.ts --grep @google-basemap
 *
 * Bai dau KHONG can mang (Google bi chan ngay trong trinh duyet). Bai "song" goi Google that va
 * con can `TRANSPORT_MAP_GOOGLE_LIVE=1`; `TRANSPORT_MAP_GOOGLE_EXPECT` mac dinh `GOOGLE_MAPS`, dat
 * `GOOGLE_AUTH_FAILED` khi co y chay voi mot khoa sai de do duong `gm_authFailure`.
 */
const GOOGLE_MODE = MAP_PROVIDER === 'google';
const GOOGLE_KEY_SET = (process.env.NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_API_KEY ?? '').trim() !== '';

test.describe('nen Google Maps (#374) @google-basemap', () => {
  test.skip(!GOOGLE_MODE, 'Can may chu dev bat voi NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER=google');

  test('dang tai thi noi dang tai; Google bi chan thi lui ve nen cuc bo, van ve tuyen', async ({
    page,
  }) => {
    const googleChunks = recordGoogleCodeChunks(page);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(GOOGLE_HOSTS, async (route) => {
      await held;
      await route.abort('blockedbyclient');
    });
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=journey&selected=RUN-E2E-1');

    const map = page.getByRole('img', { name: 'Bản đồ vòng chạy RUN-E2E-1' });
    await expect(map).toBeVisible({ timeout: 30_000 });

    if (GOOGLE_KEY_SET) {
      /* `#374` §6: trong luc Google tai, man hinh NOI dang tai — khong mot khung xam cam lang. */
      await expect(
        page.getByRole('status').filter({ hasText: 'Đang tải nền Google Maps…' }),
      ).toBeVisible();
      await expect(map).toHaveAttribute('aria-busy', 'true');
      /*
       * Doi chung duong cho bai Lane N: trinh nap Google la ma tai luoi, va CHI khi bat Google thi
       * chunk cua no moi di tren duong mang — ten chunk co chu `google` that su nhin thay duoc.
       */
      await expect.poll(() => googleChunks.length, { timeout: 15_000 }).toBeGreaterThan(0);
      release();
      await expect(map).toHaveAttribute('data-basemap-fallback', 'GOOGLE_SCRIPT_FAILED', {
        timeout: 30_000,
      });
    } else {
      /* Thieu khoa thi khong bao gio nap Google — lui ve ngay, khong cho. */
      await expect(map).toHaveAttribute('data-basemap-fallback', 'GOOGLE_KEY_MISSING');
    }
    release();

    await expect(map).toHaveAttribute('data-basemap', 'LOCAL_FALLBACK');
    await expect(map).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByTestId('tx-map-notice')).toHaveText(GOOGLE_BASEMAP_UNAVAILABLE_NOTICE);
    /* Nen hong KHONG lam mat nghiep vu: tuyen van ve, chu giai va chang RONG van con. */
    await expect(map.locator('canvas').first()).toBeVisible();
    await expect
      .poll(async () => (await routePixels(page, map)).loaded, { timeout: 15_000 })
      .toBeGreaterThan(ROUTE_PIXELS_MIN);
    await expect(page.getByText('Chặng RỖNG (chạy không hàng)')).toBeVisible();
    await expect(page.getByText('RỖNG', { exact: true }).first()).toBeVisible();
  });

  test('song: Google tra loi that — ROADMAP, hoac lui ve dung ly do', async ({
    page,
  }, testInfo) => {
    test.skip(process.env.TRANSPORT_MAP_GOOGLE_LIVE !== '1', 'Can TRANSPORT_MAP_GOOGLE_LIVE=1');
    const expected = process.env.TRANSPORT_MAP_GOOGLE_EXPECT ?? 'GOOGLE_MAPS';
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockTransport(page, 'ADMIN');
    await page.goto('/?section=journey&selected=RUN-E2E-1');

    const map = page.getByRole('img', { name: 'Bản đồ vòng chạy RUN-E2E-1' });
    await expect(map).toBeVisible({ timeout: 30_000 });

    if (expected === 'GOOGLE_MAPS') {
      await expect(map).toHaveAttribute('data-basemap', 'GOOGLE_MAPS');
      await expect(map).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
      await expect(map.locator('.gm-style')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('tx-map-notice')).toHaveCount(0);
    } else {
      await expect(map).toHaveAttribute('data-basemap', 'LOCAL_FALLBACK', { timeout: 30_000 });
      await expect(map).toHaveAttribute('data-basemap-fallback', expected);
      await expect(page.getByTestId('tx-map-notice')).toHaveText(GOOGLE_BASEMAP_UNAVAILABLE_NOTICE);
    }
    /*
     * Ca hai nhanh: tuyen PHAI hien ra. Nhanh lui ve sau `gm_authFailure` la noi tung ve ra mot nen
     * trong khong co tuyen, du cau thong bao noi "tuyến và mốc vẫn đang được hiển thị đúng".
     */
    await expect
      .poll(async () => (await routePixels(page, map)).loaded, { timeout: 30_000 })
      .toBeGreaterThan(ROUTE_PIXELS_MIN);

    await page.getByRole('region', { name: 'Bản đồ vòng chạy' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`journey-map-${expected}.png`) });
  });
});

/**
 * ===========================================================================
 * #374 — NEN OPENFREEMAP, nen MAC DINH cua san pham. CI bat buoc khong chay khoi nay.
 *
 * May chu e2e cua CI chay `provider=local` (khong Internet). Chay tay:
 *
 *   NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER=openfreemap \
 *     pnpm exec playwright test --config playwright.transport.config.ts --grep @openfreemap-basemap
 *
 * Hai bai dau KHONG can Internet: moi yeu cau toi OpenFreeMap bi giu roi chan, hoac tra bang mot
 * style gia, ngay trong trinh duyet. Bai "song" goi instance cong khai that va con can
 * `TRANSPORT_MAP_OPENFREEMAP_LIVE=1`; no luu anh 1440×900 cua nen that va sau khi keo/phong.
 */
const OPENFREEMAP_MODE = MAP_PROVIDER === 'openfreemap';

/**
 * Vong chay Ha Noi ⇄ Hai Phong HAI MAU: chang CO HANG (moc neo + vet GPS tho doc QL5) va chang
 * RONG ve bang vet GPS tho doc cao toc Ha Noi – Hai Phong. Tren nen duong sa that, nguoi xem doi
 * duoc vet tho voi con duong — va ca hai mau tuyen deu dem duoc.
 */
const JOURNEY_MAP_HN_HP_ROUND_TRIP = {
  ...JOURNEY_MAP,
  legs: [
    {
      ...JOURNEY_MAP.legs[0],
      paths: [
        ...(JOURNEY_MAP.legs[0]?.paths ?? []),
        {
          kind: 'RAW_OBSERVED',
          points: [
            { latitude: 21.0278, longitude: 105.8342 },
            { latitude: 21.0405, longitude: 105.912 },
            { latitude: 20.9845, longitude: 106.051 },
            { latitude: 20.941, longitude: 106.33 },
            { latitude: 20.883, longitude: 106.526 },
            { latitude: 20.8449, longitude: 106.6881 },
          ],
          gap: null,
          sampledFrom: 412,
        },
      ],
    },
    {
      legId: 'l-2',
      sequence: 2,
      kind: 'EMPTY',
      origin: {
        point: { latitude: 20.8449, longitude: 106.6881 },
        source: 'CHECKPOINT_OBSERVATION',
        at: '2026-09-08T07:00:00.000Z',
      },
      originGap: null,
      destination: {
        point: { latitude: 21.0278, longitude: 105.8342 },
        source: 'CHECKPOINT_OBSERVATION',
        at: '2026-09-08T11:00:00.000Z',
      },
      destinationGap: null,
      paths: [
        {
          kind: 'RAW_OBSERVED',
          points: [
            { latitude: 20.8449, longitude: 106.6881 },
            { latitude: 20.87, longitude: 106.5 },
            { latitude: 20.905, longitude: 106.28 },
            { latitude: 20.952, longitude: 106.05 },
            { latitude: 20.998, longitude: 105.915 },
            { latitude: 21.0278, longitude: 105.8342 },
          ],
          gap: null,
          sampledFrom: 388,
        },
      ],
    },
  ],
};

/**
 * Style GIA dung dang cua OpenFreeMap: mot nguon vector tro ve `tiles.openfreemap.org`. Tra no thay
 * cho style that thi do duoc duong hong MUON — ban do va lop deck.gl da khoi tao xong, style da ap,
 * roi moi biet khong mot o tile nao ve duoc.
 */
const OPENFREEMAP_LIKE_STYLE = {
  version: 8,
  sources: {
    openmaptiles: {
      type: 'vector',
      tiles: [`https://${OPENFREEMAP_HOST}/planet/e2e/{z}/{x}/{y}.pbf`],
      maxzoom: 14,
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } },
    {
      id: 'road',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      paint: { 'line-color': '#ffffff' },
    },
  ],
};

async function openRoundTrip(page: Page): Promise<Locator> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockTransport(page, 'ADMIN');
  /*
   * Danh sach vong chay cua o chon: de trong, `next dev` bien dich trang 404 (~10 s) ngay giua luc
   * ban do dang tai worker va tile — do 23/09/2026, worker 19 KB mat 6 s de ve toi trinh duyet.
   */
  await page.route('**/transport/runs', (route) => json(route, [{ id: 'r-1', code: 'RUN-E2E-1' }]));
  await page.route('**/transport/journey/runs/*/map', (route) =>
    json(route, JOURNEY_MAP_HN_HP_ROUND_TRIP),
  );
  await page.goto('/?section=journey&selected=RUN-E2E-1');
  const map = page.getByRole('img', { name: 'Bản đồ vòng chạy RUN-E2E-1' });
  await expect(map).toBeVisible({ timeout: 30_000 });
  /*
   * KHONG khang dinh `OPENFREEMAP` o day: khi o tile hong, nen lui ve cuc bo trong vai chuc ms — co
   * the truoc ca lan doc nay. Bai nao can trang thai dau tien thi tu giu mang roi moi khang dinh.
   */
  return map;
}

/** Nen hong KHONG lam mat nghiep vu: ca hai mau tuyen, chu giai va cau vet GPS tho van con. */
async function expectBusinessOverlayIntact(page: Page, map: Locator): Promise<void> {
  await expect
    .poll(async () => (await routePixels(page, map)).loaded, { timeout: 15_000 })
    .toBeGreaterThan(ROUTE_PIXELS_MIN);
  const pixels = await routePixels(page, map);
  test.info().annotations.push({
    type: 'diem-anh-tuyen',
    description: `${(await map.getAttribute('data-basemap')) ?? '?'}: CÓ HÀNG ${pixels.loaded} / RỖNG ${pixels.empty}`,
  });
  expect(pixels.empty).toBeGreaterThan(ROUTE_PIXELS_MIN);
  await expect(page.getByText('Chặng RỖNG (chạy không hàng)')).toBeVisible();
  await expect(page.getByText(/không phải tuyến đã khớp bản đồ/)).toBeVisible();
}

/**
 * Doi ban do VE XONG: hai anh chup cach nhau 400ms giong het tung byte. Tile tai ve con phai giai
 * ma trong worker roi moi ve, nen "mang da yen" chua phai "man hinh da yen".
 */
async function waitForStillFrame(map: Locator): Promise<void> {
  let previous = await map.screenshot();
  await expect
    .poll(
      async () => {
        const next = await map.screenshot();
        const still = next.equals(previous);
        previous = next;
        return still;
      },
      { intervals: [400], timeout: 30_000 },
    )
    .toBe(true);
}

/**
 * Keo ban do mot quang `delta` (diem anh) va tra ve do lech giua quang tuyen DA dich va `delta`.
 *
 * Nen va lop tuyen dung chung mot camera thi trong tam tuyen dich dung bang quang keo; lop tuyen
 * lech khoi nen (hai canvas lech khung, viewState cu) thi con so nay lon.
 */
async function dragMisalignment(
  page: Page,
  map: Locator,
  delta: { readonly x: number; readonly y: number },
): Promise<number> {
  const before = (await routePixels(page, map)).centroid;
  const box = await map.boundingBox();
  if (before === null || box === null) return Number.POSITIVE_INFINITY;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 12 });
  /*
   * Giu chuot dung yen truoc khi tha: MapLibre bo mau van toc cu hon 160ms, nen khong con quan tinh
   * — ban do dung dung cho chuot dung, va do lech do duoc la cua lop tuyen, khong cua da troi.
   */
  await page.waitForTimeout(300);
  await page.mouse.up();
  await waitForStillFrame(map);
  const after = (await routePixels(page, map)).centroid;
  if (after === null) return Number.POSITIVE_INFINITY;
  return Math.hypot(after.x - before.x - delta.x, after.y - before.y - delta.y);
}

async function screenshotMapRegion(page: Page, path: string): Promise<void> {
  await page.getByRole('region', { name: 'Bản đồ vòng chạy' }).scrollIntoViewIfNeeded();
  /* Chi bao che do dev cua Next nam de goc trai duoi — khong phai mot phan cua san pham. */
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('nextjs-portal')) node.remove();
  });
  await page.screenshot({ path });
}

test.describe('nen OpenFreeMap (#374) @openfreemap-basemap', () => {
  /*
   * Khoi chay tay tren `next dev`: bai dau tien gap may chu vua bien dich lai goi ban do (vd sau
   * khi doi `next.config.mjs`), bai "song" di mang that va cho man hinh ve xong ba lan. 30 s mac
   * dinh do toc do bien dich, khong do san pham.
   */
  test.describe.configure({ timeout: 120_000 });

  test.skip(
    !OPENFREEMAP_MODE,
    'Can may chu dev bat voi NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER=openfreemap',
  );

  /*
   * §9 bai 13/14 — OpenFreeMap khong tra loi. Style bi GIU trong luc ban do va lop deck.gl khoi tao
   * tren nen OpenFreeMap, roi moi bi chan: dung duong "hong sau khi da khoi tao" da lam mat tuyen
   * voi Google ngay 23/09/2026.
   */
  test('dang tai: tuyen da ve; OpenFreeMap bi chan → nen cuc bo, tuyen van con', async ({
    page,
  }, testInfo) => {
    const external = recordExternalRequests(page);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(OPENFREEMAP_URLS, async (route) => {
      await held;
      await route.abort('blockedbyclient');
    });

    const map = await openRoundTrip(page);

    /* Dang tai (style dang bi GIU): nen van la OpenFreeMap, khong cau thong bao, `aria-busy`. */
    await expect(map).toHaveAttribute('data-basemap', 'OPENFREEMAP');
    await expect(map).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId('tx-map-notice')).toHaveCount(0);
    /* Yeu cau DAU TIEN ra ngoai la style Liberty — khong khoa, khong tham so. */
    await expect
      .poll(() => external[0]?.url, { timeout: 15_000 })
      .toBe(OPENFREEMAP_LIBERTY_STYLE_URL);
    await expect
      .poll(async () => (await routePixels(page, map)).loaded, { timeout: 15_000 })
      .toBeGreaterThan(ROUTE_PIXELS_MIN);

    release();

    await expect(map).toHaveAttribute('data-basemap', 'LOCAL_FALLBACK', { timeout: 30_000 });
    await expect(map).toHaveAttribute('data-basemap-fallback', 'OPENFREEMAP_STYLE_FAILED');
    await expect(map).toHaveAttribute('aria-busy', 'false');
    /* Noi NEN hong — khong noi toa do sai, khong goi ten ha tang. */
    await expect(page.getByTestId('tx-map-notice')).toHaveText(BASEMAP_UNAVAILABLE_NOTICE);
    await expectBusinessOverlayIntact(page, map);
    expect(external.every(({ url }) => OPENFREEMAP_URLS.test(url))).toBe(true);

    await screenshotMapRegion(page, testInfo.outputPath('openfreemap-bi-chan-lui-ve.png'));
  });

  test('style da ap nhung moi o tile hong → lui nen MUON, tuyen van con', async ({ page }) => {
    let styleServed = false;
    let tilesAborted = 0;
    await page.route(OPENFREEMAP_URLS, async (route) => {
      if (route.request().url() === OPENFREEMAP_LIBERTY_STYLE_URL) {
        styleServed = true;
        await json(route, OPENFREEMAP_LIKE_STYLE);
        return;
      }
      tilesAborted += 1;
      await route.abort('blockedbyclient');
    });

    const map = await openRoundTrip(page);

    await expect(map).toHaveAttribute('data-basemap', 'LOCAL_FALLBACK', { timeout: 30_000 });
    await expect(map).toHaveAttribute('data-basemap-fallback', 'OPENFREEMAP_TILES_FAILED');
    /*
     * Hong MUON that: style da duoc tra va AP (MapLibre chi xin o tile sau khi style ap vao), roi
     * moi o tile tu worker moi hong. Ket luan den tu loi o tile cuoi — khong can `idle`.
     */
    expect(styleServed).toBe(true);
    expect(tilesAborted).toBeGreaterThan(0);
    await expect(page.getByTestId('tx-map-notice')).toHaveText(BASEMAP_UNAVAILABLE_NOTICE);
    await expectBusinessOverlayIntact(page, map);
  });

  test('song: OpenFreeMap that — duong sa, ghi nguon, chi goi dung may chu nen; keo/phong van khop', async ({
    page,
  }, testInfo) => {
    test.skip(
      process.env.TRANSPORT_MAP_OPENFREEMAP_LIVE !== '1',
      'Can TRANSPORT_MAP_OPENFREEMAP_LIVE=1',
    );
    const external = recordExternalRequests(page);
    const googleChunks = recordGoogleCodeChunks(page);

    const map = await openRoundTrip(page);

    await expect(map).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
    await expect(map).toHaveAttribute('data-basemap', 'OPENFREEMAP');
    expect(await map.getAttribute('data-basemap-fallback')).toBeNull();
    /* Nen thanh cong thi KHONG mot bang ron nha cung cap nao. */
    await expect(page.getByTestId('tx-map-notice')).toHaveCount(0);
    /* §5: ghi nguon hien du — OpenFreeMap, OpenMapTiles, OpenStreetMap. */
    const attribution = map.locator('.maplibregl-ctrl-attrib');
    await expect(attribution).toBeVisible();
    await expect(attribution).toContainText('OpenFreeMap');
    await expect(attribution).toContainText('OpenStreetMap');
    await expectBusinessOverlayIntact(page, map);

    /*
     * §6 + §9 bai 16/18 — chi instance OpenFreeMap, khong Google; URL khong mang tham so truy van
     * nao, va Referer chi la ORIGIN: dia chi trang (`?selected=RUN-E2E-1`) khong ra khoi trinh duyet.
     */
    expect(external.length).toBeGreaterThan(0);
    expect(external[0]?.url).toBe(OPENFREEMAP_LIBERTY_STYLE_URL);
    for (const { url, referer } of external) {
      const parsed = new URL(url);
      expect(parsed.host, url).toBe(OPENFREEMAP_HOST);
      expect(parsed.search, url).toBe('');
      if (referer !== undefined)
        expect(new URL(referer).pathname + new URL(referer).search).toBe('/');
    }
    expect(googleChunks).toEqual([]);

    await waitForStillFrame(map);
    await screenshotMapRegion(page, testInfo.outputPath('openfreemap-thanh-cong.png'));

    /*
     * §10 B — keo/phong: tuyen di CUNG nen. Lui mot muc truoc de ca tuyen nam trong khung khi keo
     * (o khung fit, tuyen cham le 48px — keo ngang se cat mat mot dau va lam lech trong tam).
     */
    await map.getByRole('button', { name: 'Zoom out' }).click();
    await waitForStillFrame(map);
    /* Keo di roi keo ve: ca hai lan tuyen phai dich DUNG bang quang keo; lan hai dua tuyen ve giua. */
    for (const delta of [
      { x: -140, y: 60 },
      { x: 140, y: -60 },
    ]) {
      const misalignment = await dragMisalignment(page, map, delta);
      testInfo.annotations.push({
        type: 'do-lech-khi-keo',
        description: `keo (${delta.x}, ${delta.y}) px → lech ${misalignment.toFixed(2)} px`,
      });
      expect(misalignment).toBeLessThan(8);
    }

    await map.getByRole('button', { name: 'Zoom in' }).click();
    await map.getByRole('button', { name: 'Zoom in' }).click();
    await waitForStillFrame(map);
    await expectBusinessOverlayIntact(page, map);
    await screenshotMapRegion(page, testInfo.outputPath('openfreemap-keo-phong.png'));
  });
});

/*
 * `#278` N9 — BE MAT BEN HUU QUAN, PHAN HOAT DONG.
 *
 * Hai route duoi day duoc khai SAU `mockTransport`, nen chung DE LEN cap `403` mac dinh cua bo
 * mock: Playwright uu tien route dang ky sau cung. O day nguoi dang xem THAT SU la mot ben huu
 * quan, va do la trang thai duy nhat ma bang hoat dong hien ra.
 */
test.describe('hoat dong cua xe toi co co phan (Lane N)', () => {
  const MY_VEHICLES = [
    {
      vehicleId: 'veh-n9-1',
      registrationPlate: '29H-111.11',
      vehicleClass: 'Dau keo',
      status: 'IDLE',
      operationalControl: 'INTERNAL_OPERATED',
      currentOdoKm: 120000,
      myBasisPoints: 3000,
      myEffectiveFrom: '2026-01-01',
      myHistory: [{ ownershipBasisPoints: 3000, effectiveFrom: '2026-01-01', effectiveTo: null }],
      driverName: 'Nguyen Van A',
    },
  ];

  const ACTIVITY = {
    range: { from: '2026-08-10', to: '2026-09-08', businessDays: 30 },
    utilisationFormula: 'ngayCoChangKhongHuy / ngayLichTrongKhoang',
    vehicles: [
      {
        vehicleId: 'veh-n9-1',
        registrationPlate: '29H-111.11',
        status: 'IDLE',
        runCount: 6,
        activeBusinessDays: 12,
        utilisation: 0.4,
        loadedKm: 1200,
        emptyKm: 300,
        totalKm: 1500,
        emptyRatio: 0.2,
        legsMissingDistance: 0,
        downtime: { workOrderDays: 3, openWorkOrderCount: 1 },
      },
    ],
    unavailableSources: [],
  };

  test('bang hoat dong hien ra kem cong thuc, va bieu do nap that', async ({ page }) => {
    await mockTransport(page, 'MANAGER');
    await page.route('**/transport/me/vehicles', (route) => json(route, MY_VEHICLES));
    await page.route('**/transport/me/vehicles/activity*', (route) => json(route, ACTIVITY));

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Xe của tôi chạy thế nào' })).toBeVisible();

    /* Cong thuc di CUNG con so — mot ty le khong kem dinh nghia la mot con so khong kiem duoc. */
    await expect(page.getByText(/ngayCoChangKhongHuy \/ ngayLichTrongKhoang/)).toBeVisible();

    /*
     * Cau canh bao ve cach dem "ngay-lenh". Neu ai do doi ten cot thanh "So ngay xe nghi" ma quen
     * cau nay, bai do — va do dung la luc con so bat dau bi doc sai.
     */
    await expect(page.getByText(/không phải số ngày xe vắng mặt/)).toBeVisible();

    await expect(
      page.getByRole('img', { name: 'Biểu đồ km có hàng và km rỗng của xe tôi có cổ phần' }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('khach chua bat bao duong: o ngay nghi la dau gach VA co cau giai thich', async ({
    page,
  }) => {
    await mockTransport(page, 'MANAGER');
    await page.route('**/transport/me/vehicles', (route) => json(route, MY_VEHICLES));
    await page.route('**/transport/me/vehicles/activity*', (route) =>
      json(route, {
        ...ACTIVITY,
        vehicles: [{ ...ACTIVITY.vehicles[0], downtime: null }],
        unavailableSources: ['MAINTENANCE_CAPABILITY_OFF'],
      }),
    );

    await page.goto('/');

    /*
     * `#278` N13 tinh than: mot o trong phai NOI duoc vi sao no trong. Khong co cau nay, nguoi doc
     * se ket luan xe chay du thang — mot ket luan sai rut ra tu mot dau gach.
     */
    await expect(page.getByText(/phần Bảo dưỡng chưa được bật/)).toBeVisible();
  });
});

/**
 * ===========================================================================
 * #348 — TONG QUAN DOC TU DON + VONG CHAY, KHONG TU CHUYEN LAP TAY.
 *
 * Mock `CONTROL_TOWER` co MOT vong chay dang chay tren MOT xe va MOT viec: chang thieu km cua vong
 * chay `RUN-E2E-1` (`id` ky thuat cua chang la `l-9`). Bo `seedTrips()` co ba chuyen lap tay chua
 * khep. Bai `.ts` da khoa phep dem; o day do nhung thu chi trinh duyet that do duoc — duong dan THAT
 * tren the, dia chi THAT sau khi bam, va con so THAT o man ben kia.
 */
test.describe('#348 — Tong quan lay so tu don va vong chay', () => {
  const RUNNING_CARD = /^Vòng chạy đang chạy\s*1\s*Trên 1 xe\.$/;

  test('0 chuyen lap tay + vong chay dang chay: Tong quan thay dang co van hanh', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    await page.route('**/transport/trips', (route) => json(route, []));
    await page.goto('/');

    const stats = page.getByRole('region', { name: 'Số liệu vận hành' });
    await expect(stats.getByRole('link', { name: RUNNING_CARD })).toBeVisible();
    await expect(stats.getByRole('link', { name: /^Đơn đang mở\s*1/ })).toHaveAttribute(
      'href',
      '/?section=movement',
    );

    await expect(page.getByRole('region', { name: 'Cần xử lý ngay' })).toContainText(
      '1 việc đang chờ người xử lý.',
    );
    await expect(page.getByText('Không có chuyến nào đang chờ người xử lý.')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Chuyến lập tay chưa khép' })).toHaveCount(0);
  });

  test('co ca chuyen cu lan vong chay moi: so chinh la vong chay, chuyen cu chi la dong phu', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/');

    const stats = page.getByRole('region', { name: 'Số liệu vận hành' });
    await expect(stats.getByRole('link', { name: RUNNING_CARD })).toBeVisible();
    /* Khong mot the so nao con dem chuyen lap tay — va khong the nao cong chung hai thu. */
    await expect(stats.getByText(/Chuyến/)).toHaveCount(0);

    const legacy = page.getByRole('region', { name: 'Chuyến lập tay chưa khép' });
    await expect(legacy).toContainText('Còn 3 chuyến lập tay theo cách làm trước đây chưa khép.');
    await expect(legacy.getByRole('link', { name: 'Xem ở “Chuyến xe”' })).toHaveAttribute(
      'href',
      '/?section=trips',
    );
  });

  test('so "đang chạy" cua Tong quan = Bang dieu hanh, va bam the la sang dung man do', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    /* Cung hinh dang bai `#344`: 1 xe mo 2 vong chay — con so ma mot phep dem theo xe se noi SAI. */
    const twoRunsOneVehicle = {
      ...CONTROL_TOWER,
      board: CONTROL_TOWER.board.map((entry) =>
        entry.column === 'IN_TRANSIT'
          ? {
              ...entry,
              total: 2,
              cards: [...entry.cards, { ...entry.cards[0], runId: 'r-2', runCode: 'RUN-E2E-2' }],
            }
          : entry,
      ),
      fleet: { ...CONTROL_TOWER.fleet, total: 1, onTrip: 1, idle: 0, runningRuns: 2 },
    };
    await page.route('**/transport/control-tower', (route) => json(route, twoRunsOneVehicle));
    await page.goto('/');

    const card = page
      .getByRole('region', { name: 'Số liệu vận hành' })
      .getByRole('link', { name: /^Vòng chạy đang chạy\s*2\s*Trên 1 xe\.$/ });
    await expect(card).toHaveAttribute('href', '/?section=control-tower');

    await card.click();
    await expect(page).toHaveURL(/\?section=control-tower$/);
    await expect(
      page
        .getByRole('region', { name: 'Bảng vòng chạy' })
        .getByText(/^Vòng chạy đang chạy: 2 trên 1 xe — /),
    ).toBeVisible();
  });

  test('khong the, khong dong viec nao dan vao Chuyen xe; dong viec mang MA, khong mang id', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    await page.goto('/');

    const stats = page.getByRole('region', { name: 'Số liệu vận hành' });
    const work = page.getByRole('region', { name: 'Cần xử lý ngay' });
    const workLink = work.getByRole('link', { name: 'Chặng đã xong nhưng chưa nhập số km' });
    await expect(stats.getByRole('link', { name: RUNNING_CARD })).toBeVisible();
    await expect(workLink).toHaveAttribute('href', '/?section=movement&selected=RUN-E2E-1');

    const hrefsOf = (region: typeof stats) =>
      region
        .getByRole('link')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    const hrefs = [...(await hrefsOf(stats)), ...(await hrefsOf(work))];
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter((href) => href === null || href.includes('section=trips'))).toEqual([]);
    expect(hrefs.join(' ')).not.toContain('l-9');
  });

  test('may chu tu choi Bang dieu hanh: Tong quan KHONG ve so vong chay nao, ke ca so 0', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    await page.route('**/transport/control-tower', (route) =>
      json(route, { message: 'Tài khoản này không được xem bảng điều hành' }, 403),
    );
    await page.goto('/');

    await expect(page.locator('#tx-main').getByRole('alert')).toContainText(
      'Tài khoản này không được xem bảng điều hành',
    );
    const stats = page.getByRole('region', { name: 'Số liệu vận hành' });
    /* Nguon khac van song: the don van la mot con so that. */
    await expect(stats.getByRole('link', { name: /^Đơn đang mở\s*1/ })).toBeVisible();
    await expect(stats.getByText(/Vòng chạy/)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Cần xử lý ngay' })).toHaveCount(0);
  });

  test('doc chuyen lap tay hong: dong phu noi "chua doc duoc", khong mot loi do nao len dau trang', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    await page.route('**/transport/trips', (route) =>
      json(route, { message: 'Không đọc được danh sách chuyến' }, 500),
    );
    await page.goto('/');

    /* Doi DONG PHU noi loi truoc — tuc query chuyen DA hong — roi moi khang dinh dau trang sach. */
    await expect(page.getByRole('region', { name: 'Chuyến lập tay chưa khép' })).toContainText(
      'Chưa đọc được các chuyến lập tay theo cách làm trước đây',
    );
    await expect(page.locator('#tx-main').getByRole('alert')).toHaveCount(0);
    await expect(
      page
        .getByRole('region', { name: 'Số liệu vận hành' })
        .getByRole('link', { name: RUNNING_CARD }),
    ).toBeVisible();
  });

  test('o 390px Tong quan moi khong tran ngang', async ({ page }) => {
    await mockTransport(page, 'ADMIN');
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto('/');

    await expect(
      page
        .getByRole('region', { name: 'Số liệu vận hành' })
        .getByRole('link', { name: RUNNING_CARD }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Chuyến lập tay chưa khép' })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

/**
 * `#351` — BA THE DOI XE CUA TONG QUAN LA SO CUA BANG DIEU HANH, tren trinh duyet that.
 *
 * Bo mock co san cho hai nguon noi KHAC nhau, va chinh su khac do lam cac bai nay phan biet duoc:
 * `VEHICLES` luu `IDLE` / `ON_TRIP` / `UNDER_MAINTENANCE` va `DRIVERS` co hai lai xe `ACTIVE`, nen
 * dem lai tu hai danh sach do ra "rỗi 1 · bảo dưỡng 1 · lái xe 2"; con `CONTROL_TOWER.fleet` — cau
 * tra loi cua phep chieu may chu — noi "rảnh 0 · sửa chữa 0 · lái xe 1".
 *
 * Bai `.ts` da khoa mo hinh. O day do nhung thu chi trinh duyet that do duoc: con so THAT tren ca
 * hai man, va viec Tong quan KHONG con goi hai duong doc cu — ke ca de lam "phuong an du phong" luc
 * `Bảng điều hành` chua tra loi.
 */
test.describe('#351 — ba the doi xe cua Tong quan la so cua Bang dieu hanh', () => {
  const FLEET_CARD = /Xe đang rỗi|Xe đang bảo dưỡng|Lái xe đang làm/;

  /** Ghi lai moi lan goi hai duong doc cu cua ba the. Dang ky TRUOC `goto`. */
  const legacyFleetReads = (page: Page): string[] => {
    const reads: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (/\/transport\/(vehicles|drivers)$/.test(path)) reads.push(path);
    });
    return reads;
  };

  test('Tong quan va Bang dieu hanh noi cung ba con so doi xe — khong dem cot trang thai xe', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    const reads = legacyFleetReads(page);
    await page.goto('/');

    const stats = page.getByRole('region', { name: 'Số liệu vận hành' });
    await expect(stats.getByRole('link', { name: /^Xe đang rỗi\s*0$/ })).toHaveAttribute(
      'href',
      '/?section=fleet',
    );
    await expect(
      stats.getByRole('link', { name: /^Xe đang bảo dưỡng\s*0\s*Đọc từ trạng thái xe/ }),
    ).toBeVisible();
    await expect(stats.getByRole('link', { name: /^Lái xe đang làm\s*1$/ })).toBeVisible();
    expect(reads).toEqual([]);

    /* Sang `Bảng điều hành` tu the vong chay: CUNG ba con so, doc tu cung mot read model. */
    await stats.getByRole('link', { name: /^Vòng chạy đang chạy/ }).click();
    await expect(page).toHaveURL(/\?section=control-tower$/);
    const tower = page.getByRole('region', { name: 'Đội xe và việc đang chờ' });
    await expect(tower.getByRole('link', { name: /^Đang rảnh\s*0$/ })).toBeVisible();
    await expect(tower.getByRole('link', { name: /^Đang sửa chữa\s*0$/ })).toBeVisible();
    await expect(tower.getByRole('link', { name: /^Lái xe đang hoạt động\s*1$/ })).toBeVisible();
  });

  test('Bang dieu hanh hong: KHONG the doi xe nao, ke ca so 0, va khong doc cot trang thai xe thay the', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    await page.route('**/transport/control-tower', (route) =>
      json(route, { message: 'Không đọc được bảng điều hành' }, 500),
    );
    const reads = legacyFleetReads(page);
    await page.goto('/');

    await expect(page.locator('#tx-main').getByRole('alert')).toContainText(
      'Không đọc được bảng điều hành',
    );
    const stats = page.getByRole('region', { name: 'Số liệu vận hành' });
    /* Nguon khac van song: the don van la mot con so that. */
    await expect(stats.getByRole('link', { name: /^Đơn đang mở\s*1/ })).toBeVisible();
    await expect(stats.getByText(FLEET_CARD)).toHaveCount(0);
    expect(reads).toEqual([]);
  });

  test('Bang dieu hanh dang doc: chua co the doi xe nao — doc xong moi hien so cua bang', async ({
    page,
  }) => {
    await mockTransport(page, 'ADMIN');
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/transport/control-tower', async (route) => {
      await answered;
      await json(route, CONTROL_TOWER);
    });
    await page.goto('/');

    const stats = page.getByRole('region', { name: 'Số liệu vận hành' });
    await expect(page.getByText('Đang đọc số liệu vận hành…')).toBeVisible();
    await expect(stats.getByRole('link', { name: /^Đơn đang mở\s*1/ })).toBeVisible();
    /* "Chua doc duoc" khong phai "0": khong the nao, thay vi ba the so 0. */
    await expect(stats.getByText(FLEET_CARD)).toHaveCount(0);

    release();
    await expect(stats.getByRole('link', { name: /^Xe đang rỗi\s*0$/ })).toBeVisible();
    await expect(stats.getByRole('link', { name: /^Lái xe đang làm\s*1$/ })).toBeVisible();
    await expect(page.getByText('Đang đọc số liệu vận hành…')).toHaveCount(0);
  });
});

/**
 * ===========================================================================
 * #341 — DANH MUC KE TOAN THEO CAU HOI NGHIEP VU, TREN TRINH DUYET THAT.
 *
 * Luat thuan (nhom, nhan, cong quyen, dia chi cu, ten cu trong o loc) khoa o
 * `__tests__/navigation.spec.ts`. Ba dieu duoi day chi trinh duyet do duoc:
 *
 *   1. ke toan nhin thanh ben MOT luot: bon nhom tien dung thu tu, ten phan he cu bien mat;
 *   2. dia chi cu va bam tren danh muc deu ra `<h1>` noi DUNG chu cua danh muc;
 *   3. `Tổng hợp tài chính` dan tung dong tien sang DUNG man — truoc #341 hai duong dan nay bi dao.
 */
test.describe('#341 — danh muc ke toan theo cau hoi nghiep vu', () => {
  const MONEY_ENTRIES = [
    ['Phải thu khách hàng', 'settlement'],
    ['Phải trả đối tác & cây xăng', 'ar-ap'],
    ['Quỹ lái xe', 'driver-fund'],
    ['Tổng hợp tài chính', 'finance'],
    ['Hiệu quả từng chuyến', 'margin'],
  ] as const;

  test('ke toan nhin mot luot: bon nhom tien dung thu tu, khong con ten phan he', async ({
    page,
  }) => {
    await mockTransport(page, 'ACCOUNTING');
    // Cung be rong/cao voi bo anh bang chung ben tren — danh muc cuon trong thanh ben o day.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Điều hướng vận hành vận tải' });
    await expect(nav.locator('.tx-nav__grouplabel')).toHaveText([
      'ĐIỀU HÀNH',
      'PHẢI THU',
      'PHẢI TRẢ',
      'QUỸ & LƯƠNG LÁI XE',
      'TỔNG HỢP & HIỆU QUẢ',
      'TÀI SẢN',
    ]);
    for (const old of ['Công nợ & quyết toán', 'AR/AP', 'Bảng tài chính', 'Biên trực tiếp']) {
      await expect(nav.getByRole('link', { name: old })).toHaveCount(0);
    }

    /*
     * "Nhin MOT luot" nghia la KHONG phai cuon: bon cau tra loi nam trong khung cua danh muc ngay
     * khi mo trang. Khi nhom TAI SAN con chen giua, hai muc tong hop roi xuong duoi mep cuon — bai
     * nay do chinh dieu do. Do thi sua THU TU danh muc, dung xoa khang dinh.
     */
    for (const label of [
      'Phải thu khách hàng',
      'Phải trả đối tác & cây xăng',
      'Tổng hợp tài chính',
      'Hiệu quả từng chuyến',
    ]) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeInViewport();
    }
  });

  test('dia chi cu va bam tren danh muc deu ra dung man, dung ten', async ({ page }) => {
    await mockTransport(page, 'ACCOUNTING');
    const nav = page.getByRole('navigation', { name: 'Điều hướng vận hành vận tải' });

    // Dia chi cu — `id` khong doi, nen dau trang da luu mo dung man duoi ten moi.
    for (const [label, section] of MONEY_ENTRIES) {
      await page.goto(`/?section=${section}`);
      await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible();
      await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }

    // Bam tren danh muc — cung mot dia chi, cung mot `<h1>`.
    await page.goto('/');
    for (const [label, section] of MONEY_ENTRIES) {
      await nav.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`\\?section=${section}$`));
      await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible();
    }
  });

  test('Tong hop tai chinh dan dong phai thu sang Phai thu, dong phai tra sang Phai tra', async ({
    page,
  }) => {
    await mockTransport(page, 'ACCOUNTING');
    await page.goto('/?section=finance');
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng hợp tài chính' })).toBeVisible();

    const flows = page.getByRole('region', { name: 'Sáu dòng tiền' });
    for (const payable of [/Còn nợ cây xăng/, /Còn nợ nhà xe/, /Hoa hồng phải trả đối tác/]) {
      await expect(flows.getByRole('link', { name: payable })).toHaveAttribute(
        'href',
        '/?section=ar-ap',
      );
    }
    await expect(page.getByRole('link', { name: /Khách hàng nợ quá hạn/ })).toHaveAttribute(
      'href',
      '/?section=settlement',
    );

    await flows.getByRole('link', { name: /Khách hàng còn nợ/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Phải thu khách hàng' }),
    ).toBeVisible();
    // Cau chi duong tren man phai thu doc NHAN tu danh muc, khong con chu `AR/AP` chep tay.
    await expect(
      page.locator('.tx-pagehead__context').getByRole('link', {
        name: 'Phải trả đối tác & cây xăng',
      }),
    ).toHaveAttribute('href', '/?section=ar-ap');
  });
});

/**
 * ===========================================================================
 * #381/#385 — HAI MAN TIEN THAY DON GIAO THEO VONG XE, TREN TRINH DUYET THAT.
 *
 *   1. `Hiệu quả từng chuyến` doc MOT route cua may chu (`/transport/finance/margin`) — khong goi lai
 *      duong cong don theo lo chuyen cu, tuc trinh duyet khong tu quyet tap nao duoc cong.
 *   2. Don Run-first hien bang MA DON, ma vong xe la boi canh; bam vao ra nguon cua tung con so.
 *   3. Don chua dieu xe hien "Chưa vào tổng", chi phi "Chưa biết" — khong bao gio 0 ₫.
 *   4. `Tổng hợp tài chính` noi doanh thu theo NGUON va canh bao tien dau chua phan bo.
 */
test.describe('#381 — doanh thu/bien tinh ca don giao theo vong xe', () => {
  test('Hieu qua: mot route cua may chu, don Run-first co dong rieng va nguon con so', async ({
    page,
  }) => {
    await mockTransport(page, 'ACCOUNTING');
    const calls: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.includes('direct-margin') || path.startsWith('/transport/finance/'))
        calls.push(path);
    });

    await page.goto('/?section=margin');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Hiệu quả từng chuyến' }),
    ).toBeVisible();

    const totals = page.getByRole('region', { name: 'Cộng dồn biên trực tiếp' });
    await expect(totals).toContainText('Tính trên 2 chuyến cũ và 1 đơn theo vòng xe.');
    const bySource = totals.getByRole('table', { name: 'Doanh thu và biên theo nguồn' });
    await expect(bySource.getByRole('row', { name: /Đơn theo vòng xe/ })).toContainText(
      '6.000.000',
    );
    await expect(totals.getByRole('list', { name: 'Lưu ý về con số' })).toContainText(
      'chưa phân bổ vào chi phí',
    );

    const table = page.getByRole('table', { name: 'Hiệu quả từng đơn và chuyến' });
    const order = table.getByRole('rowheader', { name: /UAT-378-0923A/ });
    await expect(order).toContainText('Vòng xe RUN-S260923-BE4C94F9');
    const waiting = table.getByRole('row', { name: /UAT-378-0923B/ });
    await expect(waiting).toContainText('Chưa vào tổng · Chưa điều xe');
    // Chi phi CHUA BIET la mot o chu, khong phai mot so tien bang 0.
    await expect(waiting.getByRole('cell', { name: 'Chưa biết', exact: true })).toHaveCount(1);

    await page
      .getByRole('group', { name: 'Lọc theo nguồn' })
      .getByRole('button', {
        name: 'Đơn theo vòng xe (2)',
      })
      .click();
    await expect(table.getByRole('rowheader', { name: /VT-2026-0913/ })).toHaveCount(0);

    await order.click();
    const detail = page.getByRole('region', { name: 'Nguồn con số UAT-378-0923A' });
    await expect(detail).toContainText('Giá cước của đơn UAT-378-0923A');
    await expect(detail).toContainText('Nhiên liệu phân bổ');
    await expect(detail).toContainText('1.320.000');
    await expect(detail).toContainText('Chưa gồm chi phí cố định');

    // Tong la cua MAY CHU: mot lan doc, khong mot lan goi cong don theo lo nao.
    expect(calls.filter((path) => path.includes('direct-margin'))).toEqual([]);
    expect(calls).toContain('/transport/finance/margin');
  });

  test('Tong hop tai chinh: doanh thu theo nguon, duong sang tung don va chuyen', async ({
    page,
  }) => {
    await mockTransport(page, 'ACCOUNTING');
    await page.goto('/?section=finance');

    const margin = page.getByRole('region', { name: 'Biên trực tiếp' });
    await expect(margin).toContainText('Tính trên 2 chuyến cũ và 1 đơn theo vòng xe.');
    await expect(
      margin.getByRole('table', { name: 'Doanh thu và biên theo nguồn' }).getByRole('row', {
        name: /Chuyến cũ/,
      }),
    ).toContainText('23.000.000');
    await expect(margin).toContainText('2 đơn sinh từ chuyến cũ đã tính qua chuyến');

    await margin.getByRole('link', { name: 'Xem từng đơn và chuyến →' }).click();
    await expect(page).toHaveURL(/\?section=margin$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Hiệu quả từng chuyến' }),
    ).toBeVisible();
  });
});
