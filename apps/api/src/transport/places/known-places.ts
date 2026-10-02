import { parseGeoPoint } from '../geo/geo-point.js';
import type { Geofence, GeofenceSubjectKind } from '../proof/geofence.repository.js';
import { fenceKindLabel } from './admin/place-admin.types.js';
import type { KnownPlace, KnownPlaceKind } from './place-search.types.js';

/**
 * DIA DIEM DA BIET = HANG RAO CON HIEU LUC THAT, KHONG PHAI mot kho dia diem thu hai.
 *
 * `#379` cam dung mot so dia diem rieng cho man tao don: hang rao (`TransportGeofence`) da la noi
 * duy nhat mang toa do cua bai xe, kho, nha may — va la noi lai xe, dieu xe, bang chung hien truong
 * cung doc. Hai so se lech nhau vao lan sua thu hai. Ham nay chi DOC va DAT TEN.
 *
 * `#395`: nguoi goi dua vao hang rao con hieu luc THAT (`listEffectivelyActive()` — dia diem, phap
 * nhan, khach deu con hoat dong), va MOI dia diem mang ten CHU cua no o dong phu va NHAN LOAI cua
 * no (`kindLabel`) — CHINH `fenceKindLabel()` ma man "Dia diem van hanh" va luat trung ten dung,
 * nen Tao don khong the goi mot kho khach hang la "Nhà máy / kho đối tác" trong khi man quan tri
 * goi no la "Địa điểm khách hàng".
 */

/** Thu tu hien thi: bai xe cua minh truoc, roi dia diem phap nhan, roi hang rao khach hang. */
const KIND_ORDER: Readonly<Record<KnownPlaceKind, number>> = {
  DEPOT: 0,
  COUNTERPARTY_SITE: 1,
  CUSTOMER: 2,
};

const isKnownPlaceKind = (kind: GeofenceSubjectKind): kind is KnownPlaceKind =>
  kind === 'DEPOT' || kind === 'COUNTERPARTY_SITE' || kind === 'CUSTOMER';

/** Ten dia diem + ten phap nhan cua MOT dia diem con hieu luc. */
export interface KnownSiteName {
  readonly siteName: string;
  readonly counterpartyName: string;
  /** Phap nhan so huu co lien ket khach hang (`isCustomerLinked`) -> "Địa điểm khách hàng". */
  readonly customerLinked: boolean;
}

/** Hang rao dua vao: ban ghi day du cua kho (co dia chi), hoac chi hinh hoc + nhan (spec thuan). */
export type KnownPlaceFence = Geofence & { readonly address?: string | null };

/**
 * Hang rao -> dia diem da biet.
 *
 *   · `COUNTERPARTY_SITE`: ten = ten dia diem, dong phu = ten phap nhan so huu. Dia diem KHONG doc
 *     duoc (da nghi, phap nhan da nghi, hoac vua bi xoa) thi hang rao BI BO — mot kho da nghi khong
 *     duoc hien ra cho nguoi tao don chon (`#395`; truoc do no lui ve nhan hang rao);
 *   · `CUSTOMER` (kieu cu): ten = nhan hang rao, dong phu = ten khach hang (neu doc duoc);
 *   · `DEPOT`: ten = nhan hang rao, khong dong phu — bai xe la cua chinh cong ty.
 *
 * Toa do di qua `parseGeoPoint` du CHECK cua bang da chan: mot dong hong khong duoc thanh mot cham
 * "hop le" ma nguoi dung bam chon lam diem lay hang.
 */
export function buildKnownPlaces(
  fences: readonly KnownPlaceFence[],
  sitesById: ReadonlyMap<string, KnownSiteName>,
  customerNames: ReadonlyMap<string, string> = new Map(),
): readonly KnownPlace[] {
  const places = fences.flatMap((fence): KnownPlace[] => {
    const kind = fence.subjectKind;
    if (!isKnownPlaceKind(kind)) return [];
    const parsed = parseGeoPoint(fence.latitude, fence.longitude);
    if (!parsed.ok) return [];

    if (kind === 'COUNTERPARTY_SITE') {
      const site = fence.subjectId === null ? undefined : sitesById.get(fence.subjectId);
      if (site === undefined) return [];
      return [
        placeOf(fence, kind, {
          name: site.siteName,
          detail: site.counterpartyName,
          customerLinked: site.customerLinked,
          point: parsed.point,
        }),
      ];
    }
    const detail =
      kind === 'CUSTOMER' && fence.subjectId !== null
        ? (customerNames.get(fence.subjectId) ?? null)
        : null;
    return [
      placeOf(fence, kind, {
        name: fence.label,
        detail,
        customerLinked: false,
        point: parsed.point,
      }),
    ];
  });

  return [...places].sort(
    (left, right) =>
      KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
      left.name.localeCompare(right.name, 'vi') ||
      left.id.localeCompare(right.id),
  );
}

interface PlaceFacts {
  readonly name: string;
  readonly detail: string | null;
  readonly customerLinked: boolean;
  readonly point: KnownPlace['point'];
}

function placeOf(fence: KnownPlaceFence, kind: KnownPlaceKind, facts: PlaceFacts): KnownPlace {
  return {
    id: fence.id,
    kind,
    kindLabel: fenceKindLabel(kind, facts.customerLinked),
    name: facts.name,
    address: fence.address ?? null,
    detail: facts.detail,
    point: facts.point,
    radiusMetres: fence.radiusMetres,
  };
}
