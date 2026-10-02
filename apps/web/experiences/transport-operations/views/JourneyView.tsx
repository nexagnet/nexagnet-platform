'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo } from 'react';
import { DataTable, MetricCard, PageHeader, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useNavigationInput,
  useRunJourney,
  useRunJourneyMap,
  useVehicleRuns,
} from '../hooks/useTransportWorkspace';
import { buildSectionUrl } from '../navigation';
import { canPerform } from '../transport-actions';
import { loadedVsEmptyOption, type ChartPalette } from '../visual/chart-options';
import { TransportChart } from '../visual/TransportChart';
import { boundsOf, toJourney, toJourneyMap, type JourneyLegRow } from '../workspace/journey';

/**
 * BAO CAO BAN DO MOT VONG CHAY (#278 N5).
 *
 * ===========================================================================
 * BAN DO NAP DONG, VA `ssr: false` LA BAT BUOC.
 *
 * MapLibre cham `window` ngay khi module duoc nap. Trong App Router, mot component `'use client'`
 * VAN duoc ket xuat mot lan o may chu de dung HTML dau tien — nen mot `import` tinh se lam ca trang
 * chet o may chu chu khong phai o trinh duyet. `dynamic(..., { ssr: false })` la duong duy nhat, va
 * no chi dung duoc BEN TRONG mot component may khach (Next 15 tu choi no o Server Component).
 *
 * Loi ich thu hai la thu do duoc: ca MapLibre lan deck.gl nam trong mot goi rieng, nen man hinh
 * danh sach chuyen khong tai chung ve.
 *
 * ===========================================================================
 * HAI LAN GOI, VA MOT `403` KHONG PHAI MOT LOI.
 *
 * Toa do di sau `transport.location.history.read`, ma ke toan KHONG co. Nen khi lan goi ban do that
 * bai, man hinh VAN ve bao cao va noi ro vi sao khong co ban do — do la hinh dang dung cua san
 * pham, khong phai mot su co.
 */
const TransportMap = dynamic(() => import('../visual/TransportMap'), {
  ssr: false,
  loading: () => <LoadingState label="Đang tải bản đồ…" />,
});

const LEG_COLUMNS = [
  { key: 'sequence', header: 'Chặng', render: (row: JourneyLegRow) => row.sequence },
  {
    key: 'kind',
    header: 'Loại',
    /*
     * `#278` N13 bai 4 — chang RONG phai phan biet duoc ma khong can den mau. `StatusBadge` mang
     * CHU ("RỖNG"), va `tone` chi to them; mot ban in den trang van doc ra dung chang nao la rong.
     */
    render: (row: JourneyLegRow) => (
      <StatusBadge label={row.kindLabel} tone={row.isEmpty ? 'stop' : 'go'} />
    ),
  },
  {
    key: 'route',
    header: 'Cung đường',
    render: (row: JourneyLegRow) => row.route,
    isRowHeader: true,
  },
  { key: 'order', header: 'Đơn', render: (row: JourneyLegRow) => row.orderCode },
  {
    key: 'planned-km',
    header: 'Km dự kiến',
    render: (row: JourneyLegRow) => row.plannedDistanceKm,
    isNumeric: true,
  },
  {
    key: 'km',
    header: 'Km thực tế',
    render: (row: JourneyLegRow) => row.distanceKm,
    isNumeric: true,
  },
  {
    key: 'variance',
    header: 'Lệch',
    render: (row: JourneyLegRow) => row.distanceVariance,
    isNumeric: true,
  },
  { key: 'phase', header: 'Hiện trường', render: (row: JourneyLegRow) => row.phase },
  { key: 'started', header: 'Bắt đầu', render: (row: JourneyLegRow) => row.startedAt },
  { key: 'completed', header: 'Kết thúc', render: (row: JourneyLegRow) => row.completedAt },
];

