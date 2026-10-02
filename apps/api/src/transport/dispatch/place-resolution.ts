import { parseGeoPoint, type GeoPoint } from '../geo/geo-point.js';
import type { Order } from '../movement/movement.types.js';
import type { DispatchPlaceSource, PlaceResolution, ResolvedPlace } from './dispatch.types.js';

/**
 * TU MOT CAI TEN, HOAC TU MOT DON, RA MOT TOA DO — ham THUAN, va la cho de nhat de noi doi trong
 * ca Lane M.
 *
 * ===========================================================================
 * DON MANG TOA DO (#379) — VA VI SAO PHEP SO KHOP NHAN VAN CON
 *
 * Tu #379 `TransportOrder` luu toa do diem lay/giao (`originPoint`/`destinationPoint`) do nguoi
 * nhap don chon tren ban do; `originLabel`/`destinationLabel` chi con de HIEN THI. Nen cau hoi
 * "don nay lay hang o dau" duoc tra loi bang `orderPickupPlace()` — doc thang toa do cua don,
 * khong so khop chuoi nao. Don cu (toa do NULL) bi tu choi CO KIEU chu khong roi ve nhan: mot nhan
 * trung ten mot hang rao la mot su trung hop chinh ta, khong phai mot lan khao sat.
 *
 * Phep so khop NHAN van can cho dung hai viec:
 *   · diem den cua CHANG — `RunLeg` chua co cot toa do, nen chang cua don cu, chang rong khong
 *     dung truoc chang co tai dau tien cua mot don, va chang giua cua mot don nhieu chang van chi
 *     co nhan (`remaining-leg-plan.ts`);
 *   · tham chieu TUONG MINH theo ma hang rao / ma dia diem phap nhan.
 * Toa do cua hai duong do song o `TransportGeofence` (`latitude`/`longitude` + `radiusMetres`), do
 * nguoi van hanh khai cho kho/bai/cay xang. Va khi khong noi duoc, cau tra loi la NOI RANG KHONG
 * NOI DUOC.
 *
 * ===========================================================================
 * BA LUAT CUA TANG NAY
 *
 *   1. KHOP KHIT hoac khong khop. Khong co "gan giong", khong co khoang cach Levenshtein, khong
 *      co diem so. Mot bang xep hang dieu xe dua tren mot phep doan chinh ta la mot chiec xe chay
 *      nham tinh.
 *   2. HAI KET QUA TRO LEN LA MOT THAT BAI, khong phai mot cuoc thi. `PICKUP_LABEL_AMBIGUOUS` tra
 *      ve cho nguoi dung chon; chon ho ho la mot cu tung dong xu duoc trinh bay nhu mot ket qua
 *      tinh toan.
 *   3. KHONG CO GIA TRI DU PHONG. Khong bai xe, khong tam tinh, khong diem dau tien tim thay.
 *      `#277 M1`: *"never invent depot/zero ETA."*
 */

/** Dai dau to hop cua Unicode (U+0300..U+036F) — phan con lai sau khi `NFD` tach mot nguyen am. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * CHUAN HOA MOT NHAN DIA DIEM de so khop.
 *
 * `đ`/`Đ` phai duoc doi TAY truoc `normalize('NFD')`: chung la chu cai rieng cua bang chu cai
 * Viet chu khong phai `d` cong mot dau, nen NFD khong tach chung ra.
 *
 * ---------------------------------------------------------------------------
 * VI SAO CHEP LAI THAY VI DUNG `normalizeStationLabel` CUA `transport-fuel`.
 *
 * Ham do (`fuel/fuel-station-identity.ts`) lam dung viec nay va lam tot. Nhung no song trong
 * `transport-fuel`, mot capability ma mot khach van tai co the KHONG BAT — va dieu xe thi thuoc
 * `transport-core`. Mot canh nhap khau tu loi sang mot capability tuy chon la mot canh se do vao
 * dung ngay co khach dau tien tat `transport-fuel`, va no do luc BOOT chu khong luc bien dich.
 *
 * `DRY` doi ta rut gon khi lap lai la THAT; ranh gioi capability la mot rang buoc manh hon, va
 * kho ma nay da tra gia do ba lan (`rules/text.ts`, `fuel-station-identity.ts`, va day) mot cach
 * co y thuc. Neu mot ngay co mot goi tien ich TRUNG TINH ve capability, ca ba doi ve do.
 *
 * Moi cum ky tu khong phai chu-so thanh MOT khoang trang, khong bi nuot: `Kho-so 5` phai thanh
 * `KHO SO 5` chu khong `KHOSO5` — nuot dau phan cach lam `Kho 5` va `Kho5` gap nhau.
 */
