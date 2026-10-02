'use client';

import { useState } from 'react';
import { StatusBadge } from '../components/primitives';
import { ConfirmAction, ErrorState } from '../components/SectionState';
import { useNavigationInput, useOrderFulfilment } from '../hooks/useTransportWorkspace';
import { buildSectionUrl, canNavigateTo } from '../navigation';
import { canPerform } from '../transport-actions';
import type { RunLeg, TransportOrder } from '../transport-types';
import {
  FULFIL_CONFIRM_DETAIL,
  lifecycleFailureOf,
  ORDER_FAILURE_MESSAGE,
  orderFulfilmentFor,
} from '../workspace/office-lifecycle';

/**
 * GIAO XONG DON — `OPEN -> FULFILLED`, mot hanh dong CO NGUOI THUC HIEN (`#376`).
 *
 * ============================================================================================
 * VI SAO KHONG TU SUY
 * ============================================================================================
 *
 * Lai xe bam "Khách đã nhận hàng" la BANG CHUNG hien truong; he thong dong vong chay la su that VAN
 * HANH. Ca hai deu khong phai "nghia vu thuong mai da giao xong" — mot don co the giao bang xe
 * ngoai, hoac giao thieu ma van phong phai goi lai khach. Nen nut nay la cua van phong, va sau no
 * don moi vao hang "Kết thúc đơn" (`#275`), noi ke toan con mot buoc nua moi den doi soat.
 *
 * Canh bao "con chang co hang chua hoan tat" KHONG khoa nut: may chu khong doi dieu do, va mot man
 * hinh tu dat them cong se chan dung truong hop don thue xe ngoai.
 */
export function OrderFulfilmentPanel({
  order,
  legs,
}: {
  readonly order: TransportOrder;
  /** Chang cua DON nay — `undefined` khi chua doc duoc (luc do khong canh bao gi). */
  readonly legs: readonly RunLeg[] | undefined;
}) {
  const navigation = useNavigationInput();
  const fulfil = useOrderFulfilment();
  const canManage = canPerform(navigation, 'transport.order.manage');
  const [isConfirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const view = orderFulfilmentFor(order, legs ?? null);
  const completionReachable = canNavigateTo('order-completion', navigation);

  const confirm = () => {
    fulfil.mutate(order.id, {
      onSuccess: (updated) => {
        setConfirming(false);
        setNotice(
          `Đơn ${updated.code} đã giao xong.` +
            (completionReachable ? ' Đơn đã vào hàng “Kết thúc đơn”.' : ''),
        );
      },
      onError: (error) => {
        setConfirming(false);
        setFailure(lifecycleFailureOf(error, ORDER_FAILURE_MESSAGE).message);
      },
    });
  };

  return (
    <section className="tx-panel" aria-label={`Giao xong đơn ${order.code}`}>
      <h2>Giao xong đơn {order.code}</h2>
      <p className="tx-panel__lead">
        <StatusBadge label={view.statusLabel} tone={view.tone} /> {view.note}
      </p>

      {view.canFulfil && view.warning !== null ? (
        <p className="tx-note tx-note--warn">{view.warning}</p>
      ) : null}

      {view.canFulfil && canManage ? (
        <button
          type="button"
          className="tx-btn tx-btn--go"
          onClick={() => {
            setFailure(null);
            setNotice(null);
            setConfirming(true);
          }}
        >
          Xác nhận đã giao xong
        </button>
      ) : null}
      {view.canFulfil && !canManage ? (
        <p className="tx-note">Vai của bạn chỉ xem — không xác nhận giao xong được.</p>
      ) : null}

      {notice === null ? null : (
        <p className="tx-note" role="status" aria-label="Kết quả giao xong đơn">
          {notice}
        </p>
      )}
      {order.status === 'FULFILLED' && completionReachable ? (
        <p>
          <a className="tx-btn" href={buildSectionUrl('order-completion')}>
            Mở “Kết thúc đơn” →
          </a>
        </p>
      ) : null}
      {failure === null ? null : <ErrorState message={failure} />}

      <ConfirmAction
        open={isConfirming}
        title={`Xác nhận đơn ${order.code} đã giao xong?`}
        detail={
          view.warning === null ? FULFIL_CONFIRM_DETAIL : `${view.warning} ${FULFIL_CONFIRM_DETAIL}`
        }
        confirmLabel="Xác nhận đã giao xong"
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
        isBusy={fulfil.isPending}
      />
    </section>
  );
}
