import { Injectable } from '@nestjs/common';
import type {
  AccessChangeInput,
  AccessScopeNote,
  AccessViolation,
  PermissionDomain,
} from '../../auth/access/permission-domain.js';
import { PermissionDomainRegistry } from '../../auth/access/permission-domain.registry.js';
import { demoReservedUsernames } from '../demo/demo-logins.js';
import {
  TransportAccountLinkDirectory,
  type DriverAccountLinkView,
  type StakeholderAccountLinkView,
} from '../fleet/account-link-directory.js';
import { transportPermissionCatalog } from './transport-permission-catalog.js';
import {
  effectiveTransportActionList,
  escalatedActions,
  validateTransportGrants,
} from './transport-permission-rules.js';

/**
 * MIEN PHAN QUYEN `transport` — noi quy tac thuan (`transport-permission-rules.ts`) va danh muc
 * (`transport-permission-catalog.ts`) vao hop dong cua nen tang (`PermissionDomain`, `#395`).
 *
 * Phan THUAN: danh muc, tap hieu luc, kiem bo quyen, quyen leo thang.
 *
 * Phan doc DU LIEU LIEN KET (`checkAccessChange`, `describeScopes`) doc qua MOT cho —
 * `TransportAccountLinkDirectory`, cung nguon voi route quan tri `GET /transport/account-links/:id`
 * — nen man hinh "Nguoi nay lam duoc gi?" va man hinh noi tai khoan khong lech nhau duoc.
 */

/**
 * `id` cua mot pham vi = `id` cua NHOM KHONG CAP DUOC trong danh muc ma pham vi do mo ra
 * (`transport-permission-catalog.ts`): nen tang to trang thai `SCOPE_ACTIVE`/`SCOPE_INACTIVE` cho
 * dung nhom do bang mot phep so bang, khong phai biet ten mien nao.
 */
export const TRANSPORT_DRIVER_SCOPE_ID = 'lai-xe';
export const TRANSPORT_STAKEHOLDER_SCOPE_ID = 'chu-xe';

/**
 * Ten dang nhap mien van tai DUNG LAM DANH TINH HE THONG: `demo-seed` la nguoi ghi moi dong du lieu
 * mau (`DEMO_SEED_ACTOR`, `transport/demo/demo-seed.ts`) — mot tai khoan nguoi that trung ten se
 * lam nhat ky kiem toan cua ban demo khong con phan biet duoc may voi nguoi.
 *
 * Hang so O DAY chu khong import tu `demo-seed.ts`: tep do keo ca bo du lieu mau vao duong chay cua
 * `transport-core`. `transport-permission-domain.spec.ts` khoa hai gia tri bang nhau.
 */
export const TRANSPORT_RESERVED_USERNAMES: readonly string[] = ['demo-seed'];

/**
 * Moi ten mien giu lai: danh tinh he thong, va — CHI tren goi mau — ten nhan vat mau
 * (`demoReservedUsernames`, `#395`): may gieo noi tai khoan theo TEN, nen Giam doc khong duoc tao
 * mot tai khoan nguoi that trung ten mot lai xe mau. Doc qua `demo-logins.ts` (tep NHE: hinh dang
 * bo du lieu + cong goi mau), khong qua may gieo; goi khach that khong bao gio doc bo du lieu.
 */
export function transportReservedUsernames(): readonly string[] {
  return [...TRANSPORT_RESERVED_USERNAMES, ...demoReservedUsernames()];
}

/** Vai nen tang cua lai xe (`GD-22`). */
const DRIVER_ROLE = 'SALE';

/**
 * Doi vai co pha LIEN KET HO SO LAI XE khong.
 *
 * Mot tai khoan dang noi voi `TransportDriver` chi duoc giu vai Lai xe: pham vi "viec cua chinh lai
 * xe" (quy, luong, chuyen cua minh) dat tren lien ket do, va mot tai khoan van phong mang lien ket
 * nay se vua DUYET vua HUONG cung mot khoan. Muon doi vai: go noi ho so lai xe truoc.
 *
 * Ap ca khi `fromRole === toRole` (vd sua quyen rieng cua mot tai khoan Dieu hanh dang noi ho so
 * lai xe do du lieu cu): trang thai do da SAI, va mot lan sua quyen khong duoc hop thuc hoa no.
 */
export async function checkTransportAccessChange(
  links: TransportAccountLinkDirectory,
  input: AccessChangeInput,
): Promise<readonly AccessViolation[]> {
  if (input.toRole === DRIVER_ROLE) return [];
  const driver = await links.driverFor(input.userId);
  if (!driver) return [];
  return [
    {
      code: 'ACCOUNT_LINKED_TO_DRIVER',
      detail: { driverId: driver.id, fromRole: input.fromRole, toRole: input.toRole },
    },
  ];
}

