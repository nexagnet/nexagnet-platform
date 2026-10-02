import { describe, expect, it } from 'vitest';
import type { PermissionGrant } from '../../auth/access/permission-domain.js';
import type { UserRole } from '../../auth/auth.types.js';
import { InMemoryUserRepository, type AuthUserRecord } from '../../auth/user.repository.js';
import type { FileAction, FileLink } from '../../files/file.types.js';
import type { TransportCheckpointCoreFacts } from '../checkpoint/checkpoint-facts.port.js';
import type { OperationalDocumentRepository } from './document.repository.js';
import type { OperationalDocument } from './document.types.js';
import type { PhysicalReceiptHandoverRepository } from './handover.repository.js';
import {
  OperationalDocumentFileAuthorizer,
  TRANSPORT_OPERATIONAL_DOCUMENT_OWNER,
} from './operational-document-file.authorizer.js';

/**
 * #395 — DUONG TAI BYTE TEP (`GET /files/:id/content`) KHONG di qua `TransportActionGuard`.
 *
 * Nen cho kiem quyen trong `OperationalDocumentFileAuthorizer` phai doc CUNG tap quyen hieu luc voi
 * guard: mot `DENY transport.operational_document.read` tren Ke toan phai co hieu luc o day (neu
 * khong, Ke toan bi bot quyen van tai duoc tep bang cach goi thang duong tep), va mot `ALLOW` cho
 * Dieu hanh phai mo duoc tep.
 */

const NOW = new Date('2026-09-25T02:00:00.000Z');
const DOCUMENT_ID = 'doc-1';

function record(id: string, role: UserRole, grants?: readonly PermissionGrant[]): AuthUserRecord {
  return {
    id,
    username: id,
    name: id,
    email: null,
    phone: null,
    passwordHash: 'x',
    role,
    disabledAt: null,
    credentialVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    lastLoginAt: null,
    passwordChangedAt: NOW,
    ...(grants === undefined ? {} : { permissionGrants: grants }),
  };
}

const document = {
  id: DOCUMENT_ID,
  status: 'ACTIVE',
  recordedBy: 'user-driver',
  driverId: 'driver-1',
} as unknown as OperationalDocument;

function authorizer(
  users: readonly AuthUserRecord[],
  handedOver = false,
): OperationalDocumentFileAuthorizer {
  const documents = {
    find: async (id: string) => (id === DOCUMENT_ID ? document : null),
  } as unknown as OperationalDocumentRepository;
  const handovers = {
    isDocumentHandedOver: async () => handedOver,
  } as unknown as PhysicalReceiptHandoverRepository;
  const identity = {
    findDriverByAuthUserId: async () => null,
  } as unknown as TransportCheckpointCoreFacts;
  return new OperationalDocumentFileAuthorizer(
    documents,
    handovers,
    identity,
    new InMemoryUserRepository(users),
  );
}

const link = {
  id: 'link-1',
  fileId: 'file-1',
  businessOwnerType: TRANSPORT_OPERATIONAL_DOCUMENT_OWNER,
  businessOwnerId: DOCUMENT_ID,
  purpose: 'DELIVERY_RECEIPT',
  state: 'ACTIVE',
  createdBy: 'user-driver',
  createdAt: NOW,
  withdrawnBy: null,
} as unknown as FileLink;

const ask = (subject: OperationalDocumentFileAuthorizer, action: FileAction, authUserId: string) =>
  subject.authorize({ link, action, authUserId });

describe('OperationalDocumentFileAuthorizer doc quyen rieng (#395)', () => {
  it('Ke toan bi DENY `operational_document.read` KHONG tai duoc tep', async () => {
    const subject = authorizer([
      record('acc-denied', 'ACCOUNTING', [
        { permission: 'transport.operational_document.read', effect: 'DENY' },
      ]),
      record('acc-plain', 'ACCOUNTING'),
    ]);
    expect(await ask(subject, 'READ', 'acc-denied')).toEqual({ kind: 'DENIED' });
    // Doi chung: cung vai, khong quyen rieng -> duoc doc nhu hom nay.
    expect(await ask(subject, 'READ', 'acc-plain')).toEqual({ kind: 'GRANTED' });
  });

  it('Dieu hanh DUOC cap `operational_document.read` tai duoc tep; khong duoc cap thi khong', async () => {
    const subject = authorizer([
      record('mgr-allowed', 'MANAGER', [
        { permission: 'transport.operational_document.read', effect: 'ALLOW' },
      ]),
      record('mgr-plain', 'MANAGER', []),
    ]);
    expect(await ask(subject, 'READ', 'mgr-allowed')).toEqual({ kind: 'GRANTED' });
    expect(await ask(subject, 'READ', 'mgr-plain')).toEqual({ kind: 'DENIED' });
  });

  it('Dieu hanh DUOC cap rut: rut duoc chung tu chua ban giao, `LOCKED` khi da ban giao', async () => {
    const withdrawer = record('mgr-withdraw', 'MANAGER', [
      { permission: 'transport.operational_document.withdraw', effect: 'ALLOW' },
    ]);
    expect(await ask(authorizer([withdrawer]), 'WITHDRAW', 'mgr-withdraw')).toEqual({
      kind: 'GRANTED',
    });
    expect(await ask(authorizer([withdrawer], true), 'WITHDRAW', 'mgr-withdraw')).toEqual({
      kind: 'LOCKED',
    });
  });

  it('quyen rieng khong cuu duoc tai khoan da khoa', async () => {
    const disabled = {
      ...record('mgr-disabled', 'MANAGER', [
        { permission: 'transport.operational_document.read', effect: 'ALLOW' },
      ]),
      disabledAt: NOW,
    };
    expect(await ask(authorizer([disabled]), 'READ', 'mgr-disabled')).toEqual({ kind: 'DENIED' });
  });

  it('ban ghi khong co truong `permissionGrants` (kho cu) tra loi dung nhu vai khoi diem', async () => {
    const subject = authorizer([record('admin', 'ADMIN'), record('acc', 'ACCOUNTING')]);
    expect(await ask(subject, 'WITHDRAW', 'admin')).toEqual({ kind: 'GRANTED' });
    expect(await ask(subject, 'WITHDRAW', 'acc')).toEqual({ kind: 'DENIED' });
  });
});
