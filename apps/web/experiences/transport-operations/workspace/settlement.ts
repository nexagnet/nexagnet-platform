import {
  AGING_BUCKET_LABEL,
  agingBucketTone,
  EMPTY_VALUE,
  entityLabel,
  formatBusinessDate,
  formatCount,
  formatInstant,
  formatMoney,
  SETTLEMENT_DOCUMENT_KIND_LABEL,
  SETTLEMENT_DOCUMENT_STATUS_LABEL,
  SETTLEMENT_FLOW_LABEL,
  unresolvedReference,
  type StatusTone,
} from '../customer-view';
import type {
  AgingBucket,
  ApByCounterpartyRow,
  ArAgingReport,
  PartnerPosition,
  SettlementDocument,
  SettlementDocumentChain,
  SettlementFlow,
  TransportCustomer,
  TransportPartner,
} from '../transport-types';

/**
 * KHUNG NHIN cua `TX-05`. KHONG mot phep tinh tien nao o day.
 *
 * Moi con so tren man hinh quyet toan den nguyen tu may chu: tuoi no, cong no phai tra, vi the doi
 * tac, bien truc tiep va cong don deu do `SettlementReadService` tinh. Tep nay chi doi ma thanh
 * chu, chia nhom, va noi ro nhung cho du lieu KHONG co.
 *
 * Phep thu khi phan van, giong `customer-view.ts`: bo tep nay di thi so lieu co SAI khong, hay chi
 * kho doc hon? Neu sai thi mot phep tinh tien da lot vao day va no phai di ra.
 */

/* ------------------------------------------------------------------ *
 * Danh ba — doi `id` thanh TEN nguoi doc nhan ra
 * ------------------------------------------------------------------ */

/**
 * `counterpartyId` la mot `id` KY THUAT. #161 §7 cam lay no lam nhan chinh, nen moi bang o day
 * phai tra cuu qua danh ba da tai ve. Khong tim thay thi noi ro la chua doc duoc ten — KHONG dan
 * `uuid` len man hinh nhu the do la ten cong ty.
 */
export interface SettlementDirectory {
  readonly customers: ReadonlyMap<string, string>;
  readonly partners: ReadonlyMap<string, string>;
}

export const toSettlementDirectory = (input: {
  readonly customers: readonly TransportCustomer[];
  readonly partners: readonly TransportPartner[];
}): SettlementDirectory => ({
  customers: new Map(input.customers.map((row) => [row.id, row.name])),
  partners: new Map(input.partners.map((row) => [row.id, row.name])),
});

const counterpartyLabel = (
  directory: SettlementDirectory,
  id: string,
  flow: SettlementFlow,
): string => {
  const fromCustomers = directory.customers.get(id);
  if (fromCustomers !== undefined) {
    return entityLabel(fromCustomers, unresolvedReference('Khách hàng'));
  }
  const fromPartners = directory.partners.get(id);
  if (fromPartners !== undefined) return entityLabel(fromPartners, unresolvedReference('Đối tác'));
  return unresolvedReference(flow === 'CUSTOMER_FREIGHT' ? 'Khách hàng' : 'Đối tác');
};

/* ------------------------------------------------------------------ *
 * Tuoi no phai thu
 * ------------------------------------------------------------------ */

export interface ArAgingRowModel {
  readonly documentId: string;
  readonly counterpartyLabel: string;
  readonly businessDateLabel: string;
  readonly dueDateLabel: string;
  readonly outstandingLabel: string;
  readonly daysOverdue: number;
  readonly bucketLabel: string;
  readonly tone: StatusTone;
}

export interface ArAgingBucketTotal {
  readonly bucket: AgingBucket;
  readonly label: string;
  readonly amountLabel: string;
  readonly tone: StatusTone;
}

export interface ArAgingModel {
  readonly asOfLabel: string;
  readonly rows: readonly ArAgingRowModel[];
  readonly buckets: readonly ArAgingBucketTotal[];
  readonly outstandingLabel: string;
  readonly overdueLabel: string;
  /** Cau tom tat de doc thanh tieng, khong phai mot con so tran. */
  readonly headline: string;
}

