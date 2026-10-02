'use client';

import {
  ENDPOINT_BADGE,
  ENDPOINT_NOUN,
  type DraftEndpoint,
  type OrderDraft,
} from '../../workspace/order-draft';
import {
  accuracyPhrase,
  LOCATING_MESSAGE,
  positionStatusText,
  type PositionState,
} from '../../workspace/place-lookup';

/**
 * CAC LOP tren ban do chon diem (`#379`): bang "Đang đặt…", nut "Vị trí của tôi", the vi tri, chu giai.
 *
 * ===========================================================================
 * MOI MANH LA MOT PHAN TU RIENG, KHONG CO VO BOC CHUNG.
 *
 * Bo cuc (`order-composer.css`) dat tung manh vao mot o luoi cua be mat — tren ban do o man rong,
 * quanh ban do o man hep. Mot vo boc chung se ep chung chung mot khoi va ep thu tu DOM lech khoi
 * thu tu nhin (WCAG 2.4.3). `data-map-overlay` danh dau manh nao co the de len ban do: camera doc
 * khung cua chung de khong dong khung mot ghim vao duoi (`workspace/picker-insets.ts`).
 *
 * ===========================================================================
 * BANG "Đang đặt…" LA TRANG THAI, KHONG PHAI DIEU KHIEN.
 *
 * Dieu khien that la nhom radio o phieu tuyen. Bang nam tren ban do vi do la noi mat nguoi dung
 * dang nhin luc bam — ho khong phai liec sang cot trai de biet cu bam nay se dat diem lay hay giao.
 */

export type { PositionState };

const other = (endpoint: DraftEndpoint): DraftEndpoint =>
  endpoint === 'ORIGIN' ? 'DESTINATION' : 'ORIGIN';

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export function ActiveBanner({
  draft,
  onSwitch,
}: {
  readonly draft: OrderDraft;
  readonly onSwitch: (endpoint: DraftEndpoint) => void;
}): React.ReactElement {
  const active = draft.active;
  const isFilled = (active === 'ORIGIN' ? draft.origin : draft.destination) !== null;
  const hint =
    draft.announcement ??
    (isFilled
      ? `Bấm bản đồ sẽ đặt lại ${ENDPOINT_NOUN[active]}.`
      : 'Bấm vào bản đồ, hoặc chọn trong danh sách.');

  return (
    <div className="tx-composer__banner" data-endpoint={active} data-map-overlay="">
      <span className="tx-composer__banner-tag" aria-hidden="true">
        {ENDPOINT_BADGE[active]}
      </span>
      <p className="tx-composer__banner-text" role="status" data-testid="tx-composer-active">
        <strong>Đang đặt {ENDPOINT_NOUN[active]}</strong>
        <span>{hint}</span>
      </p>
      <button
        type="button"
        className="tx-btn tx-btn--small tx-composer__switch"
        onClick={() => onSwitch(other(active))}
      >
        Đổi sang {ENDPOINT_NOUN[other(active)]}
      </button>
    </div>
  );
}

/**
 * Nut "Vị trí của tôi" + vung trang thai cua no.
 *
 * Nut KHONG bi `disabled` luc dang lay vi tri: khoa mot nut dang giu tieu diem lam trinh duyet danh
 * roi tieu diem ve `<body>`. No bao ban (`aria-busy`/`aria-disabled`) va bo qua lan bam lap lai.
 */
export function LocateButton({
  position,
  onLocate,
}: {
  readonly position: PositionState;
  readonly onLocate: () => void;
}): React.ReactElement {
  const isLocating = position.status === 'LOCATING';
  return (
    <>
      <button
        type="button"
        className="tx-btn tx-composer__locate-btn"
        data-map-overlay=""
        aria-busy={isLocating}
        aria-disabled={isLocating}
        onClick={() => {
          if (!isLocating) onLocate();
        }}
      >
        <span className="tx-composer__locate-icon" aria-hidden="true" />
        Vị trí của tôi
      </button>
      <p className="tx-visually-hidden" role="status" data-testid="tx-position-status">
        {positionStatusText(position)}
      </p>
    </>
  );
}

