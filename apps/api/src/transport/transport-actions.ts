import type { UserRole } from '../auth/auth.types.js';

/**
 * HANH DONG cua mien van tai — T1 §11.1.
 *
 * Hanh dong dat theo MIEN, khong theo chuc danh: "duoc huy chuyen" la mot nang luc, "Giam doc" la
 * mot vai. Khach sau co them "Dieu hanh vien" thi them mot mau vai, khong sua base.
 *
 * KHOANG CACH VOI NEN TANG (`PG-02`, do tren main): auth as-built chi co mot enum vai PHANG
 * (`USER_ROLES`) va `RolesGuard` so `user.role` voi danh sach tren handler. Khong co khai niem
 * action, khong co vai `DRIVER`, khong co gioi han theo dong. T2 KHONG dung IAM moi — chi thi
 * workstream cam. Thay vao do:
 *
 *   · mien cong bo hang so co kieu (tep nay); vai KHOI DIEM tra qua `presetIncludes`, con quyen
 *     THAT cua mot tai khoan qua `canPerformTransportAction` (`#395`);
 *   · cau BRIDGE vai→hanh dong nam DUNG MOT CHO, o day, o tang bien gioi;
 *   · code nghiep vu KHONG duoc viet `if (role === ...)` o bat cu dau.
 *
 * Khi auth foundation co permission that, chi mot bang duoi day doi. Neu khong lam vay tu dau thi
 * chi phi dao nguoc cua `GD-22` nhay tu "trung binh" len "rat cao" — T1 §21 ghi ro dieu do.
 */
