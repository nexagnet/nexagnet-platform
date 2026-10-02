import type { Counterparty, CounterpartyLink } from '../../counterparty/counterparty.types.js';
import type { CounterpartySite } from '../../counterparty/site.types.js';
import type { PlaceWriteTx } from '../../proof/place-write.store.js';
import { TransportDomainError } from '../../transport.errors.js';
import { PlaceAdminError } from './place-admin-error.js';
import {
  customerLinkOf,
  type CreatePlaceCommand,
  type PlaceOwnerInput,
} from './place-admin.types.js';

/**
 * CHU cua mot dia diem MOI cua don vi khac (`#395`) — "Dia diem nay cua ai?".
 *
 *   · kho / cua hang cua mot KHACH HANG — dung phap nhan da noi voi khach do; chua co thi TAO phap
 *     nhan (ten + ma so thue cua khach) va lien ket `CUSTOMER` trong CUNG giao dich. Mot phap nhan
 *     co san mang dung ma so thue cua khach la CUNG mot doanh nghiep (ma so thue la danh tinh manh
 *     nhat — xem `TransportCounterparty` trong schema), nen khach duoc noi vao phap nhan do;
 *   · nha may / kho cua MOT DON VI co san;
 *   · mot DON VI MOI (ten, ma so thue tuy chon) tao ngay tai cho;
 *   · hoac gan vi tri vao mot DIA DIEM CO SAN chua co hang rao.
 *
 * Chay BEN TRONG giao dich cua `PlaceWriteStore`, sau khoa. Moi phep kiem dung truoc lan ghi dau
 * tien cua nhanh do.
 */

export interface PlaceOwnerOutcome {
  readonly party: Counterparty;
  readonly partyCreated: boolean;
  /** Lien ket khach hang VUA tao trong lan nay (neu co). */
  readonly linkCreated: CounterpartyLink | null;
  readonly customerId: string | null;
  readonly site: CounterpartySite;
  readonly siteBefore: CounterpartySite | null;
}

/** Khuon ma so thue cua `TransportCounterparty_taxCode_shape` — khuon khac thi bo (NULL). */
const TAX_CODE_SHAPE = /^[0-9]{10}(-[0-9]{3})?$/;

/**
 * Chu cua dia diem (don vi / khach hang) da ngung hoat dong — dung chung cho tao va bat lai. Ten chu
 * di vao `detail.ownerName` de man hinh goi dung ten (telemetry chi giu ma).
 */
export const ownerInactive = (name: string): PlaceAdminError =>
  new PlaceAdminError(
    'CONFLICT',
    'PLACE_OWNER_INACTIVE',
    `"${name}" đã ngừng hoạt động — bật lại đơn vị hoặc khách hàng này trước khi thêm hoặc bật địa điểm của họ.`,
    { ownerName: name },
  );

export async function resolveSiteOwner(
  tx: PlaceWriteTx,
  command: CreatePlaceCommand,
  actor: string,
): Promise<PlaceOwnerOutcome> {
  if (command.siteId !== undefined) return attachToExistingSite(tx, command, command.siteId);
  if (command.owner === undefined) {
    throw TransportDomainError.invalid(
      'PLACE_OWNER_REQUIRED',
      'Hãy chọn địa điểm này của ai: một khách hàng, một đơn vị có sẵn, hoặc thêm đơn vị mới.',
    );
  }
  // MOI phep kiem truoc lan ghi dau tien — ke ca trung ten dia diem trong phap nhan co san — de
  // ban trong bo nho (khong co rollback) cung khong de lai phap nhan hay lien ket do dang.
  const plan = await planParty(tx, command.owner);
  if (plan.party !== null) await requireSiteNameFreeIn(tx, plan.party, command.name);
  const owner = await applyParty(tx, plan, actor);
  const site = await tx.sites.create({
    counterpartyId: owner.party.id,
    name: command.name,
    address: command.address ?? null,
    note: null,
    status: 'ACTIVE',
    recordedBy: actor,
  });
  return { ...owner, site, siteBefore: null };
}

