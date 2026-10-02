'use client';

import { useId, useState } from 'react';
import type { KnownPlace, PlaceCandidate, PlaceSearchResponse } from '../../transport-types';
import { ENDPOINT_NOUN, type DraftEndpoint } from '../../workspace/order-draft';
import {
  checkSearchQuery,
  groupKnownPlaces,
  searchOutcomeOf,
  type SearchOutcomeView,
} from '../../workspace/place-lookup';
import '../../visual/location-picker-map.css';
import './place-finder.css';

/**
 * THE TIM DIA DIEM (`#379`) — tim theo chu, hoac chon tu dia diem da biet.
 *
 * ===========================================================================
 * CHI GUI KHI NGUOI DUNG BAM.
 *
 * `<form role="search">` gui bang Enter hoac nut "Tìm" — khong mot yeu cau nao khi go phim. Nha
 * cung cap tim kiem (Nominatim) cam tu dong hoan thanh, va may chu gioi han 1 lan/giay cho CA ung
 * dung: go 12 phim la 12 luot cua ca doanh nghiep.
 *
 * ===========================================================================
 * MOI NUT NOI DICH CUA NO.
 *
 * "Chọn làm điểm lấy hàng" / "Chọn làm điểm giao hàng" doi theo o dang chon — nguoi dung doc tren
 * chinh nut ma ho sap bam la diem nay se thanh diem nao. Khong co nut "Chọn" tro khong.
 *
 * Ten truy cap (`aria-label`) cua nut con mang TEN DIA DIEM: tam nut cung chu "Chọn làm điểm lấy
 * hàng" nghe giong het nhau, va chon nham dong la chon nham diem. Chu hien tren nut dung DAU ten
 * truy cap (WCAG 2.5.3) — ai ra lenh bang giong noi van goi trung.
 *
 * ===========================================================================
 * VUNG TRANG THAI LUON NAM TRONG CAY TRUY CAP.
 *
 * `role="status"` chi duoc doc khi NOI DUNG cua no doi. Mot vung bi `display:none` luc rong roi hien
 * ra cung luc voi cau dau tien thi nhieu trinh doc man hinh bo qua cau do — nen no luon co mat, rong
 * thi chi khong chiem cho (`place-finder.css`).
 */

export type KnownPlacesState =
  | { readonly status: 'LOADING' }
  | { readonly status: 'READY'; readonly places: readonly KnownPlace[] }
  | { readonly status: 'NONE' }
  | { readonly status: 'ERROR'; readonly message: string };

export interface SearchState {
  readonly isPending: boolean;
  readonly response: PlaceSearchResponse | null;
  readonly errorMessage: string | null;
}

type FinderTab = 'RESULTS' | 'KNOWN';

const KNOWN_NOTE: Readonly<Record<'NONE' | 'ERROR', string>> = {
  NONE: 'Doanh nghiệp chưa có địa điểm đã biết nào. Tìm theo tên, hoặc bấm trực tiếp trên bản đồ.',
  ERROR: 'Chưa tải được địa điểm đã biết. Vẫn tìm theo tên hoặc chọn trên bản đồ được.',
};

const statusOf = (search: SearchState, localMessage: string | null): SearchOutcomeView | null => {
  if (localMessage !== null) return { message: localMessage, isProblem: true };
  if (search.isPending) return { message: 'Đang tìm…', isProblem: false };
  if (search.errorMessage !== null) return { message: search.errorMessage, isProblem: true };
  return search.response === null ? null : searchOutcomeOf(search.response);
};

function ResultList({
  results,
  chooseLabel,
  highlighted,
  onHighlight,
  onChoose,
}: {
  readonly results: readonly PlaceCandidate[];
  readonly chooseLabel: string;
  readonly highlighted: number | null;
  readonly onHighlight: (index: number | null) => void;
  readonly onChoose: (candidate: PlaceCandidate, index: number) => void;
}): React.ReactElement {
  return (
    <ol className="tx-finder__list" onMouseLeave={() => onHighlight(null)}>
      {results.map((candidate, index) => (
        <li
          key={`${index}-${candidate.label}`}
          className="tx-finder__item"
          data-hot={highlighted === index ? '' : undefined}
          onMouseEnter={() => onHighlight(index)}
          onFocus={() => onHighlight(index)}
        >
          <span className="tx-finder__num" aria-hidden="true">
            {index + 1}
          </span>
          <span className="tx-finder__text">
            <span className="tx-finder__name">{candidate.label}</span>
            {candidate.address === null ? null : (
              <span className="tx-finder__detail">{candidate.address}</span>
            )}
          </span>
          <button
            type="button"
            className="tx-btn tx-btn--small tx-finder__choose"
            onClick={() => onChoose(candidate, index)}
            aria-label={`${chooseLabel}: ${candidate.label} (kết quả ${index + 1})`}
          >
            {chooseLabel}
          </button>
        </li>
      ))}
    </ol>
  );
}

const SHAPE_CLASS: Readonly<Record<KnownPlace['kind'], string>> = {
  DEPOT: 'tx-pin tx-pin--known tx-pin--depot',
  COUNTERPARTY_SITE: 'tx-pin tx-pin--known tx-pin--site',
  CUSTOMER: 'tx-pin tx-pin--known tx-pin--customer',
};

