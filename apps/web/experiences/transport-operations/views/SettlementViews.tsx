'use client';

import { useMemo, useState } from 'react';
import { useTenantRuntime } from '../../../lib/tenant-runtime-context';
import { PermissionGate, PermissionNote } from '../components/PermissionGate';
import {
  DataTable,
  MetricCard,
  PageHeader,
  StatusBadge,
  type DataColumn,
} from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import { EMPTY_VALUE, formatBusinessDate } from '../customer-view';
import { buildSectionUrl, findSection } from '../navigation';
import {
  toSectionQuery,
  useApByFlow,
  useArAging,
  useCustomers,
  useFinanceMargin,
  useNavigationInput,
  usePartnerPosition,
  usePartners,
} from '../hooks/useTransportWorkspace';
import { canPerform } from '../transport-actions';
import { SETTLEMENT_FLOWS, type SettlementFlow } from '../transport-types';
import {
  filterMarginRows,
  marginFilterOptions,
  toMarginRow,
  toMarginTotals,
  type MarginFilter,
  type MarginRowModel,
} from '../workspace/company-margin';
import {
  toApFlow,
  toArAging,
  toPartnerPosition,
  toSettlementDirectory,
} from '../workspace/settlement';
import { businessTodayIn } from './business-today';
import { useCustomerArBook } from './customer-ar-book';
import { MarginNotes, MarginSourceSplit } from './CompanyMarginParts';
import { CustomerArWorkspace } from './CustomerArWorkspace';

/**
 * `TX-05` tren man hinh — BA muc, MOT nguon.
 *
 * Ba muc tach ra vi chung tra loi ba cau hoi khac nhau ("cong ty dang o dau ve tien", "ai no ai",
 * "chuyen nao lam ra tien"), nhung chung dung chung mot danh ba. Nen chung o cung mot tep: tach
 * thanh ba tep se de ba ban sao cua cung mot phep tra cuu ten troi di.
 *
 * KHONG mot lenh ghi nao trong ca tep. `TX-05` di vao HTTP o T7 chi voi sau route DOC — xem
 * `#168 B1`.
 */

/** Danh ba dung chung — doi `counterpartyId` thanh ten nguoi doc nhan ra. */
function useSettlementDirectory() {
  const navigation = useNavigationInput();
  const customers = toSectionQuery(useCustomers(navigation));
  const partners = toSectionQuery(usePartners(navigation));
  return useMemo(
    () =>
      toSettlementDirectory({
        customers: customers.data ?? [],
        partners: partners.data ?? [],
      }),
    [customers.data, partners.data],
  );
}

/* ------------------------------------------------------------------ *
 * Phai thu khach hang — tuoi no phai thu (ten cu: Cong no & quyet toan)
 * ------------------------------------------------------------------ */

/**
 * MOT MAN HINH, HAI CAU HOI — va chung phai nam o hai cho.
 *
 * ==============================================================================================
 * DOC TRUOC, LAM SAU
 * ==============================================================================================
 *
 * Chin tren muoi lan man nay duoc mo la de tra loi *khach nao dang no, bao nhieu, qua han chua*.
 * Ban cu dat khoi THAO TAC (bon form, hai muoi sau o nhap) len TRUOC bang tuoi no, nen cau tra loi
 * do nam duoi man hinh thu hai — moi lan, ke ca nhung ngay khong ai nhap gi.
 *
 * Gio: con so → bang → roi moi toi viec. Khoi viec van o day, chi khong con dung truoc cau hoi.
 *
 * ==============================================================================================
 * MOT MOC DOC CHO CA TRANG — va day KHONG phai mot lan gom cho gon
 * ==============================================================================================
 *
 * Trang nay tung co HAI o `Tính đến ngày` roi nhau: mot cua so doi soat, mot cua bang tuoi no. Hai
 * o giu hai `useState` khac nhau, nen doi mot o thi nua tren va nua duoi cua CUNG mot man hinh noi
 * ve hai ngay khac nhau — va khong mot dong chu nao noi ra dieu do. Voi mot man hinh tien, do
 * khong phai mot loi trinh bay, do la mot cach doc sai so.
 *
 * Cung mot le voi o `Khách hàng`: no von chi loc bang tuoi no, trong khi cac con so ngay tren no
 * van la cua TAT CA khach. Ba duong doc cua so cong no VON nhan `customerId` (xem
 * `customer-ar-book.ts`), nen o chon gio dieu khien ca trang.
 */
