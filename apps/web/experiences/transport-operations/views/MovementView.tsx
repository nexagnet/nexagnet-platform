'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTenantRuntime } from '../../../lib/tenant-runtime-context';
import { PermissionGate, PermissionNote } from '../components/PermissionGate';
import { DataTable, MetricCard, PageHeader, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  TRANSPORT_QUERY_KEYS,
  useCustomers,
  useNavigationInput,
  useOrderLegs,
  useOrderRunPlans,
  useRunMovement,
  useTransportOrders,
  useVehicleRunDetail,
  useVehicleRuns,
  useVehicles,
} from '../hooks/useTransportWorkspace';
import type { RunPlanProposal, RunLeg, TransportOrder, VehicleRun } from '../transport-types';
import { canPerform } from '../transport-actions';
import { newCorrelationKey, transportApi } from '../transport-api';
import {
  LEG_STATUS_LABEL,
  legStatusTone,
  ORDER_STATUS_LABEL,
  orderStatusTone,
  RUN_STATUS_LABEL,
  runStatusTone,
} from '../workspace/office-lifecycle';
import { createdNotice } from '../workspace/order-draft';
import {
  EMPTY_ORDER_FILTER,
  filterOrders,
  hiddenOpenOrderNote,
  openOrderFilterState,
  ORDER_STATUS_FILTER_LABEL,
  ORDER_STATUS_FILTERS,
  type OrderListFilter,
  type OrderStatusFilter,
} from '../workspace/order-list';
import { businessTodayIn } from './business-today';
import { OrderComposer } from './order-composer/OrderComposer';
import { OrderRouteCard } from './order-composer/OrderRouteCard';
import { useComposerHandoff } from './order-composer/use-composer-handoff';
import './order-composer/order-route.css';
import { OrderFulfilmentPanel } from './OrderFulfilmentPanel';
import { RunLegWorkflow } from './RunLegWorkflow';
import { km, RunMovementMetrics } from './RunMovementMetrics';

/**
 * DON HANG & VONG CHAY — man hinh LAY DON LAM TRUNG TAM (#274 / #276 L8).
 *
 * ============================================================================================
 * VI SAO DON DUNG TRUOC
 * ============================================================================================
 *
 * `#274` chot lai hinh dang san pham: *"Boss/accounting operate Orders; normal flow does not
 * require manual Run close."* Ban dau man hinh nay bat dau bang bang VONG CHAY, va no bat nguoi
 * dung tra loi mot cau ho khong hoi: "chuyen nay la vong chay so may". Bay gio don dung truoc, va
 * chon mot don se mo ra dung cai ho can — no dang di den dau, tren vong chay nao.
 *
 * Bang vong chay o duoi VAN CON, va do la co y: `#276` L8 giu no lam *"advanced operational
 * drill-down and report source"*. Cai bi go la vi tri TRUNG TAM cua no, khong phai ban than no.
 *
 * ============================================================================================
 * MAN HINH NAY KHONG CO NUT NAO TAO HAY DONG MOT VONG CHAY
 * ============================================================================================
 *
 * Vong chay do he thong lap va he thong dong (`#276` L2/L4). Neu mot ngay co mot nut "Dong vong
 * chay" xuat hien o day thi hoac phan xu tu dong da hong, hoac ai do vua dua mot thao tac quan ly
 * vong chay tro lai quy trinh binh thuong — ca hai deu la hoi quy cua Lane L.
 *
 * Nut CO o day tu `#376` la nut cua CHANG va cua DON — xem `RunLegWorkflow` va
 * `OrderFulfilmentPanel`: van phong tien chang `PLANNED -> IN_TRANSIT -> COMPLETED` va xac nhan don
 * `OPEN -> FULFILLED`. Moc lai xe la bang chung, khong tu doi mot trang thai nao trong hai truc do.
 *
 * ============================================================================================
 * TAO DON LA MOT BE MAT RIENG (`#379`)
 * ============================================================================================
 *
 * Form tao don ngang bay o, luon dinh tren dau bang, da bi thay bang `OrderComposer`: mot be mat mo
 * tu nut "Tạo đơn mới" o dau trang, THAY cho danh sach (khong chong len), va chot HAI TOA DO truoc
 * khi co mot don. Tao xong thi quay ve danh sach, noi mot cau xac nhan va MO SAN don vua tao.
 * Tieu diem va cau xac nhan di theo `useComposerHandoff`.
 *
 * Be mat tao don dung TRUOC loi/tai cua danh sach: no khong can danh sach, va mot lan doc lai danh
 * sach hong (mang chap chon, may chu dang deploy) khong duoc go be mat va xoa ban nhap.
 *
 * ============================================================================================
 * MOT CAM TUYET DOI: MAN HINH KHONG TU CONG KM
 * ============================================================================================
 *
 * `loadedKm`/`emptyKm`/`emptyRatio` deu do may chu tra. Va tu `#276` L6 co HAI o — DA DI va DU
 * DINH — ma man hinh KHONG duoc gop lai: mot chang chua chay xong la mot ke hoach, khong phai mot
 * quang duong da di.
 */

