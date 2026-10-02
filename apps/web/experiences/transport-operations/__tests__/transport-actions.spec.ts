import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  actionsForRole,
  canPerform,
  DIRECTOR_ONLY_ACTIONS,
  hasDriverScope,
  hasOperationsScope,
  roleCanPerform,
  SELF_SCOPE_ACTIONS,
  TRANSPORT_ACTIONS,
} from '../transport-actions';

/**
 * Ban guong `GD-22` o web la mot ban SAO. Bo test nay ton tai vi mot ban sao khong duoc phep lech
 * trong im lang: neu API doi bang phan quyen ma web khong doi, phai co cai gi do do LEN, chu khong
 * phai mot man hinh khach lang le sai quyen.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const API_ACTIONS_FILE = resolve(HERE, '../../../../api/src/transport/transport-actions.ts');

/**
 * Rut cac chuoi literal trong mot mang co ten o tep nguon cua API.
 *
 * Hai cho de sai, va ca hai deu lam test XANH GIA nen phai xu ly tu te:
 *
 *   · khai bao co the kem chu thich kieu — `const X: readonly TransportAction[] = [`;
 *   · dau dong co the la `];` HOAC `] as const;`, nen tim `];` la se chay lan sang mang KE TIEP
 *     va van "khop" mot cach tinh co. Vi vay neo dau dong vao mot `]` DAU DONG.
 */
const literalsInArray = (source: string, name: string): readonly string[] => {
  const declaration = new RegExp(`\\b${name}\\b(?:\\s*:[^=\\n]*)?\\s*=\\s*\\[`);
  const found = declaration.exec(source);
  if (found === null) throw new Error(`Khong tim thay mang ${name} trong tep hanh dong cua API`);
  const start = found.index + found[0].length;
  const end = source.indexOf('\n]', start);
  if (end < 0) throw new Error(`Mang ${name} khong duoc dong bang mot ']' dau dong`);
  const body = source.slice(start, end);
  // `match[1]` co kieu `string | undefined` duoi `noUncheckedIndexedAccess`; bo qua nhom rong thay
  // vi ep kieu, de mot mau khong khop khong lang le tro thanh mot chuoi rong trong ket qua.
  return [...body.matchAll(/'([^']+)'/g)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
};