export function SettlementView() {
  const navigation = useNavigationInput();
  const tenant = useTenantRuntime();
  const directory = useSettlementDirectory();
  const [asOf, setAsOf] = useState(() => businessTodayIn(tenant.transport?.timeZone));
  const [customerId, setCustomerId] = useState<string | null>(null);
  const customers = toSectionQuery(useCustomers(navigation));
  const aging = toSectionQuery(useArAging(navigation, asOf, customerId));
  const book = useCustomerArBook({ asOf, customerId });

  const model = toArAging(aging.data ?? null, directory);
  const arBook = book.model;
  /**
   * `#395` — BANG TUOI NO la bao cao quyet toan (`transport.settlement.report.read`), PHAN PHU cua
   * man nay: nguoi duoc cap nhom Ke toan nhung chua duoc xem bao cao van lam viec voi so doi soat
   * ben duoi. Thieu quyen thi hai the dau, cau tom tat va bang tuoi no nhuong cho mot cau noi ro —
   * KHONG con "Không có chứng từ nào còn nợ tính đến —." (cau sai do chay that bat duoc).
   */
  const canReadAging = canPerform(navigation, 'transport.settlement.report.read');
  /** Chi khi co DUNG MOT so tien te thi cac con so dau trang moi cong chung duoc (`GD-15`). */
  const singleLedger =
    arBook !== null && arBook.combinedTotalsAllowed ? (arBook.currencyGroups[0] ?? null) : null;

  return (
    <>
      <PageHeader
        /*
         * Ten trang = nhan o danh muc (#341). Hai lien ket duoi LAY NHAN tu chinh danh muc: muc kia
         * doi ten thi cau nay doi theo, khong con mot ban chep tay `AR/AP` nao de lech.
         */
        title="Phải thu khách hàng"
        summary="Tiền khách hàng nợ công ty: ai nợ, nợ bao nhiêu, quá hạn bao lâu — và việc kế toán phải làm để thu về."
        context={
          <p className="tx-note">
            Màn này giữ <strong>một dòng tiền: cước khách hàng</strong>. Ba dòng phải trả — nhà xe,
            hoa hồng nguồn đơn, cây xăng — đọc ở{' '}
            <a href={buildSectionUrl('ar-ap')}>{findSection('ar-ap')?.label}</a>; tiền đã ra với lái
            xe ở{' '}
            <a href={buildSectionUrl('driver-settlement')}>
              {findSection('driver-settlement')?.label}
            </a>
            . Năm dòng không cộng chung.
          </p>
        }
      />

      {/*
        MOC `asOf` la mot O NHAP, khong phai mot mac dinh im lang. May chu bat buoc tham so nay
        chinh vi ly do do: hai nguoi mo cung man hinh cach nhau qua nua dem se doc ra hai bang khac
        nhau, va khong bang nao ghi lai moc cua no.
      */}
      <form className="tx-scope" role="search" aria-label="Chọn mốc đọc công nợ">
        <p className="tx-scope__lead">Mọi con số trên trang đọc theo hai ô này.</p>
        <div className="tx-filters">
          <label className="tx-field">
            <span>Tính đến ngày</span>
            <input
              type="date"
              value={asOf}
              onChange={(event) => setAsOf(event.target.value)}
              required
            />
          </label>
          <label className="tx-field">
            <span>Khách hàng</span>
            <select
              aria-label="Khách hàng"
              value={customerId ?? ''}
              onChange={(event) =>
                setCustomerId(event.target.value === '' ? null : event.target.value)
              }
            >
              <option value="">Tất cả khách hàng</option>
              {(customers.data ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>

      <PermissionNote
        viewer={navigation}
        actions={['transport.customer.read', 'transport.partner.read', 'transport.order.read']}
      />

      {aging.errorMessage === null ? null : (
        <ErrorState message={aging.errorMessage} onRetry={aging.refetch} />
      )}
      {aging.isLoading ? <LoadingState label="Đang đọc công nợ phải thu…" /> : null}

      {/*
        BON CON SO DAU TRANG — den tu HAI so khac nhau, co chu dich.

        Hai o dau la cua bao cao tuoi no, nen chung cong dung bang bang ngay ben duoi. Hai o sau la
        cua so doi soat khach hang, va chung tra loi hai cau ma bao cao tuoi no KHONG tra loi: tien
        nao chua thanh cong no, va tien nao da ve ma chua tru vao dau.
      */}
      <section className="tx-cards tx-cards--lead" aria-label="Tiền khách đang nợ">
        {canReadAging ? (
          <>
            <MetricCard label="Tổng còn nợ" value={model.outstandingLabel} />
            <MetricCard label="Trong đó quá hạn" value={model.overdueLabel} tone="stop" />
          </>
        ) : null}
        <MetricCard
          label="Chờ đối soát"
          value={arBook?.pendingAmountLabel ?? EMPTY_VALUE}
          hint="chưa phải công nợ"
          tone="wait"
        />
        <MetricCard
          label="Tiền nhận trước"
          value={singleLedger?.unallocatedCreditLabel ?? EMPTY_VALUE}
          hint="đã về, chưa gắn vào chứng từ nào"
          tone="done"
        />
      </section>

      {canReadAging ? (
        <>
          <p className="tx-note" role="status">
            {model.headline}
          </p>

          <section className="tx-cards tx-cards--quiet" aria-label="Chia theo tuổi nợ">
            {model.buckets.map((bucket) => (
              <MetricCard key={bucket.bucket} label={bucket.label} value={bucket.amountLabel} />
            ))}
          </section>

          {model.rows.length === 0 && !aging.isLoading ? (
            <EmptyState title={`Không có chứng từ nào còn nợ tính đến ${model.asOfLabel}.`} />
          ) : (
            <DataTable
              caption={`Chứng từ còn nợ tính đến ${model.asOfLabel}`}
              rows={model.rows}
              rowKey={(row) => row.documentId}
              columns={[
                {
                  key: 'customer',
                  header: 'Khách hàng',
                  isRowHeader: true,
                  render: (row) => row.counterpartyLabel,
                },
                { key: 'date', header: 'Ngày chứng từ', render: (row) => row.businessDateLabel },
                { key: 'due', header: 'Hạn thanh toán', render: (row) => row.dueDateLabel },
                {
                  key: 'amount',
                  header: 'Còn nợ',
                  isNumeric: true,
                  render: (row) => row.outstandingLabel,
                },
                {
                  key: 'bucket',
                  header: 'Tuổi nợ',
                  render: (row) => <StatusBadge label={row.bucketLabel} tone={row.tone} />,
                },
              ]}
            />
          )}
        </>
      ) : (
        <PermissionGate viewer={navigation} action="transport.settlement.report.read" />
      )}

      {/*
        SO CHI TIET nam SAU bang, khong truoc.

        Sau con so nay tra loi cau hoi thu hai ("trong so con no do, bao nhieu da den han, bao nhieu
        da thu duoc") va chi co nghia khi da doc xong cau thu nhat. Truoc day chung dung ngang hang
        voi tong so o dau trang, nen mot man hinh mot tien te bay muoi bon the so giong het nhau.
      */}
      {arBook === null ? null : (
        <section aria-label="Sổ phải thu theo tiền tệ">
          <h2>Sổ phải thu theo tiền tệ</h2>
          {arBook.combinedTotalsAllowed ? null : (
            <p className="tx-note tx-note--warn">
              Có nhiều tiền tệ: không cộng gộp. Đọc từng sổ tiền tệ riêng bên dưới.
            </p>
          )}
          {arBook.currencyGroups.map((group) => (
            <div key={group.currencyCode} className="tx-ledger">
              {/* Mot so tien te thi tieu de muc da noi du — `Sổ VND` ngay duoi no la mot dong thua. */}
              {arBook.currencyGroups.length === 1 ? null : <h3>Sổ {group.currencyCode}</h3>}
              <div className="tx-cards tx-cards--quiet">
                <MetricCard label="Còn phải thu" value={group.outstandingLabel} />
                <MetricCard label="Chưa đến hạn" value={group.notYetDueLabel} />
                <MetricCard label="Đến hạn" value={group.dueLabel} />
                <MetricCard label="Quá hạn" value={group.overdueLabel} />
                <MetricCard label="Đã phân bổ" value={group.paidLabel} />
                <MetricCard
                  label="Tiền nhận trước / chưa phân bổ"
                  value={group.unallocatedCreditLabel}
                />
              </div>
            </div>
          ))}
        </section>
      )}

      <CustomerArWorkspace scope={{ asOf, customerId }} />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Phai tra doi tac & cay xang — ba dong phai tra giu RIENG (ten cu: AR/AP)
 * ------------------------------------------------------------------ */

function ApFlowPanel({ flow }: { readonly flow: SettlementFlow }) {
  const navigation = useNavigationInput();
  const directory = useSettlementDirectory();
  const query = toSectionQuery(useApByFlow(navigation, flow));
  const model = toApFlow(flow, query.data ?? null, directory);

  return (
    <section className="tx-panel" aria-label={`Phải trả — ${model.flowLabel}`}>
      <h2>
        {model.flowLabel} · {model.totalLabel}
      </h2>
      {query.errorMessage === null ? null : (
        <ErrorState message={query.errorMessage} onRetry={query.refetch} />
      )}
      {query.isLoading ? <LoadingState label={`Đang đọc ${model.flowLabel}…`} /> : null}
      {model.isEmpty && !query.isLoading ? (
        <EmptyState title={`Không còn khoản phải trả nào ở dòng ${model.flowLabel}.`} />
      ) : (
        <DataTable
          caption={`Phải trả — ${model.flowLabel}`}
          rows={model.rows}
          rowKey={(row) => row.counterpartyId}
          columns={[
            {
              key: 'party',
              header: 'Đối tác',
              isRowHeader: true,
              render: (row) => row.counterpartyLabel,
            },
            {
              key: 'count',
              header: 'Số chứng từ',
              isNumeric: true,
              render: (row) => row.documentCountLabel,
            },
            {
              key: 'amount',
              header: 'Còn nợ',
              isNumeric: true,
              render: (row) => row.outstandingLabel,
            },
          ]}
        />
      )}
    </section>
  );
}

function PartnerPositionPanel() {
  const navigation = useNavigationInput();
  const directory = useSettlementDirectory();
  const partners = toSectionQuery(usePartners(navigation));
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const position = toSectionQuery(usePartnerPosition(navigation, partnerId));
  const model = toPartnerPosition(position.data ?? null, directory);

  return (
    <section className="tx-panel" aria-label="Vị thế đối tác">
      <h2>Vị thế đối tác</h2>
      <label className="tx-field">
        <span>Đối tác</span>
        <select
          aria-label="Đối tác"
          value={partnerId ?? ''}
          onChange={(event) => setPartnerId(event.target.value === '' ? null : event.target.value)}
        >
          <option value="">Chọn một đối tác</option>
          {(partners.data ?? []).map((partner) => (
            <option key={partner.id} value={partner.id}>
              {partner.name}
            </option>
          ))}
        </select>
      </label>

      {position.errorMessage === null ? null : (
        <ErrorState message={position.errorMessage} onRetry={position.refetch} />
      )}
      {position.isLoading ? <LoadingState label="Đang đọc vị thế đối tác…" /> : null}

      {model === null ? (
        partnerId === null ? (
          <EmptyState title="Chọn một đối tác để xem cả hai chiều." />
        ) : null
      ) : (
        <>
          <div className="tx-cards">
            <MetricCard label="Họ nợ mình" value={model.receivableLabel} />
            <MetricCard label="Mình nợ họ — cước nhà xe" value={model.carrierPayableLabel} />
            <MetricCard label="Mình nợ họ — hoa hồng" value={model.commissionPayableLabel} />
            <MetricCard label="Chênh lệch" value={model.netDisplayLabel} hint="chỉ để xem" />
          </div>
          {/*
            Cau nay KHONG duoc bo. `netDisplay` khong ton tai trong bang nao va khong ai tra tien
            theo no; nguon cam bu tru phap ly (`GD-15`).
          */}
          <p className="tx-note tx-note--warn" role="note">
            {model.netDisclosure}
          </p>
        </>
      )}
    </section>
  );
}

export function ArApView() {
  const navigation = useNavigationInput();
  return (
    <>
      <PageHeader
        /*
         * KHONG con "tuoi no phai thu" o tom tat (#341): man nay khong co bang tuoi no cua khach nao.
         * Va la BA dong phai tra chu khong phai bon — dong thu tu cua `SETTLEMENT_FLOWS` la cuoc
         * khach hang, bi loc ra ngay ben duoi.
         */
        title="Phải trả đối tác & cây xăng"
        summary="Công ty còn nợ ai — cây xăng, nhà xe, hoa hồng nguồn đơn — theo từng đối tác, cùng vị thế hai chiều của một đối tác."
        context={
          <p className="tx-note">
            Ba dòng tiền phải trả được giữ riêng, không cộng chung: một đối tác có thể vừa là nhà xe
            vừa là nguồn đơn, nên khoá phân biệt là vai chứ không phải đối tác. Tiền khách hàng nợ
            công ty đọc ở{' '}
            <a href={buildSectionUrl('settlement')}>{findSection('settlement')?.label}</a>.
          </p>
        }
      />
      {/* `#395` — ten doi tac, khach la danh ba RIENG: thieu quyen thi noi ra, khong in `id`. */}
      <PermissionNote
        viewer={navigation}
        actions={['transport.partner.read', 'transport.customer.read']}
      />
      <PartnerPositionPanel />
      {SETTLEMENT_FLOWS.filter((flow) => flow !== 'CUSTOMER_FREIGHT').map((flow) => (
        <ApFlowPanel key={flow} flow={flow} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Hieu qua tung chuyen — `#381`/`#385`: chuyen cu CONG don theo vong xe
 * ------------------------------------------------------------------ */

/**
 * HIEU QUA — cho giam doc/ke toan doc NGAY: tong, doanh thu den tu nguon nao, dieu gi lam tong chua
 * du, roi tung don/chuyen kem nguon cua con so.
 *
 * Ban cu chon "tung chuyen" bang `useTrips` roi goi route cong don theo lo `tripId`: don giao theo vong
 * xe khong bao gio hien ra (`#381`), va trinh duyet quyet tap nao duoc cong. Gio MOT lan doc
 * `GET /transport/finance/margin`: dong va tong deu cua may chu, cung ham gop voi `Tổng hợp tài chính`.
 */
export function MarginView() {
  const navigation = useNavigationInput();
  const margin = toSectionQuery(useFinanceMargin(navigation));
  const [filter, setFilter] = useState<MarginFilter>('ALL');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const totals = margin.data === undefined ? null : toMarginTotals(margin.data.totals);
  const allRows = useMemo(() => margin.data?.rows ?? [], [margin.data]);
  const rows = useMemo(() => filterMarginRows(allRows, filter).map(toMarginRow), [allRows, filter]);
  const selected = rows.find((row) => row.key === selectedKey) ?? null;

  return (
    <>
      <PageHeader
        title="Hiệu quả từng chuyến"
        summary="Mỗi đơn giao theo vòng xe và mỗi chuyến cũ là một dòng: doanh thu, chi phí trực tiếp và biên. Tổng do máy chủ cộng, chưa gồm chi phí cố định."
        context={
          margin.data === undefined
            ? undefined
            : `Số liệu ngày ${formatBusinessDate(margin.data.generatedFor)}`
        }
      />

      {margin.errorMessage === null ? null : (
        <ErrorState message={margin.errorMessage} onRetry={margin.refetch} />
      )}
      {margin.isLoading ? <LoadingState label="Đang cộng doanh thu và biên…" /> : null}

      {totals === null ? null : (
        <section className="tx-panel" aria-label="Cộng dồn biên trực tiếp">
          <h2>Toàn công ty</h2>
          <div className="tx-cards tx-cards--lead">
            <MetricCard label="Doanh thu" value={totals.revenueLabel} />
            <MetricCard label="Chi phí trực tiếp" value={totals.deductionLabel} />
            <MetricCard
              label="Biên trực tiếp"
              value={totals.marginLabel}
              hint={totals.disclosure}
              tone={totals.isNegative ? 'stop' : undefined}
            />
            <MetricCard label="Tỷ suất biên" value={totals.rateLabel} />
          </div>
          <p className="tx-note">{totals.coverage}</p>
          <MarginSourceSplit sources={totals.sources} />
          <MarginNotes notes={totals.notes} />
        </section>
      )}

      {margin.data === undefined ? null : (
        <section className="tx-panel" aria-label="Từng đơn và chuyến">
          <h2>Từng đơn và chuyến</h2>
          <p className="tx-panel__lead">
            Mới nhất trước. Đơn giao theo vòng xe hiện bằng mã đơn, kèm mã vòng xe đã chạy nó. Bấm
            một dòng để xem con số đến từ sổ nào.
          </p>
          <div className="tx-tabs" role="group" aria-label="Lọc theo nguồn">
            {marginFilterOptions(allRows).map((option) => (
              <button
                key={option.value}
                type="button"
                className="tx-tab"
                aria-pressed={filter === option.value}
                onClick={() => {
                  setFilter(option.value);
                  setSelectedKey(null);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          {rows.length === 0 ? (
            <EmptyState title="Chưa có đơn hay chuyến nào có doanh thu." />
          ) : (
            <DataTable<MarginRowModel>
              caption="Hiệu quả từng đơn và chuyến"
              rows={rows}
              rowKey={(row) => row.key}
              selectedKey={selectedKey}
              onSelect={(row) => setSelectedKey(row.key)}
              onShowAll={() => setSelectedKey(null)}
              columns={MARGIN_COLUMNS}
            />
          )}
        </section>
      )}

      {selected === null ? null : (
        <MarginRowDetail row={selected} disclosure={totals?.disclosure} />
      )}
    </>
  );
}

const MARGIN_COLUMNS: readonly DataColumn<MarginRowModel>[] = [
  {
    key: 'code',
    header: 'Mã',
    isRowHeader: true,
    render: (row) => (
      <span className="tx-margin__code">
        <span>{row.code}</span>
        <span className="tx-margin__context">{row.context}</span>
      </span>
    ),
  },
  {
    key: 'source',
    header: 'Nguồn',
    render: (row) => <StatusBadge label={row.sourceLabel} tone={row.sourceTone} />,
  },
  { key: 'date', header: 'Ngày', render: (row) => row.dateLabel },
  { key: 'route', header: 'Tuyến', render: (row) => row.routeLabel },
  { key: 'revenue', header: 'Doanh thu', isNumeric: true, render: (row) => row.revenueLabel },
  { key: 'cost', header: 'Chi phí', isNumeric: true, render: (row) => row.costLabel },
  {
    key: 'margin',
    header: 'Biên',
    isNumeric: true,
    render: (row) => (
      <span className={row.isNegative ? 'tx-amount--out' : undefined}>{row.marginLabel}</span>
    ),
  },
  { key: 'rate', header: 'Tỷ suất', isNumeric: true, render: (row) => row.rateLabel },
  {
    key: 'flag',
    header: 'Ghi chú',
    render: (row) =>
      row.flag === null ? EMPTY_VALUE : <StatusBadge label={row.flag.label} tone={row.flag.tone} />,
  },
];

/** NGUON CUA CON SO cua mot dong: tung khoan, kem so cai no den tu. */
function MarginRowDetail({
  row,
  disclosure,
}: {
  readonly row: MarginRowModel;
  readonly disclosure: string | undefined;
}) {
  return (
    <section className="tx-detail" aria-label={`Nguồn con số ${row.code}`}>
      <div className="tx-detail__head">
        <div>
          <h2>{row.code}</h2>
          <p>{row.detail.title}</p>
        </div>
        <StatusBadge label={row.sourceLabel} tone={row.sourceTone} />
      </div>
      <dl className="tx-costlines">
        {row.detail.lines.map((line) => (
          <div key={line.label} className="tx-costlines__row">
            <dt>{line.label}</dt>
            <dd className="tx-costlines__value">{line.value}</dd>
            <dd className="tx-costlines__source">{line.source}</dd>
          </div>
        ))}
      </dl>
      {disclosure === undefined ? null : <p className="tx-note">{disclosure}</p>}
      <MarginNotes notes={row.detail.notes} />
    </section>
  );
}
