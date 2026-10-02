'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ConfirmAction, ErrorState } from '../components/SectionState';
import { COMPLIANCE_DOCUMENT_TYPE_LABEL, COMPLIANCE_SUBJECT_LABEL } from '../customer-view';
import { canPerform, type TransportViewerInput } from '../transport-actions';
import { transportApi } from '../transport-api';
import {
  COMPLIANCE_DOCUMENT_TYPES,
  COMPLIANCE_SUBJECT_KINDS,
  type ComplianceDocumentType,
  type ComplianceSubjectKind,
  type Driver,
  type MaintenanceWorkOrder,
  type Vehicle,
} from '../transport-types';

/**
 * BE MAT LENH cua Bao duong & giay to.
 *
 * Truoc ban nay man do DOC DUOC MOI THU va LAM DUOC KHONG GI: den han, lenh sua chua, giay to,
 * canh bao — tat ca chi de nhin. Mot man hinh bao "xe nay den han thay dau" ma khong co nut mo
 * lenh sua chua thi viec that van phai lam o cho khac.
 *
 * ==============================================================================================
 * MAY CHU TINH DEN HAN, MAN HINH KHONG TINH LAI — `#170 §4.B`
 *
 * Khong mot dong nao o day suy ra "con bao nhieu km nua thi den han" hay "giay to nay sap het
 * han". Nhung con so do den tu `/maintenance/due` va `/compliance/alerts`. Cai duy nhat man hinh
 * lam la GUI LENH roi doc lai ket qua.
 *
 * ==============================================================================================
 * SUA CHUA DOC DUONG KHONG PHAI MOT LENH SUA CHUA
 *
 * Mot khoan chi sua chua doc duong la CHI PHI CHUYEN (`costing.recordExpense`), con lenh sua chua
 * la ban ghi cua doi xe co vong doi rieng. Man nay chi mo/dong lenh sua chua; no khong bao gio
 * ghi mot khoan chi cua chuyen, va nguoc lai.
 */

/**
 * DOC LAI DUNG NHUNG KHOA MA MAN NAY THUC SU DUNG.
 *
 * `['transport', 'assets']` KHONG khop mot truy van nao — cac hook doc theo
 * `['transport','maintenance',…]`, `['transport','compliance',…]`, `['transport','fleet-status']`
 * va `['transport','alerts']`. Mot lan `invalidateQueries` tro nham khoa khong bao loi: no chi
 * lang le khong lam gi, va man hinh dung yen sau khi nguoi dung vua bam mot lenh THANH CONG. Bai
 * E2E `mo lenh sua chua roi hoan tat` bat duoc dung loi do.
 */
const ASSET_QUERY_ROOTS = [
  ['transport', 'maintenance'],
  ['transport', 'compliance'],
  ['transport', 'fleet-status'],
  ['transport', 'alerts'],
] as const;

