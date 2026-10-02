export interface PendingArOrder {
  readonly orderId: string;
  readonly orderCode: string;
  readonly customerId: string;
  readonly proposedAmount: number;
  readonly currencyCode: string;
  readonly businessDate: string;
}

export interface CustomerArSummaryView {
  readonly asOf: string;
  readonly customerId: string | null;
  readonly pendingReconciliationAmount: number;
  readonly officialReceivableAmount: number;
  readonly outstandingAmount: number;
  readonly notYetDueAmount: number;
  readonly dueAmount: number;
  readonly overdueAmount: number;
  readonly paidAmount: number;
  readonly unallocatedCreditAmount: number;
  readonly receivables: readonly {
    /** Lan xac nhan doi soat da sinh ra chung tu nay — `orderId` la duong ve MA DON doc duoc. */
    readonly reconciliation: { readonly orderId: string } | null;
    readonly documentId: string;
    readonly customerId: string;
    readonly currencyCode: string;
    readonly grossAmount: number;
    readonly allocatedAmount: number;
    readonly outstandingAmount: number;
    readonly dueDate: string | null;
    readonly status: 'NOT_YET_DUE' | 'DUE' | 'OVERDUE' | 'PAID';
  }[];
  readonly payments: readonly {
    readonly payment: {
      readonly id: string;
      readonly customerId: string;
      readonly amount: number;
      readonly currencyCode: string;
      readonly receivedAt: string;
      readonly businessDate: string;
      readonly externalRef: string | null;
      readonly note: string | null;
      readonly recordedBy: string;
      readonly sourceId: string;
      readonly sourceFingerprint: string;
      readonly createdAt: string;
    };
    readonly allocations: readonly unknown[];
    readonly allocatedAmount: number;
    readonly unallocatedAmount: number;
  }[];
}

/** Mot khach trong danh muc — chi hai truong ma man hinh can de hien TEN thay cho ID. */
export interface CustomerNameRef {
  readonly id: string;
  readonly name: string;
}

/** Mot don — de doi `orderId` trong chung tu phai thu ra MA DON ma ke toan doc duoc. */
export interface OrderCodeRef {
  readonly id: string;
  readonly code: string;
}

/** Mot lua chon trong o chon tien: nhan doc duoc, ID chi nam trong `value`. */
export interface PaymentChoice {
  readonly id: string;
  readonly label: string;
  readonly customerId: string;
  readonly currencyCode: string;
  readonly unallocatedAmount: number;
}

/** Mot lua chon trong o chon chung tu phai thu. */
export interface ReceivableChoice {
  readonly documentId: string;
  readonly label: string;
  readonly customerId: string;
  readonly currencyCode: string;
  readonly outstandingAmount: number;
}

export interface CustomerReconciliationBatchView {
  readonly id: string;
  readonly customerId: string;
  readonly currencyCode: string;
  readonly status: string;
  readonly lines: readonly {
    readonly id: string;
    readonly orderId: string;
    readonly orderCode: string;
    readonly proposedAmount: number;
    readonly currencyCode: string;
    readonly state: 'PENDING' | 'CONFIRMED' | 'DEFERRED';
    readonly resolutionReason: string | null;
    readonly reconciliationId: string | null;
  }[];
}

const money = (amount: number, currencyCode: string): string =>
  `${new Intl.NumberFormat('vi-VN').format(amount)} ${currencyCode}`;

/**
 * NGAY NGHIEP VU dang `YYYY-MM-DD` doi sang `DD/MM/YYYY`.
 *
 * Co y KHONG dung `Date` va `toLocaleDateString`: mot chuoi ISO kem gio se doi ngay theo mui gio
 * cua MAY dang mo man hinh, nen cung mot phieu thu se doc ra hai ngay khac nhau o hai may. Ngay
 * nghiep vu la mot chuoi, va no phai duoc hien dung nhu no duoc ghi.
 */
