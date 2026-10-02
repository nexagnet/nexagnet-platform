'use client';

import { PermissionNote } from '../components/PermissionGate';
import { MetricCard, PageHeader } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useControlTower,
  useNavigationInput,
  useReconciliations,
  useTransportOrders,
  useTrips,
} from '../hooks/useTransportWorkspace';
import { buildSectionUrl } from '../navigation';
import { hasOperationsScope, operationsEmptyMessage } from '../transport-actions';
import { toDashboard } from '../workspace/dashboard';

/**
 * BANG DIEU KHIEN — chi nhung con so DEM DUOC tu du lieu that dang co tren tay.
 *
 * #161 §4.B cam bia the bao duong/tuan thu/luong, va chi cho lay trang thai doi xe *"tu du lieu
 * truoc T6 o cho nao noi that duoc"*. Lenh cam do van nguyen: mot con so khong dem duoc thi KHONG
 * len bang, va tuyet doi khong duoc uoc doan cho day cho.
 *
 * #348: con so van hanh chinh doc tu THAP DIEU HANH (`useControlTower`) — cung lan goi, cung khoa
 * cache voi man `Bảng điều hành`, nen di tu Tong quan sang do la thay DUNG con so vua doc. Chuyen
 * lap tay chi con mot dong thong tin phu o cuoi trang.
 *
 * #351: ba the doi xe cung doc tu thap dieu hanh (`fleet`), nen man nay KHONG con goi danh sach xe
 * hay danh sach lai xe. Thap dieu hanh chua tra loi thi khong co the doi xe nao — khong co so 0, va
 * khong co phep dem thay the tu cot trang thai xe.
 *
 * Man hinh nay CHI SAP XEP: moi phep dem, moi cau chu, moi duong dan deu do `toDashboard` quyet.
 */
export function OverviewView() {
  const navigation = useNavigationInput();
  const tower = toSectionQuery(useControlTower(navigation));
  const orders = toSectionQuery(useTransportOrders(navigation));
  const trips = toSectionQuery(useTrips(navigation));
  const reconciliations = toSectionQuery(useReconciliations(navigation));

  if (!hasOperationsScope(navigation)) {
    return (
      <>
        <PageHeader title="Tổng quan" />
        <ErrorState message={operationsEmptyMessage(navigation)} />
      </>
    );
  }

  /*
   * LOI cua nguon CHINH moi duoc len dau trang. Chuyen lap tay la nguon PHU: no hong thi CHINH dong
   * thong tin phu noi "chua doc duoc" (`tripsFailed`), khong day mot loi do len tren nhung con so van
   * dang dung — va cung khong im lang, vi im lang doc ra y het "khong con chuyen nao chua khep".
   */
  const primary = [tower, orders];
  const firstError = primary.find((query) => query.errorMessage !== null)?.errorMessage ?? null;
  const isLoading = [...primary, trips].some((query) => query.isLoading);
  const retryFailed = () => {
    for (const query of primary) if (query.errorMessage !== null) query.refetch();
  };

  const model = toDashboard({
    tower: tower.data ?? null,
    orders: orders.data ?? null,
    trips: trips.data ?? null,
    tripsFailed: trips.errorMessage !== null,
    reconciliations: reconciliations.data ?? [],
    navigation,
  });

  return (
    <>
      <PageHeader
        title="Tổng quan"
        summary="Đơn hàng, vòng chạy đang chạy, đội xe, và những việc đang chờ người xử lý."
        context={model.generatedFor === null ? undefined : `Số liệu ngày ${model.generatedFor}`}
      />

      {firstError === null ? null : <ErrorState message={firstError} onRetry={retryFailed} />}
      {isLoading ? <LoadingState label="Đang đọc số liệu vận hành…" /> : null}
      {model.operationsNotice === null ? null : <EmptyState title={model.operationsNotice} />}
      {/*
        `#395` — the PHU (don dang mo, chuyen lap tay, ky doi soat) KHONG hien khi thieu quyen: mot
        cau noi thieu gi, thay vi mot the vang mat khong ly do.
      */}
      <PermissionNote
        viewer={navigation}
        actions={[
          'transport.order.read',
          'transport.trip.read',
          'transport.fuel.reconciliation.read',
        ]}
      />

      <section className="tx-cards" aria-label="Số liệu vận hành">
        {model.stats.map((stat) => (
          <MetricCard
            key={stat.key}
            label={stat.label}
            value={stat.value}
            hint={stat.hint}
            href={stat.section === null ? undefined : buildSectionUrl(stat.section)}
          />
        ))}
      </section>

      {model.headline === null ? null : (
        <section className="tx-panel" aria-label="Cần xử lý ngay">
          <h2>Cần xử lý ngay</h2>
          <p className="tx-panel__lead">{model.headline}</p>
          {model.hasWork ? (
            <ul className="tx-worklist">
              {model.work.map((item) => (
                <li key={item.key}>
                  <a href={buildSectionUrl(item.section, item.selection)}>
                    <span className={`tx-dot tx-dot--${item.tone}`} aria-hidden="true" />
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {model.moreWork === null ? null : (
            <p className="tx-note">
              <a href={buildSectionUrl(model.moreWork.section)}>{model.moreWork.label} →</a>
            </p>
          )}
        </section>
      )}

      {model.legacy === null ? null : (
        <section className="tx-panel tx-panel--muted" aria-label="Chuyến lập tay chưa khép">
          <p className="tx-note">
            {model.legacy.text}{' '}
            {model.legacy.link === null ? null : (
              <a href={buildSectionUrl(model.legacy.link.section)}>{model.legacy.link.label}</a>
            )}
          </p>
        </section>
      )}
    </>
  );
}