const invalidateAssets = (queryClient: QueryClient): void => {
  for (const queryKey of ASSET_QUERY_ROOTS) {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
};

export function WorkOrderCommands({
  vehicles,
  viewer,
  onChanged,
}: {
  readonly vehicles: readonly Vehicle[];
  readonly viewer: TransportViewerInput;
  readonly onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [vehicleId, setVehicleId] = useState('');
  const [description, setDescription] = useState('');
  const [openedDate, setOpenedDate] = useState('');
  const [openedOdoKm, setOpenedOdoKm] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const open = useMutation({
    mutationFn: () =>
      transportApi.assets.openWorkOrder({
        vehicleId,
        planId: null,
        description: description.trim(),
        openedDate,
        openedOdoKm: Number(openedOdoKm),
      }),
    onSuccess: () => {
      setFailure(null);
      setDescription('');
      setOpenedOdoKm('');
      invalidateAssets(queryClient);
      onChanged();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  if (!canPerform(viewer, 'transport.maintenance.work_order.open')) return null;

  const ready =
    vehicleId !== '' && description.trim() !== '' && openedDate !== '' && openedOdoKm !== '';

  return (
    <form
      className="tx-inlineform"
      aria-label="Mở lệnh sửa chữa"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) open.mutate();
      }}
    >
      {failure === null ? null : <ErrorState message={failure} />}
      <label className="tx-field tx-field--inline">
        <span>Xe</span>
        <select aria-label="Xe" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="">Chọn xe</option>
          {vehicles.map((row) => (
            <option key={row.id} value={row.id}>
              {row.registrationPlate}
            </option>
          ))}
        </select>
      </label>
      <label className="tx-field tx-field--inline">
        <span>Nội dung</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="tx-field tx-field--inline">
        <span>Ngày mở</span>
        <input type="date" value={openedDate} onChange={(e) => setOpenedDate(e.target.value)} />
      </label>
      <label className="tx-field tx-field--inline">
        <span>Km lúc mở</span>
        <input
          type="number"
          min="0"
          value={openedOdoKm}
          onChange={(e) => setOpenedOdoKm(e.target.value)}
        />
      </label>
      <button type="submit" className="tx-btn tx-btn--go" disabled={!ready || open.isPending}>
        {open.isPending ? 'Đang mở…' : 'Mở lệnh sửa chữa'}
      </button>
    </form>
  );
}

/**
 * HOAN TAT hoac HUY mot lenh sua chua dang mo.
 *
 * Ca hai deu di qua mot buoc xac nhan, va huy con doi LY DO: day la thao tac khong lam lai duoc
 * tren mot ban ghi cua doi xe — dung loai ma #196 §8 doi phai hoi lai.
 */
export function WorkOrderRowActions({
  workOrder,
  vehicleLabel,
  viewer,
  onChanged,
}: {
  readonly workOrder: MaintenanceWorkOrder;
  /**
   * BIEN SO, khong phai `vehicleId`. Bat buoc, va do la co y: khoi nay ve ra MOT LAN CHO MOI lenh
   * dang mo, nen hai lenh dang mo se cho hai hang o nhap GIONG HET NHAU. Khong noi ro hang nao
   * thuoc xe nao thi nguoi van hanh co the go ngay hoan tat cua xe nay vao lenh cua xe kia — va
   * khong co gi tren man hinh ngan ho lai.
   */
  readonly vehicleLabel: string;
  readonly viewer: TransportViewerInput;
  readonly onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<'complete' | 'cancel' | null>(null);
  const [completedDate, setCompletedDate] = useState('');
  const [completedOdoKm, setCompletedOdoKm] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const act = useMutation({
    mutationFn: async (intent: 'complete' | 'cancel') => {
      if (intent === 'cancel') {
        const note = reason.trim();
        if (note.length === 0) throw new Error('Huỷ lệnh sửa chữa thì phải ghi rõ lý do.');
        return transportApi.assets.cancelWorkOrder(workOrder.id, note);
      }
      if (completedDate === '' || completedOdoKm === '') {
        throw new Error('Hoàn tất lệnh sửa chữa cần ngày hoàn tất và số km.');
      }
      return transportApi.assets.completeWorkOrder(workOrder.id, {
        completedDate,
        completedOdoKm: Number(completedOdoKm),
        costAmount: costAmount.trim() === '' ? null : Number(costAmount),
      });
    },
    onSuccess: () => {
      setPending(null);
      setReason('');
      setFailure(null);
      invalidateAssets(queryClient);
      onChanged();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  if (!canPerform(viewer, 'transport.maintenance.work_order.close')) return null;
  if (workOrder.status !== 'OPEN') return null;

  return (
    <>
      {failure === null ? null : <ErrorState message={failure} />}
      <p className="tx-note">
        <strong>{vehicleLabel}</strong> · {workOrder.description}
      </p>
      <div className="tx-rowbtns">
        <label className="tx-field tx-field--inline">
          <span>Ngày hoàn tất</span>
          <input
            type="date"
            value={completedDate}
            onChange={(e) => setCompletedDate(e.target.value)}
          />
        </label>
        <label className="tx-field tx-field--inline">
          <span>Km</span>
          <input
            type="number"
            min="0"
            value={completedOdoKm}
            onChange={(e) => setCompletedOdoKm(e.target.value)}
          />
        </label>
        <label className="tx-field tx-field--inline">
          <span>Chi phí (đồng)</span>
          <input
            type="number"
            min="0"
            value={costAmount}
            onChange={(e) => setCostAmount(e.target.value)}
          />
        </label>
        <button type="button" className="tx-btn" onClick={() => setPending('complete')}>
          Hoàn tất
        </button>
        <button type="button" className="tx-btn tx-btn--stop" onClick={() => setPending('cancel')}>
          Huỷ lệnh
        </button>
      </div>

      <ConfirmAction
        open={pending !== null}
        title={
          pending === 'cancel'
            ? `Huỷ lệnh sửa chữa của ${vehicleLabel}?`
            : `Hoàn tất lệnh sửa chữa của ${vehicleLabel}?`
        }
        detail={
          pending === 'cancel'
            ? 'Lệnh đã huỷ không mở lại được.'
            : 'Ghi nhận ngày, số km và chi phí đã nhập ở trên.'
        }
        confirmLabel={pending === 'cancel' ? 'Huỷ lệnh' : 'Hoàn tất'}
        reasonLabel={pending === 'cancel' ? 'Lý do huỷ' : undefined}
        reason={reason}
        onReasonChange={setReason}
        isDestructive={pending === 'cancel'}
        isBusy={act.isPending}
        onConfirm={() => {
          if (pending !== null) act.mutate(pending);
        }}
        onCancel={() => {
          setPending(null);
          setReason('');
        }}
      />
    </>
  );
}

/**
 * DANG KY MOT GIAY TO.
 *
 * `subjectKind` quyet dinh `subjectId` tro vao XE hay LAI XE, nen o chon doi tuong doi theo no.
 * Han hieu luc (`validFrom`/`validTo`) la thu MAY CHU dung de suy ra canh bao het han; man hinh
 * chi nhap, khong tu danh gia "con han hay khong".
 */
export function ComplianceDocumentForm({
  vehicles,
  drivers,
  viewer,
  onChanged,
}: {
  readonly vehicles: readonly Vehicle[];
  readonly drivers: readonly Driver[];
  readonly viewer: TransportViewerInput;
  readonly onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [subjectKind, setSubjectKind] = useState<ComplianceSubjectKind>('VEHICLE');
  const [subjectId, setSubjectId] = useState('');
  const [documentType, setDocumentType] = useState<ComplianceDocumentType>('VEHICLE_INSPECTION');
  const [documentNo, setDocumentNo] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const register = useMutation({
    mutationFn: () =>
      transportApi.assets.registerComplianceDocument({
        subjectKind,
        subjectId: subjectId === '' ? null : subjectId,
        documentType,
        documentNo: documentNo.trim() === '' ? null : documentNo.trim(),
        validFrom,
        validTo,
      }),
    onSuccess: () => {
      setFailure(null);
      setDocumentNo('');
      invalidateAssets(queryClient);
      onChanged();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  if (!canPerform(viewer, 'transport.compliance.document.manage')) return null;

  const ready = validFrom !== '' && validTo !== '';

  return (
    <form
      className="tx-inlineform"
      aria-label="Đăng ký giấy tờ"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) register.mutate();
      }}
    >
      {failure === null ? null : <ErrorState message={failure} />}
      <label className="tx-field tx-field--inline">
        <span>Áp cho</span>
        <select
          aria-label="Áp cho"
          value={subjectKind}
          onChange={(e) => {
            setSubjectKind(e.target.value as ComplianceSubjectKind);
            setSubjectId('');
          }}
        >
          {COMPLIANCE_SUBJECT_KINDS.map((value) => (
            <option key={value} value={value}>
              {COMPLIANCE_SUBJECT_LABEL[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="tx-field tx-field--inline">
        <span>Đối tượng</span>
        <select
          aria-label="Đối tượng"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
        >
          <option value="">Toàn doanh nghiệp</option>
          {subjectKind === 'DRIVER'
            ? drivers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.fullName}
                </option>
              ))
            : vehicles.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.registrationPlate}
                </option>
              ))}
        </select>
      </label>
      <label className="tx-field tx-field--inline">
        <span>Loại giấy tờ</span>
        <select
          aria-label="Loại giấy tờ"
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value as ComplianceDocumentType)}
        >
          {COMPLIANCE_DOCUMENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {COMPLIANCE_DOCUMENT_TYPE_LABEL[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="tx-field tx-field--inline">
        <span>Số hiệu</span>
        <input value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} />
      </label>
      <label className="tx-field tx-field--inline">
        <span>Hiệu lực từ</span>
        <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
      </label>
      <label className="tx-field tx-field--inline">
        <span>Đến</span>
        <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
      </label>
      <button type="submit" className="tx-btn tx-btn--go" disabled={!ready || register.isPending}>
        {register.isPending ? 'Đang đăng ký…' : 'Đăng ký giấy tờ'}
      </button>
    </form>
  );
}