export const normalizePlaceLabel = (value: string | null | undefined): string =>
  value
    ? value
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .normalize('NFD')
        .replace(COMBINING_MARKS, '')
        .toUpperCase()
        .replace(/[^0-9A-Z]+/g, ' ')
        .trim()
    : '';

/**
 * MOT MUC trong so tra cuu dia diem.
 *
 * CO Y khong phai `Geofence`: tang nay khong can biet ban kinh, trang thai, hay ai khai bao. Cho
 * no biet them se lam mot ham thuan phai theo doi vong doi cua mot bang.
 *
 * `siteName` tach khoi `label` vi hai chuoi tra loi hai cau hoi khac nhau: `label` la ten NGUOI
 * VAN HANH dat cho hang rao (*"Hang rao kho HP"*), `siteName` la ten cua CHO (*"Kho Hai Phong"*)
 * ma nguoi lap ke hoach go vao nhan chang. Ca hai deu duoc so khop.
 */
export interface PlaceIndexEntry {
  readonly geofenceId: string;
  readonly label: string;
  readonly point: GeoPoint;
  readonly siteId: string | null;
  readonly siteName: string | null;
}

/**
 * GIAI mot nhan dia diem thanh mot cho co toa do.
 *
 * Thu tu uu tien co y: hang rao truoc, dia diem phap nhan sau. Mot hang rao la mot khai bao TRUC
 * TIEP cua nguoi van hanh ve mot toa do; mot dia diem phap nhan chi co toa do NHO mot hang rao
 * tro toi no. Khi mot cai ten khop ca hai duong, duong ngan hon la duong dung.
 *
 * Neu mot ten khop NHIEU muc, ket qua la `PICKUP_LABEL_AMBIGUOUS` — tru mot truong hop: nhieu muc
 * cung tro ve DUNG MOT hang rao. Do khong phai nhap nhang, do la cung mot cho duoc goi bang hai
 * ten, va tra ve no la cau tra loi dung.
 */
export function resolvePlaceByLabel(
  rawLabel: string,
  index: readonly PlaceIndexEntry[],
): PlaceResolution {
  const key = normalizePlaceLabel(rawLabel);
  if (key === '') return { ok: false, reason: 'PICKUP_LABEL_NO_MATCH' };

  const byGeofenceLabel = index.filter((entry) => normalizePlaceLabel(entry.label) === key);
  const bySiteName = index.filter((entry) => normalizePlaceLabel(entry.siteName) === key);

  const matched = byGeofenceLabel.length > 0 ? byGeofenceLabel : bySiteName;
  if (matched.length === 0) return { ok: false, reason: 'PICKUP_LABEL_NO_MATCH' };

  const distinctGeofenceIds = new Set(matched.map((entry) => entry.geofenceId));
  if (distinctGeofenceIds.size > 1) return { ok: false, reason: 'PICKUP_LABEL_AMBIGUOUS' };

  const entry = matched[0]!;
  const viaGeofenceLabel = byGeofenceLabel.length > 0;
  return {
    ok: true,
    reason: viaGeofenceLabel ? 'PICKUP_FROM_GEOFENCE_LABEL' : 'PICKUP_FROM_COUNTERPARTY_SITE',
    place: {
      point: entry.point,
      source: viaGeofenceLabel ? 'GEOFENCE_LABEL_EXACT' : 'COUNTERPARTY_SITE_GEOFENCE',
      label: viaGeofenceLabel ? entry.label : (entry.siteName ?? entry.label),
      geofenceId: entry.geofenceId,
      siteId: entry.siteId,
    },
  };
}

/** Tra cuu theo MA hang rao — duong nguoi goi chi dinh thang, khong qua so khop chuoi nao. */
export function resolvePlaceByGeofenceId(
  geofenceId: string,
  index: readonly PlaceIndexEntry[],
): PlaceResolution {
  const entry = index.find((candidate) => candidate.geofenceId === geofenceId);
  if (!entry) return { ok: false, reason: 'PICKUP_REQUEST_REF_NOT_FOUND' };
  return {
    ok: true,
    reason: 'PICKUP_FROM_EXPLICIT_REQUEST',
    place: {
      point: entry.point,
      source: 'EXPLICIT_REQUEST_GEOFENCE',
      label: entry.label,
      geofenceId: entry.geofenceId,
      siteId: entry.siteId,
    },
  };
}

