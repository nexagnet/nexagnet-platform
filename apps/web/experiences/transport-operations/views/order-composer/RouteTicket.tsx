'use client';

import { useId } from 'react';
import {
  DEPOT_NAME_LOCK_HINT,
  ENDPOINT_BADGE,
  ENDPOINT_NOUN,
  ENDPOINT_ROLE,
  isNameLocked,
  MAP_POINT_UNNAMED,
  NAME_MAX_LENGTH,
  sourceLineOf,
  type DraftEndpoint,
  type DraftPlace,
  type OrderDraft,
} from '../../workspace/order-draft';
import {
  formatCoordinates,
  formatStraightLine,
  isNearlySamePoint,
  straightLineKm,
} from '../../workspace/place-lookup';

/**
 * PHIEU TUYEN (`#379`) — hai cuong phieu Lay / Giao noi bang mot duong ray dut, goi lai to van don.
 *
 * ===========================================================================
 * HAI CUONG LA MOT NHOM RADIO THAT, KHONG PHAI HAI THE BAM DUOC.
 *
 * "Đang đặt điểm nào?" la cau hoi mot-trong-hai, va trinh duyet da co san dieu khien cho no: radio
 * gốc cho mui ten doi o, Tab vao dung o dang chon, va trinh doc man hinh doc "1 trên 2". Cuong phieu
 * chi la cach VE radio do. O ten va nut xoa nam NGOAI nhan cua radio — mot radio khong duoc chua
 * mot dieu khien khac.
 *
 * ===========================================================================
 * TEN LON, TOA DO NHO — NHUNG TOA DO LA SU THAT.
 *
 * Nguoi dung doi chieu bang TEN; toa do nam o dong nho mo de ai can doi chieu thi co. Sua ten khong
 * doi toa do (`order-draft.ts`).
 *
 * ===========================================================================
 * SUA TEN KHONG DOI O DANG CHON.
 *
 * Bam vao o "Tên trên đơn" chi la sua chu. Neu no lang le chon lai cuong do, lan bam ban do KE TIEP
 * (nguoi dung dang di dat diem giao) se DE LEN diem lay vua tinh chinh va xoa ten vua go. O dang
 * chon chi doi qua nhom radio — mot dieu khien nguoi dung nhin thay minh vua bam.
 */

const ENDPOINTS: readonly DraftEndpoint[] = ['ORIGIN', 'DESTINATION'];

const emptyHint = (isActive: boolean): string =>
  isActive
    ? 'Bấm vào bản đồ, hoặc chọn một địa điểm trong danh sách.'
    : 'Bấm vào đây để đặt điểm này.';

