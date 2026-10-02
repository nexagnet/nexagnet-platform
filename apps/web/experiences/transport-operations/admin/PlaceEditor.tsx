'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { PermissionGate } from '../components/PermissionGate';
import { useNavigationInput } from '../hooks/useTransportWorkspace';
import { transportApi } from '../transport-api';
import type { GeoPoint, PlaceCandidate } from '../transport-types';
import { readOfficePosition } from '../views/order-composer/browser-position';
import {
  checkSearchQuery,
  formatCoordinates,
  POSITION_FAILURE_MESSAGE,
  searchOutcomeOf,
} from '../workspace/place-lookup';
import { placesAdminApi } from './admin-api';
import { adminErrorMessage, openWorkOf } from './admin-reasons';
import { useOwnerCounterparties, useOwnerCustomers } from './admin-hooks';
import type { OpenWorkDetail, PlaceAdminView } from './admin-types';
import { AdminError } from './AdminBits';
import { parseCoordinateInput } from './coordinate-parser';
import { OpenWorkDialog } from './OpenWorkDialog';
import {
  buildCreatePlaceInput,
  buildUpdatePlaceInput,
  ADDRESS_LOCKED_HINT,
  COUNTERPARTY_MANAGE_NEEDED,
  GEOMETRY_CHANGE_WARNING,
  geometryChanged,
  isEmptyPatch,
  isOwnerChoiceAllowed,
  NAME_LOCKED_HINT,
  NEW_COUNTERPARTY,
  nudgePoint,
  OWNER_CHOICES,
  placeDraftProblems,
  placeFieldLocks,
  placeKindLabel,
  placeOwnerLine,
  RADIUS_MAX_METRES,
  RADIUS_MIN_METRES,
  RADIUS_SLIDER_MAX,
  RADIUS_SLIDER_MIN,
  withLookupFill,
  withOwnerChoice,
  withPoint,
  type PlaceDraft,
  type PointSource,
} from './places-model';

/**
 * TRINH SUA DIA DIEM (`#395` §3.2) — dieu khien bang `draft` cua man cha, vi BAN DO (ben phai) va
 * trinh sua (ben trai) cung doc/ghi mot diem: bam ban do, keo ghim, tim, vi tri hien tai, dan toa
 * do — tat ca di vao CUNG mot `draft.point`.
 *
 * Cau hoi DAU TIEN la "Địa điểm này của ai?" — khong phai "loai hang rao". Mot kho cua khach hang la
 * dia diem cua PHAP NHAN khach hang; man hinh tu lo phan mo hinh (don vi, lien ket, cho lam viec).
 *
 * Tim va tim nguoc CHI la tro giup: tat (khach du lieu that khong bat nha cung cap ngoai) thi van dat
 * duoc diem bang ban do, vi tri hien tai, hoac dan toa do — va o dia chi go tay.
 */

type SearchState =
  | { readonly status: 'IDLE' }
  | { readonly status: 'BUSY' }
  | {
      readonly status: 'DONE';
      readonly results: readonly PlaceCandidate[];
      readonly message: string;
      readonly isProblem: boolean;
      readonly attribution: string | null;
    }
  | { readonly status: 'OFF'; readonly message: string };

const NUDGE_METRES = 10;

/** Nguon dat diem CAN tim nguoc — tim theo ten da co ten, chinh 10 m khong doi dia chi. */
const REVERSE_SOURCES: readonly PointSource[] = ['MAP', 'DRAG', 'POSITION', 'PASTE'];