const BUCKET_ORDER: readonly AgingBucket[] = ['CURRENT', 'D1_30', 'D31_60', 'D60_PLUS'];

export const toArAging = (
  report: ArAgingReport | null,
  directory: SettlementDirectory,
): ArAgingModel => {
  if (report === null) {
    return {
      asOfLabel: EMPTY_VALUE,
      rows: [],
      buckets: [],
      outstandingLabel: EMPTY_VALUE,
      overdueLabel: EMPTY_VALUE,
      headline: 'Chưa đọc được số liệu công nợ phải thu.',
    };
  }

  const rows = report.rows.map((row) => ({
    documentId: row.documentId,
    counterpartyLabel: counterpartyLabel(directory, row.counterpartyId, 'CUSTOMER_FREIGHT'),
    businessDateLabel: formatBusinessDate(row.businessDate),
    dueDateLabel: formatBusinessDate(row.dueDate),
    outstandingLabel: formatMoney(row.outstandingAmount),
    daysOverdue: row.daysOverdue,
    bucketLabel: AGING_BUCKET_LABEL[row.bucket],
    tone: agingBucketTone(row.bucket),
  }));

  const overdueCount = report.rows.filter((row) => row.daysOverdue > 0).length;
  return {
    asOfLabel: formatBusinessDate(report.asOf),
    rows,
    buckets: BUCKET_ORDER.map((bucket) => ({
      bucket,
      label: AGING_BUCKET_LABEL[bucket],
      amountLabel: formatMoney(report.totalsByBucket[bucket]),
      tone: agingBucketTone(bucket),
    })),
    outstandingLabel: formatMoney(report.outstandingTotal),
    overdueLabel: formatMoney(report.overdueTotal),
    headline:
      report.rows.length === 0
        ? `Không có công nợ phải thu nào tính đến ${formatBusinessDate(report.asOf)}.`
        : `${formatCount(report.rows.length)} chứng từ còn nợ, trong đó ${formatCount(overdueCount)} đã quá hạn.`,
  };
};

/* ------------------------------------------------------------------ *
 * Cong no phai tra — theo TUNG DONG
 * ------------------------------------------------------------------ */

export interface ApRowModel {
  readonly counterpartyId: string;
  readonly counterpartyLabel: string;
  readonly documentCountLabel: string;
  readonly outstandingLabel: string;
}

export interface ApFlowModel {
  readonly flow: SettlementFlow;
  readonly flowLabel: string;
  readonly rows: readonly ApRowModel[];
  readonly totalLabel: string;
  readonly isEmpty: boolean;
}

/**
 * MOT dong, MOT bang. Khong co ham nao gop bon dong lai — do la `GD-15` viet thanh mot su that
 * trong code: "cong ty no ai bao nhieu" chi co nghia khi biet no AI, va mot tong bon dong tra loi
 * mot cau hoi khong ai hoi.
 */
export const toApFlow = (
  flow: SettlementFlow,
  rows: readonly ApByCounterpartyRow[] | null,
  directory: SettlementDirectory,
): ApFlowModel => {
  const safe = rows ?? [];
  const total = safe.reduce((sum, row) => sum + row.outstandingAmount, 0);
  return {
    flow,
    flowLabel: SETTLEMENT_FLOW_LABEL[flow],
    rows: safe.map((row) => ({
      counterpartyId: row.counterpartyId,
      counterpartyLabel: counterpartyLabel(directory, row.counterpartyId, flow),
      documentCountLabel: formatCount(row.documentCount),
      outstandingLabel: formatMoney(row.outstandingAmount),
    })),
    totalLabel: formatMoney(total),
    isEmpty: safe.length === 0,
  };
};

/* ------------------------------------------------------------------ *
 * Vi the doi tac — HAI CHIEU canh nhau
 * ------------------------------------------------------------------ */

export interface PartnerPositionModel {
  readonly partnerLabel: string;
  readonly receivableLabel: string;
  readonly carrierPayableLabel: string;
  readonly commissionPayableLabel: string;
  readonly netDisplayLabel: string;
  /** Cau BAT BUOC hien canh `netDisplay`. Bo no di la bien mot cot xem thanh mot so du. */
  readonly netDisclosure: string;
}