export function JourneyView({
  selection,
  onSelect,
}: {
  readonly selection: string | null;
  readonly onSelect: (selection: string | null) => void;
}): React.ReactElement {
  const input = useNavigationInput();
  const runsQuery = toSectionQuery(useVehicleRuns(input));
  const journeyQuery = toSectionQuery(useRunJourney(input, selection));
  const mapQuery = toSectionQuery(useRunJourneyMap(input, selection));

  const model = journeyQuery.data === undefined ? null : toJourney(journeyQuery.data);
  const mapModel = mapQuery.data === undefined ? null : toJourneyMap(mapQuery.data);
  const bounds = mapModel === null ? null : boundsOf(mapModel);

  const chart = model?.chart;
  const buildOption = useCallback(
    (palette: ChartPalette) =>
      loadedVsEmptyOption(
        chart ?? { sequences: [], loadedKm: [], emptyKm: [], omittedLegs: 0 },
        palette,
      ),
    [chart],
  );

  const runOptions = useMemo(
    () => (runsQuery.data ?? []).map((run) => run.code).sort(),
    [runsQuery.data],
  );

  return (
    <>
      <PageHeader
        title="Bản đồ vòng chạy"
        summary="Chặng có hàng và chặng rỗng của một vòng chạy, trên bản đồ và trên dòng thời gian."
        context={model === null ? undefined : model.context}
        actions={
          <label className="tx-field tx-field--inline">
            <span>Vòng chạy</span>
            <select
              value={selection ?? ''}
              onChange={(event) => onSelect(event.target.value === '' ? null : event.target.value)}
            >
              <option value="">— Chọn vòng chạy —</option>
              {runOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {journeyQuery.errorMessage === null ? null : (
        <ErrorState message={journeyQuery.errorMessage} onRetry={journeyQuery.refetch} />
      )}
      {journeyQuery.isLoading ? <LoadingState label="Đang đọc vòng chạy…" /> : null}

      {selection === null ? (
        <EmptyState
          title="Chọn một vòng chạy để xem bản đồ và dòng thời gian của nó."
          nextAction={<a href={buildSectionUrl('movement')}>Mở danh sách vòng chạy</a>}
        />
      ) : null}

      {model === null ? null : (
        <>
          <section className="tx-cards" aria-label="Số liệu vòng chạy">
            {model.metrics.map((metric) => (
              <MetricCard
                key={metric.key}
                label={metric.label}
                value={metric.value}
                hint={metric.hint}
              />
            ))}
          </section>

          <section className="tx-panel" aria-label="Bản đồ vòng chạy">
            <h2>Bản đồ</h2>
            {/* `#395`: hoi THANG quyen cua ban do (phan phu cua muc), khong doan tu `isBlocked`. */}
            {!canPerform(input, 'transport.location.history.read') ||
            mapQuery.errorMessage !== null ? (
              <p className="tx-note tx-note--warn">
                Tài khoản của bạn không được xem lịch sử vị trí, nên phần bản đồ bị ẩn. Báo cáo bên
                dưới vẫn đầy đủ.
              </p>
            ) : null}
            {mapQuery.isLoading ? <LoadingState label="Đang đọc toạ độ…" /> : null}

            {mapModel !== null && bounds !== null ? (
              <>
                <TransportMap
                  model={mapModel}
                  bounds={bounds}
                  ariaLabel={`Bản đồ vòng chạy ${model.runCode}`}
                />
                {/*
                 * CHU GIAI mang CA mau lan chu. `#278` N2 cam mau la tin hieu duy nhat, va mot chu
                 * giai chi co hai o mau thi khong doc duoc tren ban in den trang.
                 */}
                <ul className="tx-legend" aria-label="Chú giải bản đồ">
                  <li>
                    <span
                      className="tx-legend__swatch tx-legend__swatch--loaded"
                      aria-hidden="true"
                    />
                    Chặng CÓ HÀNG
                  </li>
                  <li>
                    <span
                      className="tx-legend__swatch tx-legend__swatch--empty"
                      aria-hidden="true"
                    />
                    Chặng RỖNG (chạy không hàng)
                  </li>
                </ul>
                {mapModel.rawSampledFrom > 0 ? (
                  <p className="tx-note">
                    Vệt GPS thô: {mapModel.rawSampledFrom.toLocaleString('vi-VN')} bản định vị, đã
                    thưa bớt ở máy chủ để vẽ. Đây là toạ độ thô, không phải tuyến đã khớp bản đồ.
                  </p>
                ) : null}
              </>
            ) : mapModel !== null ? (
              <EmptyState title="Chưa có toạ độ nào để vẽ cho vòng chạy này." />
            ) : null}

            {mapModel === null || mapModel.gaps.length === 0 ? null : (
              <ul className="tx-notes" aria-label="Phần bản đồ chưa vẽ được">
                {mapModel.gaps.map((gap) => (
                  <li key={gap.key}>{gap.text}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="tx-panel" aria-label="Km có hàng và km rỗng">
            <h2>Km có hàng vs km rỗng</h2>
            {model.chart.sequences.length === 0 ? (
              <EmptyState title="Chưa chặng nào có số km để vẽ biểu đồ." />
            ) : (
              <TransportChart
                ariaLabel={`Biểu đồ km có hàng và km rỗng theo chặng của vòng chạy ${model.runCode}`}
                buildOption={buildOption}
              />
            )}
            {model.chart.omittedLegs > 0 ? (
              <p className="tx-note tx-note--warn">
                {model.chart.omittedLegs} chặng chưa nhập km nên không có trên biểu đồ — và vì thế
                mọi tổng ở trên đều để trống thay vì cộng thiếu.
              </p>
            ) : null}
          </section>

          <section className="tx-panel" aria-label="Các chặng">
            <h2>Các chặng</h2>
            <DataTable
              caption={`Các chặng của vòng chạy ${model.runCode}`}
              columns={LEG_COLUMNS}
              rows={model.legs}
              rowKey={(row) => row.key}
            />
          </section>

          <section className="tx-panel" aria-label="Dòng thời gian">
            <h2>Dòng thời gian</h2>
            {model.timeline.length === 0 ? (
              <EmptyState title="Chưa có mốc hiện trường nào cho vòng chạy này." />
            ) : (
              <ol className="tx-timeline">
                {model.timeline.map((row) => (
                  <li key={row.key}>
                    <strong>{row.at}</strong> — {row.label} · {row.legSequence} ·{' '}
                    <span className={row.hasLocationProof ? undefined : 'tx-note--warn'}>
                      {row.proofLabel}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {model.unavailableNotes.length === 0 ? null : (
            <ul className="tx-notes" aria-label="Nguồn khách chưa bật">
              {model.unavailableNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
