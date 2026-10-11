import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../audit/audit-log.repository.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { PrismaService } from '../config/prisma.service.js';
import { trustedTenantScope } from '../source-registry/tenant-scope.js';
import { PrismaViBangRepository } from './prisma-vi-bang.repository.js';
import { createCaseSchema, createCustomerSchema } from './vi-bang.schemas.js';
import { ViBangService } from './vi-bang.service.js';

/**
 * VI BANG tren Postgres THAT: migration ap duoc, quan he Customer 1-N Contract 1-N Case that su
 * luu, khong rang buoc UNIQUE tren phone/CCCD, chuyen trang thai CO DIEU KIEN nguyen tu, va ranh
 * gioi khach (`tenantId` do may chu) cach ly du lieu. Du lieu hoan toan TONG HOP.
 *
 * `describe.runIf` theo quy uoc repo; bai nay chay o job `integration` cua CI.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')('Vi bang (Postgres THAT)', () => {
  const prisma = new PrismaService();
  const repository = new PrismaViBangRepository(prisma);
  const service = new ViBangService(
    repository,
    new AuditLogService(new InMemoryAuditLogRepository()),
  );
  // `trustedTenantScope()` doc `loadTenantConfig().slug`; bai test dung dung pham vi do va doi chieu
  // voi mot "khach khac" bang cach goi thang kho voi tenantId khac.
  const OTHER_TENANT = 'it-vi-bang-other';
  const created = { customers: [] as string[] };

  async function cleanup(): Promise<void> {
    const customerIds = created.customers;
    await prisma.viBangCaseParticipant.deleteMany({
      where: { case: { customerId: { in: customerIds } } },
    });
    await prisma.viBangCase.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.viBangServiceContract.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.viBangCustomer.deleteMany({ where: { id: { in: customerIds } } });
  }

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const newCustomer = async (displayName: string, extra: Record<string, unknown> = {}) => {
    const { customer, possibleDuplicates } = await service.createCustomer(
      createCustomerSchema.parse({ kind: 'PERSON', displayName, ...extra }),
      'it',
    );
    created.customers.push(customer.id);
    return { customer, possibleDuplicates };
  };

  it('luu khach -> hop dong -> nhieu ho so; hop dong tuy chon; participants 0..N', async () => {
    const { customer } = await newCustomer('IT Khach Mau 1');
    const contract = await service.createContract(
      { customerId: customer.id, contractRef: 'IT-HD-1' },
      'it',
    );
    const withContract = await service.createCase(
      createCaseSchema.parse({
        customerId: customer.id,
        contractId: contract.id,
        branch: 'HN',
        occurredAt: '2026-10-01T02:00:00.000Z',
        location: 'Dia diem mau',
        content: 'Noi dung mau',
        registrationNumber: 'IT-DK-1',
        registeredAt: '2026-09-30T00:00:00.000Z',
        participants: [
          { kind: 'REQUESTER', customerId: customer.id, displayName: 'IT Khach Mau 1' },
          { kind: 'PARTICIPANT', displayName: 'IT Ben Tham Gia' },
        ],
      }),
      'it',
    );
    const withoutContract = await service.createCase(
      createCaseSchema.parse({ customerId: customer.id }),
      'it',
    );
    expect(withContract.participants).toHaveLength(2);
    expect(withContract.registrationNumber).toBe('IT-DK-1');
    expect(withoutContract.contractId).toBeNull();
    const reread = await service.getCase(withContract.id);
    expect(reread.occurredAt).toBe('2026-10-01T02:00:00.000Z');
    const byContract = await service.listCases({ contractId: contract.id, limit: 20, offset: 0 });
    expect(byContract.items.map((c) => c.id)).toEqual([withContract.id]);
    const byCustomer = await service.listCases({ customerId: customer.id, limit: 20, offset: 0 });
    expect(byCustomer.items).toHaveLength(2);
  });

  it('khong co UNIQUE tren phone/CCCD: hai khach cung so van luu duoc, chi canh bao', async () => {
    const { customer: first } = await newCustomer('IT Trung A', {
      phone: '0900000099',
      nationalId: '000000000099',
    });
    const { customer: second, possibleDuplicates } = await newCustomer('IT Trung B', {
      phone: '0900000099',
      nationalId: '000000000099',
    });
    expect(second.id).not.toBe(first.id);
    expect(possibleDuplicates.map((d) => d.customerId)).toContain(first.id);
  });

  it('chuyen trang thai: hop le di duoc, nhay coc bi tu choi, DB khong doi', async () => {
    const { customer } = await newCustomer('IT Khach Mau 2');
    const c = await service.createCase(createCaseSchema.parse({ customerId: customer.id }), 'it');
    expect((await service.transitionCase(c.id, 'IN_PROGRESS', 'it')).status).toBe('IN_PROGRESS');
    await expect(service.transitionCase(c.id, 'NUMBERED', 'it')).rejects.toMatchObject({
      reason: 'TRANSITION_NOT_ALLOWED',
    });
    expect((await service.transitionCase(c.id, 'WAITING_PAYMENT', 'it')).status).toBe(
      'WAITING_PAYMENT',
    );
    expect((await service.getCase(c.id)).status).toBe('WAITING_PAYMENT');
  });

  it('hai chuyen trang thai song song: dung mot nguoi thang', async () => {
    const { customer } = await newCustomer('IT Khach Mau 3');
    const c = await service.createCase(createCaseSchema.parse({ customerId: customer.id }), 'it');
    const { tenantId } = trustedTenantScope();
    const attempts = await Promise.allSettled([
      repository.transitionCase(tenantId, c.id, 'DRAFT', 'IN_PROGRESS'),
      repository.transitionCase(tenantId, c.id, 'DRAFT', 'IN_PROGRESS'),
    ]);
    const winners = attempts.filter((a) => a.status === 'fulfilled' && a.value !== null);
    expect(winners).toHaveLength(1);
  });

  it('Thua hanh vien khong ton tai bi tu choi bang loi mien, khong ro ri', async () => {
    const { customer } = await newCustomer('IT Khach Mau 4');
    await expect(
      service.createCase(
        createCaseSchema.parse({ customerId: customer.id, executorUserId: 'khong-co-user' }),
        'it',
      ),
    ).rejects.toMatchObject({ reason: 'REFERENCE_NOT_FOUND' });
  });

  it('cach ly khach: du lieu khach nay khong doc duoc bang pham vi khach khac', async () => {
    const { customer } = await newCustomer('IT Khach Mau 5');
    expect(await repository.getCustomer(OTHER_TENANT, customer.id)).toBeNull();
    expect(await repository.listCustomers(OTHER_TENANT, { limit: 100, offset: 0 })).toEqual([]);
    expect(await repository.getCustomer(trustedTenantScope().tenantId, customer.id)).not.toBeNull();
  });
});
