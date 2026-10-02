import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAssetOwnershipRepository } from '../asset-ownership/asset-ownership.repository.js';
import { TransportAccountLinkDirectory } from './account-link-directory.js';
import { InMemoryFleetRepository } from './fleet.repository.js';

/**
 * HOP DONG DAY cua `GET /transport/account-links/:authUserId` (#395 §1.8).
 *
 * Man hinh tai khoan (web) doc thang khung nay: `driver.vehicle` la DOI TUONG
 * `{id, registrationPlate}` va web in `Xe {vehicle.registrationPlate}` (admin-types.ts,
 * AccountDetail.tsx, mock e2e admin-accounts-server.ts). Doi sang chuoi thi web in "Xe " trong
 * tren moi tai khoan noi voi lai xe dang co xe ma khong test nao do — nen khoa ca khuon lan kieu
 * sau JSON o day.
 */
describe('TransportAccountLinkDirectory — khung nhin lien ket tai khoan', () => {
  let fleet: InMemoryFleetRepository;
  let ownership: InMemoryAssetOwnershipRepository;
  let directory: TransportAccountLinkDirectory;

  const linkedDriver = (authUserId: string) =>
    fleet.createDriver({
      fullName: 'Nguyễn Văn An',
      phone: '0900000001',
      licenceClass: 'C',
      licenceExpiry: '2029-01-01',
      status: 'ACTIVE',
      authUserId,
    });

  beforeEach(() => {
    fleet = new InMemoryFleetRepository();
    ownership = new InMemoryAssetOwnershipRepository();
    directory = new TransportAccountLinkDirectory(fleet, ownership);
  });

  it('lai xe dang phu trach xe: `vehicle` la DOI TUONG `{id, registrationPlate}`', async () => {
    const driver = await linkedDriver('user-lx');
    const vehicle = await fleet.createVehicle({
      registrationPlate: '29C-123.45',
      vehicleClass: 'Xe tai',
    });
    await fleet.assignDriverToVehicle(vehicle.id, driver.id, new Date('2026-09-01T00:00:00Z'));

    const wire = JSON.parse(JSON.stringify(await directory.forUser('user-lx'))) as unknown;

    expect(wire).toEqual({
      driver: {
        id: driver.id,
        name: 'Nguyễn Văn An',
        phone: '0900000001',
        status: 'ACTIVE',
        vehicle: { id: vehicle.id, registrationPlate: '29C-123.45' },
      },
      stakeholder: null,
    });
  });

  it('lai xe chua phu trach xe nao: `vehicle` la null', async () => {
    await linkedDriver('user-lx');
    const view = await directory.forUser('user-lx');
    expect(view.driver?.vehicle).toBeNull();
  });

  it('ben gop von: `{id, name, status}`; khong lien ket nao thi ca hai null', async () => {
    const holder = await ownership.createStakeholder({
      kind: 'PERSON',
      displayName: 'Chủ xe Bình',
    });
    await ownership.setStakeholderAccount(holder.id, 'user-chu-xe');

    expect(await directory.forUser('user-chu-xe')).toEqual({
      driver: null,
      stakeholder: { id: holder.id, name: 'Chủ xe Bình', status: 'ACTIVE' },
    });
    expect(await directory.forUser('user-khong-lien-ket')).toEqual({
      driver: null,
      stakeholder: null,
    });
  });
});
