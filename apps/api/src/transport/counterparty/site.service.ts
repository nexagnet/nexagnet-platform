import { Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TransportDomainError } from '../transport.errors.js';
import { CounterpartySitePlaceGuardHub } from './counterparty-site-place-guard.js';
import { CounterpartyRepository } from './counterparty.repository.js';
import { CounterpartySiteRepository, type UpdateCounterpartySiteInput } from './site.repository.js';
import type { CounterpartySite, CounterpartySiteView } from './site.types.js';

export interface CreateCounterpartySiteCommand {
  readonly name: string;
  readonly address?: string | null;
  readonly note?: string | null;
  readonly status?: 'ACTIVE' | 'INACTIVE';
}

/**
 * DIA DIEM VAN HANH — `#267` H1.
 *
 * ============================================================================================
 * DANH TINH DO MAY CHU DAT, LUON LUON
 * ============================================================================================
 *
 * Khong mot lenh nao o day nhan `id` cua dia diem tu nguoi goi luc TAO. `#267` H1 doi
 * *"server-managed identity; no caller-provided arbitrary tenant identity"*, va cach chac chan
 * nhat de tuan thu la khong co cho de truyen vao: `cuid` do DB sinh.
 *
 * ============================================================================================
 * KHONG CO DUONG XOA, VA KHONG CO DUONG TAO TU OCR
 * ============================================================================================
 *
 * Nghi mot dia diem la `status = INACTIVE` (`GD-02`, huy thay xoa) — mot kho da tung nhan hang
 * phai con doc lai duoc tu lich su chuyen.
 *
 * Va khong ham nao o day nhan mot chuoi trich xuat: `#267` H1 viet *"no automatic counterparty
 * creation from OCR text"*. Mot ten cong ty doc tu anh chup phieu la mot GOI Y; bien no thanh mot
 * hang master data la viec cua nguoi, qua chinh duong HTTP nay.
 */
@Injectable()
export class CounterpartySiteService {
  constructor(
    private readonly sites: CounterpartySiteRepository,
    private readonly counterparties: CounterpartyRepository,
    @Optional() private readonly audit?: AuditLogService,
    /*
     * `#395` — cong chan sua TEN/TRANG THAI mot dia diem dang la DIA DIEM VAN HANH (co hang rao).
     * Cuoi va tuy chon: spec dung dich vu theo vi tri; vang mat = khong chan, dung nhu truoc #395.
     */
    @Optional() private readonly placeGuard?: CounterpartySitePlaceGuardHub,
  ) {}

  async list(counterpartyId: string): Promise<readonly CounterpartySite[]> {
    await this.requireCounterparty(counterpartyId);
    return this.sites.listForCounterparty(counterpartyId);
  }

  async get(id: string): Promise<CounterpartySiteView> {
    const site = await this.requireSite(id);
    const counterparty = await this.requireCounterparty(site.counterpartyId);
    return { site, counterpartyId: counterparty.id, counterpartyName: counterparty.name };
  }

  /**
   * KHUNG NHIN cua MOT dia diem CON HIEU LUC — `null` khi khong co that, da nghi, hoac phap nhan
   * chu khong doc duoc.
   *
   * MOT gia tri `null` cho ca ba, va do la co y: `#267` H7 doi *"Unknown versus foreign IDs do not
   * create useful enumeration"*. Ba cau tra loi rieng se cho mot nguoi go bua mot `siteId` biet
   * cai nao CO TON TAI.
   */
  async activeView(id: string): Promise<CounterpartySiteView | null> {
    const site = await this.sites.find(id);
    if (!site || site.status !== 'ACTIVE') return null;
    const counterparty = await this.counterparties.find(site.counterpartyId);
    if (!counterparty) return null;
    return { site, counterpartyId: counterparty.id, counterpartyName: counterparty.name };
  }