export const TRANSPORT_ACTIONS = [
  'transport.vehicle.read',
  'transport.vehicle.manage',
  'transport.driver.read',
  'transport.driver.manage',
  'transport.customer.read',
  'transport.customer.manage',
  'transport.partner.read',
  'transport.partner.manage',
  /**
   * DANH TINH PHAP NHAN (R1-A, #230) — doc va quan ly xuong song noi nhieu ban ghi chuyen mon
   * ve mot doanh nghiep.
   *
   * Hai ma chu khong mot: doc danh tinh la viec hang ngay cua bat ky ai xem cong no; NOI hai ban
   * ghi lai voi nhau doi mot bao cao gop theo phap nhan, nen no phai la mot quyen rieng.
   */
  'transport.counterparty.read',
  'transport.counterparty.manage',
  /**
   * MO HINH VAN CHUYEN v2 (R1-B, #232 `D-01` / #234 A1) -- nghia vu thuong mai va vong chay
   * vat ly la HAI TRUC DOC LAP, nen chung co HAI cap quyen rieng: mot nguoi duoc phep nhap don
   * khach dat khong nhat thiet duoc phep dieu xe, va nguoc lai.
   */
  'transport.order.read',
  'transport.order.manage',
  'transport.run.read',
  'transport.run.manage',
  /**
   * DE NGHI CHI CUA LAI XE + CONG DUYET (R1-C, #232 `D-06`).
   *
   * `.review` TACH khoi `.submit`, va do la ca diem cua tranche: nop mot de nghi la ghi mot y
   * kien, con duyet no la bien y kien do thanh TIEN. Gop hai ma lam mot se cho bat ky ai nop
   * duoc cung duyet duoc -- tuc go bo dung cai cong ma `D-06` doi phai co.
   */
  'transport.expense.claim.read',
  'transport.expense.claim.submit',
  'transport.expense.claim.review',
  'transport.trip.read',
  'transport.trip.create',
  'transport.trip.update',
  'transport.trip.assign',
  'transport.trip.transition',
  'transport.trip.cancel',
  /* --- `transport-costing` (`TX-03`) --- */
  'transport.costing.expense.read',
  'transport.costing.expense.record',
  'transport.costing.driver_fund.read',
  'transport.costing.driver_fund.advance',
  'transport.costing.driver_fund.return',
  'transport.costing.driver_fund.adjust',
  /**
   * DAO mot su kien da ghi — `INV-20`. Mot hanh dong RIENG, khong gop vao `.record`.
   *
   * Ghi mot khoan chi va dao mot khoan chi da ghi la hai quyen khac nhau ve muc do: cai thu nhat la
   * viec hang ngay, cai thu hai viet lai cai da bao cao. Gop chung se lam moi nguoi ghi duoc chi
   * phi cung dao duoc lich su, va bang phan quyen se khong con noi len dieu do.
   */
  'transport.costing.reversal.post',
  'transport.costing.period.read',
  'transport.costing.period.manage',
  /**
   * MO LAI mot ky da dong — `GD-11` doi mot quyen RIENG, khong phai quyen quan ly ky thong thuong.
   *
   * Do la ly do no khong nam trong `.period.manage`: dong ky la viec cuoi thang cua Ke toan, con mo
   * lai mot ky da bao cao ra ngoai la mot quyet dinh cua Giam doc.
   */
  'transport.costing.period.reopen',

  /* --- `transport-fuel` (`TX-04`) --- */
  'transport.fuel.entry.read',
  /**
   * Nop/sua HO mot phieu — duong cua Ke toan khi lai xe dua phieu giay.
   *
   * Tach khoi `transport.driver.self.fuel.submit` co chu dich: hai hanh dong nay khac nhau ve CHAT.
   * Cai kia la "nop phieu cua chinh toi" (danh tinh tu phien); cai nay la "nop phieu THAY MOT NGUOI
   * KHAC", va no phai la mot quyen ma khong lai xe nao co.
   */
  'transport.fuel.entry.submit_for_driver',
  'transport.fuel.entry.verify',
  /**
   * `#364` — PHAN BO GIA THANH mot phieu Run-first vao vong chay/chang, va DAO mot phan bo.
   *
   * Tach khoi `.entry.verify`: duyet la "chung tu nay dung", phan bo la "tien nay thuoc cong viec
   * nao" — hai quyet dinh, hai thoi diem, co the hai nguoi. Doc phan bo thi dung `.entry.read`
   * (cung du lieu phieu, chi khac cach hoi). Lai xe KHONG co ma nay.
   */
  'transport.fuel.cost_attribution.record',
  /**
   * DANH MUC CAY XANG (Lane C / C1) — doc va quan ly tram, bi danh, sieu du lieu hop dong.
   *
   * Hai ma, va chung KHONG gop vao `transport.fuel.entry.*`: phieu do dau la CHUNG TU (sinh moi
   * ngay, khoa lai sau doi soat), tram la MASTER DATA (sua bat cu luc nao). Mot nguoi duoc duyet
   * phieu khong hien nhien duoc sua danh muc tram — va nguoc lai, nguoi nhap danh muc khong can
   * mot quyen dong tien nao.
   *
   * `.read` cung phuc vu duong NHAN DANG (`GET stations/resolve`): do la mot phep doc tren cung
   * tap du lieu, chi khac cach hoi.
   */
  'transport.fuel.station.read',
  'transport.fuel.station.manage',
  /**
   * CHUNG TU NGUON NHIEN LIEU (Lane C / C2) — doc hop thu chung tu, va nhap mot chung tu moi.
   *
   * Tach `.ingest` khoi `.read` vi hai viec khac nhau ve chat: doc la viec hang ngay cua nguoi doi
   * soat; NHAP la mot lan dua du lieu tu ben ngoai vao he thong, va no de lai hang trong bang. Va
   * ca hai tach khoi `transport.fuel.statement.import`: bang ke la mot ky TONG HOP do nguoi doi
   * soat nhap tay, hoa don la tung lan ban do may cua hang phat — hai nguon, hai vong doi.
   */
  'transport.fuel.document.read',
  'transport.fuel.document.ingest',
  'transport.fuel.statement.import',
  'transport.fuel.reconciliation.read',
  'transport.fuel.reconciliation.match',
  'transport.fuel.reconciliation.resolve',
  'transport.fuel.reconciliation.close',
  /**
   * MO LAI mot ky doi soat da dong — `GD-11` doi mot quyen RIENG, giong het
   * `transport.costing.period.reopen` cua T3.
   *
   * Dong ky la viec cuoi thang cua Ke toan; mo lai mot ky DA BAO CAO RA NGOAI la quyet dinh cua
   * Giam doc. Gop hai quyen se lam bang phan quyen khong con noi len dieu do.
   */
  'transport.fuel.reconciliation.reopen',

  /* --- `transport-settlement` (`TX-05`) --- */
  /**
   * BAO CAO quyet toan — AR aging, cong no phai tra, vi the doi tac, bien truc tiep, cong don.
   *
   * MOT ma cho ca nam bao cao, khong nam ma: chung tra loi cung mot cau hoi nghiep vu ("cong ty
   * dang o dau ve tien"), va khong nguon nao noi rang mot nguoi duoc xem tuoi no ma khong duoc xem
   * cong no phai tra. Chia bang phan quyen theo tung endpoint la chia theo hinh dang cua code, chu
   * khong theo hinh dang cua cong viec.
   *
   * `TX-05` di vao HTTP o T7 va KHONG mang mot ma GHI nao. `SettlementService` co day du lenh ghi
   * (ghi nhan cong no, dieu chinh, dao, phan bo, dieu khoan, ky, quy tac hoa hong), nhung khong
   * lenh nao trong so do da tung duoc phoi ra hay duoc gan quyen — va #168 §2.B1 doi dung
   * *"expose only those commands that are already defined and permissioned"*, kem
   * *"Reporting never mutates"*. Cap quyen GHI tai chinh o day se la mot quyet dinh chinh sach ma
   * chua ai quyet.
   */
  'transport.settlement.report.read',
  /**
   * CHUOI CHUNG TU goc + cac ban dieu chinh/dao cua no — tach khoi `.report.read`.
   *
   * Mot bao cao noi "con no bao nhieu"; mot chuoi chung tu noi "ai da sua con so nay, luc nao, va
   * vi sao". Cai thu hai la LICH SU SUA DOI tai chinh, va do dung nghia la mot quyen khac.
   */
  'transport.settlement.document.read',

  /* --- DOI SOAT KHACH HANG + PHAI THU (`#292`, Lane Q) --- */
  /** Xem hang cho, lo doi soat, cong no chinh thuc va so du thanh toan cua khach. */
  'transport.customer_reconciliation.read',
  /** A/Ke toan xac nhan tung Order hoac cac dong trong mot batch thanh phai thu chinh thuc. */
  'transport.customer_reconciliation.confirm',
  /** Xem giao dich thanh toan, phan bo va tin dung chua phan bo. */
  'transport.customer_payment.read',
  /** Ghi nhan mot giao dich thanh toan bat bien cua khach. */
  'transport.customer_payment.record',
  /** Phan bo mot giao dich vao mot hoac nhieu chung tu phai thu. */
  'transport.customer_payment.allocate',
  /** Sua phan bo bang mot su kien RELEASE moi; khong UPDATE lich su. */
  'transport.customer_payment.correct',

  /* --- `R8` CHI SO VAN HANH (Issue #237) — den cung `transport-costing` --- */
  /**
   * BAO CAO CHI SO VAN HANH — km co hang/rong, bien truc tiep theo don va theo ca vong chay.
   *
   * KHONG CO MA GHI DI KEM, va se khong co: #237 chot vai cua tang nay la
   * *"AI only summarizes/ranks. AI does not rewrite facts."*
   *
   * Tach khoi `transport.settlement.report.read` vi hai bao cao tra loi hai cau hoi khac nhau cho
   * hai nguoi khac nhau: quyet toan noi "cong ty dang o dau ve TIEN" (Ke toan), chi so van hanh noi
   * "doi xe dang chay hieu qua den dau" (Dieu do/Giam doc). Gop lam mot se buoc phai cap quyen xem
   * cong no cho nguoi chi can xem ty le km rong.
   *
   * KHONG nam trong be mat lai xe: bao cao co `freightAmount`, va `INV-09` cam gia cuoc di vao
   * khung nhin lai xe.
   */
  'transport.analytics.read',

  /* --- THAP DIEU HANH (Lane G, #244) — den cung `transport-core` --- */
  /**
   * BANG DIEU HANH GOM CHUNG — bay cot vong chay, dem doi xe, hang viec dang cho nguoi xu ly.
   *
   * MOT quyen cho ca bang, khong phai mot quyen cho moi o. Cung ly le da dat cho
   * `transport.alerts.read`: bang la MOT be mat cua mot vai (Dieu do/Giam doc/Ke toan), khong phai
   * mot tap hop mang cac bao cao roi.
   *
   * Tach khoi `transport.alerts.read` du bang co doc bang canh bao: canh bao tra loi "cai gi sap
   * hong", bang dieu hanh tra loi "xe nao dang o dau va viec nao dang cho ai". Mot khach chi bat
   * `transport-core` co bang nhung khong co canh bao — hai quyen roi lam duoc dieu do, mot quyen
   * gop thi khong.
   *
   * KHONG nam trong be mat lai xe: bang phoi CA doi xe, va `INV-09` giu khung nhin lai xe o pham vi
   * cua chinh ho.
   */
  'transport.control_tower.read',

  /* --- `transport-asset-compliance` (`TX-06`) --- */
  'transport.maintenance.plan.read',
  'transport.maintenance.plan.manage',
  /**
   * MO mot lenh sua — tach khoi `.close` co chu dich.
   *
   * Mo mot lenh dua xe sang `UNDER_MAINTENANCE` o PHEP HOP THANH (T1 §18.2) va lam no hien ra la
   * dang sua tren bang doi xe. Dong lai thi nguoc lai. Hai quyen do khac nhau ve hau qua van hanh,
   * nen bang phan quyen phai noi duoc dieu do.
   *
   * ---------------------------------------------------------------------------
   * `TX-06b` (#237) SUA CAU CHU O DAY. Ban truoc viet *"dieu do vien khong dieu chuyen len no
   * nua"* — mot cong chan KHONG ton tai: `TripService.assign()` kiem dung ba thu (chuyen chua o
   * diem cuoi, xe ton tai, lai xe ton tai) va khong tra mot lenh sua nao.
   *
   * Cai co that la mot CANH BAO doc duoc (`evaluateDispatchReadiness()`), va danh sach `blocking`
   * cua no co y RONG cho toi khi `Q-05` — *"cai gi THAT SU cam dieu mot xe di"* — co nguon tu B.
   */
  'transport.maintenance.work_order.open',
  'transport.maintenance.work_order.close',
  'transport.compliance.document.read',
  'transport.compliance.document.manage',
  /** Trang thai HIEU LUC cua doi xe — phep hop thanh cua T1 §18.2, chi doc. */
  'transport.fleet_status.read',
  /** Bang canh bao van hanh gom chung (VT-015, VT-065). */
  'transport.alerts.read',

  /* --- `transport-workforce` (`TX-07`) --- */
  'transport.payroll.period.read',
  'transport.payroll.period.manage',
  /**
   * CHAY luong cho mot ky — tach khoi `.period.manage`.
   *
   * Mo mot ky la mot thao tac lich; chay luong SINH RA cac phieu mang so tien. Gop chung se lam
   * moi nguoi mo duoc ky cung tinh duoc tien cho ca doi xe.
   */
  'transport.payroll.run',
  'transport.payslip.approve',
  'transport.payslip.pay',
  /**
   * Sua mot phieu DA CHOT bang phieu bo sung / phieu dao (`INV-20`).
   *
   * Quyen RIENG, cung ly le voi `transport.costing.reversal.post` cua T3: ghi mot phieu luong la
   * viec cuoi thang, con sua mot phieu DA TRA la viet lai mot con so da bao ra ngoai.
   */
  'transport.payslip.correct',

  /* --- `TX-07b` quyet toan lai xe (Lane D, Issue #237) --- */
  /**
   * DOC bang quyet toan cua mot lai xe — da ghi nhan / da rut / con lai / hoan ung, kem phan bo.
   *
   * TACH khoi `transport.payroll.period.read`, va do la mot khac biet ve NOI DUNG chu khong ve man
   * hinh: bang nay noi tien da RA KHOI cong ty luc nao va bang duong nao. Mot nguoi duoc xem bang
   * luong khong nhat thiet duoc xem lich su chi tien mat.
   */
  'transport.driver_settlement.read',
  /**
   * GHI mot lan chi — tien roi khoi cong ty.
   *
   * Quyen RIENG, cung ly le voi `transport.payslip.pay`: chay luong sinh ra con so, con lenh nay
   * chuyen tien that. Gop chung se lam moi nguoi tinh duoc luong cung chi duoc tien.
   */
  'transport.driver_settlement.cashout',
  /**
   * DAO mot lan chi da ghi (`INV-20`) — quyen RIENG, cung khuon
   * `transport.costing.reversal.post` va `transport.payslip.correct`.
   *
   * Ghi mot lan chi la viec hang ngay cua Ke toan; dao mot lan chi DA BAO ra ngoai la viet lai mot
   * con so da di vao so quy va vao bang doi chieu cua lai xe.
   */
  'transport.driver_settlement.reverse',

  /** Pham vi CUA CHINH MINH — lai xe. Cuong che bang quyen so huu phan cong, xem `TripService`. */
  'transport.driver.self.trip.read',
  'transport.driver.self.trip.update',
  /** So quy CUA CHINH MINH. Danh tinh den tu phien, khong tu mot `:driverId` tren duong dan. */
  'transport.driver.self.fund.read',
  /** PHIEU DO DAU CUA CHINH MINH — nop va xem. Danh tinh den tu phien, khong tu than yeu cau. */
  'transport.driver.self.fuel.read',
  'transport.driver.self.fuel.submit',
  /**
   * KHOAN CHI THUONG CUA CHINH MINH — lai xe tu ghi mot khoan da tra bang tien tam ung.
   *
   * TACH HAN khoi `transport.costing.expense.record`, va do la ca diem. Ma kia la quyen VAN HANH:
   * no ghi duoc cho BAT KY chuyen nao, BAT KY lai xe nao, va chon duoc ca nguon tien
   * (`COMPANY_DIRECT` — tien cong ty tra thang). Ma nay chi lam duoc mot viec: ghi mot khoan lay
   * tu quy CUA CHINH NGUOI DANG DANG NHAP, tren mot chuyen ma chinh ho duoc phan cong.
   *
   * Cap `transport.costing.expense.record` cho lai xe de "tien cho nhanh" se cho ho ghi chi phi vao
   * chuyen cua dong nghiep va rut tien tu quy cua nguoi khac. Cong that van nam o `CostingService`
   * (`requireDriverAssignedToTrip`); ma nay chi bao dam be mat lai xe khong bao gio cham toi duong
   * van hanh.
   */
  'transport.driver.self.expense.record',
  /**
   * DE NGHI CHI CUA CHINH MINH. TACH HAN khoi `transport.expense.claim.review`: ma kia bien mot
   * de nghi thanh gia thanh that, va mot nguoi tu duyet de nghi cua chinh minh la dung cai ma
   * kiem soat noi bo sinh ra de chan.
   */
  'transport.driver.self.expense.claim.submit',
  /**
   * PHIEU LUONG CUA CHINH MINH — lai xe doc lich su luong da cong bo cua chinh ho (`#168 B8`).
   *
   * TACH HAN khoi `transport.payroll.period.read`, va do la ca diem. Ma kia la quyen VAN HANH: no
   * doc duoc ky luong, lan chay, va phieu cua BAT KY lai xe nao — tuc bang luong ca doi xe. Cap no
   * cho lai xe de "tien cho nhanh" se cho moi nguoi doc luong cua dong nghiep.
   *
   * Ma nay cung KHONG mo mot duong ghi nao. Duyet (`transport.payslip.approve`), chi tra
   * (`.pay`) va phat phieu bu (`.correct`) deu nam ben van hanh, va khong ma nao trong so do co
   * mot bien the "cua chinh minh": mot nguoi tu duyet phieu luong cua chinh minh la dung cai ma
   * kiem soat noi bo sinh ra de chan.
   *
   * Cong THAT nam o `WorkforceReadService` (`Driver.authUserId` + quy tac cong bo `DRAFT`); ma nay
   * chi bao dam be mat lai xe khong bao gio cham toi duong van hanh.
   */
  'transport.driver.self.payslip.read',
  /**
   * BANG QUYET TOAN CUA CHINH MINH — lai xe doc so da ghi nhan, da rut, con lai va hoan ung.
   *
   * TACH HAN khoi `transport.driver_settlement.read`, cung ly le voi cap
   * `transport.driver.self.payslip.read` / `transport.payroll.period.read`: ma kia doc duoc bang
   * quyet toan cua BAT KY lai xe nao. Va ma nay KHONG mo mot duong ghi nao — khong co bien the
   * "tu rut tien cho chinh minh", vi mot nguoi tu chi tien cho chinh minh la dung cai ma kiem soat
   * noi bo sinh ra de chan.
   *
   * Cong THAT nam o `DriverSettlementReadService.selfStatement()` (`Driver.authUserId`); ma nay chi
   * bao dam be mat lai xe khong bao gio cham toi duong van hanh.
   */
  'transport.driver.self.settlement.read',
  /**
   * BAM VI TRI CUA CHINH MINH — lai xe mo phien, gui ban dinh vi, dong phien (`transport-proof`).
   *
   * Ba ma rieng chu khong mot ma `tracking.write` gop chung, vi ba viec nay co ba hinh dang rui ro
   * khac nhau: MO phien la mot lan chon chuyen (cong so huu that nam o `TrackingService`), GUI la
   * mot dong bang chung nho lap lai hang nghin lan, DONG la mot moc ket thuc. Mot khach muon tat
   * bam vi tri nen tang nhung van cho ghi moc bat dau se can den su khac biet do.
   */
  'transport.driver.self.tracking.start',
  'transport.driver.self.tracking.report',
  'transport.driver.self.tracking.stop',
  /**
   * CHUNG CU VAN HANH CUA CHINH MINH — lai xe lap chung cu bat dau/giao hang.
   *
   * MOT ma cho ca hai loai, khong tach `start`/`delivery`: hai duong do khac nhau dung MOT dieu —
   * giao hang bat buoc co anh — va do la mot quy tac NGHIEP VU thuoc dich vu, khong phai mot ranh
   * gioi QUYEN. Tach thanh hai ma se goi y rang co the cap mot cai ma khong cap cai kia, trong khi
   * mot lai xe khong lap duoc chung cu bat dau thi cung khong chay duoc chuyen.
   */
  'transport.driver.self.proof.record',
  /**
   * MOC VAN HANH CUA CHINH MINH — lai xe ghi den noi / vao cong / boc hang / roi kho / giao xong.
   *
   * MOT ma cho ca chin loai moc, khong tach theo loai: chin duong do khac nhau o THU TU va o
   * CHINH SACH CHUNG CU, ca hai deu la quy tac NGHIEP VU thuoc dich vu, khong phai ranh gioi
   * QUYEN. Tach thanh chin ma se goi y rang cap duoc cai nay ma khong cap cai kia — trong khi mot
   * lai xe khong ghi duoc moc den noi thi cung khong hoan thanh duoc chuyen.
   *
   * Cong THAT nam o `CheckpointService.recordAsDriver` (`wasDriverEverAssignedToRun`); ma nay chi
   * bao dam be mat lai xe khong bao gio cham toi duong van hanh.
   */
  'transport.driver.self.checkpoint.record',
  /**
   * NHAN VIEC TAI DIA DIEM A CUA CHINH MINH — `#267` H2/H4. Lai xe hoi "toi dang o dau", roi xac
   * nhan de mo mot vong chay toi thieu.
   *
   * HAI ma chu khong mot, va do la ranh gioi ma ca `#267` xoay quanh: `.propose` la mot phep DOC
   * ma man hinh goi lai moi lan lai xe keo de lam moi — no khong ghi mot hang nao. `.confirm` TAO
   * ra mot vong chay. Gop chung lai se lam cau *"khong duoc lang le tao chuyen chi vi mot thiet bi
   * di vao hang rao"* thanh mot loi khuyen trong tai lieu thay vi mot ranh gioi quyen.
   *
   * Mot khach muon cho lai xe XEM de nghi nhung chua muon cho ho tu tao chuyen se can dung su
   * khac biet do — va do la mot cau hinh hop le, khong phai mot truong hop tuong tuong.
   *
   * Cong THAT nam o `SiteIntakeService` (`Driver.authUserId`, so huu ban dinh vi, chan vong chay
   * dang mo); hai ma nay chi bao dam be mat lai xe khong bao gio cham toi duong van hanh.
   */
  'transport.driver.self.site_intake.propose',
  'transport.driver.self.site_intake.confirm',
  /**
   * MO MOT PHIEN CHO NGUOI NHAN (`#279` O5) — nut `Bat dau cho` cua chinh lai xe do.
   *
   * MOT ma, va CHI mot: khong co ma `.close` o pham vi lai xe, vi lai xe khong dong mot phien cho
   * bang mot lenh rieng. Ho bam `Khach da nhan hang` — mot moc — va chinh moc do dong phien
   * (`DeliveryWaitingCloser`). Mo mot ma `.close` cho lai xe se tao duong ghi THU HAI cho cung mot
   * su that, va hai duong thi se co luc lech nhau: mot phien da dong ma khong co moc nhan hang.
   */
  'transport.driver.self.waiting.start',
  /**
   * GHI mot chung tu van hanh CUA CHINH MINH (`#279` O1) — nam loai, mot ma.
   *
   * MOT ma cho ca nam loai, cung ly le voi `transport.driver.self.checkpoint.record`: nam duong do
   * khac nhau o CAN CU va o NEO — ca hai deu la quy tac NGHIEP VU, khong phai ranh gioi QUYEN.
   *
   * KHONG co ma `.withdraw` o pham vi lai xe. `#279` O2: *"immutable boundary prevents driver
   * deletion once evidence is authoritative"*, va cach re nhat de giu no la khong co ma.
   */
  'transport.driver.self.document.record',
  /**
   * `Toi dang giu to bien nhan` (`#279` O7) — va KHONG gi hon.
   *
   * Ma nay chi mo duoc buoc `WITH_DRIVER`. Hai buoc con lai
   * (`RETURNED_TO_OFFICE`, `SUBMITTED_FOR_CONFIRMATION`) thuoc `transport.receipt_handover.record`,
   * mot ma VAN HANH: chi nguoi NHAN moi xac nhan duoc la ho da nhan.
   */
  'transport.driver.self.receipt_handover.record',
  /* --- `transport-checkpoint` (Lane F, Issue #243) --- */
  /**
   * DOC dong thoi gian van hanh cua mot chuyen — moc, giai doan tung chang, canh bao thieu chung
   * cu. KHONG co toa do, cung quy uoc voi `transport.tracking.read`.
   *
   * Ke toan CO ma nay: mot khoan phu cap cho phai doi chieu duoc voi luc xe den noi va luc nguoi
   * nhan nhan hang, va do dung la viec cua ke toan.
   */
  /**
   * DOC phien cho — `#279` O5/O11. Nguon cua cot `WAITING` tren bang dieu hanh (`#278`).
   *
   * TACH khoi `transport.checkpoint.read`, va do la mot khang dinh chu khong mot thoi quen: mot
   * moc tra loi *"da den noi luc may gio"*, mot phien cho tra loi *"da ket bao lau"*. Cai thu hai
   * la CAN CU CUA MOT KHOAN TIEN (`#279` O6), nen no phai dem duoc rieng trong bang phan quyen.
   */
  'transport.waiting.read',
  /**
   * DONG mot phien cho BO QUEN — duong don dep cua van hanh, khong phai duong cua lai xe.
   *
   * Nam trong `ACCOUNTING_DENIED`, cung ly le voi `transport.checkpoint.record`: `#279` O6 dat
   * khoan phu cap cho tren mot con so do chinh phien nay sinh ra. Neu nguoi DUYET khoan tien cung
   * dong duoc phien de chot con so do thi cong duyet khong con y nghia — no chi con kiem mot con so
   * ma chinh nguoi kiem viet ra.
   */
  'transport.waiting.close',
  /**
   * PHU CAP CHO CUA LAI XE (`#279` O6) — HAI ma, va tach chung la CA DIEM cua tranche.
   *
   * `.propose` la go mot con so vao mot o. `.decide` la bien con so do thanh TIEN TRONG LUONG cua
   * mot con nguoi. Gop hai ma lam mot se cho bat ky ai de nghi duoc cung duyet duoc — tuc go bo
   * dung cai cong ma `#279` O6 sinh ra (*"human approve/reject"*).
   *
   * Cung khuon `transport.expense.claim.submit` / `.review` cua `#232 D-06`, va o day co them mot
   * lop nua: cong THAT chong tu duyet nam o tang dich vu, tren `Driver.authUserId`
   * (`WaitingAllowanceService.isSelfDealing`). Bang vai khong noi duoc gi ve mot nguoi co CA HAI
   * ho so — mot tai khoan `ADMIN` duoc noi voi mot `TransportDriver`.
   *
   * CA HAI deu la ma VAN HANH, nen ca `ADMIN` lan `ACCOUNTING` co chung; vai `SALE` (vai as-built
   * cua lai xe) khong co ma nao.
   */
  'transport.waiting_allowance.propose',
  'transport.waiting_allowance.decide',
  /**
   * CHUNG TU VAN HANH (`#279` O1/O11) — BA ma, va tach chung la mot phan cua hop dong.
   *
   * `.read` la viec hang ngay cua nguoi doi soat. `.record` la ghi BU mot chung tu lai xe khong ghi
   * duoc (het pin, mat song ca ngay) — mot duong van hanh, khong kem ho so lai xe. `.withdraw` la
   * go mot to bang chung ra khoi ho so, va no nam trong `ACCOUNTING_DENIED`: `#279` O12 doi rang Ke
   * toan *"cannot mutate source evidence used for its own acceptance decision"*.
   */
  'transport.operational_document.read',
  'transport.operational_document.record',
  'transport.operational_document.withdraw',
  /**
   * BAN GIAO BIEN NHAN GIAY (`#279` O7) — hai buoc cua VAN PHONG.
   *
   * Ke toan CO ma nay: chinh ho la nguoi nhan to giay tren ban. Nhung ghi `RETURNED_TO_OFFICE`
   * KHONG ket thuc mot don — do van la mot lan bam RIENG tren truc nghiem thu cua Lane K, voi mot
   * ma quyen RIENG (`transport.commercial_acceptance.decide`).
   */
  'transport.receipt_handover.record',
  'transport.checkpoint.read',
  /**
   * GHI mot moc tu be mat VAN HANH — trong thuc te la `ASSIGNED`, va cac moc bu khi lai xe khong
   * ghi duoc (het pin, mat song ca ngay).
   *
   * TACH HAN khoi `transport.driver.self.checkpoint.record`, va do la ca diem. Ma nay ghi duoc cho
   * BAT KY vong chay nao va KHONG kem chung cu vi tri — nguoi ngoi van phong khong o hien truong.
   * Cap no cho lai xe se cho ho ghi moc "da den noi" ma khong can o do.
   */
  'transport.checkpoint.record',
  /** Van hanh doc TOM TAT bam vi tri — dem, quang duong, co rui ro. KHONG co toa do. */
  'transport.tracking.read',
  /** Van hanh doc TOM TAT chung cu — loai, so anh, cach chup, phan quyet hang rao. KHONG toa do. */
  'transport.proof.read',
  /**
   * BIA MO mot chung cu — TACH khoi `transport.proof.read`, va do la mot ranh gioi quyen that.
   *
   * Doc chung cu la viec doi soat hang ngay; rut mot chung cu la viec go bo bang chung cua mot lan
   * giao da xay ra. Nguoi lam viec thu nhat khong duong nhien duoc lam viec thu hai — va lai xe
   * KHONG BAO GIO duoc, ke ca voi chung cu cua chinh minh: mot nguoi xoa duoc bang chung cua chinh
   * minh thi cai con lai khong con la bang chung.
   */
  'transport.proof.withdraw',
  /**
   * DOC DUONG DI THO cua mot con nguoi — ma RIENG, va la ma hep nhat trong ca tep nay.
   *
   * Tach han khoi `transport.tracking.read`, va do la ca diem. Ma kia tra loi "co chung cu vi tri
   * khong" va "co bao nhieu co rui ro" — du cho ke toan doi soat. Ma NAY tra ve chuoi toa do tung
   * phut cua mot nguoi lam cong. Gop hai thu lam mot la mo mot nang luc giam sat ma khong ai yeu
   * cau, cho moi vai da co quyen doc so sach.
   *
   * Xem `ACCOUNTING_DENIED` ben duoi: ke toan CO `transport.tracking.read` va KHONG co ma nay.
   */
  'transport.location.history.read',
  /** Khai bao hang rao dia ly (kho, bai, cay xang) — viec cua van hanh. */
  'transport.geofence.read',
  'transport.geofence.manage',

  /* --- `TX-08` SO HUU TAI SAN (Lane E, Issue #242) --- */
  /**
   * SO DANG KY SO HUU + ho so ben huu quan — doc va quan ly.
   *
   * Hai ma chu khong mot, cung ly le voi cap `counterparty.read`/`.manage`: xem ai so huu mot chiec
   * xe la viec hang ngay cua nguoi lam doi xe; SUA mot ty le so huu la sua mot su that phap ly, va
   * lan sua do phai doc lai duoc tu so kiem toan.
   *
   * `.manage` cung la ma cho doi QUYEN DIEU HANH (`operationalControl`). No CO Y khong nam trong
   * `transport.vehicle.manage`: bien mot xe thanh xe nha ngoai la mot tuyen bo ve tai san, khong
   * phai mot lan sua ho so xe nhu doi tai trong hay so odo.
   */
  'transport.asset_ownership.read',
  'transport.asset_ownership.manage',
  /**
   * PHAM VI CUA CHINH MINH — ben huu quan. "Xe toi co co phan".
   *
   * CHI DOC, va khong co bien the ghi nao: mot dong so huu khong dieu duoc xe, khong sua duoc ty le
   * cua chinh minh, va khong ghi duoc mot dong nao vao du lieu van hanh.
   *
   * Xem `STAKEHOLDER_SCOPE_ACTIONS` ben duoi ve vi sao ma nay khong duoc cap qua VAI.
   */
  'transport.stakeholder.self.vehicle.read',
  /* --- `#395` NOI TAI KHOAN DANG NHAP voi ho so nghiep vu --- */
  /**
   * NOI / GO mot tai khoan dang nhap voi ho so LAI XE hoac ho so BEN HUU QUAN.
   *
   * Ma RIENG, tach khoi `transport.driver.manage` va `transport.asset_ownership.manage`: sua ho so
   * lai xe hay ty le so huu la sua DU LIEU; noi mot tai khoan vao ho so la CAP QUYEN cho mot con
   * nguoi. Lien ket do mo pham vi `transport.driver.self.*` (lai xe) hoac
   * `transport.stakeholder.self.vehicle.read` (ben huu quan) ma khong qua bang quyen nao.
   *
   * Truoc #395 dieu nay chi song trong `@Roles` cua route noi ben huu quan (chi `ADMIN`), trong khi
   * bang vai noi Ke toan co `.manage`. Nay no la mot ma trong `DIRECTOR_ONLY_ACTIONS`.
   */
  'transport.account_link.manage',
  /* --- `TX-08` mo rong: NAP DU LIEU ETC / PHI DUONG BO (Lane J, Issue #269) --- */
  /**
   * TAI KHOAN GIAO THONG + anh xa xe — doc va quan ly.
   *
   * Hai ma chu khong mot, va rieng o day co mot ly do PHAP LY: `.manage` la ma cho phep NOI mot
   * chiec xe vao mot tai khoan giao thong, ma ND 119/2024/ND-CP D.11 kh.3 chi cho moi xe nhan chi
   * tra tu DUNG MOT tai khoan. Noi sai xe la lam moi luot qua tram cua no dem sang nham tai khoan.
   */
  'transport.toll.account.read',
  'transport.toll.account.manage',
  /**
   * NAP mot nguon du lieu ETC — TACH khoi ca `.account.manage` lan `.review.resolve`.
   *
   * Nap la mang MOT BAN SAO cua su that nha cung cap vao he thong; doi soat la NOI cai ban sao do
   * khop hay khong khop. Gop hai ma lam mot se cho bat ky ai nap duoc cung quyet duoc — tuc go bo
   * dung cai cong ma #269 J7 doi phai co.
   */
  'transport.toll.import',
  /**
   * HOP THU DOI SOAT ETC — doc va quyet.
   *
   * `.review.resolve` KHONG phai mot ma noi ve tien. Nguoi giu no chon duoc chiec xe cho mot dong,
   * xac nhan mot dong da co nguoi nhin, hay noi hai dong giong nhau la hai su kien that. Khong
   * thao tac nao trong so do tao ra mot khoan phai tra — #269 J7 cam thang.
   */
  'transport.toll.review.read',
  'transport.toll.review.resolve',

  /* --- `TX-09` NGHIEM THU CHUNG TU / THUONG MAI (Lane I, Issue #268) --- */
  /**
   * DOC hang cho nghiem thu — vong chay da chay xong, dang cho chung tu duoc A xac nhan.
   *
   * TACH khoi `transport.checkpoint.read`, va do la mot khac biet ve CAU HOI chu khong ve man hinh:
   * dong thoi gian moc noi "xe da lam gi, luc nao"; hang cho nay noi "ho so nao dang cho nguoi co
   * tham quyen ky, va cai gi con thieu". Gop lam mot se buoc phai cap quyen xem hang cho tai chinh
   * cho moi nguoi chi can xem gio xe den noi.
   */
  'transport.commercial_acceptance.read',
  /**
   * QUYET DINH nghiem thu — duyet / khong chap nhan / doi bo sung chung tu.
   *
   * MA QUYEN QUAN TRONG NHAT CUA LANE NAY, va no khong gop vao bat cu ma nao dang co.
   *
   * `#268` chot ro ai duoc quyet: *"Final approval in Nexagnet may be performed by boss/ADMIN and
   * ACCOUNTING"* va *"Driver and unauthorized roles cannot approve"*. Vi `OPERATIONS_ACTIONS` duoc
   * SUY RA bang phep tru (moi ma khong thuoc pham vi tu than), mot ma moi khai o day tu dong duoc
   * cap cho `ADMIN` va `ACCOUNTING`, va tu dong KHONG duoc cap cho `SALE` (vai as-built cua lai xe)
   * lan `MANAGER`. Chinh sach den tu CAU TRUC, khong tu mot dong cau hinh phai nho.
   *
   * KHONG co bien the "cua chinh minh". Mot lai xe tu nghiem thu chuyen cua chinh minh la dung cai
   * ma kiem soat noi bo sinh ra de chan — cung ly le da ghi o `transport.expense.claim.review` va
   * `transport.payslip.approve`.
   *
   * VA no KHONG mo mot duong sua nao vao can cu: `transport.checkpoint.record`,
   * `transport.proof.withdraw` va `transport.geofence.manage` van nam trong `ACCOUNTING_DENIED`.
   * Do la bat bien tach nhiem vu ma `#268` I3 doi — nguoi DUYET khong duoc sua can cu sinh ra
   * quyet dinh cua chinh ho.
   */
  'transport.commercial_acceptance.decide',

  /* --- `TX-11` DIEU XE / DE NGHI XE CHO MOT DON (Lane M, Issue #277) --- */
  /**
   * DOC bang de nghi xe cho mot don — CHI DOC, khong sinh mot phan cong nao.
   *
   * MA MOI, va no CO Y khong gop vao `transport.run.read`: ma kia tra loi *"vong chay nao dang
   * chay"*; ma nay mo mot be mat NHIN CA DOI XE kem vi tri hien tai cua tung chiec. Gop lam mot se
   * bien moi nguoi xem duoc mot vong chay thanh nguoi xem duoc ca doi xe dang o dau.
   *
   * `OPERATIONS_ACTIONS` duoc suy ra bang phep tru, nen ma nay tu dong duoc cap cho `ADMIN` va
   * `ACCOUNTING`, va tu dong KHONG cap cho `SALE` (vai as-built cua lai xe) lan `MANAGER`. Do la
   * dung cau tra loi cua `#277 M13`: *"driver cannot query fleet-wide dispatch suggestions"*.
   *
   * KHONG co ma thu hai cho lan GHI. Boss bam xac nhan thi duong ghi di qua `transport.run.manage`
   * — chinh ma da chi phoi moi lan ghi vong chay/chang tren `main` hom nay. Che them mot ma rieng
   * se tao mot duong ghi vong chay THU HAI voi mot bang phan quyen khac, va `#277 M13` cam mo rong
   * quyen cho tien (*"do not broaden rights by convenience"*).
   *
   * TOA DO trong ket qua van chiu them mot cong nua: chung chi hien khi nguoi goi CO
   * `transport.location.history.read`. Xem `DispatchController.callerOf()`.
   */
  'transport.dispatch.suggest.read',

  /* --- `TX-12` NGUON VI TRI THU HAI / TELEMATICS (Lane T, Issue #297) --- */
  /**
   * NHAP mot ban dinh vi tu PHAN CUNG TREN XE qua mot dau noi trung lap nha cung cap.
   *
   * MA MOI, va no CO Y khong dung lai `transport.driver.self.tracking.report`. Ma kia thuoc PHAM VI
   * LAI XE: cap duong nhap nay qua no se cho phep chinh chiec dien thoai dang bi doi chieu viet ra
   * ban ghi cua nguon dung de doi chieu no — va luc do `SOURCE_FALLBACK` se bao "dien thoai im
   * nhung hop GSHT tren xe con bao" trong khi ca hai ban ghi den tu cung mot may.
   *
   * `OPERATIONS_ACTIONS` duoc suy ra bang phep tru, nen ma nay tu dong KHONG duoc cap cho `SALE`
   * (vai as-built cua lai xe) lan `MANAGER`. Do la cau tra loi dung, va no den tu CAU TRUC.
   *
   * Ke toan thi bi cat o `ACCOUNTING_DENIED` ben duoi — xem ly le tai do.
   *
   * KHONG co ma DOC di kem. Ban dinh vi tu phan cung doc qua dung nhung cong da co:
   * `transport.tracking.read` cho suc khoe vi tri, `transport.location.history.read` cho toa do
   * tho. Che them mot ma doc rieng se tao mot duong doc vi tri THU HAI voi mot bang phan quyen khac.
   */
  'transport.telematics.observation.ingest',
] as const;

