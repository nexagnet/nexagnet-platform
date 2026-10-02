import type { Order } from '../movement/movement.types.js';
import type { DispatchLegFact } from './dispatch-facts.port.js';
import type { ResolvedPlace } from './dispatch.types.js';
import {
  orderPointPlace,
  resolvePlaceByLabel,
  type OrderPointSource,
  type PlaceIndexEntry,
} from './place-resolution.js';
import type { TruckProfile } from './routing/routing.types.js';
import type { TransportRoutingPort } from './routing/transport-routing.port.js';
import type { RemainingLegFact, RemainingLegPlan } from './vehicle-state-projection.js';

/**
 * VIEC CON LAI CUA MOT CHIEC XE -> chuoi diem den co GIO DI (#277 `NEXT_FREE`, #379).
 *
 * ===========================================================================
 * DIEM DEN CUA CHANG LAY TU DAU
 *
 * `RunLeg` chua co cot toa do — chi co nhan. Nhung tu #379 DON co toa do, va phan lon chang tro
 * toi mot don, nen diem den cua chang duoc lay theo thu tu:
 *
 *   1. chang `LOADED` CUOI CUNG cua mot don trong viec con lai
 *                                   -> diem GIAO cua don do (`ORDER_DELIVERY_POINT`);
 *   2. chang `EMPTY` dung NGAY TRUOC chang `LOADED` DAU TIEN cua mot don, CUNG vong chay
 *                                   -> diem LAY cua don ke tiep (`ORDER_PICKUP_POINT`) — dung hinh
 *                                      dang ma bo lap ke hoach sinh ra: chay rong toi cho lay hang;
 *   3. con lai (chang cua don cu, chang rong ve bai, don khong co toa do, chang giua cua mot don
 *      nhieu chang)
 *                                   -> giai theo NHAN nhu truoc #379. Day KHONG phai suy diem lay
 *                                      hang cua don dang dieu: no chi la phep chieu "xe se ranh o
 *                                      dau", va chang chua co nguon toa do nao khac.
 *
 * VI SAO "CUOI CUNG" va "DAU TIEN": mot don co the chay qua NHIEU chang co tai (giao tung phan, qua
 * mot bai trung chuyen). Don chi ghi HAI diem — lay va giao — nen chang co tai dau tien cua don moi
 * xuat phat tu diem lay, va chang co tai cuoi cung moi dung o diem giao. Gan diem giao cho moi
 * chang co tai se cho xe "toi noi giao" ngay tu chang dau roi dinh tuyen chang sau tu do — mot phep
 * chieu sai ma trong van hop ly. Chang giua di toi mot cho don khong ghi, nen no roi ve nhan.
 *
 * "Dau tien" va "cuoi cung" do tren VIEC CON LAI cua xe (`remaining`), khong phai tren lich su don:
 * chang da xong khong con trong danh sach. Neu chang co tai dau cua don da xong, chang co tai sau
 * no duoc coi la dau tien — mot gioi han biet truoc, va cai gia chi la mot chang rong hiem hoi bi
 * tro toi diem lay thay vi bai trung chuyen.
 *
 * Toa do don THANG nhan chang ke ca khi nhan chang trung ten mot hang rao khac: nhan chi de hien
 * thi, toa do moi la su that.
 *
 * ===========================================================================
 * MOI DON DOC MOT LAN MOI LUOT TINH
 *
 * Nhieu xe co the cung tro toi mot don (don dang dieu, hoac hai chang cua cung mot don), va moi
 * chang cua moi xe deu hoi. `memoizeOrderLookup()` giu dung MOT lan doc cho moi ma don trong mot
 * lan `suggest()`. Ngan sach dinh tuyen (`maxProjectionRouteCalls`) KHONG doi nghia: doc don khong
 * ton lan goi nha cung cap nao.
 */

/** Doc mot don theo ma — `null` khi khong co. */
export type OrderLookup = (orderId: string) => Promise<Order | null>;

/**
 * Bo dem doc don cho MOT lan tinh bang de nghi.
 *
 * Luu PROMISE chu khong luu ket qua: hai chang hoi cung mot don lien tiep se dung chung mot lan doc
 * dang bay, thay vi ca hai cung thay "chua co trong bo dem" roi cung doc. `seed` cho phep dua vao
 * don da doc san (don dang dieu) de no khong bi doc lan hai.
 */
export function memoizeOrderLookup(read: OrderLookup, seed: readonly Order[] = []): OrderLookup {
  const cache = new Map<string, Promise<Order | null>>(
    seed.map((order) => [order.id, Promise.resolve(order)] as const),
  );
  return (orderId) => {
    const hit = cache.get(orderId);
    if (hit) return hit;
    const pending = read(orderId);
    cache.set(orderId, pending);
    return pending;
  };
}

/** Chang + vong chay so huu no -> mot su that chang con lai. Ham thuan. */
export function toRemainingLegFact({ leg, run }: DispatchLegFact): RemainingLegFact {
  return {
    legId: leg.id,
    runId: leg.runId,
    orderId: leg.orderId,
    sequence: leg.sequence,
    kind: leg.kind,
    status: leg.status,
    originLabel: leg.originLabel,
    destinationLabel: leg.destinationLabel,
    runStatus: run.status,
    runBusinessDate: run.businessDate,
    runCreatedAt: run.createdAt,
  };
}