export function PlaceEditor({
  draft,
  onChange,
  canLookUp,
  canManageCounterparties,
  basemapNotice,
  onSaved,
  onCancel,
}: {
  readonly draft: PlaceDraft;
  readonly onChange: (next: PlaceDraft) => void;
  /** Nguoi dung duoc goi tim / tim nguoc (cung ma quyen voi man Tao don). */
  readonly canLookUp: boolean;
  /** Co quyen quan ly khach hang/doi tac — dieu kien de them dia diem cua don vi khac. */
  readonly canManageCounterparties: boolean;
  readonly basemapNotice: string | null;
  readonly onSaved: (saved: PlaceAdminView, isCreate: boolean) => void;
  readonly onCancel: () => void;
}) {
  const titleId = useId();
  const nameHintId = useId();
  const addressHintId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const isCreate = draft.original === null;
  /* Ten va dia chi cua dia diem don vi khac = ho so phap nhan: doi them quyen do (nhu may chu). */
  const locks = placeFieldLocks(draft.original, canManageCounterparties);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'IDLE' });
  const [pasted, setPasted] = useState('');
  const [pasteMessage, setPasteMessage] = useState<{ text: string; isProblem: boolean } | null>(
    null,
  );
  const [positionMessage, setPositionMessage] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [openWork, setOpenWork] = useState<OpenWorkDetail | null>(null);
  const navigation = useNavigationInput();
  const customers = useOwnerCustomers(navigation, isCreate && draft.ownerChoice === 'CUSTOMER');
  const counterparties = useOwnerCounterparties(
    navigation,
    isCreate && draft.ownerChoice === 'PARTNER',
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const locksRef = useRef(locks);
  locksRef.current = locks;

  useEffect(() => heading.current?.focus(), []);

  /*
   * TIM NGUOC sau MOI lan dat diem bang tay — bam ban do (o man cha), keo ghim, vi tri hien tai, dan
   * toa do: dien ten va dia chi CON TRONG. Chay theo CHINH diem cua ban nhap (khong theo nut nao da
   * dat no), nen mot lan bam ban do o man cha cung duoc tim nguoc. Diem doi truoc khi ket qua ve thi
   * ket qua cu bi bo — khong ghi de diem moi bang dia chi cua diem cu.
   */
  const pointKey = draft.point === null ? null : `${draft.point.latitude},${draft.point.longitude}`;
  const pointSource = draft.pointSource;
  useEffect(() => {
    const point = draftRef.current.point;
    if (!canLookUp || point === null || pointSource === null) return undefined;
    if (!REVERSE_SOURCES.includes(pointSource)) return undefined;
    let isCurrent = true;
    transportApi.places
      .reverse(point)
      .then((response) => {
        if (!isCurrent || response.status !== 'OK' || response.result === null) return;
        onChangeRef.current(withLookupFill(draftRef.current, response.result, locksRef.current));
      })
      .catch(() => undefined);
    return () => {
      isCurrent = false;
    };
  }, [pointKey, pointSource, canLookUp]);

  const placeAt = (point: GeoPoint, source: PointSource) => {
    onChange(withPoint(draftRef.current, point, source));
  };

  /*
   * O tim nam TRONG bieu mau dia diem — khong the la mot `<form>` long (HTML cam). Enter trong o tim
   * chay tim, KHONG gui bieu mau dia diem.
   */
  const runSearch = async () => {
    const checked = checkSearchQuery(query);
    if (!checked.ok) {
      setSearch({
        status: 'DONE',
        results: [],
        message: checked.message,
        isProblem: true,
        attribution: null,
      });
      return;
    }
    setSearch({ status: 'BUSY' });
    try {
      const response = await transportApi.places.search(checked.query);
      const outcome = searchOutcomeOf(response);
      if (response.status === 'DISABLED') {
        setSearch({ status: 'OFF', message: outcome.message });
        return;
      }
      setSearch({
        status: 'DONE',
        results: response.status === 'OK' ? response.results : [],
        message: outcome.message,
        isProblem: outcome.isProblem,
        attribution: response.attribution,
      });
    } catch (error) {
      setSearch({
        status: 'DONE',
        results: [],
        // Cau ky thuat (gioi han toc do, mat mang) khong len man hinh — cung luat voi moi loi quan tri.
        message: adminErrorMessage(error),
        isProblem: true,
        attribution: null,
      });
    }
  };

  const placeAtMyPosition = async () => {
    setPositionMessage('Đang lấy vị trí…');
    const outcome = await readOfficePosition();
    if (!outcome.ok) {
      setPositionMessage(POSITION_FAILURE_MESSAGE[outcome.failure]);
      return;
    }
    setPositionMessage('Đã đặt điểm ở vị trí hiện tại của bạn — kéo ghim nếu cần chỉnh.');
    placeAt(outcome.point, 'POSITION');
  };

  const applyPasted = () => {
    const parsed = parseCoordinateInput(pasted);
    if (!parsed.ok) {
      setPasteMessage({ text: parsed.message, isProblem: true });
      return;
    }
    setPasteMessage({
      text: parsed.warning ?? `Đã đặt điểm ở ${formatCoordinates(parsed.point)}.`,
      isProblem: parsed.warning !== null,
    });
    placeAt(parsed.point, 'PASTE');
  };

  const save = useMutation({
    mutationFn: async (acknowledgeOpenWork: boolean) => {
      if (isCreate) {
        const input = buildCreatePlaceInput(draft);
        if (input === null) throw new Error('Còn thiếu thông tin.');
        return placesAdminApi.create(input);
      }
      const patch = buildUpdatePlaceInput(draft, acknowledgeOpenWork);
      if (patch === null || draft.placeId === null) throw new Error('Còn thiếu thông tin.');
      if (isEmptyPatch(patch)) return draft.original as PlaceAdminView;
      return placesAdminApi.update(draft.placeId, patch);
    },
    onSuccess: (saved) => {
      setOpenWork(null);
      onSaved(saved, isCreate);
    },
    onError: (error) => setOpenWork(openWorkOf(error)),
  });

  const problems = placeDraftProblems(draft);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setShowProblems(true);
    if (problems.length === 0) save.mutate(false);
  };

  const ownerChoice = OWNER_CHOICES.find((choice) => choice.id === draft.ownerChoice) ?? null;

  return (
    <section className="tx-admin-sheet tx-admin-placeeditor" aria-labelledby={titleId}>
      <header className="tx-admin-sheet__head">
        <div>
          <p className="tx-admin-eyebrow">
            {isCreate
              ? 'Thêm địa điểm'
              : `${placeKindLabel(draft.original as PlaceAdminView)} · ${placeOwnerLine(draft.original as PlaceAdminView)}`}
          </p>
          <h2 id={titleId} ref={heading} tabIndex={-1}>
            {isCreate ? 'Địa điểm mới' : `Sửa ${draft.original?.name ?? ''}`}
          </h2>
        </div>
      </header>

      <form
        className="tx-form"
        onSubmit={submit}
        aria-label={isCreate ? 'Thêm địa điểm' : 'Sửa địa điểm'}
        noValidate
      >
        {isCreate ? (
          <fieldset className="tx-admin-presets tx-admin-owner">
            <legend>Địa điểm này của ai?</legend>
            {OWNER_CHOICES.map((choice) => {
              const isAllowed = isOwnerChoiceAllowed(choice.id, canManageCounterparties);
              return (
                <label
                  key={choice.id}
                  className="tx-admin-preset"
                  data-checked={draft.ownerChoice === choice.id ? '' : undefined}
                  data-disabled={isAllowed ? undefined : ''}
                >
                  <input
                    type="radio"
                    name="place-owner"
                    value={choice.id}
                    checked={draft.ownerChoice === choice.id}
                    disabled={!isAllowed}
                    onChange={() => onChange(withOwnerChoice(draft, choice.id))}
                  />
                  <strong>{choice.label}</strong>
                  <span>{choice.hint}</span>
                </label>
              );
            })}
            {canManageCounterparties ? null : (
              <p className="tx-note tx-note--warn">{COUNTERPARTY_MANAGE_NEEDED}</p>
            )}
          </fieldset>
        ) : null}

        {isCreate && ownerChoice?.id === 'CUSTOMER' ? (
          <PermissionGate viewer={navigation} action="transport.customer.read">
            <label className="tx-field">
              <span>Khách hàng</span>
              <select
                value={draft.customerId}
                onChange={(event) => onChange({ ...draft, customerId: event.target.value })}
              >
                <option value="">— Chọn khách hàng —</option>
                {(customers.data ?? [])
                  .filter((customer) => customer.status === 'ACTIVE')
                  .map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
              </select>
            </label>
          </PermissionGate>
        ) : null}

        {isCreate && ownerChoice?.id === 'PARTNER' ? (
          <PermissionGate viewer={navigation} action="transport.counterparty.read">
            <div className="tx-admin-fields">
              <label className="tx-field">
                <span>Đơn vị</span>
                <select
                  value={draft.counterpartyId}
                  onChange={(event) => onChange({ ...draft, counterpartyId: event.target.value })}
                >
                  <option value="">— Chọn đơn vị —</option>
                  {(counterparties.data ?? [])
                    .filter((entry) => entry.status === 'ACTIVE')
                    .map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                        {entry.taxCode === null ? '' : ` · MST ${entry.taxCode}`}
                      </option>
                    ))}
                  <option value={NEW_COUNTERPARTY}>+ Thêm đơn vị mới</option>
                </select>
              </label>
              {draft.counterpartyId === NEW_COUNTERPARTY ? (
                <>
                  <label className="tx-field">
                    <span>Tên đơn vị mới</span>
                    <input
                      value={draft.newCounterpartyName}
                      onChange={(event) =>
                        onChange({ ...draft, newCounterpartyName: event.target.value })
                      }
                      maxLength={200}
                    />
                  </label>
                  <label className="tx-field">
                    <span>Mã số thuế (nếu có)</span>
                    <input
                      value={draft.newCounterpartyTaxCode}
                      onChange={(event) =>
                        onChange({ ...draft, newCounterpartyTaxCode: event.target.value })
                      }
                      inputMode="numeric"
                      maxLength={20}
                    />
                  </label>
                </>
              ) : null}
            </div>
          </PermissionGate>
        ) : null}

        {!isCreate || draft.ownerChoice !== null ? (
          <>
            <fieldset className="tx-admin-position">
              <legend>Vị trí</legend>
              <p className="tx-admin-position__now" aria-live="polite" data-testid="place-point">
                {draft.point === null
                  ? 'Chưa đặt điểm. Bấm vào bản đồ, hoặc dùng một cách bên dưới.'
                  : `Điểm đã đặt: ${formatCoordinates(draft.point)} — kéo ghim “Đây” trên bản đồ để chỉnh.`}
              </p>
              {basemapNotice === null ? null : (
                <p className="tx-note tx-note--warn">
                  {basemapNotice} Bản đồ nền không tải được thì dán toạ độ hoặc liên kết bản đồ bên
                  dưới.
                </p>
              )}
              {draft.point === null ? null : (
                <div className="tx-admin-nudge" role="group" aria-label="Chỉnh điểm từng 10 mét">
                  {(
                    [
                      ['N', 'Lên (Bắc)'],
                      ['S', 'Xuống (Nam)'],
                      ['W', 'Sang trái (Tây)'],
                      ['E', 'Sang phải (Đông)'],
                    ] as const
                  ).map(([direction, label]) => (
                    <button
                      key={direction}
                      type="button"
                      className="tx-btn tx-btn--ghost tx-btn--small"
                      onClick={() =>
                        draft.point !== null &&
                        placeAt(nudgePoint(draft.point, direction, NUDGE_METRES), 'NUDGE')
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {canLookUp && search.status !== 'OFF' ? (
                <div className="tx-admin-lookup">
                  <div className="tx-inlineform" role="search" aria-label="Tìm địa điểm theo tên">
                    <label className="tx-field">
                      <span>Tìm theo tên hoặc địa chỉ</span>
                      <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return;
                          event.preventDefault();
                          void runSearch();
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="tx-btn"
                      disabled={search.status === 'BUSY'}
                      onClick={() => void runSearch()}
                    >
                      {search.status === 'BUSY' ? 'Đang tìm…' : 'Tìm'}
                    </button>
                  </div>
                  <p className="tx-note" role="status">
                    {search.status === 'DONE' ? search.message : ''}
                  </p>
                  {search.status === 'DONE' && search.results.length > 0 ? (
                    <ol className="tx-admin-results">
                      {search.results.map((result, index) => (
                        <li key={`${index}-${result.label}`}>
                          <span>
                            <strong>{result.label}</strong>
                            {result.address === null ? null : <small>{result.address}</small>}
                          </span>
                          <button
                            type="button"
                            className="tx-btn tx-btn--small"
                            aria-label={`Đặt điểm ở đây: ${result.label}`}
                            onClick={() => {
                              onChange(
                                withLookupFill(
                                  withPoint(draftRef.current, result.point, 'SEARCH'),
                                  result,
                                  locks,
                                ),
                              );
                            }}
                          >
                            Đặt điểm ở đây
                          </button>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {search.status === 'DONE' && search.attribution !== null ? (
                    <small className="tx-note">{search.attribution}</small>
                  ) : null}
                </div>
              ) : null}
              {search.status === 'OFF' ? <p className="tx-note">{search.message}</p> : null}

              <div className="tx-admin-actions">
                <button
                  type="button"
                  className="tx-btn tx-btn--ghost tx-btn--small"
                  onClick={() => void placeAtMyPosition()}
                >
                  Dùng vị trí hiện tại
                </button>
                <span className="tx-admin-actions__status" role="status">
                  {positionMessage ?? ''}
                </span>
              </div>

              <details className="tx-admin-paste">
                <summary>Dán toạ độ hoặc liên kết Google Maps</summary>
                <div className="tx-inlineform">
                  <label className="tx-field">
                    <span>Toạ độ (vĩ độ, kinh độ) hoặc liên kết</span>
                    <input
                      value={pasted}
                      onChange={(event) => setPasted(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        applyPasted();
                      }}
                      spellCheck={false}
                    />
                  </label>
                  <button type="button" className="tx-btn" onClick={applyPasted}>
                    Dùng toạ độ này
                  </button>
                </div>
                {pasteMessage === null ? null : (
                  <p
                    className={pasteMessage.isProblem ? 'tx-note tx-note--warn' : 'tx-note'}
                    role="status"
                  >
                    {pasteMessage.text}
                  </p>
                )}
              </details>
            </fieldset>

            <div className="tx-admin-radius">
              <label className="tx-field">
                <span>Bán kính tính là “đã đến nơi” (mét)</span>
                <input
                  type="range"
                  min={RADIUS_SLIDER_MIN}
                  max={RADIUS_SLIDER_MAX}
                  step={10}
                  value={Math.min(
                    Math.max(draft.radiusMetres, RADIUS_SLIDER_MIN),
                    RADIUS_SLIDER_MAX,
                  )}
                  onChange={(event) =>
                    onChange({ ...draft, radiusMetres: Number(event.target.value) })
                  }
                  aria-valuetext={`${draft.radiusMetres} mét`}
                />
              </label>
              <label className="tx-field tx-field--inline">
                <span>Bán kính (m)</span>
                <input
                  type="number"
                  min={RADIUS_MIN_METRES}
                  max={RADIUS_MAX_METRES}
                  value={draft.radiusMetres}
                  onChange={(event) =>
                    onChange({ ...draft, radiusMetres: Math.round(Number(event.target.value)) })
                  }
                />
              </label>
            </div>

            <div className="tx-admin-fields">
              {/*
                Goi y o bi khoa nam NGOAI nhan: nam trong `<label>` thi no thanh mot phan TEN cua o
                ("Địa chỉ Đổi địa chỉ…"). Trinh doc man hinh doc no qua `aria-describedby`.
              */}
              <div className="tx-admin-field">
                <label className="tx-field">
                  <span>Tên địa điểm</span>
                  <input
                    value={draft.name}
                    onChange={(event) => onChange({ ...draft, name: event.target.value })}
                    maxLength={200}
                    required
                    readOnly={locks.name}
                    aria-describedby={locks.name ? nameHintId : undefined}
                  />
                </label>
                {locks.name ? (
                  <small className="tx-admin-hint" id={nameHintId}>
                    {NAME_LOCKED_HINT}
                  </small>
                ) : null}
              </div>
              <div className="tx-admin-field">
                <label className="tx-field">
                  <span>Địa chỉ</span>
                  <input
                    value={draft.address}
                    onChange={(event) => onChange({ ...draft, address: event.target.value })}
                    maxLength={300}
                    readOnly={locks.address}
                    aria-describedby={locks.address ? addressHintId : undefined}
                  />
                </label>
                {locks.address ? (
                  <small className="tx-admin-hint" id={addressHintId}>
                    {ADDRESS_LOCKED_HINT}
                  </small>
                ) : null}
              </div>
              <label className="tx-field tx-field--wide">
                <span>Ghi chú cho lái xe, điều hành (cổng vào, giờ nhận hàng…)</span>
                <textarea
                  rows={2}
                  value={draft.note}
                  onChange={(event) => onChange({ ...draft, note: event.target.value })}
                  maxLength={500}
                />
              </label>
            </div>
          </>
        ) : null}

        {geometryChanged(draft) ? (
          <p className="tx-note tx-note--warn" role="status" data-testid="geometry-warning">
            {GEOMETRY_CHANGE_WARNING}
          </p>
        ) : null}
        {showProblems && problems.length > 0 ? (
          <ul className="tx-admin-violations" role="alert">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}
        {save.error !== null && openWork === null ? <AdminError error={save.error} /> : null}
        <div className="tx-admin-actions">
          <button type="submit" className="tx-btn tx-btn--go" disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : isCreate ? 'Thêm địa điểm' : 'Lưu thay đổi'}
          </button>
          <button type="button" className="tx-btn tx-btn--ghost" onClick={onCancel}>
            Huỷ
          </button>
        </div>
      </form>

      <OpenWorkDialog
        detail={openWork}
        confirmLabel="Tôi đã xem, vẫn lưu"
        isBusy={save.isPending}
        onCancel={() => setOpenWork(null)}
        onConfirm={() => save.mutate(true)}
      />
    </section>
  );
}