export type TransportAction = (typeof TRANSPORT_ACTIONS)[number];

export const SELF_SCOPE_ACTIONS: readonly TransportAction[] = [
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
];

/**
 * PHAM VI BEN HUU QUAN — cap bang MOT HANG DU LIEU, khong bang mot vai.
 *
 * Day la khac biet quan trong nhat cua `TX-08` so voi be mat lai xe, va no khong phai mot lua chon
 * tuy tien. Be mat lai xe duoc cap qua vai `SALE` roi CHOT lai bang `Driver.authUserId` o tang dich
 * vu. Voi ben huu quan, tang vai KHONG CON CHO:
 *
 *   · `SALE` da la vai cua lai xe — cap them o day se cho moi lai xe goi duoc be mat co dong;
 *   · `MANAGER` la mot khoang trong phan quyen CHUA AI QUYET (xem khoi `ROLE_ACTIONS`) — gan nghia
 *     "co dong" cho no la dua mot chinh sach khong ai quyet vao base, roi moi khach van tai sau
 *     deu thua huong;
 *   · them mot vai thu nam vao `USER_ROLES` la sua MO HINH XAC THUC CUA NEN TANG cho mot nhu cau
 *     cua mot mien — dung thu ma #242 E3 cam ("do not build a second auth system").
 *
 * Nen cac ma nay khong nam trong bang vai NAO CA. Cong that la
 * `AssetOwnershipScopeService.resolve()`, doc `TransportAssetStakeholder.authUserId` tu chinh phien
 * dang nhap va fail-closed khi khong co hang nao. `TransportActionGuard` cho chung di qua tang vai
 * DUNG VI KHONG CO VAI NAO NOI DUOC GI VE CHUNG — va vi khong ma nao trong so do mo mot duong ghi.
 *
 * Neu mot ngay them mot ma `.write` vao day, quy uoc nay khong con du va phai co mot cong that o
 * tang guard. `transport-actions.spec.ts` khoa dieu do.
 */
