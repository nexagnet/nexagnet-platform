'use client';

import { useState } from 'react';
import { PermissionNote } from '../components/PermissionGate';
import { DataTable, MetricCard, PageHeader, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import { formatCount } from '../customer-view';
import {
  toSectionQuery,
  useNavigationInput,
  useTollAccounts,
  useTollImports,
  useTollLinkCounts,
  useTollProviders,
  useVehicles,
} from '../hooks/useTransportWorkspace';
import { hasOperationsScope, operationsEmptyMessage } from '../transport-actions';
import {
  toTollProviderRows,
  tollCapabilities,
  type TollCapabilities,
  type TollProviderRow,
} from '../workspace/toll';
import { TollAccountAdmin } from './TollAccountAdmin';
import { NO_TOLL_QUEUE_FOCUS, TollCandidateQueue, type TollQueueFocus } from './TollCandidateQueue';
import { TollImport } from './TollImport';
import { TollSpendReport } from './TollSpendReport';

/**
 * Man PHI DUONG BO (ETC).
 *
 * ==============================================================================================
 * DIEU DAU TIEN MAN NAY PHAI NOI LA CAI NO KHONG LAM DUOC
 * ==============================================================================================
 *
 * Do lai 08/09/2026: khong nha cung cap ETC nao o Viet Nam cong bo tai lieu API cho khach hang.
 * Nen bang do san sang duoc dat LEN DAU, truoc moi bang so lieu va truoc ca cac the: neu khong, nguoi
 * van hanh se ngoi cho mot duong tu dong khong ton tai thay vi di xin mot tep mau va nap tay.
 *
 * `NOT_PUBLICLY_PROVEN` KHONG duoc viet thanh "dang ket noi" hay "sap co" — mot cau chu mo ho o
 * day la mot loi hua sai, va no lam nguoi ta cho thay vi lam.
 *
 * ==============================================================================================
 * BON VIEC, BON THE — `#314`
 * ==============================================================================================
 *
 * Hang cho doi soat (viec hang ngay), nap bang ke (viec theo ky), tai khoan & so xe (viec danh muc)
 * va chi phi theo xe (viec bao cao). Truoc day ca man la mot cot dai; gio moi viec mot the, va cac
 * loi "Xem các dòng" / "Mở hàng chờ" dua nguoi dung sang hang cho voi DUNG bo loc.
 *
 * ==============================================================================================
 * ETC LA TIEN CONG TY, KHONG BAO GIO LA QUY LAI XE
 * ==============================================================================================
 *
 * Man nay CO Y khong co mot o nao noi ve lai xe, quy lai xe hay luong. Phieu dau la tien lai xe
 * ung truoc; ETC la tien cong ty tra thang cho nha cung cap (`#229` §8).
 */

type TollTab = 'queue' | 'import' | 'accounts' | 'report';

const TABS: readonly { readonly id: TollTab; readonly label: string }[] = [
  { id: 'queue', label: 'Hàng chờ đối soát' },
  { id: 'import', label: 'Nạp bảng kê' },
  { id: 'accounts', label: 'Tài khoản & sổ xe' },
  { id: 'report', label: 'Chi phí theo xe' },
];

/** The chi hien khi vai DOC duoc du lieu cua the do — cung ma quyen voi route cua may chu. */
const tabVisible = (tab: TollTab, capabilities: TollCapabilities): boolean => {
  switch (tab) {
    case 'queue':
    case 'report':
      return capabilities.canReadReview;
    case 'accounts':
      return capabilities.canReadAccounts;
    case 'import':
      return capabilities.canImport || capabilities.canReadReview;
  }
};

export function TollView() {
  const navigation = useNavigationInput();
  const [tab, setTab] = useState<TollTab>('queue');
  const [focus, setFocus] = useState<TollQueueFocus>(NO_TOLL_QUEUE_FOCUS);

  const providers = toSectionQuery(useTollProviders(navigation));
  const accounts = toSectionQuery(useTollAccounts(navigation));
  /*
   * HAI nguon KHAC NHAU cho hai cau hoi khac nhau: `linkCounts` tra loi *"moi tai khoan dang co bao
   * nhieu xe"* (mot cot cua bang tai khoan); so doan noi cua tai khoan DANG CHON doc rieng trong
   * `TollAccountLinks`. Dung mot nguon cho ca hai thi moi tai khoan chua chon se hien `0`.
   */
  const linkCounts = toSectionQuery(useTollLinkCounts(navigation));
  const imports = toSectionQuery(useTollImports(navigation));
  const vehicles = toSectionQuery(useVehicles(navigation));

  if (!hasOperationsScope(navigation)) {
    return (
      <>
        <PageHeader title="Phí đường bộ (ETC)" />
        <ErrorState message={operationsEmptyMessage(navigation)} />
      </>
    );
  }

  const capabilities = tollCapabilities(navigation);
  const providerRows = providers.data ? toTollProviderRows(providers.data) : [];
  const readyCount = providerRows.filter((row) => row.statementReady).length;
  const visibleTabs = TABS.filter((entry) => tabVisible(entry.id, capabilities));
  const activeTab = visibleTabs.some((entry) => entry.id === tab)
    ? tab
    : (visibleTabs[0]?.id ?? 'import');

  const importLabelOf = (importId: string): string | null =>
    imports.data?.find((entry) => entry.id === importId)?.sourceLabel ?? null;

  const openQueue = (next: Omit<TollQueueFocus, 'nonce'>) => {
    setFocus((current) => ({ ...next, nonce: current.nonce + 1 }));
    setTab('queue');
  };

  return (
    <>
      <PageHeader
        title="Phí đường bộ (ETC)"
        summary="Tài khoản VETC/ePass, sổ xe nhận chi trả, nạp bảng kê, hàng chờ đối soát và chi phí theo xe. Đây là chi phí của công ty — không bao giờ trừ vào Quỹ lái xe."
      />

      <section className="tx-cards" aria-label="Tóm tắt phí đường bộ">
        <MetricCard
          label="Nhà cung cấp đọc được bảng kê"
          value={
            providers.data === undefined
              ? '—'
              : `${String(readyCount)}/${String(providerRows.length)}`
          }
          hint={
            providers.data === undefined || readyCount === providerRows.length
              ? null
              : 'Nhà cung cấp còn lại cần một tệp mẫu để khai bộ cột.'
          }
        />
        <MetricCard
          label="Tài khoản giao thông"
          value={accounts.data === undefined ? '—' : formatCount(accounts.data.length)}
        />
        <MetricCard
          label="Lần nạp bảng kê"
          value={imports.data === undefined ? '—' : formatCount(imports.data.length)}
        />
      </section>

      {/* Do san sang len DAU — xem khoi chu thich dau tep. */}
      <ProviderReadinessPanel
        rows={providerRows}
        isLoading={providers.isLoading}
        errorMessage={providers.errorMessage}
        onRetry={providers.refetch}
      />

      {/*
        `#395` — hang cho doi soat (va bao cao chi phi theo xe) doi ma XEM DONG PHI; bien so doi danh
        sach xe. Thieu ma nao thi the tuong ung khong hien — cau nay noi VI SAO, thay vi de nguoi
        duoc cap "Phí đường bộ" tu hoi hang cho di dau.
      */}
      <PermissionNote
        viewer={navigation}
        actions={['transport.toll.review.read', 'transport.vehicle.read']}
      />

      <div className="tx-tabs" role="tablist" aria-label="Việc phí đường bộ">
        {visibleTabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={activeTab === entry.id}
            className="tx-tab"
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {activeTab === 'queue' ? (
        <TollCandidateQueue
          // Doi bo loc tu noi khac (lan nap, bao cao) la mot cau hoi MOI: dung lai hang cho tu dau.
          key={`${focus.importId ?? ''}|${focus.matchState ?? ''}|${String(focus.nonce)}`}
          navigation={navigation}
          focus={focus}
          onClearImportFocus={() =>
            openQueue({ importId: null, importLabel: null, matchState: null })
          }
          vehicles={vehicles.data}
          importLabelOf={importLabelOf}
        />
      ) : null}

      {activeTab === 'import' ? (
        <TollImport
          navigation={navigation}
          readiness={providers.data?.readiness ?? []}
          canImport={capabilities.canImport}
          onShowRows={
            capabilities.canReadReview
              ? (entry) =>
                  openQueue({
                    importId: entry.id,
                    importLabel: entry.sourceLabel,
                    matchState: null,
                  })
              : undefined
          }
        />
      ) : null}

      {activeTab === 'accounts' ? (
        <TollAccountAdmin
          navigation={navigation}
          accounts={accounts}
          linkCounts={linkCounts}
          vehicles={vehicles.data}
          canManage={capabilities.canManageAccounts}
        />
      ) : null}

      {activeTab === 'report' ? (
        <TollSpendReport
          navigation={navigation}
          providers={providers.data}
          imports={imports.data}
          onOpenQueue={(matchState) => openQueue({ importId: null, importLabel: null, matchState })}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Do san sang cua nha cung cap
 * ------------------------------------------------------------------ */

function ProviderReadinessPanel({
  rows,
  isLoading,
  errorMessage,
  onRetry,
}: {
  readonly rows: readonly TollProviderRow[];
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly onRetry: () => void;
}) {
  return (
    <section className="tx-panel" aria-labelledby="toll-providers-heading">
      <h2 id="toll-providers-heading">Đường vào dữ liệu của từng nhà cung cấp</h2>
      <p className="tx-panel__lead">
        Đo 08/09/2026: không nhà cung cấp nào công bố tài liệu API cho khách hàng. Nạp từ tệp bảng
        kê hoặc nhập tay vẫn dùng được — việc nạp tệp chỉ cần bộ cột của nhà cung cấp, không cần
        đường API. Đường hợp pháp để yêu cầu một đường API được ghi ở cột cuối.
      </p>

      {isLoading ? <LoadingState label="Đang tải độ sẵn sàng…" /> : null}
      {errorMessage === null ? null : <ErrorState message={errorMessage} onRetry={onRetry} />}

      {rows.length === 0 && !isLoading && errorMessage === null ? (
        <EmptyState title="Chưa khai nhà cung cấp nào." />
      ) : null}

      {rows.length === 0 ? null : (
        <DataTable
          caption="Độ sẵn sàng của từng nhà cung cấp ETC"
          columns={[
            {
              key: 'provider',
              header: 'Nhà cung cấp',
              isRowHeader: true,
              render: (row: TollProviderRow) => row.providerLabel,
            },
            {
              key: 'statement',
              header: 'Nạp bảng kê',
              render: (row: TollProviderRow) => (
                <StatusBadge label={row.statementLabel} tone={row.statementTone} />
              ),
            },
            {
              key: 'blocked',
              header: 'Vì sao chưa nạp được',
              render: (row: TollProviderRow) => row.blockedReasonLabel ?? '—',
            },
            {
              key: 'api',
              header: 'Đường API',
              render: (row: TollProviderRow) => (
                <StatusBadge label={row.apiStatusLabel} tone={row.apiStatusTone} />
              ),
            },
            {
              key: 'request',
              header: 'Đường yêu cầu hợp pháp',
              render: (row: TollProviderRow) => row.requestPathLabel ?? '—',
            },
          ]}
          rows={rows}
          rowKey={(row) => row.provider}
        />
      )}
    </section>
  );
}