async function requireSiteNameFreeIn(
  tx: PlaceWriteTx,
  party: Counterparty,
  name: string,
): Promise<void> {
  const existing = await tx.sites.findByName(party.id, name);
  if (!existing) return;
  throw new PlaceAdminError(
    'CONFLICT',
    'COUNTERPARTY_SITE_NAME_TAKEN',
    `"${party.name}" đã có địa điểm "${existing.name}" — chọn địa điểm đó để gắn vị trí.`,
    { siteId: existing.id, siteName: existing.name, counterpartyName: party.name },
  );
}

async function attachToExistingSite(
  tx: PlaceWriteTx,
  command: CreatePlaceCommand,
  siteId: string,
): Promise<PlaceOwnerOutcome> {
  if (command.owner !== undefined && !('counterpartyId' in command.owner)) {
    throw TransportDomainError.invalid(
      'PLACE_OWNER_INVALID',
      'Gắn vị trí vào địa điểm có sẵn thì chủ là đơn vị của địa điểm đó — không chọn thêm chủ khác.',
    );
  }
  const site = await tx.sites.find(siteId);
  if (!site) {
    throw TransportDomainError.notFound('COUNTERPARTY_SITE_NOT_FOUND', 'Không tìm thấy địa điểm.');
  }
  if (command.owner !== undefined && command.owner.counterpartyId !== site.counterpartyId) {
    throw TransportDomainError.invalid(
      'PLACE_SITE_OWNER_MISMATCH',
      'Địa điểm được chọn không thuộc đơn vị đã chọn.',
    );
  }
  const fenced = await tx.geofences.listAll({
    subjectKinds: ['COUNTERPARTY_SITE'],
    subjectIds: [site.id],
  });
  if (fenced.length > 0) {
    throw TransportDomainError.conflict(
      'PLACE_SITE_ALREADY_FENCED',
      `"${site.name}" đã có vị trí trên bản đồ — sửa ở chính địa điểm đó.`,
    );
  }
  const party = await tx.counterparties.find(site.counterpartyId);
  if (!party) {
    throw TransportDomainError.notFound('COUNTERPARTY_NOT_FOUND', 'Không tìm thấy đơn vị.');
  }
  if (party.status !== 'ACTIVE') throw ownerInactive(party.name);

  // Ten dia diem DI THEO ten dia diem van hanh — hai ten cho mot cho la hai cach goi de lech nhau.
  const renamed = site.name !== command.name;
  if (renamed) {
    const clash = await tx.sites.findByName(site.counterpartyId, command.name);
    if (clash && clash.id !== site.id) {
      throw new PlaceAdminError(
        'CONFLICT',
        'COUNTERPARTY_SITE_NAME_TAKEN',
        `"${party.name}" đã có một địa điểm khác tên "${clash.name}".`,
        { siteId: clash.id, siteName: clash.name, counterpartyName: party.name },
      );
    }
  }
  const updated = await tx.sites.update(site.id, {
    ...(renamed ? { name: command.name } : {}),
    ...(command.address === undefined ? {} : { address: command.address }),
    status: 'ACTIVE',
  });
  const links = await tx.counterparties.listLinks(party.id);
  return {
    party,
    partyCreated: false,
    linkCreated: null,
    customerId: customerLinkOf(links)?.subjectId ?? null,
    site: updated ?? site,
    siteBefore: site,
  };
}

type PartyOutcome = Omit<PlaceOwnerOutcome, 'site' | 'siteBefore'>;

/**
 * KE HOACH chu — doc het, KHONG ghi gi. `party` = phap nhan co san (NULL = se tao `newParty`);
 * `linkCustomerId` = khach can noi vao phap nhan trong lan nay.
 */
interface PartyPlan {
  readonly party: Counterparty | null;
  readonly newParty: { readonly name: string; readonly taxCode: string | null } | null;
  readonly customerId: string | null;
  readonly linkCustomerId: string | null;
}