export const STAKEHOLDER_SCOPE_ACTIONS: readonly TransportAction[] = [
  'transport.stakeholder.self.vehicle.read',
];

export const isStakeholderScopeAction = (action: TransportAction): boolean =>
  STAKEHOLDER_SCOPE_ACTIONS.includes(action);

/** Moi hanh dong van hanh — tuc tat ca TRU pham vi lai xe va pham vi ben huu quan. */
export const OPERATIONS_ACTIONS: readonly TransportAction[] = TRANSPORT_ACTIONS.filter(
  (action): action is TransportAction =>
    !SELF_SCOPE_ACTIONS.includes(action) && !STAKEHOLDER_SCOPE_ACTIONS.includes(action),
);

/**
 * CAU BRIDGE DEMO `GD-22` — mau vai nghiep vu → bon vai as-built cua nen tang.
 *
 * Giam doc → `ADMIN` · Ke toan → `ACCOUNTING` · Lai xe → `SALE` (CHO GIU TAM, khong phai mot quyet
 * dinh nghiep vu: nen tang chua co vai `DRIVER`).
 *
 * `MANAGER` co y KHONG duoc cap gi. Ba mau vai la tat ca nhung gi khach da noi (VT-080); che mot
 * anh xa thu tu cho `MANAGER` la dua mot chinh sach ma KHONG AI QUYET vao base, roi moi khach van
 * tai sau deu thua huong. Fail-closed o day la cau tra loi trung thuc: chua ai noi vai nay lam gi
 * trong nghiep vu van tai.
 *
 * `SALE` chi co pham vi CUA CHINH MINH. Va vi `SALE` la vai dong nhat cua nen tang hom nay, dieu
 * KHONG duoc phep xay ra la mot `SALE` bat ky doc duoc moi chuyen — nen no khong he co
 * `transport.trip.read`. Rieng viec cat hanh dong VAN CHUA DU: cong that nam o quyen so huu phan
 * cong (`TripService.driverTrip`), vi hai `SALE` khac nhau van cung mot vai.
 */
