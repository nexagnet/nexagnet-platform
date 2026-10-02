'use client';

import { useState } from 'react';
import { DataTable, StatusBadge, type DataColumn } from '../components/primitives';
import { ConfirmAction, EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useLegTransition,
  useNavigationInput,
  useRunClosure,
  useRunJourney,
  useVehicleRunDetail,
} from '../hooks/useTransportWorkspace';
import { canPerform } from '../transport-actions';
import type { RunJourneyView, RunLeg } from '../transport-types';
import {
  closureLineFor,
  fieldTruthLabel,
  LEG_FAILURE_MESSAGE,
  LEG_KIND_LABEL,
  LEG_STATUS_LABEL,
  legKindTone,
  legStatusTone,
  legTitle,
  legWorkflowFor,
  lifecycleFailureOf,
  transitionNoticeFor,
  type FieldTruth,
  type LegAction,
  type LegWorkflowRow,
} from '../workspace/office-lifecycle';

/**
 * CHANG CUA MOT VONG CHAY, VA VIEC VAN PHONG LAM TREN TUNG CHANG — `#376`.
 *
 * ============================================================================================
 * HAI TRUC DUNG CANH NHAU, KHONG TRON VAO NHAU
 * ============================================================================================
 *
 * Cot "Hiện trường" doc MOC lai xe da bam (bao cao vong chay, `transport.run.read`); cot "Tiến độ"
 * la `RunLegStatus`. Lai xe bam "Khách đã nhận hàng" KHONG doi cot thu hai — chi van phong doi, bang
 * dung hai nut o day. Cot thu nhat chi quyet dinh nut "Hoàn tất" co phai ghi de hay khong.
 *
 * ============================================================================================
 * KHONG CO NUT NAO CUA VONG CHAY
 * ============================================================================================
 *
 * Dong "Đóng vòng chạy" chi DOC phan xu cua he thong (`GET .../closure`) va ket qua ma chinh lan
 * tien chang tra ve. Mot nut "Đóng vòng chạy" o day la hoi quy cua `#293` R1.
 *
 * ============================================================================================
 * CONG THAT NAM O MAY CHU
 * ============================================================================================
 *
 * `canPerform` chi an nut voi vai chac chan bi tu choi. Quyen, hien truong va ghi de deu duoc may
 * chu kiem lai; mot lan tu choi hien cau tu `reason` co kieu, roi man hinh DOC LAI mo hinh (xem
 * `useLegTransition`) — khong mot trang thai nao duoc doi truoc khi may chu dong y.
 */

interface PendingLegAction {
  readonly leg: RunLeg;
  readonly action: LegAction;
}

interface Props {
  readonly runId: string;
  /**
   * Tieu de bang theo MA vong chay. La mot HAM vi ma chi co sau khi doc xong vong chay — dung
   * `runId` lam tieu de trong luc cho la in mot `cuid` ra man hinh.
   */
  readonly captionFor: (runCode: string) => string;
  /** Ma don theo `orderId` — man hinh khong bao gio in mot `cuid`. */
  readonly orderCodeOf: (orderId: string | null) => string;
  /** Hai cot km cua be mat nang cao (nguon bao cao km rong). */
  readonly showDistance?: boolean;
  /** Co ⇒ ve thanh mot khoi rieng "Tiến độ vòng chạy …" — khoi dung trong chi tiet DON. */
  readonly asPanel?: boolean;
}

const PANEL_LEAD =
  'Mốc lái xe bấm là bằng chứng hiện trường — không tự đổi tiến độ chặng. Văn phòng tiến từng ' +
  'chặng ở cột “Việc văn phòng”; vòng chạy do hệ thống tự đóng.';

const km = (value: number | null): string =>
  value === null ? 'chưa nhập' : `${value.toLocaleString('vi-VN')} km`;