/** Mot tham chieu toi toa do DON ma diem den cua chang phu thuoc vao. */
export interface LegOrderPointRef {
  readonly orderId: string;
  readonly source: OrderPointSource;
}

/**
 * Chang o vi tri `position` cua `remaining` di toi toa do cua don NAO — hoac `null` khi phai giai
 * theo nhan.
 *
 * Nhan CA danh sach chu khong chi chang ke tiep: "chang co tai cuoi cung / dau tien cua don" la
 * mot cau hoi ve moi chang con lai cua xe, khong tra loi duoc tu mot cap chang (xem dau tep).
 *
 * Chang ke tiep phai la chang KE TIEP THAT trong cung vong chay (`sequence + 1`): mot chang rong
 * cuoi vong chay la chang ve bai, khong phai chang di lay hang cua vong chay sau.
 */
export function legOrderPointRef(
  remaining: readonly RemainingLegFact[],
  position: number,
): LegOrderPointRef | null {
  const leg = remaining[position];
  if (leg === undefined) return null;

  if (leg.kind === 'LOADED') {
    if (leg.orderId === null) return null;
    // Con mot chang co tai cua CUNG don phia sau -> chang nay dung o cho trung gian, khong o diem giao.
    const endsAtDelivery = !hasLoadedLegOf(remaining.slice(position + 1), leg.orderId);
    return endsAtDelivery ? { orderId: leg.orderId, source: 'ORDER_DELIVERY_POINT' } : null;
  }

  const next = remaining[position + 1];
  const feedsNextLoaded =
    next !== undefined &&
    next.runId === leg.runId &&
    next.sequence === leg.sequence + 1 &&
    next.kind === 'LOADED';
  if (!feedsNextLoaded || next.orderId === null) return null;
  // Da co mot chang co tai cua don do phia truoc -> chay rong toi cho trung gian, khong toi diem lay.
  const startsAtPickup = !hasLoadedLegOf(remaining.slice(0, position), next.orderId);
  return startsAtPickup ? { orderId: next.orderId, source: 'ORDER_PICKUP_POINT' } : null;
}

function hasLoadedLegOf(legs: readonly RemainingLegFact[], orderId: string): boolean {
  return legs.some((entry) => entry.kind === 'LOADED' && entry.orderId === orderId);
}

/** Doc toa do dung vai (lay hay giao) tu mot don da doc. */
function placeFromOrder(order: Order, source: OrderPointSource): ResolvedPlace | null {
  return source === 'ORDER_DELIVERY_POINT'
    ? orderPointPlace(order.destinationPoint, order.destinationLabel, source)
    : orderPointPlace(order.originPoint, order.originLabel, source);
}

/** Diem den cua chang o vi tri `position`: toa do don neu co, khong thi giai theo nhan. Xem dau tep. */
export async function resolveLegDestination(
  remaining: readonly RemainingLegFact[],
  position: number,
  orders: OrderLookup,
  index: readonly PlaceIndexEntry[],
): Promise<ResolvedPlace | null> {
  const leg = remaining[position];
  if (leg === undefined) return null;
  const ref = legOrderPointRef(remaining, position);
  if (ref !== null) {
    const order = await orders(ref.orderId);
    const fromOrder = order === null ? null : placeFromOrder(order, ref.source);
    if (fromOrder !== null) return fromOrder;
  }
  const byLabel = resolvePlaceByLabel(leg.destinationLabel, index);
  return byLabel.ok ? byLabel.place : null;
}

export interface RemainingLegPlanInput {
  readonly remaining: readonly RemainingLegFact[];
  /** Cho xe dang dung — diem xuat phat cua chang dau. `null` = khong biet. */
  readonly currentPlace: ResolvedPlace | null;
  readonly truck: TruckProfile;
  readonly index: readonly PlaceIndexEntry[];
  readonly orders: OrderLookup;
  readonly routing: TransportRoutingPort;
  /** Ngan sach goi dinh tuyen DUNG CHUNG cho ca luot tinh — bi tru tai cho. */
  readonly budget: { remaining: number };
}

/**
 * Chuoi chang con lai -> ke hoach co GIO DI cua tung doan.
 *
 * Diem xuat phat cua doan dau la CHO XE DANG DUNG; tu doan thu hai tro di la diem den cua doan
 * truoc. Doan nao thieu mot dau — khong biet xe o dau, hoac diem den khong giai duoc — thi
 * `travelSeconds` la `null`, va `projectNextFree()` bien dieu do thanh mot `gap` co ten.
 */
export async function planRemainingLegs(
  input: RemainingLegPlanInput,
): Promise<readonly RemainingLegPlan[]> {
  const plans: RemainingLegPlan[] = [];
  let from: ResolvedPlace | null = input.currentPlace;

  for (const [position, leg] of input.remaining.entries()) {
    const destination = await resolveLegDestination(
      input.remaining,
      position,
      input.orders,
      input.index,
    );

    let travelSeconds: number | null = null;
    if (from !== null && destination !== null && input.budget.remaining > 0) {
      input.budget.remaining -= 1;
      const outcome = await input.routing.route({
        origin: from.point,
        destination: destination.point,
        truck: input.truck,
        departAt: null,
      });
      travelSeconds = outcome.ok ? outcome.estimate.durationSeconds : null;
    }

    plans.push({ legId: leg.legId, orderId: leg.orderId, destination, travelSeconds });
    from = destination;
  }
  return plans;
}