  /**
   * KHUNG NHIN theo LO — DUNG HAI truy van: mot cho danh sach dia diem, mot cho moi phap nhan cua
   * chung (`findMany`), bat ke bao nhieu dia diem.
   *
   * Truoc #379 buoc thu hai la mot vong doc tung phap nhan NOI TIEP; chap nhan duoc khi nguoi goi
   * duy nhat (`site-intake`) da cat danh sach xuong vai ung vien, nhung "dia diem da biet" cua man
   * tao don doc MOI hang rao dia diem — va mot vong N lan hoi o do lon theo so khach. Mot dia diem
   * tro toi mot phap nhan khong doc duoc thi BI BO QUA — mot the "Ban dang o ???" te hon mot the
   * khong hien ra.
   */
  async activeViews(ids: readonly string[]): Promise<readonly CounterpartySiteView[]> {
    const sites = await this.sites.findManyActive(ids);
    const partyIds = [...new Set(sites.map((site) => site.counterpartyId))];
    const parties = new Map(
      (partyIds.length === 0 ? [] : await this.counterparties.findMany(partyIds)).map(
        (party) => [party.id, party] as const,
      ),
    );
    return sites.flatMap((site) => {
      const counterparty = parties.get(site.counterpartyId);
      if (!counterparty) return [];
      return [{ site, counterpartyId: counterparty.id, counterpartyName: counterparty.name }];
    });
  }

  async create(
    counterpartyId: string,
    command: CreateCounterpartySiteCommand,
    actor: string,
  ): Promise<CounterpartySite> {
    await this.requireCounterparty(counterpartyId);
    if (await this.sites.findByName(counterpartyId, command.name)) {
      throw TransportDomainError.conflict(
        'COUNTERPARTY_SITE_NAME_TAKEN',
        `Phap nhan nay da co dia diem ten "${command.name}"`,
      );
    }

    const site = await this.sites.create({
      counterpartyId,
      name: command.name,
      address: command.address ?? null,
      note: command.note ?? null,
      status: command.status ?? 'ACTIVE',
      recordedBy: actor,
    });

    await this.audit?.append({
      actor,
      action: 'transport.counterparty_site.create',
      entityType: 'TransportCounterpartySite',
      entityId: site.id,
      before: null,
      after: site,
    });
    return site;
  }

  async update(
    id: string,
    patch: UpdateCounterpartySiteInput,
    actor: string,
  ): Promise<CounterpartySite> {
    const before = await this.requireSite(id);
    await this.requireNotManagedAsPlace(before, patch);
    if (patch.name !== undefined && patch.name !== before.name) {
      const clash = await this.sites.findByName(before.counterpartyId, patch.name);
      if (clash && clash.id !== id) {
        throw TransportDomainError.conflict(
          'COUNTERPARTY_SITE_NAME_TAKEN',
          `Phap nhan nay da co dia diem ten "${patch.name}"`,
        );
      }
    }

    const after = await this.sites.update(id, patch);
    if (!after) {
      throw TransportDomainError.notFound(
        'COUNTERPARTY_SITE_NOT_FOUND',
        'Khong tim thay dia diem van hanh',
      );
    }

    await this.audit?.append({
      actor,
      action: 'transport.counterparty_site.update',
      entityType: 'TransportCounterpartySite',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  /**
   * Dia diem co hang rao (moi trang thai) la mot DIA DIEM VAN HANH: ten va trang thai cua no di
   * CUNG hang rao, trong mot giao dich duoi khoa cua man "Dia diem van hanh". Duong nay khong biet
   * hang rao — doi ten o day se de ten kho va nhan hang rao lech nhau, tat o day se de hang rao con
   * bat. Dia chi va ghi chu thi sua tu do.
   */
  private async requireNotManagedAsPlace(
    before: CounterpartySite,
    patch: UpdateCounterpartySiteInput,
  ): Promise<void> {
    if (!this.placeGuard) return;
    const verdict = await this.placeGuard.checkLegacySiteChange({
      siteId: before.id,
      changesName: patch.name !== undefined && patch.name !== before.name,
      changesStatus: patch.status !== undefined && patch.status !== before.status,
    });
    if (!verdict.allowed) {
      throw TransportDomainError.conflict(
        verdict.reason,
        'Điểm này đang được quản lý ở Địa điểm vận hành — sửa tên hoặc bật/tắt ở đó.',
      );
    }
  }

  private async requireSite(id: string): Promise<CounterpartySite> {
    const site = await this.sites.find(id);
    if (!site) {
      throw TransportDomainError.notFound(
        'COUNTERPARTY_SITE_NOT_FOUND',
        'Khong tim thay dia diem van hanh',
      );
    }
    return site;
  }

  private async requireCounterparty(id: string) {
    const counterparty = await this.counterparties.find(id);
    if (!counterparty) {
      throw TransportDomainError.notFound(
        'COUNTERPARTY_NOT_FOUND',
        'Khong tim thay phap nhan nao mang ma do',
      );
    }
    return counterparty;
  }
}
