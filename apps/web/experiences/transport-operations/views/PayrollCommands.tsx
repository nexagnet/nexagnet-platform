'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ConfirmAction, ErrorState } from '../components/SectionState';
import { canPerform, type TransportViewerInput } from '../transport-actions';
import { transportApi } from '../transport-api';
import type { PayrollPeriod } from '../transport-types';

/**
 * BE MAT LENH cua Luong.
 *
 * Truoc ban nay man Luong DUYET va CHI duoc mot phieu, nhung khong MO duoc ky, khong CHAY duoc
 * lan tinh luong, va khong SUA duoc mot phieu da chot. Tuc vong doi bat dau o giua: phai co san
 * mot ky va mot lan chay do noi khac tao ra thi man hinh moi lam duoc gi.
 *
 * ==============================================================================================
 * MAN HINH KHONG TINH MOT DONG LUONG NAO
 *
 * `POST /transport/payroll/runs` la noi TINH: may chu doc chinh sach va chot mot ban chup cua no
 * cho lan chay. `manualComponents` co y KHONG duoc dien tu dong o day — mot khoan cong/tru chi
 * xuat hien khi con nguoi go no vao. #196 §2.3 noi thang: khong mot khoan tru nao do man hinh
 * tu nghi ra.
 *
 * ==============================================================================================
 * `INV-20` — SUA MOT PHIEU DA CHOT LA PHAT MOT PHIEU MOI
 *
 * Khong co duong nao sua so cu. `correctPayslip` phat mot phieu BU (`SUPPLEMENTAL`) hoac DAO
 * (`REVERSAL`), va ly do la BAT BUOC — mot lan sua tien phai noi duoc vi sao. Man hinh cuong che
 * dieu do truoc khi goi, thay vi de may chu tra 400.
 */
