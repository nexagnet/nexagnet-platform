import { Injectable } from '@nestjs/common';
import { UserRepository } from '../../auth/user.repository.js';
import {
  FileDomainAuthorizer,
  type FileDomainAuthorizationRequest,
  type FileDomainVerdict,
} from '../../files/file-authorization.port.js';
import { TransportCheckpointCoreFacts } from '../checkpoint/checkpoint-facts.port.js';
import { canPerformTransportAction } from '../permissions/transport-permission-rules.js';
import { OperationalDocumentRepository } from './document.repository.js';
import type { OperationalDocument } from './document.types.js';
import { PhysicalReceiptHandoverRepository } from './handover.repository.js';

/**
 * TEN MIEN so huu — mot hang so o MOT cho.
 *
 * Doi thanh mot chuoi khac se lam moi lien ket da ghi thanh mo coi: khong mien nao nhan tra loi cho
 * ten cu nua, va `FileAuthorizationService` se TU CHOI tat ca (fail closed). Do la hanh vi dung khi
 * mot ten bien mat, nhung no co nghia hang so nay khong doi duoc nua sau lan trien khai dau.
 */
export const TRANSPORT_OPERATIONAL_DOCUMENT_OWNER = 'TRANSPORT_OPERATIONAL_DOCUMENT';

/**
 * MIEN VAN TAI TRA LOI CHO CHINH NO — `#287` P2/P6.
 *
 * ============================================================================================
 * KHONG MOT MA QUYEN MOI NAO
 * ============================================================================================
 *
 * `#287` P6: *"Do not broaden current role/action tables ... New auth broadening is STOP/HUMAN
 * DECISION."*
 *
 * Nen lop nay KHONG dat mot hanh dong moi. No doc dung bang ma Lane O (`#279`) da chot:
 *
 *   · `transport.operational_document.read`     — ADMIN + ACCOUNTING (van phong doi soat);
 *   · `transport.operational_document.withdraw` — ADMIN. Nam trong `ACCOUNTING_DENIED`, va do la
 *     ca bai kiem cua `#287` P6: ke toan DOC duoc moi chung tu nhung khong sua duoc chinh nguon
 *     bang chung ho dang dung de quyet.
 *
 * Nguoi o hien truong khong di qua bang do: lai xe duoc xem to giay CUA CHINH HO, va phep so do la
 * `driverId` cua chung tu — dung cong ma `#279` O12 goi la *"Driver A cannot attach document to
 * Driver B's work"*.
 *
 * ============================================================================================
 * VAI DOC TU CSDL, KHONG TU YEU CAU
 * ============================================================================================
 *
 * `#287` P6: *"caller cannot forge creator/withdrawer/time/tenant scope"*. Nen vai duoc tra cuu tu
 * `UserRepository` theo ma nguoi dung ma PHIEN dua ra — khong mot truong nao cua than yeu cau tham
 * gia. Mot tai khoan da bi vo hieu hoa khong con vai nao.
 */
@Injectable()
export class OperationalDocumentFileAuthorizer extends FileDomainAuthorizer {
  readonly businessOwnerType = TRANSPORT_OPERATIONAL_DOCUMENT_OWNER;

  constructor(
    private readonly documents: OperationalDocumentRepository,
    private readonly handovers: PhysicalReceiptHandoverRepository,
    private readonly identity: TransportCheckpointCoreFacts,
    private readonly users: UserRepository,
  ) {
    super();
  }

  async authorize(request: FileDomainAuthorizationRequest): Promise<FileDomainVerdict> {
    const document = await this.documents.find(request.link.businessOwnerId);
    // Mot lien ket tro vao mot chung tu khong con la mot lien ket khong tra loi duoc — va cau tra
    // loi an toan cho mot cau hoi khong tra loi duoc la KHONG.
    if (!document) return { kind: 'DENIED' };

    switch (request.action) {
      case 'ATTACH':
        return this.mayAttach(document, request.authUserId);
      case 'READ':
        return this.mayRead(document, request.authUserId);
      case 'WITHDRAW':
        return this.mayWithdraw(document, request.authUserId);
    }
  }

