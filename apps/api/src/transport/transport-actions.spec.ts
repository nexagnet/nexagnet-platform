import { describe, expect, it } from 'vitest';
import { USER_ROLES } from '../auth/auth.types.js';
import {
  ACCOUNTING_DENIED,
  DIRECTOR_ONLY_ACTIONS,
  STAKEHOLDER_SCOPE_ACTIONS,
  TRANSPORT_ACTIONS,
  actionsForRole,
  isStakeholderScopeAction,
  presetIncludes,
  type TransportAction,
} from './transport-actions.js';

/**
 * Hanh dong cua mien van tai — T1 §11.1, cau bridge demo `GD-22`.
 *
 * Vi sao khai hang so NGAY o T2 du nen tang chua co mo hinh permission (`PG-02`): T1 ghi ro chi
 * phi dao nguoc cua `GD-22` la "trung binh — nhung CHI NEU action duoc khai tu dau. Neu khong,
 * rat cao". Rai `if (role === 'ADMIN')` khap ma mien co nghia la luc auth foundation co permission
 * that, phai di tim tung dong mot trong ca mien de doi.
 */
describe('Hanh dong mien van tai + cau bridge vai tro (GD-22)', () => {
  it('bo hanh dong phu du cac nhom nghiep vu cua T2, T3, T4, T5 va T6', () => {
    expect([...TRANSPORT_ACTIONS]).toEqual([
      'transport.vehicle.read',
      'transport.vehicle.manage',
      'transport.driver.read',
      'transport.driver.manage',
      'transport.customer.read',
      'transport.customer.manage',
      'transport.partner.read',
      'transport.partner.manage',
      'transport.counterparty.read',
      'transport.counterparty.manage',
      'transport.order.read',
      'transport.order.manage',
      'transport.run.read',
      'transport.run.manage',
      'transport.expense.claim.read',
      'transport.expense.claim.submit',
      'transport.expense.claim.review',
      'transport.trip.read',
      'transport.trip.create',
      'transport.trip.update',
      'transport.trip.assign',
      'transport.trip.transition',
      'transport.trip.cancel',
      'transport.costing.expense.read',
      'transport.costing.expense.record',
      'transport.costing.driver_fund.read',
      'transport.costing.driver_fund.advance',
      'transport.costing.driver_fund.return',
      'transport.costing.driver_fund.adjust',
      'transport.costing.reversal.post',
      'transport.costing.period.read',
      'transport.costing.period.manage',
      'transport.costing.period.reopen',
      'transport.fuel.entry.read',
      'transport.fuel.entry.submit_for_driver',
      'transport.fuel.entry.verify',
      'transport.fuel.cost_attribution.record',
      'transport.fuel.station.read',
      'transport.fuel.station.manage',
      'transport.fuel.document.read',
      'transport.fuel.document.ingest',
      'transport.fuel.statement.import',
      'transport.fuel.reconciliation.read',
      'transport.fuel.reconciliation.match',
      'transport.fuel.reconciliation.resolve',
      'transport.fuel.reconciliation.close',
      'transport.fuel.reconciliation.reopen',
      // `TX-05` di vao HTTP o `#168 B1` — CHI DOC. Khong ma ghi nao, xem `transport-actions.ts`.
      'transport.settlement.report.read',
      'transport.settlement.document.read',
      'transport.customer_reconciliation.read',
      'transport.customer_reconciliation.confirm',
      'transport.customer_payment.read',
      'transport.customer_payment.record',
      'transport.customer_payment.allocate',
      'transport.customer_payment.correct',
      'transport.analytics.read',
      'transport.control_tower.read',
      'transport.maintenance.plan.read',
      'transport.maintenance.plan.manage',
      'transport.maintenance.work_order.open',
      'transport.maintenance.work_order.close',
      'transport.compliance.document.read',
      'transport.compliance.document.manage',
      'transport.fleet_status.read',
      'transport.alerts.read',
      'transport.payroll.period.read',
      'transport.payroll.period.manage',
      'transport.payroll.run',
      'transport.payslip.approve',
      'transport.payslip.pay',
      'transport.payslip.correct',
      // `TX-07b` (Lane D, #237) — ba ma van hanh: doc bang quyet toan, chi tien, dao mot lan chi.
      'transport.driver_settlement.read',
      'transport.driver_settlement.cashout',
      'transport.driver_settlement.reverse',
      'transport.driver.self.trip.read',
      'transport.driver.self.trip.update',
      'transport.driver.self.fund.read',
      'transport.driver.self.fuel.read',
      'transport.driver.self.fuel.submit',
      // `#168 B3` — lai xe tu ghi mot khoan chi lay tu quy CUA CHINH MINH. Tach han khoi
      // `transport.costing.expense.record`, la ma van hanh ghi duoc cho bat ky ai.
      'transport.driver.self.expense.record',
      'transport.driver.self.expense.claim.submit',
      // `#168 B8` — lai xe doc lich su luong DA CONG BO cua chinh minh. Tach han khoi
      // `transport.payroll.period.read`, la ma van hanh doc duoc phieu cua bat ky lai xe nao.
      'transport.driver.self.payslip.read',
      // `TX-07b` — lai xe doc bang quyet toan CUA CHINH MINH. Khong co bien the ghi nao: mot nguoi
      // tu chi tien cho chinh minh la dung cai ma kiem soat noi bo sinh ra de chan.
      'transport.driver.self.settlement.read',
      // Issue #235 Lane B — bam vi tri cua chinh minh. Ba ma rieng chu khong mot ma gop, vi ba
      // viec co ba hinh dang rui ro khac nhau: MO phien la mot lan chon chuyen, GUI la mot dong
      // bang chung lap lai hang nghin lan, DONG la mot moc ket thuc.
      'transport.driver.self.tracking.start',
      'transport.driver.self.tracking.report',
      'transport.driver.self.tracking.stop',
      // MOT ma cho ca chung cu bat dau lan giao hang: hai duong khac nhau dung mot quy tac NGHIEP
      // VU (giao hang bat buoc co anh), khong phai mot ranh gioi QUYEN.
      'transport.driver.self.proof.record',
      // MOT ma cho ca chin loai moc van hanh: chin duong khac nhau o THU TU va CHINH SACH CHUNG
      // CU — ca hai deu la quy tac NGHIEP VU, khong phai ranh gioi QUYEN (`#243` F5).
      'transport.driver.self.checkpoint.record',
      // HAI ma cho nhan viec tai dia diem A (`#267` H2/H4), va do la ranh gioi ma ca `#267` xoay
      // quanh: `.propose` DOC ("toi dang o dau"), `.confirm` TAO ra mot vong chay. Gop chung se
      // lam cau "khong duoc lang le tao chuyen chi vi mot thiet bi di vao hang rao" thanh mot loi
      // khuyen trong tai lieu thay vi mot ranh gioi quyen.
      'transport.driver.self.site_intake.propose',
      'transport.driver.self.site_intake.confirm',
      // MOT ma cho phien cho (`#279` O5): MO. Khong co ma DONG o pham vi lai xe — mot phien dong
      // lai boi chinh moc `Khach da nhan hang`, khong boi mot lenh thu hai.
      'transport.driver.self.waiting.start',
      // HAI ma cua lai xe cho chung tu (`#279` O1/O7). Khong co ma BIA MO: `#279` O2 goi day la
      // *"immutable boundary prevents driver deletion once evidence is authoritative"*.
      'transport.driver.self.document.record',
      'transport.driver.self.receipt_handover.record',
      // PHIEN CHO NGUOI NHAN (`#279` O5). Ke toan CO ma DOC: mot khoan phu cap cho duoc duyet tren
      // chinh con so nay. Ma DONG thi khong — xem bai rieng ben duoi.
      'transport.waiting.read',
      'transport.waiting.close',
      // HAI ma cho phu cap cho (`#279` O6): de nghi ⟂ quyet dinh. Gop chung se cho bat ky ai de
      // nghi duoc cung duyet duoc.
      'transport.waiting_allowance.propose',
      'transport.waiting_allowance.decide',
      // BA ma cho chung tu van hanh (`#279` O1/O11): doc ⟂ ghi bu ⟂ bia mo. Ma bia mo nam trong
      // `ACCOUNTING_DENIED` — xem bai rieng ben duoi.
      'transport.operational_document.read',
      'transport.operational_document.record',
      'transport.operational_document.withdraw',
      // BAN GIAO BIEN NHAN (`#279` O7) — hai buoc cua VAN PHONG. Ke toan CO ma nay: chinh ho la
      // nguoi nhan to giay tren ban. Nhung ghi `da ve van phong` KHONG ket thuc mot don.
      'transport.receipt_handover.record',
      // DONG THOI GIAN cua mot chuyen. Ke toan CO ma nay: mot khoan phu cap cho phai doi chieu
      // duoc voi luc xe den noi. KHONG co toa do.
      'transport.checkpoint.read',
      // GHI moc tu be mat van hanh — ghi duoc cho MOI vong chay, va KHONG kem chung cu vi tri.
      'transport.checkpoint.record',
      // TOM TAT bam vi tri — dem, quang duong, co rui ro. KHONG co toa do.
      'transport.tracking.read',
      'transport.proof.read',
      // BIA MO mot chung cu — TACH khoi quyen doc. Doc la doi soat; rut la go bo bang chung cua
      // mot lan giao da xay ra, va lai xe khong bao gio duoc lam viec do voi chung cu cua minh.
      'transport.proof.withdraw',
      // DUONG DI THO cua mot con nguoi. Ma hep nhat trong ca tep; ke toan KHONG co no.
      'transport.location.history.read',
      'transport.geofence.read',
      'transport.geofence.manage',
      // `TX-08` SO HUU TAI SAN. Doc/quan ly so dang ky tach nhau, cung ly le voi cap
      // `counterparty.read`/`.manage`: xem ai so huu mot chiec xe la viec hang ngay; SUA mot ty le
      // la sua mot su that phap ly.
      'transport.asset_ownership.read',
      'transport.asset_ownership.manage',
      // Pham vi CUA CHINH MINH cua ben huu quan — CHI DOC, va KHONG cap qua vai nao.
      'transport.stakeholder.self.vehicle.read',
      // `#395` — NOI tai khoan dang nhap voi ho so lai xe / ben huu quan. Ma rieng, chi Giam doc:
      // noi mot tai khoan vao ho so la CAP QUYEN cho mot con nguoi, khong phai sua du lieu.
      'transport.account_link.manage',
      // `TX-08` mo rong (Lane J, #269) — NAP DU LIEU ETC. Bon ma, va su tach bach giua chung la co
      // that: NAP mot ban sao cua su that nha cung cap KHAC voi QUYET rang ban sao do khop hay
      // khong. Khong ma nao trong so nay noi ve tien da tra.
      'transport.toll.account.read',
      'transport.toll.account.manage',
      'transport.toll.import',
      'transport.toll.review.read',
      'transport.toll.review.resolve',
      'transport.commercial_acceptance.read',
      'transport.commercial_acceptance.decide',
      'transport.dispatch.suggest.read',
      // `TX-12` (#297 Lane T) — NHAP vi tri tu phan cung tren xe. Ma RIENG, khong dung lai ma pham
      // vi lai xe: neu dung lai, chinh chiec dien thoai dang bi doi chieu se ghi duoc ban ghi cua
      // nguon dung de doi chieu no.
      'transport.telematics.observation.ingest',
    ]);
  });

  it('khong co ma nao trung nhau', () => {
    expect(new Set(TRANSPORT_ACTIONS).size).toBe(TRANSPORT_ACTIONS.length);
  });

  describe('ADMIN — vai Giam doc (VT-081, VT-084)', () => {
    it('lam duoc moi viec van hanh, KE CA huy chuyen', () => {
      for (const action of TRANSPORT_ACTIONS) {
        if (action.startsWith('transport.driver.self.')) continue;
        if (isStakeholderScopeAction(action)) continue;
        expect(presetIncludes('ADMIN', action), action).toBe(true);
      }
      expect(presetIncludes('ADMIN', 'transport.trip.cancel')).toBe(true);
    });

    /**
     * ADMIN GIU NGUYEN nang luc quan tri doi xe sau `TX-08` — #242 E6.
     *
     * Them mot lop so huu khong duoc lam mat quyen cua nguoi dang van hanh. Hai ma quan tri so
     * dang ky phai thuoc ve ADMIN, va toan bo be mat doi xe cu phai con nguyen.
     */
    it('quan ly duoc so dang ky so huu, va van giu nguyen quyen doi xe cu', () => {
      expect(presetIncludes('ADMIN', 'transport.asset_ownership.read')).toBe(true);
      expect(presetIncludes('ADMIN', 'transport.asset_ownership.manage')).toBe(true);
      expect(presetIncludes('ADMIN', 'transport.vehicle.manage')).toBe(true);
      expect(presetIncludes('ADMIN', 'transport.driver.manage')).toBe(true);
    });
  });

  /**
   * PHAM VI BEN HUU QUAN KHONG DUOC CAP QUA VAI — bat bien trung tam cua `TX-08`/#242 E3.
   *
   * Neu mot ngay co nguoi them ma nay vao `ROLE_ACTIONS`, bai duoi day do. Do la dieu can xay ra:
   * cap qua vai nghia la MOI nguoi mang vai do doc duoc be mat co dong, trong khi cong that phai la
   * mot hang `TransportAssetStakeholder.authUserId` cua RIENG mot con nguoi.
   */
  describe('TX-08 — pham vi ben huu quan (#242 E3)', () => {
    it.each(USER_ROLES)('vai %s KHONG duoc cap pham vi ben huu quan qua bang vai', (role) => {
      for (const action of STAKEHOLDER_SCOPE_ACTIONS) {
        expect(presetIncludes(role, action), `${role} / ${action}`).toBe(false);
      }
    });

    /**
     * `TransportActionGuard` cho nhom nay di qua tang vai, nen quy uoc CHI dung chung nao khong ma
     * nao trong nhom mo mot duong ghi. Bai nay khoa dieu do: mot ma `.manage`/`.record`/`.submit`
     * lot vao day se lam do test, chu khong lang le mo mot duong ghi cho moi nguoi da dang nhap.
     */
    it('moi ma trong nhom deu la ma CHI DOC', () => {
      for (const action of STAKEHOLDER_SCOPE_ACTIONS) {
        expect(action.endsWith('.read'), action).toBe(true);
      }
    });

    it('nhom nay khong chong lan pham vi lai xe', () => {
      for (const action of STAKEHOLDER_SCOPE_ACTIONS) {
        expect(action.startsWith('transport.driver.self.')).toBe(false);
      }
    });
  });

  describe('ACCOUNTING — vai Ke toan (VT-082)', () => {
    it('nhap va sua duoc du lieu van hanh', () => {
      expect(presetIncludes('ACCOUNTING', 'transport.trip.create')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.trip.assign')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.trip.transition')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.vehicle.manage')).toBe(true);
    });

    /**
     * `#168 B1`/`B3` — hai ma moi cua T7B roi dung ben cua bang phan hoach.
     *
     * Ke toan la nguoi doc cong no hang ngay, nen ho PHAI co ca hai ma bao cao. Nguoc lai, ma tu
     * phuc vu cua lai xe khong duoc chay nguoc len be mat van hanh: no lay danh tinh tu phien, va
     * mot nguoi van hanh dung no se ghi duoc khoan chi duoi ten ho so lai xe cua chinh ho.
     */
    it('#168: doc duoc bao cao quyet toan, va khong mang pham vi tu phuc vu cua lai xe', () => {
      expect(presetIncludes('ACCOUNTING', 'transport.settlement.report.read')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.settlement.document.read')).toBe(true);
      expect(presetIncludes('ADMIN', 'transport.settlement.report.read')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.driver.self.expense.record')).toBe(false);
      expect(presetIncludes('ADMIN', 'transport.driver.self.expense.record')).toBe(false);
    });

    it('#292: co quyen doi soat khach va ghi/phan bo thanh toan, khong mo cho lai xe', () => {
      const laneQActions = [
        'transport.customer_reconciliation.read',
        'transport.customer_reconciliation.confirm',
        'transport.customer_payment.read',
        'transport.customer_payment.record',
        'transport.customer_payment.allocate',
        'transport.customer_payment.correct',
      ] as const;

      for (const action of laneQActions) {
        expect(presetIncludes('ACCOUNTING', action), action).toBe(true);
        expect(presetIncludes('ADMIN', action), action).toBe(true);
        expect(presetIncludes('SALE', action), action).toBe(false);
        expect(presetIncludes('MANAGER', action), action).toBe(false);
      }
    });

    it('KHONG huy duoc chuyen — nguon noi ro "khong xoa du lieu"', () => {
      expect(presetIncludes('ACCOUNTING', 'transport.trip.cancel')).toBe(false);
    });

    /**
     * Issue #235 Lane B — ranh gioi DOC ⟂ SUA trong mien chung cu.
     *
     * Ke toan doc chung cu va doc hang rao: do la doi soat, va la ca cong viec cua ho. Hai duong
     * SUA thi khong, va vi hai ly do khac nhau:
     *
     *   · rut mot chung cu la go bo mot muc khoi chinh ho so dang duoc doi soat;
     *   · hang rao duoc cham LUC DOC, nen sua ban kinh mot cai kho hom nay se doi phan quyet
     *     `INSIDE`/`OUTSIDE` cua MOI lan giao da xong truoc do.
     *
     * Ca hai deu la "sua cau hoi thay vi tra loi no".
     */
    it('doc duoc chung cu va hang rao, nhung KHONG rut chung cu va KHONG doi hang rao', () => {
      expect(presetIncludes('ACCOUNTING', 'transport.proof.read')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.geofence.read')).toBe(true);

      expect(presetIncludes('ACCOUNTING', 'transport.proof.withdraw')).toBe(false);
      expect(presetIncludes('ACCOUNTING', 'transport.geofence.manage')).toBe(false);
      expect(presetIncludes('ADMIN', 'transport.proof.withdraw')).toBe(true);
      expect(presetIncludes('ADMIN', 'transport.geofence.manage')).toBe(true);
    });

    /**
     * `#279` O5/O6 — ranh gioi DOC ⟂ DONG trong mien phien cho.
     *
     * Ke toan doc duoc moi phien cho: ho phai doc de doi soat mot khoan phu cap. Dong mot phien
     * thi khong, va ly do chat hon ca hai truong hop tren: gio dong CHINH LA moc tren cua khoang
     * thoi gian ma ho sap duyet tien. Cho nguoi duyet tu chot con so ho sap duyet la go bo dung cai
     * cong ma `#279` O6 sinh ra.
     *
     * Lai xe cung khong co ma dong — nhung vi mot ly do KHAC: ho dong mot phien bang cach bam
     * `Khach da nhan hang`, tuc ghi mot moc. Mot ma `.close` rieng cho lai xe se la duong ghi THU
     * HAI cho cung mot su that.
     */
    it('#279: Ke toan doc duoc phien cho nhung KHONG dong duoc', () => {
      expect(presetIncludes('ACCOUNTING', 'transport.waiting.read')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.waiting.close')).toBe(false);
      expect(presetIncludes('ADMIN', 'transport.waiting.close')).toBe(true);
      expect(presetIncludes('SALE', 'transport.waiting.close')).toBe(false);
      expect(presetIncludes('SALE', 'transport.waiting.read')).toBe(false);
      expect(presetIncludes('SALE', 'transport.driver.self.waiting.start')).toBe(true);
    });

    /**
     * `#279` O12 — ranh gioi DOC ⟂ BIA MO trong mien chung tu van hanh.
     *
     * Ke toan doc duoc moi chung tu: do la ca cong viec cua ho. Go mot to ra khoi chinh ho so ho
     * dang doi soat thi khong — va o day to giay do co the la can cu cua chinh lan `Da ket thuc`
     * ma ho sap bam. `#279` O12: *"[Accounting] cannot mutate source evidence used for its own
     * acceptance decision"*.
     *
     * Lai xe cung khong co ma bia mo, nhung vi mot ly do KHAC: `#279` O2 goi day la
     * *"immutable boundary prevents driver deletion once evidence is authoritative"*.
     */
    it('#279: Ke toan doc duoc chung tu nhung KHONG bia mo duoc', () => {
      expect(presetIncludes('ACCOUNTING', 'transport.operational_document.read')).toBe(true);
      // `#395`: ghi BU chung tu nay nam trong `ACCOUNTING_DENIED`. Truoc do bang vai noi `true`
      // nhung route chi mo cho `ADMIN` (`@Roles`) — nay bang vai la noi DUY NHAT noi dieu do, va
      // `transport-behaviour-preservation.spec.ts` chung minh hanh vi that khong doi.
      expect(presetIncludes('ACCOUNTING', 'transport.operational_document.record')).toBe(false);
      expect(presetIncludes('ADMIN', 'transport.operational_document.record')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.operational_document.withdraw')).toBe(false);
      expect(presetIncludes('ADMIN', 'transport.operational_document.withdraw')).toBe(true);
      expect(presetIncludes('SALE', 'transport.operational_document.withdraw')).toBe(false);
      expect(presetIncludes('SALE', 'transport.driver.self.document.record')).toBe(true);
    });

    /**
     * `#279` O7 — Ke toan ghi duoc `da nhan to giay`, va do KHONG phai `Da ket thuc`.
     *
     * Hai ma khac nhau, tren hai be mat khac nhau, cho hai su that khac nhau. Bai nay khoa lai
     * dieu do: co ma nay KHONG hien nhien la co ma kia (Ke toan co ca hai, nhung `SALE` chi co
     * duong tu phuc vu, va hai ma van la hai).
     */
    it('#279: ghi `da ve van phong` va bam `Da ket thuc` la HAI ma khac nhau', () => {
      expect(presetIncludes('ACCOUNTING', 'transport.receipt_handover.record')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.commercial_acceptance.decide')).toBe(true);
      expect(presetIncludes('SALE', 'transport.receipt_handover.record')).toBe(false);
      expect(presetIncludes('SALE', 'transport.commercial_acceptance.decide')).toBe(false);
      expect(presetIncludes('SALE', 'transport.driver.self.receipt_handover.record')).toBe(true);
    });

    /** Lai xe khong rut duoc chung cu cua CHINH MINH — xoa duoc bang chung thi no het la bang chung. */
    it('lai xe (SALE) khong co duong rut chung cu nao', () => {
      expect(presetIncludes('SALE', 'transport.proof.withdraw')).toBe(false);
      expect(presetIncludes('SALE', 'transport.proof.read')).toBe(false);
    });

    /**
     * T3: Ke toan CO quyen ung tien va dong ky — Issue #85 ghi ro "Director and Accountant can
     * create advances", va dong ky cuoi thang la viec cua chinh ho.
     *
     * Nhung MO LAI mot ky da dong thi khong: `GD-11` doi mot quyen RIENG cho viec do, vi ky da dong
     * la ky da bao cao ra ngoai. Hai dong duoi day la cho DUY NHAT trong ma the hien su khac biet
     * giua "dong so" va "viet lai so da chot".
     */
    it('ung tien va dong ky duoc, nhung KHONG mo lai ky da dong (GD-11)', () => {
      expect(presetIncludes('ACCOUNTING', 'transport.costing.driver_fund.advance')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.costing.expense.record')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.costing.reversal.post')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.costing.period.manage')).toBe(true);

      expect(presetIncludes('ACCOUNTING', 'transport.costing.period.reopen')).toBe(false);
      expect(presetIncludes('ADMIN', 'transport.costing.period.reopen')).toBe(true);
    });

    /**
     * T4 lap lai DUNG khuon do cho ky doi soat bang ke — va do la diem cua bai test nay.
     *
     * Ke toan nhap bang ke, chay so khop, quyet chenh lech va DONG ky: bon viec cuoi thang cua ho.
     * Nhung mot ky da dong da PHAT BAN GIAO CONG NO ra ngoai (`FuelSettlementHandoff`), nen mo lai
     * no la mot quyet dinh khac han ve muc do — `GD-11` doi mot quyen rieng, giong het T3.
     */
    it('doi soat bang ke: dong duoc ky, nhung KHONG mo lai ky da dong (GD-11)', () => {
      expect(presetIncludes('ACCOUNTING', 'transport.fuel.statement.import')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.fuel.reconciliation.match')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.fuel.reconciliation.resolve')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.fuel.reconciliation.close')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.fuel.entry.verify')).toBe(true);

      expect(presetIncludes('ACCOUNTING', 'transport.fuel.reconciliation.reopen')).toBe(false);
      expect(presetIncludes('ADMIN', 'transport.fuel.reconciliation.reopen')).toBe(true);
    });

    /** `#364` — phan bo gia thanh phieu Run-first la viec cua ke toan (va Giam doc). */
    it('phan bo gia thanh nhien lieu Run-first: ke toan va Giam doc', () => {
      expect(presetIncludes('ACCOUNTING', 'transport.fuel.cost_attribution.record')).toBe(true);
      expect(presetIncludes('ADMIN', 'transport.fuel.cost_attribution.record')).toBe(true);
    });

    it('la tap con cua Giam doc, khong phai mot nhanh loai tru', () => {
      for (const action of actionsForRole('ACCOUNTING')) {
        expect(presetIncludes('ADMIN', action), action).toBe(true);
      }
    });
  });

  /**
   * CHI GIAM DOC (`#395`) — bon ma KHONG cap duoc cho vai nao khac.
   *
   * Hai ma dau da nam trong `ACCOUNTING_DENIED` tu truoc; hai ma sau truoc day chi song trong
   * `@Roles(ADMIN)` cua route, nen bang vai noi Ke toan lam duoc con may chu tra 403 — va man hinh
   * (doc bang vai) hien nut cho Ke toan. Bai nay khoa ca danh sach lan hau qua cua no.
   */
  describe('DIRECTOR_ONLY — chi Giam doc (#395)', () => {
    it('dung bon ma, dung thu tu', () => {
      expect([...DIRECTOR_ONLY_ACTIONS]).toEqual([
        'transport.costing.period.reopen',
        'transport.fuel.reconciliation.reopen',
        'transport.driver_settlement.reverse',
        'transport.account_link.manage',
      ]);
    });

    it.each(DIRECTOR_ONLY_ACTIONS)(
      '%s: Giam doc CO, Ke toan / Quan ly / Lai xe KHONG',
      (action) => {
        expect(presetIncludes('ADMIN', action)).toBe(true);
        expect(presetIncludes('ACCOUNTING', action)).toBe(false);
        expect(presetIncludes('MANAGER', action)).toBe(false);
        expect(presetIncludes('SALE', action)).toBe(false);
      },
    );

    it('Ke toan = moi viec van hanh TRU hai danh sach cam', () => {
      const expected = TRANSPORT_ACTIONS.filter(
        (action) =>
          !action.startsWith('transport.driver.self.') &&
          !isStakeholderScopeAction(action) &&
          !ACCOUNTING_DENIED.includes(action) &&
          !DIRECTOR_ONLY_ACTIONS.includes(action),
      );
      expect([...actionsForRole('ACCOUNTING')]).toEqual(expected);
    });

    it('noi tai khoan tach khoi quan ly so huu: Ke toan van quan ly so dang ky', () => {
      expect(presetIncludes('ACCOUNTING', 'transport.asset_ownership.manage')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.account_link.manage')).toBe(false);
      expect(presetIncludes('ACCOUNTING', 'transport.driver_settlement.cashout')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.driver_settlement.reverse')).toBe(false);
    });
  });

  describe('SALE — CHO GIU TAM cho vai Lai xe (GD-22)', () => {
    it('CHI co hanh dong tren pham vi cua chinh minh', () => {
      expect([...actionsForRole('SALE')]).toEqual([
        'transport.driver.self.trip.read',
        'transport.driver.self.trip.update',
        'transport.driver.self.fund.read',
        'transport.driver.self.fuel.read',
        'transport.driver.self.fuel.submit',
        'transport.driver.self.expense.record',
        'transport.driver.self.expense.claim.submit',
        'transport.driver.self.payslip.read',
        'transport.driver.self.settlement.read',
        'transport.driver.self.tracking.start',
        'transport.driver.self.tracking.report',
        'transport.driver.self.tracking.stop',
        'transport.driver.self.proof.record',
        'transport.driver.self.checkpoint.record',
        'transport.driver.self.site_intake.propose',
        'transport.driver.self.site_intake.confirm',
        'transport.driver.self.waiting.start',
        'transport.driver.self.document.record',
        'transport.driver.self.receipt_handover.record',
      ]);
    });

    /**
     * `TX-07b` — pham vi tu phuc vu KHONG keo theo mot quyen chi tien nao.
     *
     * Cung phep thu voi `#168 B3` o ngay duoi, va o day no dat hon: ba ma van hanh cua quyet toan
     * doc duoc bang cua MOI lai xe va CHUYEN DUOC TIEN THAT. Mot lai xe cham vao chung nghia la ho
     * doc duoc luong dong nghiep va tu tra tien cho chinh minh.
     */
    it('KHONG cham duoc mot ma quyet toan van hanh nao', () => {
      expect(presetIncludes('SALE', 'transport.driver_settlement.read')).toBe(false);
      expect(presetIncludes('SALE', 'transport.driver_settlement.cashout')).toBe(false);
      expect(presetIncludes('SALE', 'transport.driver_settlement.reverse')).toBe(false);
    });

    /**
     * `#168 B3` — pham vi tu phuc vu KHONG duoc keo theo quyen van hanh tuong ung.
     *
     * Day la phep thu quan trong nhat cua B3: ma moi phai la mot QUYEN HEP, khong phai mot loi tat
     * toi `transport.costing.expense.record` — ma van hanh ghi duoc cho bat ky chuyen nao va bat ky
     * lai xe nao, ke ca bang tien cua nguoi khac.
     */
    it('#168 B3: ghi duoc khoan chi cua CHINH MINH, nhung khong cham duong van hanh', () => {
      expect(presetIncludes('SALE', 'transport.driver.self.expense.record')).toBe(true);
      expect(presetIncludes('SALE', 'transport.costing.expense.record')).toBe(false);
      expect(presetIncludes('SALE', 'transport.costing.expense.read')).toBe(false);
      expect(presetIncludes('SALE', 'transport.costing.reversal.post')).toBe(false);
    });
    /**
     * `#168 B8` — pham vi tu phuc vu KHONG duoc keo theo quyen van hanh tuong ung.
     *
     * Ma van hanh `transport.payroll.period.read` doc duoc ky luong, lan chay VA phieu cua bat ky
     * lai xe nao — tuc ca bang luong doi xe. Cap no cho lai xe de mo mot man hinh se lam moi nguoi
     * doc duoc luong cua dong nghiep.
     *
     * Bon ma con lai la duong GHI tai chinh: khong ma nao co bien the "cua chinh minh", vi mot
     * nguoi tu duyet hay tu chi tra phieu cua chinh minh la dung cai ma kiem soat noi bo chan.
     */
    it('#168 B8: doc duoc phieu luong CUA CHINH MINH, nhung khong cham duong van hanh', () => {
      expect(presetIncludes('SALE', 'transport.driver.self.payslip.read')).toBe(true);
      expect(presetIncludes('SALE', 'transport.payroll.period.read')).toBe(false);
      expect(presetIncludes('SALE', 'transport.payroll.period.manage')).toBe(false);
      expect(presetIncludes('SALE', 'transport.payroll.run')).toBe(false);
      expect(presetIncludes('SALE', 'transport.payslip.approve')).toBe(false);
      expect(presetIncludes('SALE', 'transport.payslip.pay')).toBe(false);
      expect(presetIncludes('SALE', 'transport.payslip.correct')).toBe(false);
    });

    /**
     * `MANAGER` van FAIL-CLOSED sau khi B8 them mot ma moi.
     *
     * Kiem o day chu khong chi trong khoi `MANAGER` ben duoi: moi lan mot ma tu phuc vu ra doi la
     * mot co hoi de ai do "tien tay" cap cho vai chua ai quyet dinh nghiep vu (VT-080).
     */
    it('#168 B8: MANAGER khong doc duoc phieu luong cua ai, ke ca cua chinh minh', () => {
      expect(presetIncludes('MANAGER', 'transport.driver.self.payslip.read')).toBe(false);
      expect(presetIncludes('MANAGER', 'transport.payroll.period.read')).toBe(false);
    });

    it('#168 B1: lai xe KHONG doc duoc mot bao cao quyet toan nao', () => {
      expect(presetIncludes('SALE', 'transport.settlement.report.read')).toBe(false);
      expect(presetIncludes('SALE', 'transport.settlement.document.read')).toBe(false);
    });

    /**
     * `R8` mang `freightAmount` ra mot be mat bao cao, va `INV-09` cam gia cuoc di vao khung nhin
     * lai xe. Vai lai xe hom nay la `SALE` (cau bridge `GD-22`), nen phep do phai o dung day.
     */
    it('`R8`: van hanh doc duoc chi so, lai xe thi khong', () => {
      expect(presetIncludes('ADMIN', 'transport.analytics.read')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.analytics.read')).toBe(true);
      expect(presetIncludes('SALE', 'transport.analytics.read')).toBe(false);
      expect(presetIncludes('MANAGER', 'transport.analytics.read')).toBe(false);
    });

    /**
     * THAP DIEU HANH phoi CA doi xe — moi vong chay, moi xe, moi viec dang cho.
     *
     * `INV-09` giu khung nhin lai xe o pham vi cua chinh ho, nen vai lai xe (`SALE`, theo cau
     * bridge `GD-22`) khong duoc cap quyen nay. Do KHONG phai mot han che ve giao dien: cong that
     * nam o `TransportActionGuard`, va bai nay khoa dung cai bang ma guard doc.
     */
    it('bang dieu hanh: van hanh doc duoc ca doi xe, lai xe thi khong', () => {
      expect(presetIncludes('ADMIN', 'transport.control_tower.read')).toBe(true);
      expect(presetIncludes('ACCOUNTING', 'transport.control_tower.read')).toBe(true);
      expect(presetIncludes('SALE', 'transport.control_tower.read')).toBe(false);
      expect(presetIncludes('MANAGER', 'transport.control_tower.read')).toBe(false);
    });

    it('KHONG doc duoc danh sach chuyen chung — day la cho ro ri de nhat', () => {
      expect(presetIncludes('SALE', 'transport.trip.read')).toBe(false);
      expect(presetIncludes('SALE', 'transport.trip.create')).toBe(false);
      expect(presetIncludes('SALE', 'transport.vehicle.read')).toBe(false);
    });

    /**
     * T3 mo them mot be mat cho lai xe — va do la cho ro ri de nhat TIEP THEO.
     *
     * Lai xe DOC duoc so quy cua chinh minh, nhung khong doc duoc so quy nguoi khac (cong that nam o
     * `Driver.authUserId`, khong o vai), va khong GHI duoc mot dong nao: ai chi bao nhieu la mot su
     * that ke toan, khong phai mot lua chon cua nguoi tieu tien.
     */
    it('doc duoc so quy cua chinh minh, nhung khong ghi va khong doc so quy chung', () => {
      expect(presetIncludes('SALE', 'transport.driver.self.fund.read')).toBe(true);
      expect(presetIncludes('SALE', 'transport.costing.driver_fund.read')).toBe(false);
      expect(presetIncludes('SALE', 'transport.costing.driver_fund.advance')).toBe(false);
      expect(presetIncludes('SALE', 'transport.costing.expense.record')).toBe(false);
      expect(presetIncludes('SALE', 'transport.costing.expense.read')).toBe(false);
    });

    /**
     * T4 mo be mat thu ba cho lai xe: NOP PHIEU DO DAU. Day la lan dau mot lai xe duoc GHI mot thu
     * co gia tri tien te — nen ranh gioi phai chat hon hai lan truoc.
     *
     * Ho nop duoc phieu CUA CHINH MINH, nhung khong duyet duoc phieu nao (ke ca cua chinh ho: mot
     * nguoi tu duyet chung tu cua minh la mot cong khong ton tai), khong doc duoc danh sach phieu
     * chung, va khong cham duoc mot buoc nao cua doi soat bang ke.
     */
    it('nop duoc phieu dau cua chinh minh, nhung khong duyet va khong doi soat', () => {
      expect(presetIncludes('SALE', 'transport.driver.self.fuel.submit')).toBe(true);
      expect(presetIncludes('SALE', 'transport.driver.self.fuel.read')).toBe(true);

      expect(presetIncludes('SALE', 'transport.fuel.entry.verify')).toBe(false);
      expect(presetIncludes('SALE', 'transport.fuel.entry.read')).toBe(false);
      expect(presetIncludes('SALE', 'transport.fuel.entry.submit_for_driver')).toBe(false);
      expect(presetIncludes('SALE', 'transport.fuel.statement.import')).toBe(false);
      expect(presetIncludes('SALE', 'transport.fuel.reconciliation.read')).toBe(false);
      expect(presetIncludes('SALE', 'transport.fuel.reconciliation.close')).toBe(false);
      // `#364` — lai xe khong bao gio quyet (hay thay) phan bo gia thanh.
      expect(presetIncludes('SALE', 'transport.fuel.cost_attribution.record')).toBe(false);
    });
  });

  describe('MANAGER — khong nam trong cau bridge, nen DONG', () => {
    it('khong co hanh dong van tai nao', () => {
      expect([...actionsForRole('MANAGER')]).toEqual([]);
      for (const action of TRANSPORT_ACTIONS) {
        expect(presetIncludes('MANAGER', action), action).toBe(false);
      }
    });
  });

  it('moi vai co that cua nen tang deu duoc tra loi tuong minh, khong nem', () => {
    for (const role of USER_ROLES) {
      expect(Array.isArray(actionsForRole(role)), role).toBe(true);
    }
  });

  it('khong vai nao duoc cap mot hanh dong ngoai bo hanh dong', () => {
    const known = new Set<TransportAction>(TRANSPORT_ACTIONS);
    for (const role of USER_ROLES) {
      for (const action of actionsForRole(role)) expect(known.has(action), action).toBe(true);
    }
  });
});
