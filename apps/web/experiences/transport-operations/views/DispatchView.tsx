'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { PermissionGate } from '../components/PermissionGate';
import { DataTable, PageHeader } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useDispatchAssignment,
  useDispatchSuggestions,
  useNavigationInput,
  useTransportOrders,
  useTransportPlanningPolicy,
} from '../hooks/useTransportWorkspace';
import { canPerform } from '../transport-actions';
import type { TransportApiError } from '../transport-api';
import { boundsOf } from '../workspace/journey';
import {
  dispatchErrorMessage,
  toDispatch,
  toDispatchMap,
  type DispatchCandidateRow,
} from '../workspace/dispatch';

/**
 * BAN DO DIEU XE (#278 N3) — de nghi cua Lane M (#277), quyet dinh cua CON NGUOI.
 *
 * ===========================================================================
 * MAN HINH NAY KHONG BAO GIO TU GAN XE.
 *
 * `#278` N3: *"Boss chooses; map does not auto-assign."* Hai lan goi tach han nhau: "Tìm xe" chi
 * hoi de nghi (`assignmentCreated: false`), va "Gán xe" chi chay tu mot `onClick` tren DUNG mot
 * chiec xe. Khong mot nhanh nao trong tep nay goi lenh gan thay nguoi dung — ke ca khi chi co dung
 * mot ung vien.
 */
const TransportMap = dynamic(() => import('../visual/TransportMap'), {
  ssr: false,
  loading: () => <LoadingState label="Đang tải bản đồ…" />,
});