  /**
   * GAN: chi NGUOI VUA GHI chung tu do.
   *
   * Hep den the vi day la duong duy nhat mot tep tro thanh bang chung cua mot chung tu, va no chay
   * ngay sau `create()` trong cung mot lan goi. Mot nguoi thu hai gan them tep vao mot chung tu da
   * ghi la mot viec KHONG CO trong nghiep vu — sua mot to ghi nham la BIA MO no roi ghi to moi
   * (`transport_operational_document_immutable`), khong phai dinh lai tep.
   */
  private async mayAttach(
    document: OperationalDocument,
    authUserId: string,
  ): Promise<FileDomainVerdict> {
    if (document.status !== 'ACTIVE') return { kind: 'DENIED' };
    return document.recordedBy === authUserId ? { kind: 'GRANTED' } : { kind: 'DENIED' };
  }

  /**
   * DOC: van phong doi soat, HOAC chinh lai xe cua to giay do.
   *
   * Chung tu DA BIA MO thi khong doc duoc qua duong nay — `#287` P3 bat bien 8
   * (*"withdrawn/quarantined File is not downloadable through normal business path"*). Lich su van
   * o lai trong bang; cai khong con la duong DOC BYTE binh thuong.
   */
  private async mayRead(
    document: OperationalDocument,
    authUserId: string,
  ): Promise<FileDomainVerdict> {
    if (document.status !== 'ACTIVE') return { kind: 'DENIED' };
    if (document.recordedBy === authUserId) return { kind: 'GRANTED' };

    if (document.driverId !== null) {
      const driver = await this.identity.findDriverByAuthUserId(authUserId);
      if (driver && driver.id === document.driverId) return { kind: 'GRANTED' };
    }

    return (await this.holds(authUserId, 'transport.operational_document.read'))
      ? { kind: 'GRANTED' }
      : { kind: 'DENIED' };
  }

  /**
   * RUT: `LOCKED` khi to giay DA VE VAN PHONG — `#287` P3 bat bien 6, muc 5 cua nghiem thu cuoi.
   *
   * `LOCKED` truoc ca phep kiem quyen, va thu tu do la mot quyet dinh: mot to bang chung da duoc
   * ban giao thi KHONG AI rut duoc nua, ke ca ADMIN. Tra `DENIED` cho ADMIN se lam ho di tim mot
   * quyen cao hon — mot quyen khong ton tai.
   *
   * Bien do la mot su that CUA MIEN NAY (`isDocumentHandedOver`) chu khong doc sang Lane K; chieu
   * phu thuoc chi di mot huong, dung nhu `#279` da dat.
   */
  private async mayWithdraw(
    document: OperationalDocument,
    authUserId: string,
  ): Promise<FileDomainVerdict> {
    if (await this.handovers.isDocumentHandedOver(document.id)) return { kind: 'LOCKED' };
    if (document.status !== 'ACTIVE') return { kind: 'DENIED' };

    return (await this.holds(authUserId, 'transport.operational_document.withdraw'))
      ? { kind: 'GRANTED' }
      : { kind: 'DENIED' };
  }

  /**
   * Vai + quyen rieng tu CSDL, qua CUNG cau tra loi voi `TransportActionGuard` (`#395`). Tai khoan
   * da vo hieu hoa khong con quyen nao.
   *
   * Duong tai byte tep (`GET /files/:id/content`) KHONG di qua guard van tai, nen day la cho duy
   * nhat mot `DENY transport.operational_document.read` tren mot ke toan co hieu luc voi tep — va mot
   * `ALLOW` cho mot tai khoan Dieu hanh cung chi co tac dung o day. Kho khong tra `permissionGrants`
   * (fixture cu) = khong co quyen rieng: tra loi dung nhu vai khoi diem.
   */
  private async holds(
    authUserId: string,
    action: 'transport.operational_document.read' | 'transport.operational_document.withdraw',
  ): Promise<boolean> {
    const user = await this.users.findById(authUserId);
    if (!user || user.disabledAt !== null) return false;
    return canPerformTransportAction(
      { role: user.role, permissionGrants: user.permissionGrants ?? [] },
      action,
    );
  }
}
