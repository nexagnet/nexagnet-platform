import { formatInstant, formatMoney } from '../customer-view';
import type { RecordFuelCostAttributionInput } from '../transport-api';
import { canPerform, type TransportViewerInput } from '../transport-actions';
import type { FuelCostAttributionLine, FuelEntryCostAttributionView } from '../transport-types';

/**
 * PHAN BO GIA THANH NHIEN LIEU o dang man hinh — `#364`. Ham THUAN: moi quyet dinh "hien gi, cho bam
 * gi" nam o day (co test), JSX chi ve.
 *
 * Hai so cai, loai tru nhau (may chu noi so cai nao qua `ledger`):
 *   · phieu CHUYEN CU — gia thanh da vao chuyen o so chi phi chuyen; man nay chi noi ra dieu do;
 *   · phieu theo VONG XE — ke toan chia tien vao vong xe / chang, co the nhieu dong, dao giu lich su.
 */

export interface FuelCostTargetOption {
  readonly key: string;
  readonly label: string;
  readonly target: RecordFuelCostAttributionInput['target'];
}

export interface FuelCostLineModel {
  readonly id: string;
  readonly kindLabel: string;
  readonly targetLabel: string;
  readonly amountLabel: string;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly createdAtLabel: string;
  /** Cap phat CON hieu luc (chua bi dao) — chi dong nay moi co nut "Đảo". */
  readonly isActiveAllocation: boolean;
}

export interface FuelCostAttributionModel {
  readonly isLegacyTrip: boolean;
  /** Mot cau noi so cai nao dang giu tien cua phieu nay. */
  readonly ledgerNote: string;
  readonly totalLabel: string;
  readonly attributedLabel: string | null;
  readonly unattributedLabel: string | null;
  readonly lines: readonly FuelCostLineModel[];
  /** Duoc CAP PHAT them: dung quyen, phieu da duyet, con tien chua phan bo. */
  readonly canAttribute: boolean;
  /** Vi sao chua cap phat duoc — `null` khi duoc. */
  readonly blockedReason: string | null;
  /** Duoc DAO mot dong: dung quyen (dao luon hop le voi mot cap phat con hieu luc). */
  readonly canReverse: boolean;
  readonly targets: readonly FuelCostTargetOption[];
  /** So tien de san trong o nhap — phan CON LAI, khong phai toan bo phieu. */
  readonly defaultAmount: number;
}

const targetLabelOf = (line: FuelCostAttributionLine): string => {
  const run = `Vòng xe ${line.runCode ?? line.runId}`;
  return line.legId === null ? run : `${run} · Chặng ${line.legSequence ?? '?'}`;
};

export function toFuelCostAttributionModel(
  view: FuelEntryCostAttributionView,
  viewer: TransportViewerInput,
): FuelCostAttributionModel {
  const mayRecord = canPerform(viewer, 'transport.fuel.cost_attribution.record');
  const totalLabel = formatMoney(view.amount);

  if (view.ledger === 'LEGACY_TRIP_EXPENSE') {
    const trip = view.legacyTrip?.tripCode ?? view.legacyTrip?.tripId ?? 'chuyến cũ';
    return {
      isLegacyTrip: true,
      ledgerNote:
        view.legacyTrip?.projectedExpenseId === null
          ? `Phiếu gắn chuyến cũ ${trip}: giá thành sẽ vào chi phí của chuyến khi phiếu được duyệt — không phân bổ ở đây.`
          : `Phiếu gắn chuyến cũ ${trip}: giá thành đã vào chi phí của chuyến — không phân bổ lần hai ở đây.`,
      totalLabel,
      attributedLabel: null,
      unattributedLabel: null,
      lines: [],
      canAttribute: false,
      blockedReason: null,
      canReverse: false,
      targets: [],
      defaultAmount: 0,
    };
  }

  const attributed = view.attributedAmount ?? 0;
  const unattributed = view.unattributedAmount ?? view.amount - attributed;
  const blockedReason = !mayRecord
    ? 'Tài khoản này không có quyền phân bổ giá thành.'
    : view.verificationStatus !== 'VERIFIED'
      ? 'Duyệt phiếu trước khi phân bổ giá thành.'
      : unattributed <= 0
        ? 'Đã phân bổ hết số tiền của phiếu — đảo một dòng trước nếu cần chia lại.'
        : null;

  const targets: FuelCostTargetOption[] = [];
  if (view.context.runId !== null) {
    const run = view.context.runCode ?? view.context.runId;
    targets.push({
      key: `run:${view.context.runId}`,
      label: `Vòng xe ${run}`,
      target: { kind: 'RUN', runId: view.context.runId },
    });
    if (view.context.legId !== null) {
      targets.push({
        key: `leg:${view.context.legId}`,
        label: `Vòng xe ${run} · Chặng ${view.context.legSequence ?? '?'}`,
        target: { kind: 'LEG', legId: view.context.legId },
      });
    }
  }

  return {
    isLegacyTrip: false,
    ledgerNote:
      'Phiếu theo vòng xe: giá thành không tự vào chuyến nào — kế toán phân bổ vào vòng xe hoặc chặng.',
    totalLabel,
    attributedLabel: formatMoney(attributed),
    unattributedLabel: formatMoney(unattributed),
    lines: view.lines.map((line) => ({
      id: line.id,
      kindLabel: line.kind === 'ALLOCATION' ? 'Phân bổ' : 'Đảo',
      targetLabel: targetLabelOf(line),
      amountLabel: formatMoney(line.signedAmount),
      note: line.note,
      recordedBy: line.recordedBy,
      createdAtLabel: formatInstant(line.createdAt),
      isActiveAllocation: line.kind === 'ALLOCATION' && line.reversedById === null,
    })),
    canAttribute: blockedReason === null && targets.length > 0,
    blockedReason:
      blockedReason ??
      (targets.length === 0 ? 'Phiếu không có vòng xe — chưa có công việc để phân bổ vào.' : null),
    canReverse: mayRecord,
    targets,
    defaultAmount: Math.max(unattributed, 0),
  };
}