/** The ket qua vi tri: dang lay, da co (hai nut dat diem), hoac loi. Rong khi chua bam. */
export function PositionCard({
  position,
  onUse,
  onDismiss,
}: {
  readonly position: PositionState;
  readonly onUse: (endpoint: DraftEndpoint) => void;
  readonly onDismiss: () => void;
}): React.ReactElement | null {
  if (position.status === 'IDLE') return null;
  if (position.status === 'LOCATING') {
    /* Cau nay da duoc vung trang thai cua nut doc len — o day chi de mat thay. */
    return (
      <div className="tx-composer__me tx-composer__me--busy" data-map-overlay="" aria-hidden="true">
        <p>{LOCATING_MESSAGE}</p>
      </div>
    );
  }
  if (position.status === 'FAILED') {
    return (
      <div
        className="tx-composer__me tx-composer__me--failed"
        data-map-overlay=""
        data-testid="tx-composer-position"
      >
        <p>{position.message}</p>
        <button type="button" className="tx-btn tx-btn--ghost tx-btn--small" onClick={onDismiss}>
          Đóng
        </button>
      </div>
    );
  }
  return (
    <div
      className="tx-composer__me"
      role="group"
      aria-label="Vị trí của bạn"
      data-map-overlay=""
      data-testid="tx-composer-position"
    >
      <p className="tx-composer__me-title">
        Vị trí của bạn, {accuracyPhrase(position.accuracyMetres)}
      </p>
      <p className="tx-composer__me-note">
        Chỉ là gợi ý để chọn điểm, không phải bằng chứng vị trí.
      </p>
      <div className="tx-composer__me-actions">
        <button type="button" className="tx-btn tx-btn--small" onClick={() => onUse('ORIGIN')}>
          Đặt làm điểm lấy hàng
        </button>
        <button type="button" className="tx-btn tx-btn--small" onClick={() => onUse('DESTINATION')}>
          Đặt làm điểm giao hàng
        </button>
        <button type="button" className="tx-btn tx-btn--ghost tx-btn--small" onClick={onDismiss}>
          Đóng
        </button>
      </div>
    </div>
  );
}

/** Chu giai: moi ky hieu tren ban do mot dong, ky hieu ve BANG CHINH lop cua ghim. */
export function MapLegend(): React.ReactElement {
  return (
    <ul className="tx-composer__legend" aria-label="Chú giải bản đồ" data-map-overlay="">
      <li>
        <span className="tx-composer__key tx-composer__key--origin" aria-hidden="true">
          {ENDPOINT_BADGE.ORIGIN}
        </span>
        {capitalise(ENDPOINT_NOUN.ORIGIN)}
      </li>
      <li>
        <span className="tx-composer__key tx-composer__key--destination" aria-hidden="true">
          {ENDPOINT_BADGE.DESTINATION}
        </span>
        {capitalise(ENDPOINT_NOUN.DESTINATION)}
      </li>
      <li>
        <span className="tx-pin tx-pin--known tx-pin--depot" aria-hidden="true">
          <span className="tx-pin__mark" />
        </span>
        Bãi xe
      </li>
      <li>
        {/*
          Hinh ghim theo LOAI HANG RAO, khong theo nhan: kho cua khach hang va nha may doi tac cung
          la dia diem cua mot phap nhan (`COUNTERPARTY_SITE`) nen cung mot hinh (`#395` §2.1);
          danh sach ben trai moi tach "Địa điểm khách hàng" / "Nhà máy / kho đối tác".
        */}
        <span className="tx-pin tx-pin--known tx-pin--site" aria-hidden="true">
          <span className="tx-pin__mark" />
        </span>
        Kho, nhà máy của khách hàng hoặc đối tác
      </li>
      <li>
        <span className="tx-pin tx-pin--known tx-pin--customer" aria-hidden="true">
          <span className="tx-pin__mark" />
        </span>
        Điểm khách hàng (kiểu cũ)
      </li>
      <li>
        <span className="tx-pin tx-pin--result" aria-hidden="true">
          <span className="tx-pin__mark">1</span>
        </span>
        Kết quả tìm
      </li>
      <li>
        <span className="tx-pin tx-pin--me" aria-hidden="true">
          <span className="tx-pin__mark" />
        </span>
        Vị trí của tôi
      </li>
    </ul>
  );
}