async function planParty(tx: PlaceWriteTx, owner: PlaceOwnerInput): Promise<PartyPlan> {
  if ('counterpartyId' in owner) {
    const party = await tx.counterparties.find(owner.counterpartyId);
    if (!party) {
      throw TransportDomainError.notFound('COUNTERPARTY_NOT_FOUND', 'Không tìm thấy đơn vị.');
    }
    if (party.status !== 'ACTIVE') throw ownerInactive(party.name);
    const links = await tx.counterparties.listLinks(party.id);
    return {
      party,
      newParty: null,
      customerId: customerLinkOf(links)?.subjectId ?? null,
      linkCustomerId: null,
    };
  }
  if ('customerId' in owner) return planCustomerParty(tx, owner.customerId);
  return planNewParty(tx, owner.newCounterparty);
}

async function planCustomerParty(tx: PlaceWriteTx, customerId: string): Promise<PartyPlan> {
  const customer = await tx.customers.findCustomer(customerId);
  if (!customer) {
    throw TransportDomainError.notFound('CUSTOMER_NOT_FOUND', 'Không tìm thấy khách hàng.');
  }
  if (customer.status !== 'ACTIVE') throw ownerInactive(customer.name);

  const link = await tx.counterparties.findLinkBySubject('CUSTOMER', customer.id);
  if (link) {
    const party = await tx.counterparties.find(link.counterpartyId);
    if (!party) {
      throw TransportDomainError.notFound('COUNTERPARTY_NOT_FOUND', 'Không tìm thấy đơn vị.');
    }
    if (party.status !== 'ACTIVE') throw ownerInactive(party.name);
    return { party, newParty: null, customerId: customer.id, linkCustomerId: null };
  }

  const taxCode = customer.taxCode?.trim() ?? '';
  const usableTaxCode = TAX_CODE_SHAPE.test(taxCode) ? taxCode : null;
  const sameEntity = usableTaxCode ? await tx.counterparties.findByTaxCode(usableTaxCode) : null;
  if (sameEntity && sameEntity.status !== 'ACTIVE') throw ownerInactive(sameEntity.name);
  return {
    party: sameEntity,
    newParty: sameEntity ? null : { name: customer.name, taxCode: usableTaxCode },
    customerId: customer.id,
    linkCustomerId: customer.id,
  };
}

async function planNewParty(
  tx: PlaceWriteTx,
  input: { readonly name: string; readonly taxCode?: string | null },
): Promise<PartyPlan> {
  const taxCode = input.taxCode ?? null;
  if (taxCode !== null) {
    const holder = await tx.counterparties.findByTaxCode(taxCode);
    if (holder) {
      throw new PlaceAdminError(
        'CONFLICT',
        'COUNTERPARTY_TAX_CODE_TAKEN',
        `Mã số thuế ${taxCode} đã thuộc "${holder.name}" — chọn đơn vị đó thay vì thêm mới.`,
        { counterpartyId: holder.id, counterpartyName: holder.name },
      );
    }
  }
  return {
    party: null,
    newParty: { name: input.name, taxCode },
    customerId: null,
    linkCustomerId: null,
  };
}

/** GHI theo ke hoach: phap nhan moi (neu can), roi lien ket khach (neu can). */
async function applyParty(tx: PlaceWriteTx, plan: PartyPlan, actor: string): Promise<PartyOutcome> {
  const party =
    plan.party ??
    (await tx.counterparties.create({
      name: plan.newParty?.name ?? '',
      taxCode: plan.newParty?.taxCode ?? null,
      note: null,
    }));
  const linkCreated =
    plan.linkCustomerId === null
      ? null
      : await tx.counterparties.link({
          counterpartyId: party.id,
          kind: 'CUSTOMER',
          subjectId: plan.linkCustomerId,
          linkedBy: actor,
        });
  return { party, partyCreated: plan.party === null, linkCreated, customerId: plan.customerId };
}
