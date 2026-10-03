import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../audit/audit-log.repository.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { InMemoryViBangRepository } from './in-memory-vi-bang.repository.js';
import { ViBangError } from './vi-bang.errors.js';
import { createCaseSchema, createCustomerSchema } from './vi-bang.schemas.js';
import { ViBangService } from './vi-bang.service.js';

// Du lieu TONG HOP — khong mot gia tri nao la du lieu that.
const PHONE = '0900000001';
const NATIONAL_ID = '000000000001';

describe('ViBangService', () => {
  let service: ViBangService;
  let audit: AuditLogService;

  beforeEach(() => {
    audit = new AuditLogService(new InMemoryAuditLogRepository());
    service = new ViBangService(new InMemoryViBangRepository(), audit);
  });

  const customer = async (extra: Record<string, unknown> = {}) =>
    (
      await service.createCustomer(
        createCustomerSchema.parse({ kind: 'PERSON', displayName: 'Khach Mau A', ...extra }),
        'tester',
      )
    ).customer;

  const newCase = (customerId: string, extra: Record<string, unknown> = {}) =>
    service.createCase(createCaseSchema.parse({ customerId, ...extra }), 'tester');

  it('mot khach co nhieu hop dong va nhieu ho so; mot hop dong co nhieu ho so', async () => {
    const c = await customer();
    const k1 = await service.createContract({ customerId: c.id, contractRef: 'HD-1' }, 'tester');
    const k2 = await service.createContract({ customerId: c.id, contractRef: 'HD-2' }, 'tester');
    await newCase(c.id, { contractId: k1.id });
    await newCase(c.id, { contractId: k1.id });
    await newCase(c.id, { contractId: k2.id });
    expect(
      (await service.listContracts({ customerId: c.id, limit: 20, offset: 0 })).items,
    ).toHaveLength(2);
    expect(
      (await service.listCases({ contractId: k1.id, limit: 20, offset: 0 })).items,
    ).toHaveLength(2);
    expect(
      (await service.listCases({ customerId: c.id, limit: 20, offset: 0 })).items,
    ).toHaveLength(3);
  });

  it('hop dong la tuy chon luc tiep nhan va ho so luu du truong chuan', async () => {
    const c = await customer();
    const requester = await customer({ displayName: 'Nguoi Yeu Cau B' });
    const created = await newCase(c.id, {
      executorUserId: null,
      branch: 'HN',
      occurredAt: '2026-10-01T02:00:00.000Z',
      location: 'Dia diem mau',
      content: 'Noi dung mau',
      registrationNumber: 'DK-0001',
      registeredAt: '2026-09-30T00:00:00.000Z',
      participants: [
        { kind: 'REQUESTER', customerId: requester.id, displayName: 'Nguoi Yeu Cau B' },
        { kind: 'PARTICIPANT', displayName: 'Ben Tham Gia C', roleLabel: 'chung kien' },
      ],
    });
    expect(created.status).toBe('DRAFT');
    expect(created.contractId).toBeNull();
    expect(created.participants).toHaveLength(2);
    expect(created.registrationNumber).toBe('DK-0001');
    expect(created.branch).toBe('HN');
    expect(created.secretaryUserId).toBeNull();
  });

  it('khong tao ho so cho khach/hop dong khong ton tai hoac hop dong cua khach khac', async () => {
    const a = await customer();
    const b = await customer({ displayName: 'Khach Mau B' });
    const contractOfB = await service.createContract(
      { customerId: b.id, contractRef: 'HD-B' },
      't',
    );
    await expect(newCase('khong-co')).rejects.toMatchObject({ reason: 'CUSTOMER_NOT_FOUND' });
    await expect(newCase(a.id, { contractId: 'khong-co' })).rejects.toMatchObject({
      reason: 'CONTRACT_NOT_FOUND',
    });
    await expect(newCase(a.id, { contractId: contractOfB.id })).rejects.toMatchObject({
      reason: 'CONTRACT_CUSTOMER_MISMATCH',
    });
  });

  it('trung phone/CCCD chi canh bao, khong chan va khong hop nhat', async () => {
    const first = await customer({ phone: PHONE, nationalId: NATIONAL_ID });
    const { customer: second, possibleDuplicates } = await service.createCustomer(
      createCustomerSchema.parse({
        kind: 'PERSON',
        displayName: 'Khach Mau Trung',
        phone: PHONE,
        nationalId: NATIONAL_ID,
      }),
      'tester',
    );
    expect(second.id).not.toBe(first.id);
    expect(possibleDuplicates).toEqual([
      { customerId: first.id, matchedOn: ['phone', 'nationalId'] },
    ]);
    expect((await service.listCustomers({ limit: 20, offset: 0 })).items).toHaveLength(2);
  });

  it('chuyen trang thai: DRAFT -> IN_PROGRESS -> WAITING_PAYMENT, kem dau vet', async () => {
    const created = await newCase((await customer()).id);
    const running = await service.transitionCase(created.id, 'IN_PROGRESS', 'tester');
    const waiting = await service.transitionCase(created.id, 'WAITING_PAYMENT', 'tester');
    expect([running.status, waiting.status]).toEqual(['IN_PROGRESS', 'WAITING_PAYMENT']);
    const transitions = (await audit.list({})).filter(
      (e) => e.action === 'vi-bang.case.transition',
    );
    expect(transitions.map((e) => e.after)).toEqual(
      expect.arrayContaining([{ status: 'IN_PROGRESS' }, { status: 'WAITING_PAYMENT' }]),
    );
  });

  it.each(['WAITING_NUMBER', 'NUMBERED', 'STAMPED', 'ISSUED', 'RETURNED', 'DRAFT'] as const)(
    'tu choi nhay thang toi %s va khong doi trang thai',
    async (to) => {
      const created = await newCase((await customer()).id);
      await expect(service.transitionCase(created.id, to, 'tester')).rejects.toMatchObject({
        reason: 'TRANSITION_NOT_ALLOWED',
      });
      expect((await service.getCase(created.id)).status).toBe('DRAFT');
    },
  );

  it('dau vet tao moi/chuyen trang thai khong chua PII', async () => {
    const c = await customer({
      displayName: 'Ten Rieng Tu Z',
      phone: PHONE,
      nationalId: NATIONAL_ID,
    });
    const created = await newCase(c.id, { content: 'Noi dung rieng tu Z', location: 'Dia chi Z' });
    await service.transitionCase(created.id, 'IN_PROGRESS', 'tester');
    const dump = JSON.stringify(await audit.list({}));
    for (const secret of [
      'Ten Rieng Tu Z',
      PHONE,
      NATIONAL_ID,
      'Noi dung rieng tu Z',
      'Dia chi Z',
    ]) {
      expect(dump).not.toContain(secret);
    }
    expect((await audit.list({})).map((e) => e.action).sort()).toEqual([
      'vi-bang.case.create',
      'vi-bang.case.transition',
      'vi-bang.customer.create',
    ]);
  });

  it('loi khong chua PII', async () => {
    const c = await customer({ displayName: 'Ten Rieng Tu Z', phone: PHONE });
    const created = await newCase(c.id);
    const error = await service.transitionCase(created.id, 'NUMBERED', 't').catch((e) => e);
    expect(error).toBeInstanceOf(ViBangError);
    expect(String(error.message)).not.toContain('Ten Rieng Tu Z');
    expect(String(error.message)).not.toContain(PHONE);
  });

  it('body co tenantId (hay khoa la) bi tu choi boi schema strict', () => {
    expect(
      createCustomerSchema.safeParse({ kind: 'PERSON', displayName: 'A', tenantId: 'khac' })
        .success,
    ).toBe(false);
    expect(createCaseSchema.safeParse({ customerId: 'x', tenantId: 'khac' }).success).toBe(false);
  });

  it('tim kiem co ban theo ten khach va loc theo trang thai', async () => {
    const a = await customer({ displayName: 'Alpha Mau' });
    await customer({ displayName: 'Beta Mau' });
    const created = await newCase(a.id, { content: 'Tim theo noi dung' });
    await service.transitionCase(created.id, 'IN_PROGRESS', 't');
    expect((await service.listCustomers({ q: 'alpha', limit: 20, offset: 0 })).items).toHaveLength(
      1,
    );
    expect(
      (await service.listCases({ status: 'IN_PROGRESS', limit: 20, offset: 0 })).items,
    ).toHaveLength(1);
    expect((await service.listCases({ status: 'DRAFT', limit: 20, offset: 0 })).items).toHaveLength(
      0,
    );
    expect((await service.listCases({ q: 'noi dung', limit: 20, offset: 0 })).items).toHaveLength(
      1,
    );
  });
});
