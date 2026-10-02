'use client';

import { MetricCard } from '../components/primitives';
import type { RunMovementSummary } from '../transport-types';

/**
 * SO KM CUA MOT VONG CHAY — tach khoi `MovementView` (`#379`) de man don hang giu duoi 500 dong.
 *
 * MOT CAM TUYET DOI: man hinh KHONG tu cong km. `loadedKm`/`emptyKm`/`emptyRatio` deu do may chu tra,
 * va tu `#276` L6 co HAI o — DA DI va DU DINH — khong duoc gop lai: mot chang chua chay xong la mot
 * ke hoach, khong phai mot quang duong da di.
 */

/** `null` la CHUA BIET, khong phai 0 — va man hinh phai noi dung the. */
export const km = (value: number | null): string =>
  value === null ? 'chưa nhập' : `${value.toLocaleString('vi-VN')} km`;

const ratio = (value: number | null): string =>
  value === null ? 'chưa đủ dữ liệu' : `${(value * 100).toFixed(1)}%`;

export function RunMovementMetrics({
  movement,
}: {
  readonly movement: RunMovementSummary;
}): React.ReactElement {
  const missing =
    movement.actual.legsMissingDistance.loaded + movement.actual.legsMissingDistance.empty;
  return (
    <>
      <MetricCard label="Km có hàng (đã đi)" value={km(movement.actual.loadedKm)} />
      <MetricCard label="Km rỗng (đã đi)" value={km(movement.actual.emptyKm)} />
      <MetricCard
        label="Tỷ lệ rỗng (đã đi)"
        value={ratio(movement.actual.emptyRatio)}
        hint={
          movement.actual.complete
            ? null
            : `Còn ${missing} chặng đã xong chưa nhập km — chưa tính được tỷ lệ.`
        }
      />
      <MetricCard
        label="Km rỗng (dự kiến)"
        value={km(movement.planned.emptyKm)}
        hint="Chặng chưa chạy xong. KHÔNG cộng vào km đã đi."
      />
      {movement.cancelledLegs > 0 && (
        <MetricCard
          label="Chặng đã huỷ"
          value={String(movement.cancelledLegs)}
          hint="Kế hoạch bị bỏ — không tính vào km đã đi lẫn km dự kiến."
        />
      )}
    </>
  );
}