function Stub({
  endpoint,
  place,
  isActive,
  groupName,
  onSelect,
  onRename,
  onClear,
}: {
  readonly endpoint: DraftEndpoint;
  readonly place: DraftPlace | null;
  readonly isActive: boolean;
  readonly groupName: string;
  readonly onSelect: (endpoint: DraftEndpoint) => void;
  readonly onRename: (endpoint: DraftEndpoint, name: string) => void;
  readonly onClear: (endpoint: DraftEndpoint) => void;
}): React.ReactElement {
  const bodyId = useId();
  const lockHintId = useId();
  const line = place === null ? null : sourceLineOf(place);
  const isLocked = place !== null && isNameLocked(place);
  const noun = ENDPOINT_NOUN[endpoint];
  const shownName = place === null ? 'Chưa chọn' : place.name.trim() || MAP_POINT_UNNAMED;

  return (
    <div
      className={`tx-ticket__stub tx-ticket__stub--${endpoint === 'ORIGIN' ? 'origin' : 'destination'}`}
      data-active={isActive ? '' : undefined}
      data-filled={place === null ? undefined : ''}
    >
      <label className="tx-ticket__pick">
        <input
          type="radio"
          className="tx-ticket__radio"
          name={groupName}
          value={endpoint}
          checked={isActive}
          onChange={() => onSelect(endpoint)}
          aria-label={ENDPOINT_ROLE[endpoint]}
          aria-describedby={bodyId}
        />
        <span className="tx-ticket__node" aria-hidden="true">
          {ENDPOINT_BADGE[endpoint]}
        </span>
        <span className="tx-ticket__role">{ENDPOINT_ROLE[endpoint]}</span>
        <span className="tx-ticket__body" id={bodyId}>
          <span className="tx-ticket__place">{shownName}</span>
          {line === null ? (
            <span className="tx-ticket__source">{emptyHint(isActive)}</span>
          ) : (
            <>
              <span className="tx-ticket__source">{line.source}</span>
              {line.detail === null ? null : (
                <span className="tx-ticket__detail">{line.detail}</span>
              )}
            </>
          )}
          {place === null ? null : (
            <span className="tx-ticket__coords">{formatCoordinates(place.point)}</span>
          )}
        </span>
      </label>
      {place === null ? null : (
        <div className="tx-ticket__edit">
          <label className="tx-field tx-ticket__name">
            <span>
              Tên trên đơn<span className="tx-visually-hidden"> ({noun})</span>
            </span>
            <input
              value={place.name}
              maxLength={NAME_MAX_LENGTH}
              onChange={(event) => onRename(endpoint, event.target.value)}
              aria-invalid={place.name.trim().length === 0}
              autoComplete="off"
              /*
               * `#395` §2.3 — ten bai xe KHOA: `readOnly` chu khong `disabled`, de van doc/chon/sao
               * chep duoc va trinh doc man hinh van doc ra, kem cau noi vi sao.
               */
              readOnly={isLocked}
              aria-describedby={isLocked ? lockHintId : undefined}
            />
            {isLocked ? (
              <small className="tx-ticket__lock" id={lockHintId}>
                {DEPOT_NAME_LOCK_HINT}
              </small>
            ) : null}
          </label>
          <button
            type="button"
            className="tx-btn tx-btn--ghost tx-btn--small tx-ticket__clear"
            onClick={() => onClear(endpoint)}
          >
            Xoá điểm<span className="tx-visually-hidden"> {noun.replace('điểm ', '')}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function RouteTicket({
  draft,
  onSelect,
  onRename,
  onClear,
}: {
  readonly draft: OrderDraft;
  readonly onSelect: (endpoint: DraftEndpoint) => void;
  readonly onRename: (endpoint: DraftEndpoint, name: string) => void;
  readonly onClear: (endpoint: DraftEndpoint) => void;
}): React.ReactElement {
  const groupName = useId();
  const { origin, destination } = draft;
  const isComplete = origin !== null && destination !== null;
  const isTooClose = isComplete && isNearlySamePoint(origin.point, destination.point);

  const leg = (
    <div className="tx-ticket__leg" aria-live="polite">
      {isComplete ? (
        <p className="tx-ticket__distance">
          Đường chim bay {formatStraightLine(straightLineKm(origin.point, destination.point))}
          <span> — không phải quãng đường xe chạy</span>
        </p>
      ) : null}
      {isTooClose ? (
        <p className="tx-note tx-note--warn">
          Hai điểm cách nhau chưa tới 100 m. Kiểm tra lại xem có chọn nhầm không.
        </p>
      ) : null}
    </div>
  );

  return (
    <fieldset className="tx-ticket">
      <legend className="tx-ticket__legend">Đang đặt điểm nào?</legend>
      {ENDPOINTS.map((endpoint, index) => (
        <div key={endpoint} className="tx-ticket__slot">
          <Stub
            endpoint={endpoint}
            place={endpoint === 'ORIGIN' ? origin : destination}
            isActive={draft.active === endpoint}
            groupName={groupName}
            onSelect={onSelect}
            onRename={onRename}
            onClear={onClear}
          />
          {index === 0 ? leg : null}
        </div>
      ))}
    </fieldset>
  );
}
