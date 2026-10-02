'use client';

import { PermissionGate } from '../components/PermissionGate';
import { MetricCard, PageHeader } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useControlTower,
  useFinanceSummary,
  useFleetInsight,
  useNavigationInput,
} from '../hooks/useTransportWorkspace';
import { buildSectionUrl } from '../navigation';
import { toControlTower } from '../workspace/control-tower';
import { toFinance } from '../workspace/finance';
import { toFleetInsight } from '../workspace/insight';

/**
 * BANG DIEU HANH CAP CAO — "5 phut moi sang", khong phai mot buc tuong bieu do (#278 N8).
 *
 * ===========================================================================
 * KHONG MOT LAN GOI API MOI NAO, VA DO LA QUYET DINH CHINH CUA MAN HINH NAY.
 *
 * `#278` N8 doi *"Reuse accepted Finance read model"*. Man nay ghep BA read model DA DUOC NGHIEM
 * THU — thap dieu hanh, bang tai chinh, bang doi xe — thay vi mo mot duong doc thu tu.
 *
 * Neu no tu cong tien, hay tu dem vong chay, thi cong ty se co HAI con so cho cung mot cau hoi, va
 * khong ai biet cai nao dung khi chung lech. Dieu do quan trong hon o day so voi cac man khac: day
 * la man hinh Giam doc doc, va mot con so sai o day di thang vao mot quyet dinh.
 *
 * ===========================================================================
 * BIEN TRUC TIEP KHONG PHAI LAI RONG.
 *
 * `disclosure` cua may chu di CUNG con so, giu nguyen van tu `toFinance()`. `#244` G5 cam goi day
 * la lai da tru het chi phi, chung nao chua co mo hinh chi phi co dinh.
 */
export function ExecutiveView(): React.ReactElement {
  const input = useNavigationInput();
  const towerQuery = toSectionQuery(useControlTower(input));
  const financeQuery = toSectionQuery(useFinanceSummary(input));
  const fleetQuery = toSectionQuery(useFleetInsight(input, {}));

  const tower = towerQuery.data === undefined ? null : toControlTower(towerQuery.data);
  const finance = financeQuery.data === undefined ? null : toFinance(financeQuery.data);
  const fleet = fleetQuery.data === undefined ? null : toFleetInsight(fleetQuery.data);

  const loading = towerQuery.isLoading || financeQuery.isLoading || fleetQuery.isLoading;
  const error = towerQuery.errorMessage ?? financeQuery.errorMessage ?? fleetQuery.errorMessage;

  return (
    <>
      <PageHeader
        /*
         * Ten phai KHAC man `control-tower`, va do khong phai chuyen tham my.
         *
         * Hai man tung cung mang ten `Bảng điều hành` va cung nam tren mot thanh ben. Xem chu thich
         * o muc `executive` trong `navigation.ts`: nhan o danh muc va `<h1>` o day phai di cung
         * nhau, neu khong thi bam vao `Tổng hợp giám đốc` lai mo ra mot trang tu xung la thu khac.
         */
        title="Tổng hợp giám đốc"
        summary="Ba câu hỏi mỗi sáng: xe đang chạy thế nào, tiền đang ở đâu, và việc gì cần người xử lý."
        context={tower === null ? undefined : `Số liệu ngày ${tower.generatedFor}`}
      />

      {error === null ? null : <ErrorState message={error} />}
      {loading ? <LoadingState label="Đang đọc số liệu…" /> : null}

      {tower === null ? null : (
        <section className="tx-panel" aria-label="Vận hành">
          <h2>Vận hành</h2>
          <div className="tx-cards">
            {tower.stats.map((stat) => (
              <MetricCard
                key={stat.key}
                label={stat.label}
                value={stat.value}
                href={stat.section === null ? undefined : buildSectionUrl(stat.section)}
              />
            ))}
          </div>
        </section>
      )}

      {/* `#395` — hai khoi phu, moi khoi mot ma: thieu quyen thi khoi NOI ra, khong bien mat. */}
      <PermissionGate viewer={input} action="transport.analytics.read" />
      {fleet === null ? null : (
        <section className="tx-panel" aria-label="Hiệu quả chạy xe">
          <h2>Hiệu quả chạy xe</h2>
          <div className="tx-cards">
            {fleet.metrics
              .filter((metric) => metric.key === 'total-km' || metric.key === 'empty-ratio')
              .map((metric) => (
                <MetricCard
                  key={metric.key}
                  label={metric.label}
                  value={metric.value}
                  hint={metric.hint}
                  href={buildSectionUrl('fleet-dashboard')}
                />
              ))}
          </div>
          {fleet.worstEmptyRatio.length === 0 ? null : (
            <>
              <h3>Chạy rỗng nhiều nhất</h3>
              <ol className="tx-worklist">
                {fleet.worstEmptyRatio.slice(0, 3).map((row) => (
                  <li key={row.key}>
                    <strong>{row.plate}</strong> — rỗng {row.emptyRatio}
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}

      <PermissionGate viewer={input} action="transport.settlement.report.read" />
      {finance === null ? null : (
        <section className="tx-panel" aria-label="Tiền">
          <h2>Tiền</h2>
          {/*
           * SAU DONG, GIU RIENG. `INV-23` + #87: khong mot phep cong nao giua chung. Mot con so
           * "tong cong no" doc len rat co nghia, va chinh vi the no se di vao mot bao cao roi khong
           * ai go ra duoc nua.
           */}
          <div className="tx-cards">
            {finance.rows.map((row) => (
              <MetricCard
                key={row.key}
                label={row.label}
                value={row.value}
                href={row.section === null ? undefined : buildSectionUrl(row.section)}
              />
            ))}
          </div>
          <p className="tx-note">
            Biên trực tiếp {finance.margin.margin} ({finance.margin.ratio}) —{' '}
            {finance.margin.disclosure}. {finance.margin.coverage}
          </p>
          {finance.currencyWarning === null ? null : (
            <p className="tx-note tx-note--warn">{finance.currencyWarning}</p>
          )}
        </section>
      )}

      {tower === null ? null : (
        <section className="tx-panel" aria-label="Việc cần xử lý">
          <h2>Việc cần xử lý</h2>
          <p className="tx-panel__lead">{tower.headline}</p>
          {tower.queue.length === 0 ? (
            <EmptyState title="Không có việc nào đang chờ xử lý." />
          ) : (
            <ol className="tx-worklist">
              {tower.queue.slice(0, 5).map((row) => (
                <li key={row.key}>
                  <span className={`tx-dot tx-dot--${row.tone}`} aria-hidden="true" />
                  <a href={buildSectionUrl(row.section, row.selection ?? undefined)}>{row.title}</a>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </>
  );
}