const fieldTruthOf = (journey: RunJourneyView | undefined, legId: string): FieldTruth => {
  if (journey === undefined) return { kind: 'UNKNOWN' };
  if (journey.unavailableSources.includes('CHECKPOINT')) return { kind: 'NO_SOURCE' };
  const leg = journey.legs.find((entry) => entry.legId === legId);
  return leg === undefined ? { kind: 'UNKNOWN' } : { kind: 'KNOWN', phase: leg.phase };
};

export function RunLegWorkflow({
  runId,
  captionFor,
  orderCodeOf,
  showDistance = false,
  asPanel = false,
}: Props) {
  const navigation = useNavigationInput();
  const detail = toSectionQuery(useVehicleRunDetail(navigation, runId));
  const journey = useRunJourney(navigation, runId);
  const closure = useRunClosure(navigation, runId);
  const transition = useLegTransition();
  const canManage = canPerform(navigation, 'transport.run.manage');

  const [pending, setPending] = useState<PendingLegAction | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Chang may chu DA tu choi hoan tat vi hien truong — nut chuyen sang ghi de ngay, khong doi doc lai. */
  const [rejectedLegIds, setRejectedLegIds] = useState<readonly string[]>([]);

  if (detail.isBlocked) {
    return <EmptyState title="Vai của bạn không đọc được chặng của vòng chạy này." />;
  }
  if (detail.errorMessage !== null) {
    return <ErrorState message={detail.errorMessage} onRetry={detail.refetch} />;
  }
  if (detail.isLoading || detail.data == null) return <LoadingState label="Đang tải chặng…" />;

  const { run, legs } = detail.data;

  const rowFor = (leg: RunLeg) =>
    legWorkflowFor({
      leg,
      runCode: run.code,
      runStatus: run.status,
      field: fieldTruthOf(journey.data, leg.id),
      deliveryRejected: rejectedLegIds.includes(leg.id),
    });

  const open = (leg: RunLeg, action: LegAction) => {
    setFailure(null);
    setNotice(null);
    setOverrideReason('');
    setPending({ leg, action });
  };

  const confirm = () => {
    if (pending === null) return;
    const { leg, action } = pending;
    transition.mutate(
      {
        runId: run.id,
        legId: leg.id,
        to: action.to,
        ...(action.isOverride ? { overrideReason: overrideReason.trim() } : {}),
      },
      {
        onSuccess: (result) => {
          setPending(null);
          setNotice(
            transitionNoticeFor({
              legLabel: legTitle(leg),
              to: action.to,
              override: action.isOverride,
              runCode: run.code,
              closure: result.closure,
            }),
          );
        },
        onError: (error) => {
          const failed = lifecycleFailureOf(error, LEG_FAILURE_MESSAGE);
          if (failed.needsOverride) setRejectedLegIds((held) => [...held, leg.id]);
          setPending(null);
          setFailure(failed.message);
        },
      },
    );
  };

  const line = closureLineFor(run.status, closure.data ?? null);

  const body = (
    <>
      <DataTable<RunLeg>
        caption={captionFor(run.code)}
        rows={legs}
        rowKey={(leg) => leg.id}
        columns={columnsFor({
          canManage,
          rowFor,
          open,
          orderCodeOf,
          showDistance,
          journey: journey.data,
        })}
      />

      {/*
        `role="status"`: phan xu doi SAU moi lan tien chang (va sau luot quet cua he thong), nen day
        la mot vung doc lai duoc — trinh doc man hinh noi lai khi vong chay vua dong.
      */}
      <p className="tx-panel__lead" role="status" aria-label={`Đóng vòng chạy ${run.code}`}>
        Đóng vòng chạy (hệ thống tự quyết): <StatusBadge label={line.badge} tone={line.tone} />{' '}
        {line.text}
      </p>

      {notice === null ? null : (
        <p className="tx-note" role="status" aria-label="Kết quả tiến chặng">
          {notice}
        </p>
      )}
      {failure === null ? null : <ErrorState message={failure} />}

      <ConfirmAction
        open={pending !== null}
        title={pending?.action.confirmTitle ?? ''}
        detail={pending?.action.confirmDetail ?? null}
        confirmLabel={pending?.action.confirmLabel ?? ''}
        reasonLabel={pending?.action.reasonLabel ?? undefined}
        reason={overrideReason}
        onReasonChange={setOverrideReason}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
        isDestructive={pending?.action.isOverride === true}
        isBusy={transition.isPending}
      />
    </>
  );

  if (!asPanel) return body;
  return (
    <section className="tx-panel" aria-label={`Tiến độ vòng chạy ${run.code}`}>
      <h2>Tiến độ vòng chạy {run.code}</h2>
      <p className="tx-panel__lead">{PANEL_LEAD}</p>
      {body}
    </section>
  );
}