/**
 * Hai hanh dong Ke toan KHONG co, moi cai mot ly do khac nhau:
 *
 *   · `transport.trip.cancel`            — VT-082 "khong xoa du lieu" (`GD-02`: huy thay xoa);
 *   · `transport.costing.period.reopen`  — `GD-11`: mo lai mot ky DA BAO CAO can quyen rieng.
 *
 * Ke toan VAN duoc tao tam ung va dong ky: Issue #85 ghi ro "Director and Accountant can create
 * advances", va dong ky cuoi thang la viec cua chinh ho.
 *
 * T4 them MOT dong theo dung khuon do: `transport.fuel.reconciliation.reopen`. Ke toan DONG duoc
 * mot ky doi soat bang ke — do la viec cuoi thang cua ho — nhung MO LAI mot ky da phat ban giao
 * cong no ra ngoai la mot quyet dinh khac han ve muc do (`GD-11`).
 */
export const ACCOUNTING_DENIED: readonly TransportAction[] = [
  'transport.trip.cancel',
  'transport.costing.period.reopen',
  'transport.fuel.reconciliation.reopen',
  /**
   * Ke toan doc duoc TOM TAT bam vi tri (`transport.tracking.read`) — du de doi soat mot chuyen
   * co chung cu vi tri hay khong — nhung KHONG doc duoc duong di tung phut cua mot con nguoi.
   *
   * Day khong phai su nghi ngo ai ca. Doi soat so sach khong CAN toa do, va mot quyen khong can
   * den ma van duoc cap la mot quyen se bi dung vao viec khac. Khi mot ho so ky luat that su can
   * duong di, no di qua mot nguoi co `ADMIN` va de lai mot dong o `tracking.history_read`.
   */
  'transport.location.history.read',
  /**
   * GHI moc van hanh (`#243` F1) — Ke toan DOC duoc dong thoi gian, KHONG ghi duoc moc.
   *
   * Day la mot phan cong nhiem vu, khong phai su nghi ngo. F4 dat phu cap cho tren mot con so do
   * duoc tu chinh chuoi moc: gio den noi, gio nguoi nhan nhan hang. Neu nguoi DUYET khoan tien do
   * cung sua duoc can cu sinh ra no thi cong duyet cua F4 khong con y nghia gi — no chi con kiem
   * mot con so ma chinh nguoi kiem viet ra.
   *
   * Ke toan van GIU `transport.checkpoint.read`: doi soat mot khoan phu cap thi phai nhin duoc
   * dong thoi gian. Doc thi can, ghi thi khong.
   */
  'transport.checkpoint.record',
  /**
   * DONG mot phien cho (`#279` O5) — Ke toan DOC duoc phien cho, KHONG dong duoc.
   *
   * Cung mot phan cong nhiem vu voi dong ngay tren, va o day no chat hon nua: `#279` O6 doi
   * *"approving user cannot rewrite WaitingSession timestamps"*. Gio dong cua mot phien CHINH LA
   * moc tren cua khoang thoi gian ma khoan phu cap dua vao. Cap quyen nay cho Ke toan la cho nguoi
   * duyet tien tu chot lay con so ho sap duyet.
   */
  'transport.waiting.close',
  /**
   * BIA MO mot chung tu van hanh (`#279` O2/O12 bai 7) — Ke toan DOC duoc, KHONG go duoc.
   *
   * Cung ranh gioi voi `transport.proof.withdraw` ngay duoi: doi soat la doc mot ho so roi noi no
   * khop hay khong khop. Go mot to ra khoi chinh ho so minh dang doi soat la sua cau hoi thay vi
   * tra loi no — va o day to giay do co the la can cu cua chinh lan `Da ket thuc` ma ho sap bam.
   */
  'transport.operational_document.withdraw',
  /**
   * GHI BU mot chung tu van hanh (`#279` O1) — `#395` dua vao day tu `@Roles` cua route.
   *
   * Truoc #395 bang nay noi Ke toan CO ma nay, nhung route ghi bu chi mo cho `ADMIN`: chinh sach
   * song o hai noi va hai noi noi hai dieu khac nhau. Ghi bu mot to chung tu la THEM can cu vao
   * chinh ho so ma Ke toan sap duyet tien — cung phan cong nhiem vu voi `checkpoint.record` va
   * `operational_document.withdraw`. Nay bang vai la noi DUY NHAT noi dieu do.
   */
  'transport.operational_document.record',
  /**
   * Ke toan DOC duoc chung cu, va do la ca cong viec cua ho. RUT mot chung cu la viec khac.
   *
   * Doi soat la doc mot ho so roi noi no khop hay khong khop. Rut la go bo mot muc khoi chinh ho
   * so minh dang doi soat — tuc sua cau hoi thay vi tra loi no.
   */
  'transport.proof.withdraw',
  /**
   * NHAP vi tri tu phan cung tren xe (`#297` T4) — Ke toan DOC duoc suc khoe vi tri, KHONG ghi
   * duoc mot ban dinh vi nao.
   *
   * Cung mot phan cong nhiem vu voi `transport.checkpoint.record` ngay tren, va o day no chat hon:
   * vi tri xe la can cu de xac nhan mot chuyen da chay, va mot khoan phu cap/cuoc van chuyen dua
   * tren chuyen do. Cho nguoi DUYET tien viet ra chinh chuoi toa do chung minh chuyen ay la bo
   * cong duyet.
   *
   * Va no la nguon DOI CHIEU CHEO cua chuoi tu dien thoai (`telematics-crosscheck.ts`). Mot nguon
   * doi chieu ma nguoi doi soat ghi duoc thi khong con doi chieu duoc gi.
   */
  'transport.telematics.observation.ingest',
  /**
   * Hang rao duoc cham LUC DOC (`viewsForTrip`), nen them mot hang rao hom nay se doi phan quyet
   * `INSIDE`/`OUTSIDE` cua MOI chung cu cu.
   *
   * Do la hanh vi dung — sua ban kinh mot cai kho phai ap dung cho ca lich su — nhung no cung co
   * nghia rang quyen nay doi duoc ket luan ve nhung lan giao da xong. No thuoc ve van hanh, khong
   * thuoc ve nguoi dang doi soat chinh nhung lan giao do.
   */
  'transport.geofence.manage',
];