const dayLabel = (businessDate: string): string => {
  const parts = businessDate.slice(0, 10).split('-');
  if (parts.length !== 3) return businessDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

/** KHONG bao gio roi ve chinh `customerId`: mot `cuid` tren man hinh la mot nhan vo nghia. */
const UNKNOWN_CUSTOMER = 'Khách không còn trong danh mục';

/**
 * Danh ba khach CHUA co trong tay (chua duoc cap quyen xem, hoac dang doc) — khac han "khong con
 * trong danh muc": khong duoc noi mot dieu ve danh muc ma man hinh chua doc (`#395`).
 */
const UNREAD_CUSTOMER = 'Khách hàng chưa đọc được tên';

/** Chung tu phai thu chua gan duoc ve mot don — van chon duoc, nhung noi that la khong co ma don. */
const UNLINKED_ORDER = 'Chứng từ chưa gắn đơn';

/** Danh sach don CHUA co trong tay — ma don chua doc duoc, khong phai "chua gan don". */
const UNREAD_ORDER = 'Đơn chưa đọc được mã';

const RECEIVABLE_STATUS_LABELS = {
  NOT_YET_DUE: 'chưa đến hạn',
  DUE: 'đến hạn',
  OVERDUE: 'quá hạn',
  PAID: 'đã thu đủ',
} as const;

/**
 * TRANG THAI CUA MOT LO va CUA MOT DONG TRONG LO — doi ra chu Viet.
 *
 * `OPEN`/`PENDING` la tu vung cua kho du lieu. Chung tung duoc dan thang len man hinh canh nhung
 * dong tieng Viet khac, va mot nguoi doc `PENDING` khong biet do la "chua ai quyet" hay "dang gui
 * di" — hai nghia dan toi hai viec khac nhau.
 *
 * Roi ve CHINH chuoi goc khi gap mot gia tri chua biet: mot ma la, du kho doc, van that hon mot
 * cau tieng Viet doan mo.
 */
const BATCH_STATUS_LABELS: Readonly<Record<string, string>> = {
  OPEN: 'Đang mở',
  CLOSED: 'Đã chốt',
};

const BATCH_LINE_STATE_LABELS: Readonly<Record<string, string>> = {
  PENDING: 'Chờ quyết',
  CONFIRMED: 'Đã chốt số',
  DEFERRED: 'Đã hoãn',
};

const labelOf = (labels: Readonly<Record<string, string>>, code: string): string =>
  labels[code] ?? code;

/**
 * SO CONG NO CUA KE TOAN, va mot luat duy nhat ve NHAN.
 *
 * ==============================================================================================
 * MOT ID KHONG PHAI MOT NHAN NGHIEP VU
 * ==============================================================================================
 *
 * Ke toan chon KHACH bang ten, chon TIEN bang so tien + ngay nhan, chon CHUNG TU PHAI THU bang ma
 * don + so con lai. `customerId`, `payment.id` va `documentId` la `cuid` cua kho du lieu: chung
 * chi duoc phep nam trong `value` cua mot o chon, khong bao gio la thu nguoi dung phai GO VAO.
 * Mot ban UAT bat chu doanh nghiep mo DevTools de chep mot `cuid` la mot ban UAT khong chay duoc.
 *
 * Vi the cac ham duoi day tra ve `label` DA GHEP SAN. Ghep nhan trong tep nay chu khong trong
 * component de mot bai test doc duoc dung cau ma nguoi dung se doc — va de hai man hinh khong bao
 * gio ghep ra hai cach goi khac nhau cho cung mot dong tien.
 */
export function toCustomerArWorkspace(input: {
  readonly asOf: string;
  readonly pending: readonly PendingArOrder[];
  readonly batches: readonly CustomerReconciliationBatchView[];
  readonly summary: CustomerArSummaryView;
  readonly customers?: readonly CustomerNameRef[];
  readonly orders?: readonly OrderCodeRef[];
}) {
  const customerNameOf = (customerId: string): string =>
    input.customers === undefined
      ? UNREAD_CUSTOMER
      : (input.customers.find((customer) => customer.id === customerId)?.name ?? UNKNOWN_CUSTOMER);
  const orderCodeOf = (orderId: string | null): string =>
    orderId === null
      ? UNLINKED_ORDER
      : input.orders === undefined
        ? UNREAD_ORDER
        : (input.orders.find((order) => order.id === orderId)?.code ?? UNLINKED_ORDER);
  const currencies = new Map<
    string,
    {
      outstanding: number;
      notYetDue: number;
      due: number;
      overdue: number;
      paid: number;
      credit: number;
    }
  >();
  const ensure = (code: string) => {
    const found = currencies.get(code);
    if (found !== undefined) return found;
    const created = { outstanding: 0, notYetDue: 0, due: 0, overdue: 0, paid: 0, credit: 0 };
    currencies.set(code, created);
    return created;
  };

  for (const receivable of input.summary.receivables) {
    const group = ensure(receivable.currencyCode);
    group.outstanding += receivable.outstandingAmount;
    group.paid += receivable.allocatedAmount;
    if (receivable.status === 'NOT_YET_DUE') group.notYetDue += receivable.outstandingAmount;
    if (receivable.status === 'DUE') group.due += receivable.outstandingAmount;
    if (receivable.status === 'OVERDUE') group.overdue += receivable.outstandingAmount;
  }
  for (const payment of input.summary.payments) {
    ensure(payment.payment.currencyCode).credit += payment.unallocatedAmount;
  }
  for (const pending of input.pending) ensure(pending.currencyCode);

  if (currencies.size === 1) {
    const only = [...currencies.values()][0];
    if (only !== undefined) {
      only.outstanding = input.summary.outstandingAmount;
      only.notYetDue = input.summary.notYetDueAmount;
      only.due = input.summary.dueAmount;
      only.overdue = input.summary.overdueAmount;
      only.paid = input.summary.paidAmount;
      only.credit = input.summary.unallocatedCreditAmount;
    }
  }

  const currencyGroups = [...currencies.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currencyCode, group]) => ({
      currencyCode,
      outstandingLabel: money(group.outstanding, currencyCode),
      notYetDueLabel: money(group.notYetDue, currencyCode),
      dueLabel: money(group.due, currencyCode),
      overdueLabel: money(group.overdue, currencyCode),
      paidLabel: money(group.paid, currencyCode),
      unallocatedCreditLabel: money(group.credit, currencyCode),
    }));

  const primaryCurrency =
    currencyGroups[0]?.currencyCode ?? input.pending[0]?.currencyCode ?? 'VND';
  /**
   * CHI nhung khoan tien CON CHUA PHAN BO. Mot khoan da phan bo het van nam trong so, nhung dua no
   * vao o chon la moi ke toan lam mot viec ma may chu se tu choi.
   */
  const paymentChoices: readonly PaymentChoice[] = input.summary.payments
    .filter((entry) => entry.unallocatedAmount > 0)
    .map((entry) => ({
      id: entry.payment.id,
      customerId: entry.payment.customerId,
      currencyCode: entry.payment.currencyCode,
      unallocatedAmount: entry.unallocatedAmount,
      label: [
        customerNameOf(entry.payment.customerId),
        money(entry.payment.amount, entry.payment.currencyCode),
        `nhận ${dayLabel(entry.payment.businessDate)}`,
        `còn ${money(entry.unallocatedAmount, entry.payment.currencyCode)} chưa phân bổ`,
        ...(entry.payment.externalRef === null ? [] : [entry.payment.externalRef]),
      ].join(' · '),
    }));

  /** Cung mot le: chi chung tu CON PHAI THU moi la mot dich phan bo hop le. */
  const receivableChoices: readonly ReceivableChoice[] = input.summary.receivables
    .filter((entry) => entry.outstandingAmount > 0)
    .map((entry) => ({
      documentId: entry.documentId,
      customerId: entry.customerId,
      currencyCode: entry.currencyCode,
      outstandingAmount: entry.outstandingAmount,
      label: [
        orderCodeOf(entry.reconciliation?.orderId ?? null),
        customerNameOf(entry.customerId),
        `còn ${money(entry.outstandingAmount, entry.currencyCode)}`,
        entry.dueDate === null
          ? RECEIVABLE_STATUS_LABELS[entry.status]
          : `${RECEIVABLE_STATUS_LABELS[entry.status]} (hạn ${dayLabel(entry.dueDate)})`,
      ].join(' · '),
    }));

  return {
    pendingRows: input.pending.map((row) => ({
      ...row,
      customerName: customerNameOf(row.customerId),
      /*
       * NGAY va SO TIEN da thanh chu o day, khong o component.
       *
       * Bang "Don cho doi soat" tung in thang `row.businessDate`, nen no hien `2026-09-17` trong
       * khi bang tuoi no ngay duoi hien `17/09/2026` — hai kieu ngay tren cung mot man hinh, va
       * kieu dung la kieu ke toan doc.
       */
      businessDateLabel: dayLabel(row.businessDate),
      proposedAmountLabel: money(row.proposedAmount, row.currencyCode),
    })),
    batches: input.batches.map((batch) => ({
      ...batch,
      customerName: customerNameOf(batch.customerId),
      statusLabel: labelOf(BATCH_STATUS_LABELS, batch.status),
      lines: batch.lines.map((line) => ({
        ...line,
        stateLabel: labelOf(BATCH_LINE_STATE_LABELS, line.state),
        proposedAmountLabel: money(line.proposedAmount, line.currencyCode),
      })),
    })),
    paymentChoices,
    receivableChoices,
    customerNameOf,
    currencyGroups,
    combinedTotalsAllowed: currencyGroups.length <= 1,
    pendingAmountLabel:
      currencyGroups.length <= 1
        ? money(input.summary.pendingReconciliationAmount, primaryCurrency)
        : null,
    officialAmountLabel:
      currencyGroups.length <= 1
        ? money(input.summary.officialReceivableAmount, primaryCurrency)
        : null,
  };
}
