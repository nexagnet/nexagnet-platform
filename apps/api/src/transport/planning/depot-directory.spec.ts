import { describe, expect, it } from 'vitest';
import {
  ConfigDepotDirectory,
  DepotDirectory,
  DepotDirectoryHub,
  type DepotEntry,
} from './depot-directory.js';
import type { TransportPlanningPolicy } from './planning.types.js';

const policy = (depots: TransportPlanningPolicy['depots']): TransportPlanningPolicy => ({
  grouping: 'ONE_ORDER_PER_RUN',
  depots,
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
});

class FixedDirectory extends DepotDirectory {
  constructor(private readonly entries: readonly DepotEntry[]) {
    super();
  }

  async list(): Promise<readonly DepotEntry[]> {
    return this.entries;
  }
}

describe('danh ba bai xe — cong cua transport-core (#395)', () => {
  it('cau hinh goi khach: giu ma, nhan va co bat/tat, danh dau nguon', async () => {
    const directory = new ConfigDepotDirectory(
      policy([
        { code: 'DEPOT-A', label: 'Bãi A' },
        { code: 'DEPOT-B', label: 'Bãi B', active: false },
      ]),
    );
    expect(await directory.list()).toEqual([
      { code: 'DEPOT-A', label: 'Bãi A', active: true, source: 'TENANT_CONFIG' },
      { code: 'DEPOT-B', label: 'Bãi B', active: false, source: 'TENANT_CONFIG' },
    ]);
  });

  it('chua ai dang ky thi hub doc cau hinh — dung nhu truoc #395', async () => {
    const hub = new DepotDirectoryHub(policy([{ code: 'DEPOT-A', label: 'Bãi A' }]));
    expect(await hub.list()).toEqual([
      { code: 'DEPOT-A', label: 'Bãi A', active: true, source: 'TENANT_CONFIG' },
    ]);
  });

  it('nguon da dang ky la cau tra loi, ke ca khi no tra rong', async () => {
    const hub = new DepotDirectoryHub(policy([{ code: 'DEPOT-A', label: 'Bãi A' }]));
    hub.register(new FixedDirectory([]));
    expect(await hub.list()).toEqual([]);
  });

  it('dang ky hai nguon thi NEM — loi composition phai lo luc khoi dong', () => {
    const hub = new DepotDirectoryHub(policy([]));
    hub.register(new FixedDirectory([]));
    expect(() => hub.register(new FixedDirectory([]))).toThrow(/Da co mot nguon bai xe/);
  });
});