export function DispatchView(): React.ReactElement {
  const input = useNavigationInput();
  const ordersQuery = toSectionQuery(useTransportOrders(input));
  const policyQuery = useTransportPlanningPolicy(input);
  /**
   * `#395` — lan doc che do van hanh BI CHAN (thieu `transport.run.read`) thi KHONG phai "dang
   * doc": `isPending` cua mot query bi `enabled: false` dung mai mai, va man hinh tung treo o "Đang
   * đọc chế độ vận hành…" voi nguoi chi duoc cap ma de nghi. Muc gio doi ca ma do; day la chot chan.
   */
  const policy = toSectionQuery(policyQuery);
  const canAssign = canPerform(input, 'transport.run.manage');
  const suggestions = useDispatchSuggestions();
  const assignment = useDispatchAssignment();
  const [orderId, setOrderId] = useState<string>('');

  /**
   * CHUA BIET thi coi nhu TAT — `undefined` khong duoc hieu thanh "chac la bat".
   *
   * Trong luc lan doc chinh sach chua ve, `data` la `undefined`, va bieu thuc nay ra `false`. Do la
   * huong hong DUNG: man hinh im lang mot nhip roi hien dung trang thai, thay vi moi nguoi dung bam
   * mot cai nut ma may chu se tu choi.
   *
   * Va day KHONG phai cong chan. Cong chan that nam o `DispatchService.requireMultiOrderRun()`; neu
   * ai do go bo doan nay, may chu VAN tra 403 `DISPATCH_MULTI_ORDER_DISABLED`. `#294 S-OWNER-03`:
   * *"UI hiding is not authorization."*
   */
  const multiOrderRunEnabled = policyQuery.data?.grouping === 'MULTI_ORDER_RUN';

  const model = suggestions.data === undefined ? null : toDispatch(suggestions.data);
  const mapModel = suggestions.data === undefined ? null : toDispatchMap(suggestions.data);
  const bounds = mapModel === null ? null : boundsOf(mapModel);

  const orders = useMemo(
    () => (ordersQuery.data ?? []).filter((order) => order.status === 'OPEN'),
    [ordersQuery.data],
  );

  const columns = [
    {
      key: 'plate',
      header: 'Biển số',
      render: (row: DispatchCandidateRow) => row.plate,
      isRowHeader: true,
    },
    { key: 'mode', header: 'Vì sao', render: (row: DispatchCandidateRow) => row.mode },
    { key: 'origin', header: 'Xuất phát', render: (row: DispatchCandidateRow) => row.origin },
    { key: 'free', header: 'Rảnh lúc', render: (row: DispatchCandidateRow) => row.availableAt },
    {
      key: 'empty',
      header: 'Km rỗng thêm',
      render: (row: DispatchCandidateRow) => <span>Chặng chạy rỗng · {row.emptyKm}</span>,
      isNumeric: true,
    },
    { key: 'eta', header: 'Đến điểm lấy', render: (row: DispatchCandidateRow) => row.pickupEta },
    {
      key: 'warn',
      header: 'Lưu ý',
      render: (row: DispatchCandidateRow) => row.warnings.join(', '),
    },
    {
      key: 'assign',
      header: 'Chọn',
      render: (row: DispatchCandidateRow) =>
        // Gan xe di sau `transport.run.manage` (may chu kiem lai); khong co quyen thi khong co nut.
        canAssign ? (
          <button
            type="button"
            className="tx-btn tx-btn--small"
            disabled={assignment.isPending}
            onClick={() => assignment.mutate({ orderId, vehicleId: row.vehicleId })}
          >
            Gán xe
          </button>
        ) : (
          'Chưa được cấp quyền gán xe'
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Điều xe"
        summary="Xe nào đang gần điểm lấy hàng, sẽ rảnh lúc nào, và chạy rỗng thêm bao nhiêu km."
        context={model === null ? undefined : `Đề nghị lúc ${model.generatedAt}`}
        actions={
          !multiOrderRunEnabled ? null : (
            <>
              <label className="tx-field tx-field--inline">
                <span>Đơn hàng</span>
                <select value={orderId} onChange={(event) => setOrderId(event.target.value)}>
                  <option value="">— Chọn đơn —</option>
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.code} · {order.originLabel} → {order.destinationLabel}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="tx-btn"
                disabled={orderId === '' || suggestions.isPending}
                onClick={() => suggestions.mutate({ orderId })}
              >
                Tìm xe
              </button>
            </>
          )
        }
      />

      {policy.isLoading ? <LoadingState label="Đang đọc chế độ vận hành…" /> : null}
      {policy.isBlocked ? <PermissionGate viewer={input} action="transport.run.read" /> : null}

      {/*
        CHE DO MOI DON MOT VONG CHAY — noi thang ra, khong de mot man hinh trong.

        `#294 S-OWNER-01`: o che do nay khong ai duoc moi noi don moi vao mot vong chay dang chay,
        nen bang de nghi khong ton tai. Mot `EmptyState` ("chua co de nghi nao") se noi sai: no ham
        y rang cu bam them thi se co.
      */}
      {policyQuery.isSuccess && !multiOrderRunEnabled ? (
        <section
          className="tx-panel"
          aria-label="Chế độ vận hành"
          data-testid="tx-dispatch-one-order"
        >
          <h2>Khách này chạy chế độ mỗi đơn một vòng chạy</h2>
          <p className="tx-note">
            Mỗi đơn đi một vòng chạy riêng, nên không có bảng đề nghị ghép đơn vào xe đang chạy. Đơn
            được tạo, xem trước kế hoạch và giao xe ngay tại màn hình Đơn hàng &amp; vòng chạy.
          </p>
          <p className="tx-note">
            Muốn bật bảng đề nghị điều xe, đổi cấu hình <code>transportPlanning.runGrouping</code>{' '}
            sang <code>MULTI_ORDER_RUN</code> trong gói khách.
          </p>
        </section>
      ) : null}

      {suggestions.isError ? (
        <ErrorState message={dispatchErrorMessage(suggestions.error as TransportApiError)} />
      ) : null}
      {assignment.isError ? <ErrorState message={(assignment.error as Error).message} /> : null}
      {suggestions.isPending ? <LoadingState label="Đang tìm xe phù hợp…" /> : null}
      {assignment.isSuccess ? (
        <p className="tx-note">Đã gán xe. Vòng chạy đã được cập nhật.</p>
      ) : null}

      {model === null ? (
        /* O che do mot-don-mot-vong, loi moi "bam Tim xe" la mot cai bay — khoi hien. */
        multiOrderRunEnabled ? (
          <EmptyState title="Chọn một đơn rồi bấm “Tìm xe” để xem đề nghị." />
        ) : null
      ) : (
        <>
          <section className="tx-panel" aria-label="Bản đồ đội xe">
            <h2>
              Đơn {model.orderCode} · lấy hàng tại {model.pickupLabel}
            </h2>
            {model.redactedNote === null ? null : (
              <p className="tx-note tx-note--warn">{model.redactedNote}</p>
            )}
            {mapModel !== null && bounds !== null ? (
              <TransportMap
                model={mapModel}
                bounds={bounds}
                ariaLabel={`Bản đồ điều xe cho đơn ${model.orderCode}`}
              />
            ) : (
              <EmptyState title="Chưa có toạ độ nào để vẽ bản đồ cho lần đề nghị này." />
            )}
          </section>

          <section className="tx-panel" aria-label="Xe phù hợp">
            <h2>Xe phù hợp</h2>
            {model.candidates.length === 0 ? (
              <EmptyState title="Không có xe nào phù hợp với đơn này." />
            ) : (
              <DataTable
                caption={`Xe phù hợp cho đơn ${model.orderCode}`}
                columns={columns}
                rows={model.candidates}
                rowKey={(row) => row.key}
              />
            )}
            {/*
             * NHAC LAI TRONG CHINH GIAO DIEN. `assignmentCreated` luon `false`; cau nay ton tai de
             * khong ai doc bang xep hang nhu mot viec da roi.
             */}
            <p className="tx-note">
              Đây là ĐỀ NGHỊ, chưa gán xe cho đơn nào. Xe chỉ được gán khi bạn bấm “Gán xe”.
            </p>
          </section>

          {model.excluded.length === 0 ? null : (
            <section className="tx-panel" aria-label="Xe bị loại">
              <h2>Xe bị loại, và vì sao</h2>
              <ul className="tx-notes">
                {model.excluded.map((entry) => (
                  <li key={entry.key}>
                    <strong>{entry.plate}</strong> — {entry.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
