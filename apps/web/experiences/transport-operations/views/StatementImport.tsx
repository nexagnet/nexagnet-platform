'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { CommandPanel, DataTable } from '../components/primitives';
import { ErrorState } from '../components/SectionState';
import { formatBusinessDate, formatLiters, formatMoney, rejectReasonLabel } from '../customer-view';
import { readUploadAsBase64 } from '../file-base64';
import { canPerform, type TransportViewerInput } from '../transport-actions';
import { transportApi, type ImportStatementInput } from '../transport-api';
import {
  FUEL_STATEMENT_FORMATS,
  type FuelStatementFormat,
  type FuelSupplier,
  type MappedStatementLine,
  type StatementImportPreview,
} from '../transport-types';

/**
 * NHAP BANG KE CUA CAY XANG — xem truoc roi moi nhap.
 *
 * ==============================================================================================
 * VI SAO PHAI CO BUOC XEM TRUOC RIENG
 *
 * `POST /transport/fuel/statements` GHI THAT: no tao bang ke, tao cac dong, VA tao luon mot ky
 * doi soat. Mot tep sai cot hay sai dinh dang ngay se de lai mot ky doi soat rac ma nguoi ta phai
 * di don. `POST .../preview` chay dung phep anh xa do nhung KHONG ghi gi — nen man hinh bat buoc
 * di qua no truoc, va nut nhap that chi mo ra sau khi da co ket qua xem truoc.
 *
 * ==============================================================================================
 * TEP DI TRONG THAN JSON, KHONG PHAI `multipart`
 *
 * Hop dong cua may chu la `contentBase64` trong than JSON. Nen tep duoc doc bang `FileReader` roi
 * cat phan dau `data:...;base64,`. Gioi han ~7.000.000 ky tu base64 duoc kiem O DAY thay vi de
 * may chu tra 413: mot bang ke thang thuong chi vai chuc KB, nen cham tran gan nhu luon la chon
 * nham tep.
 */