export function PayrollPeriodCommands({
  periods,
  viewer,
  onChanged,
}: {
  readonly periods: readonly PayrollPeriod[];
  readonly viewer: TransportViewerInput;
  readonly onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [closing, setClosing] = useState<PayrollPeriod | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['transport', 'payroll'] });
    onChanged();
  };

  const open = useMutation({
    mutationFn: () => transportApi.payroll.openPeriod({ label: label.trim(), startDate, endDate }),
    onSuccess: () => {
      setFailure(null);
      setLabel('');
      refresh();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  const close = useMutation({
    mutationFn: (period: PayrollPeriod) => transportApi.payroll.closePeriod(period.id),
    onSuccess: () => {
      setClosing(null);
      setFailure(null);
      refresh();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  if (!canPerform(viewer, 'transport.payroll.period.manage')) return null;

  const ready = label.trim() !== '' && startDate !== '' && endDate !== '';
  const openPeriods = periods.filter((row) => row.status === 'OPEN');

  return (
    <>
      {failure === null ? null : <ErrorState message={failure} />}
      <form
        className="tx-inlineform"
        aria-label="Mở kỳ lương"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) open.mutate();
        }}
      >
        <label className="tx-field tx-field--inline">
          <span>Tên kỳ</span>
          <input
            value={label}
            placeholder="Tháng 9/2026"
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label className="tx-field tx-field--inline">
          <span>Từ ngày</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="tx-field tx-field--inline">
          <span>Đến ngày</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <button type="submit" className="tx-btn tx-btn--go" disabled={!ready || open.isPending}>
          {open.isPending ? 'Đang mở…' : 'Mở kỳ lương'}
        </button>
      </form>

      {openPeriods.length === 0 ? null : (
        <div className="tx-rowbtns">
          {openPeriods.map((period) => (
            <button
              key={period.id}
              type="button"
              className="tx-btn tx-btn--stop"
              onClick={() => setClosing(period)}
            >
              Chốt kỳ {period.label}
            </button>
          ))}
        </div>
      )}

      <ConfirmAction
        open={closing !== null}
        title={closing === null ? '' : `Chốt kỳ lương ${closing.label}?`}
        detail="Kỳ đã chốt không nhận thêm lần chạy nào. Phiếu đã chốt chỉ sửa được bằng phiếu bù hoặc phiếu đảo."
        confirmLabel="Chốt kỳ"
        isDestructive
        isBusy={close.isPending}
        onConfirm={() => {
          if (closing !== null) close.mutate(closing);
        }}
        onCancel={() => setClosing(null)}
      />
    </>
  );
}

/**
 * CHAY MOT LAN TINH LUONG cho ky dang mo.
 *
 * Khong truyen `manualComponents`: mot lan chay khong kem khoan nhap tay nao la mot lan chay
 * THUAN theo chinh sach cua may chu. Do la hanh vi dung cho buoc nay; khoan cong/tru nhap tay la
 * mot viec rieng, va no khong duoc lang le xuat hien vi man hinh tu dien.
 */
export function PayrollRunCommand({
  periodId,
  periodStatus,
  viewer,
  onChanged,
}: {
  readonly periodId: string;
  readonly periodStatus: PayrollPeriod['status'];
  readonly viewer: TransportViewerInput;
  readonly onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: () => transportApi.payroll.run({ periodId }),
    onSuccess: () => {
      setPending(false);
      setFailure(null);
      void queryClient.invalidateQueries({ queryKey: ['transport', 'payroll'] });
      onChanged();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  if (!canPerform(viewer, 'transport.payroll.run')) return null;

  return (
    <>
      {failure === null ? null : <ErrorState message={failure} />}
      <div className="tx-rowbtns">
        <button
          type="button"
          className="tx-btn tx-btn--go"
          disabled={periodStatus !== 'OPEN' || run.isPending}
          title={periodStatus === 'OPEN' ? undefined : 'Kỳ đã chốt, không chạy thêm được.'}
          onClick={() => setPending(true)}
        >
          {run.isPending ? 'Đang tính…' : 'Chạy tính lương'}
        </button>
      </div>

      <ConfirmAction
        open={pending}
        title="Chạy tính lương cho kỳ này?"
        detail="Máy chủ tính theo chính sách và chốt một bản chụp của chính sách đó cho lần chạy."
        confirmLabel="Chạy tính lương"
        isBusy={run.isPending}
        onConfirm={() => run.mutate()}
        onCancel={() => setPending(false)}
      />
    </>
  );
}

/**
 * PHAT PHIEU BU / PHIEU DAO cho mot phieu da chot.
 *
 * Hien theo co `canCorrect` cua `PayslipRow` — dung mot nguon voi hai nut Duyet/Tra o canh, nen
 * ba nut khong bao gio noi ba dieu khac nhau ve cung mot phieu. Ly do la bat buoc, va no duoc
 * kiem o day de nguoi dung thay cau nhac ngay canh o nhap thay vi mot ma loi tu may chu.
 */
export function PayslipCorrection({
  payslipId,
  canCorrect,
  viewer,
  onChanged,
}: {
  readonly payslipId: string;
  /**
   * Co CUA VONG DOI, do `toPayslipRow` suy tu trang thai o may chu — khong phai mot phep so sanh
   * lam lai o day. Mot phieu con `DRAFT` thi sua bang cach chay lai, khong phat phieu bu.
   */
  readonly canCorrect: boolean;
  readonly viewer: TransportViewerInput;
  readonly onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<'SUPPLEMENTAL' | 'REVERSAL'>('SUPPLEMENTAL');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const correct = useMutation({
    mutationFn: () => {
      const note = reason.trim();
      if (note.length === 0) throw new Error('Phát phiếu bù hoặc phiếu đảo thì phải ghi lý do.');
      return transportApi.payroll.correctPayslip(payslipId, { kind, reason: note });
    },
    onSuccess: () => {
      setPending(false);
      setReason('');
      setFailure(null);
      void queryClient.invalidateQueries({ queryKey: ['transport', 'payroll'] });
      onChanged();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  if (!canPerform(viewer, 'transport.payroll.run')) return null;
  if (!canCorrect) return null;

  return (
    <div className="tx-detail__block">
      <h3>Sửa phiếu đã chốt</h3>
      <p className="tx-note">
        Sổ đã ghi không sửa được. Sai sót được xử lý bằng một phiếu bù hoặc một phiếu đảo mới.
      </p>
      {failure === null ? null : <ErrorState message={failure} />}
      <div className="tx-inlineform">
        <label className="tx-field tx-field--inline">
          <span>Loại phiếu</span>
          <select
            aria-label="Loại phiếu"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'SUPPLEMENTAL' | 'REVERSAL')}
          >
            <option value="SUPPLEMENTAL">Phiếu bù</option>
            <option value="REVERSAL">Phiếu đảo</option>
          </select>
        </label>
        <label className="tx-field tx-field--inline">
          <span>Lý do</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button
          type="button"
          className="tx-btn tx-btn--stop"
          disabled={reason.trim() === ''}
          onClick={() => setPending(true)}
        >
          Phát phiếu
        </button>
      </div>

      <ConfirmAction
        open={pending}
        title={kind === 'REVERSAL' ? 'Phát phiếu đảo?' : 'Phát phiếu bù?'}
        detail="Phiếu gốc giữ nguyên. Phiếu mới được ghi thêm vào sổ và đọc được trong lịch sử."
        confirmLabel="Phát phiếu"
        isDestructive={kind === 'REVERSAL'}
        isBusy={correct.isPending}
        onConfirm={() => correct.mutate()}
        onCancel={() => setPending(false)}
      />
    </div>
  );
}
