'use client';

import dynamic from 'next/dynamic';
import { LoadingState } from '../../components/SectionState';
import type { GeoPoint, TransportOrder } from '../../transport-types';
import { ENDPOINT_BADGE } from '../../workspace/order-draft';
import { LEGACY_ROUTE_NOTE, orderRouteMarkers, orderRouteOf } from '../../workspace/order-list';
import {
  boundsOfPoints,
  formatCoordinates,
  formatStraightLine,
  straightLineKm,
} from '../../workspace/place-lookup';
import '../../visual/location-picker-map.css';
import './order-route.css';

/**
 * KHOI "TUYẾN" cua don dang chon (`#379`) — ten hai dau, toa do nho, ban do chi doc nho.
 *
 * Don CU (tao truoc khi he thong luu toa do; don chieu tu chuyen v1; du lieu mau) KHONG co ban do va
 * KHONG co mot diem nao duoc bia: man hinh noi thang la don chi co ten hien thi. Ve mot ghim o
 * "trung tam tinh" cho mot don cu la bia ra mot noi lay hang ma khong ai chon.
 */

const LocationPickerMap = dynamic(() => import('../../visual/LocationPickerMap'), {
  ssr: false,
  loading: () => <LoadingState label="Đang tải bản đồ…" />,
});

function End({
  endpoint,
  label,
  point,
}: {
  readonly endpoint: 'ORIGIN' | 'DESTINATION';
  readonly label: string;
  readonly point: GeoPoint | null;
}): React.ReactElement {
  return (
    <li className="tx-routecard__end" data-endpoint={endpoint}>
      <span className="tx-routecard__tag" aria-hidden="true">
        {ENDPOINT_BADGE[endpoint]}
      </span>
      <span className="tx-routecard__text">
        <span className="tx-routecard__role">
          {endpoint === 'ORIGIN' ? 'Lấy hàng' : 'Giao hàng'}
        </span>
        <span className="tx-routecard__name">{label}</span>
        {point === null ? null : (
          <span className="tx-routecard__coords">{formatCoordinates(point)}</span>
        )}
      </span>
    </li>
  );
}

export function OrderRouteCard({ order }: { readonly order: TransportOrder }): React.ReactElement {
  const route = orderRouteOf(order);
  const bounds =
    route.origin !== null && route.destination !== null
      ? boundsOfPoints([route.origin, route.destination])
      : null;

  return (
    <section className="tx-panel tx-routecard" aria-label={`Tuyến của đơn ${order.code}`}>
      <div className="tx-routecard__facts">
        <h2>Tuyến</h2>
        <ol className="tx-routecard__ends">
          <End endpoint="ORIGIN" label={order.originLabel} point={route.origin} />
          <End endpoint="DESTINATION" label={order.destinationLabel} point={route.destination} />
        </ol>
        {route.origin !== null && route.destination !== null ? (
          <p className="tx-routecard__distance">
            Đường chim bay {formatStraightLine(straightLineKm(route.origin, route.destination))}
            <span> — không phải quãng đường xe chạy</span>
          </p>
        ) : (
          <p className="tx-note">{LEGACY_ROUTE_NOTE}</p>
        )}
      </div>
      {bounds === null || route.origin === null || route.destination === null ? null : (
        <div className="tx-routecard__map">
          <LocationPickerMap
            key={order.id}
            markers={orderRouteMarkers(order)}
            initialBounds={bounds}
            straightLine={[route.origin, route.destination]}
            ariaLabel={`Bản đồ tuyến của đơn ${order.code}: điểm lấy và điểm giao`}
            testId="tx-route-map"
          />
        </div>
      )}
    </section>
  );
}
