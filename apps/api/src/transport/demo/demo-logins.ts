import { DemoDatasetError, loadDemoMonthDataset } from './demo-dataset.js';
import { isTransportDemoTenant } from './demo-guard.js';

/**
 * TEN DANG NHAP CUA NHAN VAT MAU — tep NHE (chi hinh dang bo du lieu + cong goi mau), de mien phan
 * quyen doc duoc ma khong keo may gieo (`demo-seed.ts`) vao duong chay.
 */

/**
 * NHAN VAT VAN PHONG cua ban demo — khong phai lai xe, nen khong co ho so `TransportDriver`.
 *
 * VI SAO VAI NAM TRONG MA NGUON CHU KHONG TRONG GOI KHACH:
 * mot goi khach khai duoc vai o tang xac thuc thi mot goi khach cung PHONG duoc quyen cua chinh
 * no — `role: 'ADMIN'` trong mot tep JSON la mot duong leo thang dac quyen. Nen goi khach quyet
 * dinh DU LIEU, con ma nguon quyet dinh QUYEN.
 *
 * VI SAO CAN MOT KE TOAN THAT: `ACCOUNTING` khong phai `ADMIN` bi cat bot cho vui — no bi tu choi
 * DUNG BA hanh dong (`transport-actions.ts`): huy chuyen (`GD-02`: huy thay xoa), mo lai ky chi phi
 * va mo lai ky doi soat bang ke (ca hai deu `GD-11`). Khong co mot tai khoan `ACCOUNTING` that thi
 * ba duong tu choi do khong bao gio duoc DO tren ban dang chay — chi duoc do trong bo nho.
 */
export const DEMO_STAFF_PERSONAS = [
  { login: 'ke-toan', name: 'Kế toán mẫu', role: 'ACCOUNTING' },
  { login: 'giam-doc', name: 'Giám đốc mẫu', role: 'ADMIN' },
] as const;

/** Ten dang nhap lai xe cua bo du lieu mau — tap ten ma lan gieo tao ra. */
export function demoDriverLogins(): readonly string[] {
  return loadDemoMonthDataset().drivers.map((driver) => driver.login);
}

/**
 * Ten Giam doc KHONG duoc tao tren man quan tri cua GOI MAU (`#395`): moi ten nhan vat mau.
 *
 * Lan khoi dong ke tiep, buoc tao bu (`backfillDemoPersonaLogins`) noi tai khoan TRUNG TEN voi lai xe
 * mau — mot tai khoan Giam doc tao cho nguoi that ten `lx.binh` se lang le mang pham vi "viec cua
 * chinh lai xe" cua lai xe mau Binh — va lenh xoa-gieo-lai xoa tai khoan THEO TEN. Giu ten lai la
 * chan ca hai tu goc. Goi khach that: rong.
 *
 * Bo du lieu hong / vang: van giu ten nhan vat van phong — tao tai khoan khong duoc chet vi mot tep
 * du lieu mau.
 */
export function demoReservedUsernames(): readonly string[] {
  if (!isTransportDemoTenant()) return [];
  const staff = DEMO_STAFF_PERSONAS.map((persona) => persona.login);
  try {
    return [...demoDriverLogins(), ...staff];
  } catch (error) {
    if (error instanceof DemoDatasetError) return staff;
    throw error;
  }
}