const money = (value: number | null): string =>
  value === null ? '—' : `${value.toLocaleString('vi-VN')} đ`;

export function MovementView() {
  const queryClient = useQueryClient();
  const navigation = useNavigationInput();
  const orders = toSectionQuery(useTransportOrders(navigation));
  const runs = toSectionQuery(useVehicleRuns(navigation));
  const vehicles = toSectionQuery(useVehicles(navigation));
  const customers = toSectionQuery(useCustomers(navigation));
  const tenant = useTenantRuntime();
  const businessToday = useMemo(
    () => businessTodayIn(tenant.transport?.timeZone),
    [tenant.transport],
  );
  const composer = useComposerHandoff();
  const [filter, setFilter] = useState<OrderListFilter>(EMPTY_ORDER_FILTER);

  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const orderLegs = toSectionQuery(useOrderLegs(navigation, openOrderId));
  const orderPlans = toSectionQuery(useOrderRunPlans(navigation, openOrderId));

  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const runDetail = toSectionQuery(useVehicleRunDetail(navigation, openRunId));
  const movement = toSectionQuery(useRunMovement(navigation, openRunId));
  const [preview, setPreview] = useState<RunPlanProposal | null>(null);
  const [planKey, setPlanKey] = useState<string | null>(null);
  const [planSuccess, setPlanSuccess] = useState<string | null>(null);

  const previewPlan = useMutation({
    mutationFn: (input: { orderId: string; vehicleId: string }) =>
      transportApi.planning.preview(input.orderId, { vehicleId: input.vehicleId }),
    onSuccess: (proposal) => {
      setPreview(proposal);
      setPlanKey(newCorrelationKey());
    },
  });
  const commitPlan = useMutation({
    mutationFn: (input: { orderId: string; vehicleId: string; idempotencyKey: string }) =>
      transportApi.planning.commit(input.orderId, {
        vehicleId: input.vehicleId,
        idempotencyKey: input.idempotencyKey,
      }),
    onSuccess: (_, input) => {
      const order = orders.data?.find((entry) => entry.id === input.orderId);
      const vehicle = vehicles.data?.find((entry) => entry.id === input.vehicleId);
      setPlanSuccess(
        `Đã giao đơn ${order?.code ?? input.orderId} cho xe ${vehicle?.registrationPlate ?? 'đã chọn'}`,
      );
      void queryClient.invalidateQueries({ queryKey: ['transport', 'orders'] });
      void queryClient.invalidateQueries({ queryKey: ['transport', 'runs'] });
    },
  });

  if (orders.isBlocked) {
    return (
      <EmptyState title="Doanh nghiệp này chưa bật nghiệp vụ đơn hàng, hoặc vai của bạn không có quyền đọc." />
    );
  }

  /** Bien so doc duoc thay cho `vehicleId` — man hinh khong bao gio hien mot `cuid` ra ngoai. */
  const plateOf = (vehicleId: string): string =>
    vehicles.data?.find((vehicle) => vehicle.id === vehicleId)?.registrationPlate ?? '—';

  /**
   * Ma vong chay doc duoc thay cho `runId`. Chua doc duoc danh sach vong chay (`#395`: nguoi chi
   * duoc xem don) thi noi dung vay — KHONG bao gio in `runId` (mot `cuid`) ra man hinh.
   */
  const runCodeOf = (runId: string): string =>
    runs.data === undefined
      ? 'Vòng chạy chưa đọc được mã'
      : (runs.data.find((run) => run.id === runId)?.code ?? runId);

  /**
   * Ten khach doc duoc thay cho `customerId` — man hinh khong hien mot `cuid` bao gio. Danh ba CHUA
   * co trong tay (chua duoc cap quyen xem khach) khac han "khach da go khoi danh muc" (`#395`).
   */
  const customerNameOf = (customerId: string | null): string =>
    customerId === null
      ? '—'
      : customers.data === undefined
        ? 'Khách hàng chưa đọc được tên'
        : (customers.data.find((customer) => customer.id === customerId)?.name ??
          'khách đã gỡ khỏi danh mục');

  /** Lap ke hoach tu don doi biet ke hoach dang co (`run.read`) va quyen giao xe (`run.manage`). */
  const canPlan =
    canPerform(navigation, 'transport.run.read') && canPerform(navigation, 'transport.run.manage');

  /** Ma don doc duoc thay cho `orderId`. */
  const orderCodeOf = (orderId: string | null): string =>
    orderId === null
      ? '—'
      : (orders.data?.find((order) => order.id === orderId)?.code ?? 'đơn đã gỡ');

  /** Chi khach DANG HOAT DONG moi la mot lua chon hop le cho mot don moi. */
  const activeCustomers = (customers.data ?? []).filter((customer) => customer.status === 'ACTIVE');

  /*
   * Tao xong: dong be mat, noi MOT cau doi chieu (ma don + hai dau tuyen), va MO SAN don vua tao —
   * nguoi dung vua tao don de lam viec tiep voi no (lap ke hoach, giao xe), khong de di tim no.
   * Don moi duoc chen vao bo nho dem NGAY de bang khong nhay; lan doc lai van la su that.
   */
  const handleCreated = (order: TransportOrder): void => {
    queryClient.setQueryData<readonly TransportOrder[]>(TRANSPORT_QUERY_KEYS.orders, (current) =>
      current === undefined
        ? current
        : [...current.filter((entry) => entry.id !== order.id), order],
    );
    void queryClient.invalidateQueries({ queryKey: TRANSPORT_QUERY_KEYS.orders });
    setFilter(EMPTY_ORDER_FILTER);
    setOpenOrderId(order.id);
    composer.created(createdNotice(order));
  };

  if (composer.isComposing) {
    return (
      <OrderComposer
        customers={activeCustomers}
        isCustomersLoading={customers.isLoading}
        businessToday={businessToday}
        onCancel={composer.cancel}
        onCreated={handleCreated}
      />
    );
  }

  if (orders.errorMessage !== null) {
    return <ErrorState message={orders.errorMessage} onRetry={orders.refetch} />;
  }
  if (orders.isLoading || orders.data === undefined) {
    return <LoadingState label="Đang tải đơn hàng…" />;
  }

  const visibleOrders = filterOrders(orders.data, filter, customerNameOf);
  const canCreate = canPerform(navigation, 'transport.order.manage');
  const openState = openOrderFilterState(orders.data, visibleOrders, openOrderId);
  const activePlan = orderPlans.data?.find((plan) => plan.cancelledAt === null) ?? null;
  /* Bo loc giau don dang mo: chi tiet cua no AN theo (co mot cau + nut bo loc), khong lang le o lai. */
  const detailOrderId = openState.kind === 'HIDDEN_BY_FILTER' ? null : openOrderId;
  const selectedOrder =
    detailOrderId === null
      ? null
      : (orders.data.find((order) => order.id === detailOrderId) ?? null);

  return (
    <>
      <PageHeader
        title="Đơn hàng & vòng chạy"
        summary="Nghiệp vụ đi từ ĐƠN. Vòng chạy và chặng do hệ thống lập và tự đóng — không ai phải bấm tạo hay đóng vòng chạy."
        actions={
          canCreate ? (
            <button
              ref={composer.openButtonRef}
              type="button"
              className="tx-btn tx-btn--go"
              onClick={composer.open}
            >
              Tạo đơn mới
            </button>
          ) : undefined
        }
      />

      {/* Luon co mat (rong thi an khoi dong chay) — xem `useComposerHandoff`. */}
      <p
        ref={composer.noticeRef}
        className="tx-notice tx-created-notice"
        role="status"
        tabIndex={-1}
        data-testid="tx-created-notice"
      >
        {composer.notice ?? ''}
      </p>

      {/* `#395` — ten khach va bien so la danh ba RIENG: thieu quyen thi noi, khong de o trong. */}
      <PermissionNote
        viewer={navigation}
        actions={['transport.customer.read', 'transport.vehicle.read']}
      />

      {/* Loc PHIA MAY KHACH: danh sach da nam het trong bo nho; URL khong doi. */}
      <div className="tx-orderfilter" role="search" aria-label="Tìm và lọc đơn">
        <label className="tx-field">
          <span>Tìm đơn</span>
          <input
            type="search"
            value={filter.search}
            placeholder="Mã đơn, khách hàng, điểm lấy hoặc giao"
            onChange={(event) => setFilter({ ...filter, search: event.target.value })}
            autoComplete="off"
          />
        </label>
        <label className="tx-field tx-orderfilter__status">
          <span>Trạng thái</span>
          <select
            value={filter.status}
            onChange={(event) =>
              setFilter({ ...filter, status: event.target.value as OrderStatusFilter })
            }
          >
            {ORDER_STATUS_FILTERS.map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_FILTER_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <p className="tx-orderfilter__count" role="status">
          Đang hiện {visibleOrders.length} / {orders.data.length} đơn
        </p>
      </div>

      <DataTable<TransportOrder>
        caption="Nghĩa vụ thương mại"
        rows={visibleOrders}
        rowKey={(order) => order.id}
        selectedKey={openOrderId}
        onSelect={(order) => setOpenOrderId(order.id === openOrderId ? null : order.id)}
        onShowAll={() => setOpenOrderId(null)}
        columns={[
          { key: 'code', header: 'Mã đơn', render: (order) => order.code, isRowHeader: true },
          {
            key: 'route',
            header: 'Tuyến',
            render: (order) => `${order.originLabel} → ${order.destinationLabel}`,
          },
          { key: 'customer', header: 'Khách', render: (order) => customerNameOf(order.customerId) },
          { key: 'businessDate', header: 'Ngày', render: (order) => order.businessDate },
          {
            key: 'freight',
            header: 'Cước',
            render: (order) => money(order.freightAmount),
            isNumeric: true,
          },
          {
            key: 'status',
            header: 'Trạng thái',
            render: (order) => (
              <StatusBadge
                label={ORDER_STATUS_LABEL[order.status]}
                tone={orderStatusTone(order.status)}
              />
            ),
          },
        ]}
      />
      {visibleOrders.length === 0 && orders.data.length > 0 ? (
        <p className="tx-note">Không có đơn nào khớp bộ lọc.</p>
      ) : null}

      {openState.kind === 'HIDDEN_BY_FILTER' ? (
        <div className="tx-orderfilter__hidden" data-testid="tx-open-order-hidden">
          <p className="tx-note">{hiddenOpenOrderNote(openState.code)}</p>
          <button
            type="button"
            className="tx-btn tx-btn--small"
            onClick={() => setFilter(EMPTY_ORDER_FILTER)}
          >
            Bỏ lọc
          </button>
        </div>
      ) : null}

      {selectedOrder === null ? null : <OrderRouteCard order={selectedOrder} />}

      {detailOrderId !== null && orderLegs.errorMessage !== null && (
        <ErrorState message={orderLegs.errorMessage} onRetry={orderLegs.refetch} />
      )}
      {detailOrderId !== null && orderLegs.isLoading && (
        <LoadingState label="Đang tải chặng của đơn…" />
      )}

      {detailOrderId !== null && orderLegs.data !== undefined && (
        <>
          {(() => {
            const selected = orders.data?.find((entry) => entry.id === openOrderId);
            if (selected === undefined || activePlan !== null || !canPlan) return null;
            return (
              <form
                className="tx-panel tx-filters"
                aria-label={`Lập kế hoạch và giao xe cho đơn ${selected.code}`}
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  setPlanSuccess(null);
                  previewPlan.mutate({
                    orderId: selected.id,
                    vehicleId: String(data.get('vehicleId') ?? ''),
                  });
                }}
              >
                <h2>Lập kế hoạch từ đơn</h2>
                <label className="tx-field">
                  <span>Xe</span>
                  <select name="vehicleId" required defaultValue="">
                    <option value="">— Chọn xe —</option>
                    {(vehicles.data ?? []).map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.registrationPlate}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="tx-btn" type="submit" disabled={previewPlan.isPending}>
                  Xem kế hoạch
                </button>
              </form>
            );
          })()}
          {previewPlan.isError ? (
            <ErrorState message={(previewPlan.error as Error).message} />
          ) : null}
          {preview !== null && planKey !== null && openOrderId === preview.orderId ? (
            <section
              className="tx-panel"
              role="region"
              aria-label={`Kế hoạch vận chuyển cho đơn ${orderCodeOf(openOrderId)}`}
            >
              <h2>Kế hoạch vận chuyển</h2>
              <ul className="tx-notes">
                {preview.legs.map((leg) => (
                  <li key={`${leg.sequence}-${leg.kind}`}>
                    <strong>{leg.kind === 'EMPTY' ? 'Chặng chạy rỗng' : 'Chặng có hàng'}</strong> ·{' '}
                    {leg.originLabel} → {leg.destinationLabel} · {km(leg.plannedDistanceKm)}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="tx-btn"
                disabled={commitPlan.isPending}
                onClick={() =>
                  commitPlan.mutate({
                    orderId: preview.orderId,
                    vehicleId: preview.vehicleId,
                    idempotencyKey: planKey,
                  })
                }
              >
                Xác nhận kế hoạch và giao xe
              </button>
            </section>
          ) : null}
          {commitPlan.isError ? <ErrorState message={(commitPlan.error as Error).message} /> : null}
          {planSuccess === null ? null : (
            <p className="tx-note" role="status">
              {planSuccess}
            </p>
          )}
          {activePlan !== null && (
            <MetricCard
              label="Vòng chạy đang phục vụ đơn"
              value={runCodeOf(activePlan.runId)}
              hint={`Xe ${plateOf(activePlan.vehicleId)} · ${
                activePlan.outcome === 'NEW_RUN'
                  ? 'mở vòng chạy mới'
                  : 'nối vào vòng chạy đang chạy'
              }`}
            />
          )}
          {/*
            `#376` — TIEN DO VONG CHAY dung ngay trong don: ca chang RONG (khong mang don nao) cung
            nam o day, vi vong chay chi dong khi MOI chang da xong, va nguoi lam viec voi DON khong
            phai di tim vong chay o bang nang cao ben duoi.
          */}
          {activePlan !== null && (
            <RunLegWorkflow
              runId={activePlan.runId}
              captionFor={(runCode) =>
                `Chặng của vòng chạy ${runCode} phục vụ đơn ${orderCodeOf(openOrderId)}`
              }
              orderCodeOf={orderCodeOf}
              asPanel
            />
          )}
          {selectedOrder === null ? null : (
            <OrderFulfilmentPanel order={selectedOrder} legs={orderLegs.data} />
          )}
          <DataTable<RunLeg>
            caption={`Chặng của đơn ${orderCodeOf(openOrderId)}`}
            rows={orderLegs.data}
            rowKey={(leg) => leg.id}
            columns={[
              {
                key: 'run',
                header: 'Vòng chạy',
                render: (leg) => runCodeOf(leg.runId),
                isRowHeader: true,
              },
              {
                key: 'route',
                header: 'Chặng',
                render: (leg) => `${leg.originLabel} → ${leg.destinationLabel}`,
              },
              {
                key: 'status',
                header: 'Tiến độ',
                render: (leg) => (
                  <StatusBadge
                    label={LEG_STATUS_LABEL[leg.status]}
                    tone={legStatusTone(leg.status)}
                  />
                ),
              },
              {
                key: 'distance',
                header: 'Đã đi',
                render: (leg) => km(leg.distanceKm),
                isNumeric: true,
              },
            ]}
          />
        </>
      )}

      {/* `#379` — muc PHU cua trang (h2), khong phai mot trang thu hai: bang vong chay la noi xem sau
          va nguon cua bao cao km rong, khong duoc to ngang khoi don hang. */}
      <section className="tx-movement-runs" aria-labelledby="tx-movement-runs-title">
        <h2 id="tx-movement-runs-title">Vòng chạy của xe</h2>
        <p className="tx-note">
          Bề mặt vận hành nâng cao — nguồn của báo cáo km rỗng. Quy trình thường ngày không cần mở
          tới đây.
        </p>
      </section>

      {/* `#395` — bang vong chay la PHAN PHU (`transport.run.read`): nguoi chi duoc xem don thay
          mot cau, khong thay mot bang vong chay rong. */}
      {!canPerform(navigation, 'transport.run.read') ? (
        <PermissionGate viewer={navigation} action="transport.run.read" />
      ) : runs.errorMessage !== null ? (
        <ErrorState message={runs.errorMessage} onRetry={runs.refetch} />
      ) : (
        <DataTable<VehicleRun>
          caption="Vòng chạy của xe"
          rows={runs.data ?? []}
          rowKey={(run) => run.id}
          selectedKey={openRunId}
          onSelect={(run) => setOpenRunId(run.id === openRunId ? null : run.id)}
          onShowAll={() => setOpenRunId(null)}
          columns={[
            { key: 'code', header: 'Mã', render: (run) => run.code, isRowHeader: true },
            { key: 'vehicle', header: 'Xe', render: (run) => plateOf(run.vehicleId) },
            { key: 'businessDate', header: 'Ngày', render: (run) => run.businessDate },
            {
              key: 'status',
              header: 'Trạng thái',
              render: (run) => (
                <StatusBadge
                  label={RUN_STATUS_LABEL[run.status]}
                  tone={runStatusTone(run.status)}
                />
              ),
            },
          ]}
        />
      )}

      {openRunId !== null && runDetail.errorMessage !== null && (
        <ErrorState message={runDetail.errorMessage} onRetry={runDetail.refetch} />
      )}
      {openRunId !== null && runDetail.isLoading && <LoadingState label="Đang tải chặng…" />}

      {runDetail.data != null && (
        <>
          {/* Cung bang + cung nut voi khoi tien do cua don (`#376`) — mot vong chay khong gan don nao
              (nhan viec tai dia diem, chieu chuyen cu) van tien chang duoc o day. */}
          <RunLegWorkflow
            runId={runDetail.data.run.id}
            captionFor={(runCode) => `Chặng của vòng chạy ${runCode}`}
            orderCodeOf={orderCodeOf}
            showDistance
          />

          {movement.data !== undefined && <RunMovementMetrics movement={movement.data} />}
        </>
      )}
    </>
  );
}