/**
 * CHI GIAM DOC — `#395`. Khong cap duoc cho vai nao khac, ke ca bang quyen rieng.
 *
 *   · `transport.costing.period.reopen`      — `GD-11`: mo lai mot ky DA BAO CAO ra ngoai;
 *   · `transport.fuel.reconciliation.reopen` — cung khuon `GD-11` cho ky doi soat bang ke;
 *   · `transport.driver_settlement.reverse`  — dao mot lan chi DA BAO. Truoc #395 chi song trong
 *     `@Roles` cua route, nen bang vai noi Ke toan lam duoc con may chu tra 403;
 *   · `transport.account_link.manage`        — noi tai khoan vao ho so la cap quyen cho mot con nguoi.
 *
 * Hai ma dau van nam trong `ACCOUNTING_DENIED`; danh sach nay noi them mot dieu ma danh sach kia
 * khong noi: KHONG cap lai duoc. `permissions/transport-permission-rules.ts` doc no; ban guong web
 * chep nguyen no va bai drift o web so tung ma.
 */
export const DIRECTOR_ONLY_ACTIONS: readonly TransportAction[] = [
  'transport.costing.period.reopen',
  'transport.fuel.reconciliation.reopen',
  'transport.driver_settlement.reverse',
  'transport.account_link.manage',
];