/** Cot cua bang — tach ra de than component chi con viec noi trang thai voi hop thoai. */
function columnsFor(input: {
  readonly canManage: boolean;
  readonly rowFor: (leg: RunLeg) => LegWorkflowRow;
  readonly open: (leg: RunLeg, action: LegAction) => void;
  readonly orderCodeOf: (orderId: string | null) => string;
  readonly showDistance: boolean;
  readonly journey: RunJourneyView | undefined;
}): readonly DataColumn<RunLeg>[] {
  const base: DataColumn<RunLeg>[] = [
    {
      key: 'sequence',
      header: '#',
      render: (leg) => String(leg.sequence),
      isRowHeader: true,
      isNumeric: true,
    },
    {
      key: 'route',
      header: 'Chặng',
      render: (leg) => `${leg.originLabel} → ${leg.destinationLabel}`,
    },
    {
      key: 'kind',
      header: 'Loại',
      render: (leg) => (
        <StatusBadge label={LEG_KIND_LABEL[leg.kind]} tone={legKindTone(leg.kind)} />
      ),
    },
    { key: 'order', header: 'Đơn', render: (leg) => input.orderCodeOf(leg.orderId) },
    {
      key: 'field',
      header: 'Hiện trường',
      render: (leg) => fieldTruthLabel(fieldTruthOf(input.journey, leg.id), leg.kind),
    },
    {
      key: 'status',
      header: 'Tiến độ',
      render: (leg) => (
        <StatusBadge label={LEG_STATUS_LABEL[leg.status]} tone={legStatusTone(leg.status)} />
      ),
    },
  ];

  const distance: DataColumn<RunLeg>[] = input.showDistance
    ? [
        { key: 'distance', header: 'Đã đi', render: (leg) => km(leg.distanceKm), isNumeric: true },
        {
          key: 'plannedDistance',
          header: 'Dự kiến',
          render: (leg) => km(leg.plannedDistanceKm),
          isNumeric: true,
        },
      ]
    : [];

  const actions: DataColumn<RunLeg> = {
    key: 'actions',
    header: 'Việc văn phòng',
    render: (leg) => (
      <LegActionCell
        leg={leg}
        row={input.rowFor(leg)}
        canManage={input.canManage}
        open={input.open}
      />
    ),
  };

  return [...base, ...distance, actions];
}

function LegActionCell({
  leg,
  row,
  canManage,
  open,
}: {
  readonly leg: RunLeg;
  readonly row: LegWorkflowRow;
  readonly canManage: boolean;
  readonly open: (leg: RunLeg, action: LegAction) => void;
}) {
  const { action, note } = row;
  return (
    <>
      {action === null || !canManage ? null : (
        <button
          type="button"
          className={
            action.isOverride ? 'tx-btn tx-btn--small tx-btn--stop' : 'tx-btn tx-btn--small'
          }
          aria-label={`${action.label} — ${legTitle(leg)}`}
          onClick={(event) => {
            // Bang KHONG chon dong, nhung giu an toan neu mot ngay no chon: bam nut khong phai bam dong.
            event.stopPropagation();
            open(leg, action);
          }}
        >
          {action.label}
        </button>
      )}
      {action !== null && !canManage ? (
        <span className="tx-note">Vai của bạn chỉ xem chặng.</span>
      ) : null}
      {note === null ? null : <p className="tx-note tx-note--warn tx-cellnote">{note}</p>}
      {action === null && note === null ? '—' : null}
    </>
  );
}