/**
 * Pham vi lai xe PHAI noi dung dieu may chu dang cuong che: moi duong "viec cua chinh lai xe" (de
 * nghi thanh toan, chi phi chuyen, phieu dau, moc, tai lieu, bang luong, quy) chi hoi "tai khoan nay
 * co noi ho so lai xe khong", KHONG hoi ho so con hoat dong khong. Nen ho so ngung hoat dong ma con
 * noi van la pham vi HIEU LUC — va cau phai canh bao Giam doc dieu do, thay vi noi "khong lam duoc
 * gi" trong khi tai khoan van gui duoc de nghi tien. (Chan viec ghi cua lai xe da nghi la mot quyet
 * dinh san pham rieng — vd bang luong cuoi con xem duoc khong — chua lam o day.)
 */
function driverScope(driver: DriverAccountLinkView): AccessScopeNote {
  const who = `${driver.name} (${driver.phone})`;
  const vehicle = driver.vehicle ? `, đang phụ trách xe ${driver.vehicle.registrationPlate}` : '';
  return {
    id: TRANSPORT_DRIVER_SCOPE_ID,
    label: 'Hồ sơ lái xe',
    active: true,
    sentence:
      driver.status === 'ACTIVE'
        ? `Nối với hồ sơ lái xe ${who}${vehicle} — làm được việc của chính lái xe này.`
        : `Nối với hồ sơ lái xe ${who} — hồ sơ này đang ngừng hoạt động, nhưng tài khoản vẫn làm được việc của chính lái xe này (gửi đề nghị thanh toán, chi phí, xem lương, quỹ) cho tới khi gỡ nối hồ sơ hoặc khoá tài khoản.`,
    subject: { id: driver.id, name: driver.name },
  };
}

function stakeholderScope(stakeholder: StakeholderAccountLinkView): AccessScopeNote {
  const active = stakeholder.status === 'ACTIVE';
  return {
    id: TRANSPORT_STAKEHOLDER_SCOPE_ID,
    label: 'Hồ sơ bên góp vốn',
    active,
    sentence: active
      ? `Nối với hồ sơ bên góp vốn ${stakeholder.name} — xem được các xe mình có cổ phần.`
      : `Nối với hồ sơ bên góp vốn ${stakeholder.name} — hồ sơ đang ngừng hoạt động, chưa xem được xe nào.`,
    subject: { id: stakeholder.id, name: stakeholder.name },
  };
}

/**
 * Cac pham vi DEN TU LIEN KET cua mot tai khoan — CHI nhung lien ket dang ton tai.
 *
 * Khong noi "chua noi ho so lai xe" o day: mien khong biet vai cua tai khoan, va voi mot Ke toan cau
 * do la nhieu. Nen tang biet vai, nen tu no noi cau do cho tai khoan Lai xe khong co pham vi
 * `TRANSPORT_DRIVER_SCOPE_ID`.
 */
export async function describeTransportScopes(
  links: TransportAccountLinkDirectory,
  userId: string,
): Promise<readonly AccessScopeNote[]> {
  const { driver, stakeholder } = await links.forUser(userId);
  return [
    ...(driver ? [driverScope(driver)] : []),
    ...(stakeholder ? [stakeholderScope(stakeholder)] : []),
  ];
}

/**
 * `links` tuy chon: khong co danh ba (spec thuan, cong cu khong co DB) thi mien chi co phan thuan —
 * nen tang coi thieu `checkAccessChange`/`describeScopes` la "khong co lien ket nao".
 */
export function transportPermissionDomain(links?: TransportAccountLinkDirectory): PermissionDomain {
  return {
    id: 'transport',
    catalog: transportPermissionCatalog,
    effective: effectiveTransportActionList,
    validate: validateTransportGrants,
    escalated: escalatedActions,
    reservedUsernames: transportReservedUsernames,
    ...(links
      ? {
          checkAccessChange: (input: AccessChangeInput) => checkTransportAccessChange(links, input),
          describeScopes: (userId: string) => describeTransportScopes(links, userId),
        }
      : {}),
  };
}

/**
 * Dang ky mien `transport` vao so cua nen tang — trong HAM DUNG, nen xay ra luc Nest khoi tao
 * `TransportModule` (moi provider duoc khoi tao luc boot, ke ca khi khong ai tiem lop nay), khong
 * phu thuoc thu tu hook `onModuleInit`. Cung khuon `OperationalDocumentFileAuthorizer`.
 *
 * `links` tuy chon O TANG KIEU (spec dung lop theo vi tri), BAT BUOC o tang DI: trong `TransportModule`
 * danh ba luon co, va thieu no thi boot chet thay vi mien am tham mat kiem lien ket.
 */
@Injectable()
export class TransportPermissionDomainRegistrar {
  constructor(registry: PermissionDomainRegistry, links?: TransportAccountLinkDirectory) {
    registry.register(transportPermissionDomain(links));
  }
}