describe('cau bridge GD-22 — web guong dung bang cua API', () => {
  const source = readFileSync(API_ACTIONS_FILE, 'utf8');

  it('danh sach hanh dong khop tung ma va dung thu tu voi apps/api', () => {
    expect([...TRANSPORT_ACTIONS]).toEqual(literalsInArray(source, 'TRANSPORT_ACTIONS'));
  });

  it('pham vi CUA CHINH MINH khop voi API', () => {
    expect([...SELF_SCOPE_ACTIONS]).toEqual(literalsInArray(source, 'SELF_SCOPE_ACTIONS'));
  });

  it('bay hanh dong Ke toan khong co van dung bay hanh dong do', () => {
    const denied = literalsInArray(source, 'ACCOUNTING_DENIED');
    expect(denied).toEqual([
      'transport.trip.cancel',
      'transport.costing.period.reopen',
      'transport.fuel.reconciliation.reopen',
      // Issue #235 Lane B — Ke toan doc TOM TAT bam vi tri, khong doc duong di tung phut cua mot
      // con nguoi. Doi soat so sach khong CAN toa do, va mot quyen khong can den ma van duoc cap
      // la mot quyen se bi dung vao viec khac.
      'transport.location.history.read',
      // Issue #243 Lane F — Ke toan DOC duoc dong thoi gian nhung KHONG ghi duoc moc. F4 dat phu
      // cap cho tren chinh chuoi moc nay; nguoi DUYET khoan tien khong duoc sua can cu sinh ra no.
      'transport.checkpoint.record',
      // Issue #279 Lane O — Ke toan DOC duoc phien cho nhung KHONG dong duoc. Gio dong la moc tren
      // cua khoang thoi gian ma chinh ho sap duyet tien cho; cho nguoi duyet dong duoc phien la cho
      // ho tu chot lay con so ho sap duyet.
      'transport.waiting.close',
      // Issue #279 Lane O — Ke toan DOC duoc chung tu van hanh nhung KHONG go duoc mot to nao ra
      // khoi ho so ho dang doi soat. To giay do co the la can cu cua chinh lan `Da ket thuc` ma ho
      // sap bam.
      'transport.operational_document.withdraw',
      // Issue #395 — ghi BU chung tu van hanh. Truoc day chi song trong `@Roles` cua route (chi
      // Giam doc); nay bang vai la noi duy nhat noi dieu do: ghi bu la THEM can cu vao ho so ma
      // Ke toan sap duyet tien.
      'transport.operational_document.record',
      // Issue #235 Lane B — hai quyen SUA trong mien chung cu. Doi soat la doc mot ho so roi noi
      // no khop hay khong; rut mot chung cu, va doi ban kinh mot hang rao (duoc cham LUC DOC, nen
      // no doi phan quyet cua ca lich su), la sua chinh ho so dang duoc doi soat.
      'transport.proof.withdraw',
      // Issue #297 Lane T — Ke toan DOC duoc suc khoe vi tri nhung KHONG ghi duoc mot ban dinh vi
      // nao tu phan cung. Vi tri xe la can cu cua chinh khoan tien ho sap duyet, va no la nguon
      // DOI CHIEU CHEO cua chuoi tu dien thoai — mot nguon doi chieu ma nguoi doi soat ghi duoc thi
      // khong con doi chieu duoc gi.
      'transport.telematics.observation.ingest',
      'transport.geofence.manage',
    ]);
    for (const action of denied) {
      expect(roleCanPerform('ACCOUNTING', action as never)).toBe(false);
      expect(roleCanPerform('ADMIN', action as never)).toBe(true);
    }
  });

  /**
   * CHI GIAM DOC (`#395`). Ban guong quen tru danh sach nay thi man hinh hien nut cho Ke toan ma
   * may chu tra 403 — dung loi `DriverSettlementView` tung co voi dao quyet toan. Bai nay so CA
   * danh sach lan hau qua cua no tren bang vai.
   */
  it('bon hanh dong chi Giam doc khop tung ma, va Ke toan khong co ma nao', () => {
    const directorOnly = literalsInArray(source, 'DIRECTOR_ONLY_ACTIONS');
    expect([...DIRECTOR_ONLY_ACTIONS]).toEqual(directorOnly);
    expect(directorOnly).toEqual([
      'transport.costing.period.reopen',
      'transport.fuel.reconciliation.reopen',
      'transport.driver_settlement.reverse',
      'transport.account_link.manage',
    ]);
    for (const action of directorOnly) {
      expect(roleCanPerform('ACCOUNTING', action as never), action).toBe(false);
      expect(roleCanPerform('ADMIN', action as never), action).toBe(true);
    }
  });

  it('MANAGER van la fail-closed o ca hai phia', () => {
    expect(source).toContain('MANAGER: []');
    expect(actionsForRole('MANAGER')).toEqual([]);
  });
});

describe('phan quyen theo vai — hau qua that tren man hinh', () => {
  it('Lai xe (SALE) khong doc duoc chuyen cua nguoi khac', () => {
    expect(roleCanPerform('SALE', 'transport.trip.read')).toBe(false);
    expect(roleCanPerform('SALE', 'transport.driver.self.trip.read')).toBe(true);
  });

  it('ADMIN co moi thao tac van hanh nhung KHONG co pham vi lai xe', () => {
    expect(roleCanPerform('ADMIN', 'transport.trip.cancel')).toBe(true);
    // Ket qua that cua bang, va la ly do ba duong `/transport/me/*` tra 403 cho ADMIN.
    expect(roleCanPerform('ADMIN', 'transport.driver.self.trip.read')).toBe(false);
  });

  it('Ke toan lam duoc viec cuoi thang nhung khong mo lai duoc ky da bao cao', () => {
    expect(roleCanPerform('ACCOUNTING', 'transport.costing.period.manage')).toBe(true);
    expect(roleCanPerform('ACCOUNTING', 'transport.costing.period.reopen')).toBe(false);
  });

  it('MANAGER khong lam duoc gi, ke ca doc', () => {
    expect(roleCanPerform('MANAGER', 'transport.trip.read')).toBe(false);
    expect(hasOperationsScope('MANAGER')).toBe(false);
    expect(hasDriverScope('MANAGER')).toBe(false);
  });

  it('chua biet vai thi KHONG an bot gi — an bot la noi doi theo huong nguoc lai', () => {
    // Che do khong phien dang nhap: moi guard cua API tra `true` ngay. Man hinh ma an bot se ke
    // rang khach khong lam duoc viec ma may chu dang cho phep.
    expect(canPerform(null, 'transport.trip.cancel')).toBe(true);
    expect(hasOperationsScope(null)).toBe(true);
    expect(hasDriverScope(null)).toBe(true);
  });
});
