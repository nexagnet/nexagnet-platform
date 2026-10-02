'use client';

import { MetricCard, PageHeader } from '../components/primitives';
import { ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useFinanceSummary,
  useNavigationInput,
} from '../hooks/useTransportWorkspace';
import { buildSectionUrl } from '../navigation';
import { hasOperationsScope, operationsEmptyMessage } from '../transport-actions';
import { toFinance } from '../workspace/finance';
import { MarginNotes, MarginSourceSplit } from './CompanyMarginParts';

/**
 * TONG HOP TAI CHINH (ten cu: Bang tai chinh) — sau dong tien canh nhau, va KHONG mot o tong nao
 * (#244 G5).
 *
 * ===========================================================================
 * CAU CONG BO DI CUNG CON SO, khong xuong chan trang.
 *
 * `GD-13` doi cau "chua gom chi phi co dinh" nam canh bien truc tiep, va #244 G5 cam goi con so do
 * la mot khoan lai da tru het chi phi. O day cau do duoc dat NGAY TRONG the mang con so — de mot
 * nguoi doc luot qua bang van khong the hieu nham.
 *
 * Man hinh nay chi sap xep: moi phep dinh dang va moi cau chu da duoc `toFinance` quyet o mot ham
 * thuan co bai kiem, ke ca cau canh bao nhieu ma tien.
 */
export function FinanceView() {
  const navigation = useNavigationInput();
  const summary = toSectionQuery(useFinanceSummary(navigation));

  if (!hasOperationsScope(navigation)) {
    return (
      <>
        <PageHeader title="Tổng hợp tài chính" />
        <ErrorState message={operationsEmptyMessage(navigation)} />
      </>
    );
  }

  const model = summary.data === undefined ? null : toFinance(summary.data);

  return (
    <>
      <PageHeader
        /* Ten trang = nhan o danh muc (#341) — ten cu `Bảng tài chính`. */
        title="Tổng hợp tài chính"
        summary="Chỉ phần tiền, cho cả công ty: doanh thu, biên trực tiếp và sáu dòng phải thu/phải trả đặt cạnh nhau — không cộng chung, mỗi dòng mở sang mục chi tiết."
        context={model === null ? undefined : `Số liệu ngày ${model.generatedFor}`}
      />

      {summary.errorMessage === null ? null : (
        <ErrorState message={summary.errorMessage} onRetry={summary.refetch} />
      )}
      {summary.isLoading ? <LoadingState label="Đang đọc số liệu tài chính…" /> : null}

      {model === null ? null : (
        <>
          {model.currencyWarning === null ? null : (
            <p className="tx-note tx-note--warn">{model.currencyWarning}</p>
          )}

          <section className="tx-panel" aria-label="Biên trực tiếp">
            <h2>Doanh thu và biên trực tiếp</h2>
            <div className="tx-cards tx-cards--lead">
              <MetricCard label="Doanh thu" value={model.margin.revenue} />
              <MetricCard label="Chi phí trực tiếp" value={model.margin.deduction} />
              <MetricCard
                label="Biên trực tiếp"
                value={model.margin.margin}
                hint={model.margin.disclosure}
              />
              <MetricCard
                label="Tỷ lệ biên trực tiếp"
                value={model.margin.ratio}
                hint={model.margin.disclosure}
              />
            </div>
            <p className="tx-note">{model.margin.coverage}</p>
            {/*
              `#385` — nguon cua con so ngay duoi con so: bao nhieu den tu don theo vong xe, bao nhieu
              tu chuyen cu, va dieu gi lam tong chua du. Tong con la cua MAY CHU.
            */}
            <MarginSourceSplit sources={model.margin.sources} />
            <MarginNotes notes={model.margin.notes} />
            <p className="tx-split__more">
              <a href={buildSectionUrl('margin')}>Xem từng đơn và chuyến →</a>
            </p>
          </section>

          <section className="tx-panel" aria-label="Sáu dòng tiền">
            <h2>Sáu dòng tiền, giữ riêng</h2>
            <p className="tx-panel__lead">
              Mỗi dòng là một quan hệ nợ với một đối tượng khác nhau. Bảng này cố ý không có ô tổng:
              cộng chúng lại cho ra một con số không ai nợ ai cả.
            </p>
            <div className="tx-cards">
              {model.rows.map((row) => (
                <MetricCard
                  key={row.key}
                  label={row.label}
                  value={row.value}
                  hint={row.direction === 'RECEIVABLE' ? 'Phải thu' : 'Phải trả'}
                  href={row.section === null ? undefined : buildSectionUrl(row.section)}
                />
              ))}
            </div>
          </section>

          <section className="tx-panel" aria-label="Công nợ quá hạn">
            <h2>Trong đó, quá hạn</h2>
            <div className="tx-cards">
              {/* Tien KHACH no — nen mo `Phải thu khách hàng`, khong phai man phai tra (#341). */}
              <MetricCard
                label="Khách hàng nợ quá hạn"
                value={model.receivableOverdue}
                href={buildSectionUrl('settlement')}
              />
            </div>
          </section>

          {model.disabledSourceNotes.length === 0 ? null : (
            <section className="tx-panel" aria-label="Nghiệp vụ chưa bật">
              <h2>Mục bảng không có, vì khách chưa bật nghiệp vụ</h2>
              <ul className="tx-notes">
                {model.disabledSourceNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