/**
 * `netDisplay` la mot cot HIEN THI. No khong ton tai trong bang nao, khong ai tra tien theo no, va
 * cau canh no khong duoc bo — nguon CAM bu tru phap ly (`GD-15`). Ba con so goc luon di kem.
 */
export const NET_DISPLAY_DISCLOSURE =
  'Số ròng chỉ để xem — hai chiều vẫn thanh toán riêng, không bù trừ.';

export const toPartnerPosition = (
  position: PartnerPosition | null,
  directory: SettlementDirectory,
): PartnerPositionModel | null =>
  position === null
    ? null
    : {
        partnerLabel: counterpartyLabel(directory, position.partnerId, 'CARRIER_SERVICE'),
        receivableLabel: formatMoney(position.receivableAmount),
        carrierPayableLabel: formatMoney(position.carrierPayableAmount),
        commissionPayableLabel: formatMoney(position.commissionPayableAmount),
        netDisplayLabel: formatMoney(position.netDisplay),
        netDisclosure: NET_DISPLAY_DISCLOSURE,
      };

/* ------------------------------------------------------------------ *
 * Chuoi chung tu — LICH SU SUA mot con so tien
 * ------------------------------------------------------------------ */

export interface SettlementDocumentRowModel {
  readonly id: string;
  readonly kindLabel: string;
  readonly statusLabel: string;
  readonly amountLabel: string;
  readonly businessDateLabel: string;
  readonly dueDateLabel: string;
  readonly invoiceRef: string | null;
  readonly note: string | null;
  readonly createdAtLabel: string;
}

export interface SettlementAllocationRowModel {
  readonly id: string;
  readonly amountLabel: string;
  readonly businessDateLabel: string;
  readonly method: string;
  readonly note: string | null;
}

export interface DocumentChainModel {
  readonly flowLabel: string;
  readonly counterpartyLabel: string;
  readonly grossLabel: string;
  readonly outstandingLabel: string;
  readonly documents: readonly SettlementDocumentRowModel[];
  readonly allocations: readonly SettlementAllocationRowModel[];
  /** Cau noi ro so du doc tu CA CHUOI, khong doc tren ban goc. */
  readonly note: string;
}

export const DOCUMENT_CHAIN_NOTE =
  'Số dư đọc trên cả chuỗi: chứng từ gốc cộng mọi bản điều chỉnh và đảo, trừ các lần phân bổ tiền.';

const toDocumentRow = (document: SettlementDocument): SettlementDocumentRowModel => ({
  id: document.id,
  kindLabel: SETTLEMENT_DOCUMENT_KIND_LABEL[document.kind],
  statusLabel: SETTLEMENT_DOCUMENT_STATUS_LABEL[document.status],
  amountLabel: formatMoney(document.signedAmount),
  businessDateLabel: formatBusinessDate(document.businessDate),
  dueDateLabel: formatBusinessDate(document.dueDate),
  invoiceRef: document.invoiceRef,
  note: document.note,
  createdAtLabel: formatInstant(document.createdAt),
});

export const toDocumentChain = (
  chain: SettlementDocumentChain | null,
  directory: SettlementDirectory,
): DocumentChainModel | null =>
  chain === null
    ? null
    : {
        flowLabel: SETTLEMENT_FLOW_LABEL[chain.original.flow],
        counterpartyLabel: counterpartyLabel(
          directory,
          chain.original.counterpartyId,
          chain.original.flow,
        ),
        grossLabel: formatMoney(chain.grossAmount),
        outstandingLabel: formatMoney(chain.outstandingAmount),
        documents: [chain.original, ...chain.corrections].map(toDocumentRow),
        allocations: chain.allocations.map((allocation) => ({
          id: allocation.id,
          amountLabel: formatMoney(allocation.amount),
          businessDateLabel: formatBusinessDate(allocation.businessDate),
          method: allocation.method,
          note: allocation.note,
        })),
        note: DOCUMENT_CHAIN_NOTE,
      };