/**
 * VAI KHOI DIEM (`#395`). Bang nay KHONG con la cau tra loi cuoi cung cho mot tai khoan: quyen rieng
 * (ALLOW/DENY) cua tung nguoi chong len no trong `permissions/transport-permission-rules.ts`
 * (`canPerformTransportAction`). `presetIncludes` duoi day chi con la tra cuu VAI KHOI DIEM.
 */
const ROLE_ACTIONS: Readonly<Record<UserRole, readonly TransportAction[]>> = {
  ADMIN: OPERATIONS_ACTIONS,
  ACCOUNTING: OPERATIONS_ACTIONS.filter(
    (action) => !ACCOUNTING_DENIED.includes(action) && !DIRECTOR_ONLY_ACTIONS.includes(action),
  ),
  SALE: SELF_SCOPE_ACTIONS,
  MANAGER: [],
};

export const actionsForRole = (role: UserRole): readonly TransportAction[] => ROLE_ACTIONS[role];

/**
 * VAI KHOI DIEM co gom `action` khong — KHONG phai "tai khoan nay lam duoc khong". Ten cu
 * `roleCanPerform` bi doi CO CHU Y (`#395`): mot duong goi viet truoc #395 (vd `GET /transport/access`
 * cua nhanh mobile) se do bien dich thay vi lang le bo qua quyen rieng ALLOW/DENY. Hoi quyen that cua
 * mot nguoi dung: `canPerformTransportAction` / `effectiveTransportActionList`.
 */
export const presetIncludes = (role: UserRole, action: TransportAction): boolean =>
  ROLE_ACTIONS[role].includes(action);