export function StatementImport({
  suppliers,
  viewer,
  onImported,
}: {
  readonly suppliers: readonly FuelSupplier[];
  readonly viewer: TransportViewerInput;
  readonly onImported: () => void;
}) {
  const [supplierId, setSupplierId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<FuelStatementFormat>('CSV');
  const [preview, setPreview] = useState<StatementImportPreview | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);

  const buildInput = async (): Promise<ImportStatementInput> => {
    if (file === null) throw new Error('Chưa chọn tệp bảng kê.');
    // Doc tep + kiem tran o MOT cho — xem `file-base64.ts`.
    const contentBase64 = await readUploadAsBase64(file);
    return { supplierId, periodStart, periodEnd, filename: file.name, format, contentBase64 };
  };

  const runPreview = useMutation({
    mutationFn: async () => transportApi.fuel.previewStatement(await buildInput()),
    onSuccess: (result) => {
      setFailure(null);
      setImported(null);
      setPreview(result);
    },
    onError: (error: Error) => {
      setPreview(null);
      setFailure(error.message);
    },
  });

  const runImport = useMutation({
    mutationFn: async () => transportApi.fuel.importStatement(await buildInput()),
    onSuccess: (result) => {
      setFailure(null);
      setPreview(result.preview);
      setImported(
        `Đã nhập ${result.lines.length} dòng và mở kỳ đối soát ${formatBusinessDate(
          result.reconciliation.periodStart,
        )} – ${formatBusinessDate(result.reconciliation.periodEnd)}.`,
      );
      onImported();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  if (!canPerform(viewer, 'transport.fuel.statement.import')) return null;

  const ready = supplierId !== '' && periodStart !== '' && periodEnd !== '' && file !== null;

  return (
    /*
     * NGAN DONG SAN.
     *
     * Truoc day khoi nay la mot `tx-panel--form` luon mo, nam NGA GIUA hop thu phieu (viec hang
     * ngay) va bang ky doi soat (thu nguoi ta vao de xem). Nam o nhap voi mot nut `Chọn tệp` chan
     * ngang duong doc cua mot man hinh ma phan lon lan mo ra la de tra cuu.
     *
     * Nhap bang ke la viec CUOI THANG — dung mot lan moi ky, moi cay xang. Cho no mot ngan la dung
     * tan suat that cua no; tieu de va nut mo van o nguyen vi tri cu nen khong ai mat duong vao.
     */
    <CommandPanel
      title="Nhập bảng kê cây xăng"
      /*
       * KHONG duoc chua chuoi `Nhập bảng kê` — do la ten nut GUI ben trong, va Playwright khop ten
       * nut theo chuoi con. Hai nut cung khop se lam bo E2E do vi `strict mode violation`.
       */
      openLabel="Mở biểu nhập"
      hint="Xem trước không ghi gì. Nhập bảng kê sẽ tạo kỳ đối soát cho khoảng thời gian đã chọn."
    >
      {failure === null ? null : <ErrorState message={failure} />}
      {imported === null ? null : (
        <p className="tx-note" role="status">
          {imported}
        </p>
      )}

      <div className="tx-detail__grid">
        <label className="tx-field">
          <span>Cây xăng</span>
          <select
            aria-label="Cây xăng"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Chọn cây xăng</option>
            {suppliers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tx-field">
          <span>Từ ngày</span>
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </label>
        <label className="tx-field">
          <span>Đến ngày</span>
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </label>
        <label className="tx-field">
          <span>Định dạng</span>
          <select
            aria-label="Định dạng"
            value={format}
            onChange={(e) => setFormat(e.target.value as FuelStatementFormat)}
          >
            {FUEL_STATEMENT_FORMATS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="tx-field">
          <span>Tệp bảng kê</span>
          <input
            type="file"
            accept=".csv,.xlsx,text/csv"
            onChange={(event) => {
              const picked = event.target.files?.[0] ?? null;
              setFile(picked);
              setPreview(null);
              setImported(null);
              // Doan dinh dang tu duoi tep, nhung VAN de nguoi dung sua duoc: duoi tep khong phai
              // mot su that, chi la mot pho doan.
              if (picked !== null) {
                setFormat(picked.name.toLowerCase().endsWith('.xlsx') ? 'XLSX' : 'CSV');
              }
            }}
          />
        </label>
      </div>

      <div className="tx-detail__actions">
        <button
          type="button"
          className="tx-btn"
          disabled={!ready || runPreview.isPending}
          onClick={() => runPreview.mutate()}
        >
          {runPreview.isPending ? 'Đang đọc thử…' : 'Xem trước'}
        </button>
        <button
          type="button"
          className="tx-btn tx-btn--go"
          disabled={preview === null || runImport.isPending}
          onClick={() => runImport.mutate()}
          title={preview === null ? 'Xem trước trước đã.' : undefined}
        >
          {runImport.isPending ? 'Đang nhập…' : 'Nhập bảng kê'}
        </button>
      </div>

      {preview === null ? null : <StatementPreview preview={preview} />}
    </CommandPanel>
  );
}

/**
 * KET QUA XEM TRUOC — dem duoc, va noi ro dong nao BI LOAI vi ly do gi.
 *
 * Con so quan trong nhat khong phai tong so dong ma la so dong BI LOAI: mot bang ke nhap vao voi
 * mot nua so dong bi loai se sinh ra mot ky doi soat lech tran lan, va cho re nhat de phat hien
 * dieu do la o day, truoc khi ghi.
 */
function StatementPreview({ preview }: { readonly preview: StatementImportPreview }) {
  const rejections = Object.entries(preview.rejectionsByReason);
  return (
    <div className="tx-detail__block">
      <h3>Kết quả đọc thử</h3>
      <dl className="tx-detail__grid">
        <div className="tx-detailrow">
          <dt>Tổng số dòng</dt>
          <dd>{preview.rowCount}</dd>
        </div>
        <div className="tx-detailrow">
          <dt>Nhận được</dt>
          <dd>{preview.acceptedCount}</dd>
        </div>
        <div className="tx-detailrow">
          <dt>Bị loại</dt>
          <dd>{preview.rejectedCount}</dd>
        </div>
      </dl>

      {rejections.length === 0 ? null : (
        <ul className="tx-detail__reasons">
          {rejections.map(([reason, count]) => (
            <li key={reason}>
              {rejectReasonLabel(reason)}: {count} dòng
            </li>
          ))}
        </ul>
      )}

      {preview.lines.length === 0 ? null : (
        <DataTable<MappedStatementLine>
          caption="Các dòng đọc được từ bảng kê"
          rows={preview.lines}
          rowKey={(row) => String(row.rowNumber)}
          columns={[
            { key: 'row', header: 'Dòng', isRowHeader: true, render: (row) => row.rowNumber },
            { key: 'plate', header: 'Biển số', render: (row) => row.vehiclePlateRaw },
            {
              key: 'date',
              header: 'Ngày',
              render: (row) =>
                row.businessDate === null ? '—' : formatBusinessDate(row.businessDate),
            },
            {
              key: 'liters',
              header: 'Số lít',
              render: (row) => (row.litersUnits === null ? '—' : formatLiters(row.litersUnits)),
            },
            {
              key: 'amount',
              header: 'Số tiền',
              render: (row) => (row.amount === null ? '—' : formatMoney(row.amount)),
            },
            {
              key: 'status',
              header: 'Kết quả',
              render: (row) =>
                row.status === 'ACCEPTED' ? 'Nhận' : rejectReasonLabel(row.rejectReason),
            },
          ]}
        />
      )}
    </div>
  );
}