function KnownList({
  places,
  chooseLabel,
  onChoose,
}: {
  readonly places: readonly KnownPlace[];
  readonly chooseLabel: string;
  readonly onChoose: (place: KnownPlace) => void;
}): React.ReactElement {
  return (
    <div className="tx-finder__groups">
      {groupKnownPlaces(places).map((group) => (
        <section key={group.key} className="tx-finder__group" aria-label={group.title}>
          <h3 className="tx-finder__grouptitle">{group.title}</h3>
          <ul className="tx-finder__list">
            {group.places.map((place) => (
              <li key={place.id} className="tx-finder__item">
                <span className={`${SHAPE_CLASS[place.kind]} tx-finder__shape`} aria-hidden="true">
                  <span className="tx-pin__mark" />
                </span>
                <span className="tx-finder__text">
                  <span className="tx-finder__name">{place.name}</span>
                  {place.detail === null ? null : (
                    <span className="tx-finder__detail">{place.detail}</span>
                  )}
                </span>
                <button
                  type="button"
                  className="tx-btn tx-btn--small tx-finder__choose"
                  onClick={() => onChoose(place)}
                  aria-label={`${chooseLabel}: ${place.name}`}
                >
                  {chooseLabel}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function PlaceFinder({
  active,
  known,
  search,
  highlighted,
  onSearch,
  onHighlight,
  onChooseKnown,
  onChooseResult,
}: {
  readonly active: DraftEndpoint;
  readonly known: KnownPlacesState;
  readonly search: SearchState;
  readonly highlighted: number | null;
  readonly onSearch: (query: string) => void;
  readonly onHighlight: (index: number | null) => void;
  readonly onChooseKnown: (place: KnownPlace) => void;
  readonly onChooseResult: (candidate: PlaceCandidate, index: number) => void;
}): React.ReactElement {
  const [query, setQuery] = useState('');
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<FinderTab>('KNOWN');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const bodyId = useId();
  const tabIds = { RESULTS: useId(), KNOWN: useId() };

  const chooseLabel = `Chọn làm ${ENDPOINT_NOUN[active]}`;
  const results = search.response?.status === 'OK' ? search.response.results : [];
  const knownPlaces = known.status === 'READY' ? known.places : [];
  const status = statusOf(search, localMessage);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const check = checkSearchQuery(query);
    if (!check.ok) {
      setLocalMessage(check.message);
      return;
    }
    setLocalMessage(null);
    setTab('RESULTS');
    setIsCollapsed(false);
    onSearch(check.query);
  };

  const tabButton = (value: FinderTab, label: string): React.ReactElement => (
    <button
      type="button"
      role="tab"
      id={tabIds[value]}
      className="tx-tab tx-finder__tab"
      aria-selected={tab === value}
      aria-controls={`${bodyId}-panel`}
      tabIndex={tab === value ? 0 : -1}
      onClick={() => setTab(value)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          const next: FinderTab = value === 'RESULTS' ? 'KNOWN' : 'RESULTS';
          setTab(next);
          document.getElementById(tabIds[next])?.focus();
        }
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="tx-finder" data-collapsed={isCollapsed ? '' : undefined}>
      <div className="tx-finder__head">
        <h2 className="tx-finder__title">Tìm địa điểm</h2>
        <button
          type="button"
          className="tx-btn tx-btn--ghost tx-btn--small tx-finder__toggle"
          aria-expanded={!isCollapsed}
          aria-controls={bodyId}
          onClick={() => setIsCollapsed((value) => !value)}
        >
          {isCollapsed ? 'Hiện danh sách' : 'Thu gọn'}
        </button>
      </div>
      <form role="search" aria-label="Tìm địa điểm" className="tx-finder__form" onSubmit={submit}>
        <label className="tx-visually-hidden" htmlFor={`${bodyId}-query`}>
          Tên địa điểm hoặc địa chỉ
        </label>
        <input
          id={`${bodyId}-query`}
          type="search"
          className="tx-finder__input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nhà máy, kho, khu công nghiệp…"
          autoComplete="off"
          enterKeyHint="search"
        />
        <button type="submit" className="tx-btn tx-finder__submit" disabled={search.isPending}>
          Tìm
        </button>
      </form>
      <p
        className={`tx-finder__status${status?.isProblem === true ? ' tx-finder__status--problem' : ''}`}
        role="status"
        data-testid="tx-finder-status"
      >
        {status?.message ?? ''}
      </p>
      <div id={bodyId} className="tx-finder__body" hidden={isCollapsed}>
        <div className="tx-tabs tx-finder__tabs" role="tablist" aria-label="Nguồn địa điểm">
          {tabButton('RESULTS', 'Kết quả tìm kiếm')}
          {tabButton('KNOWN', `Địa điểm đã biết (${knownPlaces.length})`)}
        </div>
        <div
          id={`${bodyId}-panel`}
          role="tabpanel"
          aria-labelledby={tabIds[tab]}
          className="tx-finder__panel"
        >
          {tab === 'RESULTS' ? (
            results.length === 0 ? (
              <p className="tx-note">
                Gõ tên rồi bấm Tìm. Kết quả chỉ là gợi ý — điểm chỉ thành điểm của đơn khi bạn chọn.
              </p>
            ) : (
              <>
                <ResultList
                  results={results}
                  chooseLabel={chooseLabel}
                  highlighted={highlighted}
                  onHighlight={onHighlight}
                  onChoose={onChooseResult}
                />
                {search.response?.attribution == null ? null : (
                  <p className="tx-finder__credit">{search.response.attribution}</p>
                )}
              </>
            )
          ) : known.status === 'LOADING' ? (
            <p className="tx-note">Đang tải địa điểm đã biết…</p>
          ) : known.status === 'NONE' || known.status === 'ERROR' ? (
            <p className="tx-note">{KNOWN_NOTE[known.status]}</p>
          ) : knownPlaces.length === 0 ? (
            <p className="tx-note">{KNOWN_NOTE.NONE}</p>
          ) : (
            <KnownList places={knownPlaces} chooseLabel={chooseLabel} onChoose={onChooseKnown} />
          )}
        </div>
      </div>
    </div>
  );
}
