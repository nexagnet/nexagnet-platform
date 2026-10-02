'use client';

import type { TransportCustomer } from '../../transport-types';
import type { OrderDetailsDraft } from '../../workspace/order-draft';

/**
 * THONG TIN DON (`#379`) — cac truong thuong mai, sau khi hai diem da chot.
 *
 * KHACH HANG va CUOC la BAT BUOC o day, va do khong phai mot lua chon ve giao dien. May chu cho phep
 * ca hai truong rong luc tao don — dung, vi mot don noi bo chua chot gia van phai ghi duoc. Nhung so
 * cong no chi nhan mot don vao "cho doi soat" khi don DONG THOI da `FULFILLED`, ket thuc thuong mai
 * `APPROVED`, co `customerId` va co `freightAmount`. Thieu mot trong hai thi don chay xong roi DUNG
 * mai truoc cua doi soat — khong mot man hinh nao bao loi. Nen mot don tao tu day LUON di het duong.
 *
 * Nut gui KHONG nam trong form nay: no dinh o day cot phieu (may ban) hoac day man hinh (dien thoai)
 * va noi vao form qua thuoc tinh `form` — Enter trong mot o van gui, va nut khoa thi Enter cung khoa.
 */
export function OrderFacts({
  formId,
  details,
  customers,
  isCustomersLoading,
  onChange,
  onSubmit,
}: {
  readonly formId: string;
  readonly details: OrderDetailsDraft;
  readonly customers: readonly TransportCustomer[];
  readonly isCustomersLoading: boolean;
  readonly onChange: (patch: Partial<OrderDetailsDraft>) => void;
  readonly onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}): React.ReactElement {
  return (
    <form id={formId} className="tx-composer__facts" aria-label="Tạo đơn hàng" onSubmit={onSubmit}>
      <h2 className="tx-composer__facts-title">Thông tin đơn</h2>
      <div className="tx-composer__grid">
        <label className="tx-field">
          <span>Mã đơn</span>
          <input
            name="code"
            value={details.code}
            onChange={(event) => onChange({ code: event.target.value })}
            autoComplete="off"
            required
          />
        </label>
        <label className="tx-field">
          <span>Ngày vận hành</span>
          <input
            name="businessDate"
            type="date"
            value={details.businessDate}
            onChange={(event) => onChange({ businessDate: event.target.value })}
            required
          />
        </label>
        <label className="tx-field tx-composer__wide">
          <span>Khách hàng</span>
          <select
            name="customerId"
            value={details.customerId}
            onChange={(event) => onChange({ customerId: event.target.value })}
            required
          >
            <option value="">
              {isCustomersLoading ? 'Đang tải danh mục khách…' : '— Chọn khách hàng —'}
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tx-field">
          <span>Cước (đ)</span>
          {/* KHONG dat `step`: moc buoc tinh tu `min`, nen `min=1 step=1000` lam trinh duyet coi
              5.000.000 la khong hop le va NUOT lan bam gui — khong mot thong bao nao cua ta. */}
          <input
            name="freightAmount"
            type="number"
            min="1"
            inputMode="numeric"
            value={details.freightAmount}
            onChange={(event) => onChange({ freightAmount: event.target.value })}
            required
          />
        </label>
        <label className="tx-field">
          <span>Hàng hoá (tuỳ chọn)</span>
          <input
            name="cargoDescription"
            value={details.cargoDescription}
            onChange={(event) => onChange({ cargoDescription: event.target.value })}
            autoComplete="off"
          />
        </label>
      </div>
      {!isCustomersLoading && customers.length === 0 ? (
        <p className="tx-note tx-note--warn">
          Chưa có khách hàng nào đang hoạt động trong danh mục, nên chưa tạo được đơn thương mại.
          Thêm khách ở mục Khách hàng trước.
        </p>
      ) : null}
    </form>
  );
}