/**
 * Tra cuu theo MA DIA DIEM phap nhan.
 *
 * Mot dia diem KHONG CO hang rao thi khong co toa do, va do la mot ket qua khac han "khong tim
 * thay dia diem": cai dau la du lieu chua khai xong, cai sau la mot ma sai. Ca hai deu tra
 * `PICKUP_REQUEST_REF_NOT_FOUND` o day cho gon — tang tren phan biet duoc bang chinh danh sach
 * dia diem, va viec khai hang rao cho mot dia diem thuoc ve Lane H.
 */
export function resolvePlaceBySiteId(
  siteId: string,
  index: readonly PlaceIndexEntry[],
): PlaceResolution {
  const matched = index.filter((entry) => entry.siteId === siteId);
  if (matched.length === 0) return { ok: false, reason: 'PICKUP_REQUEST_REF_NOT_FOUND' };
  if (new Set(matched.map((entry) => entry.geofenceId)).size > 1) {
    return { ok: false, reason: 'PICKUP_LABEL_AMBIGUOUS' };
  }
  const entry = matched[0]!;
  return {
    ok: true,
    reason: 'PICKUP_FROM_EXPLICIT_REQUEST',
    place: {
      point: entry.point,
      source: 'EXPLICIT_REQUEST_SITE',
      label: entry.siteName ?? entry.label,
      geofenceId: entry.geofenceId,
      siteId,
    },
  };
}

/** Mot toa do do chinh nguoi goi dua vao. Da qua `parseGeoPoint` o tang bien truoc khi toi day. */
export function explicitPointPlace(point: GeoPoint, label: string): ResolvedPlace {
  return {
    point,
    source: 'EXPLICIT_REQUEST_POINT',
    label,
    geofenceId: null,
    siteId: null,
  };
}

/** Hai nguon toa do DON — mot cho diem lay, mot cho diem giao. */
export type OrderPointSource = Extract<
  DispatchPlaceSource,
  'ORDER_PICKUP_POINT' | 'ORDER_DELIVERY_POINT'
>;

/**
 * MOT TOA DO LUU TREN DON -> mot cho da giai, hoac `null`.
 *
 * Kiem LAI bang `parseGeoPoint` du tang ghi da kiem: rang buoc CHECK cua bang chan duoc du lieu
 * hong, nhung mot ban sao du lieu cu, mot lan sua tay, hay mot kho trong bo nho cua bai kiem thu
 * thi khong. Mot toa do hong di tiep qua phep dinh tuyen se cho ra mot con so km trong nhu that.
 *
 * `undefined` duoc coi nhu `null` (khong co toa do) chu khong phai mot loi: kieu `Order` bat buoc
 * truong nay, nhung mot doi tuong den tu mot tang cu chua biet truong do van phai ra "khong co"
 * thay vi mot ngoai le giua duong dieu xe.
 */
export function orderPointPlace(
  point: GeoPoint | null | undefined,
  label: string,
  source: OrderPointSource,
): ResolvedPlace | null {
  if (point === null || point === undefined) return null;
  const parsed = parseGeoPoint(point.latitude, point.longitude);
  if (!parsed.ok) return null;
  return { point: parsed.point, source, label, geofenceId: null, siteId: null };
}

/**
 * DIEM LAY HANG CUA MOT DON — duong mac dinh cua dieu xe khi nguoi goi khong chi dinh gi.
 *
 * Ba ket cuc, tach rieng de nguoi doc trace biet vi sao: co toa do -> dung no; khong co (don cu)
 * -> `PICKUP_ORDER_COORDINATES_MISSING`; co nhung hong -> `PICKUP_ORDER_COORDINATES_REJECTED`.
 * KHONG co nhanh thu tu "thu nhan chu" — do chinh la duong #379 go bo. Nhan chi di kem de hien thi.
 */
export function orderPickupPlace(
  order: Pick<Order, 'originPoint' | 'originLabel'>,
): PlaceResolution {
  if (order.originPoint === null || order.originPoint === undefined) {
    return { ok: false, reason: 'PICKUP_ORDER_COORDINATES_MISSING' };
  }
  const place = orderPointPlace(order.originPoint, order.originLabel, 'ORDER_PICKUP_POINT');
  if (place === null) return { ok: false, reason: 'PICKUP_ORDER_COORDINATES_REJECTED' };
  return { ok: true, reason: 'PICKUP_FROM_ORDER_COORDINATES', place };
}
