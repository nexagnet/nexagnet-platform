import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOOT_SPAWN_TIMEOUT_MS, BOOT_TEST_TIMEOUT_MS } from './boot-spec-timeout.js';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = resolve(apiDir, '../../packages/tenant/src/__tests__/fixtures/vi-bang');

describe('vi-bang-management process boot contract', () => {
  it(
    'boot Nest that khi bat doc lap: khong Transport, Messaging, LLM; tao + chuyen ho so duoc',
    () => {
      const script = `
      import { NestFactory } from '@nestjs/core';
      const { AppModule } = await import('./src/app.module.ts');
      const { ViBangService } = await import('./src/vi-bang/vi-bang.service.ts');
      const { ViBangController } = await import('./src/vi-bang/vi-bang.controller.ts');
      const { FleetService } = await import('./src/transport/fleet/fleet.service.ts');
      const { OrdersService } = await import('./src/orders/orders.service.ts');
      const { ZaloUserClient } = await import('./src/channels/zalo-user.client.ts');
      const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
      const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };
      const service = context.get(ViBangService, { strict: false });
      const { customer } = await service.createCustomer({ kind: 'ORGANIZATION', displayName: 'Khach Boot' }, 'boot');
      const created = await service.createCase({ customerId: customer.id, participants: [] }, 'boot');
      const moved = await service.transitionCase(created.id, 'IN_PROGRESS', 'boot');
      let jumped = 'no-error';
      try { await service.transitionCase(created.id, 'NUMBERED', 'boot'); } catch (e) { jumped = e.reason; }
      const proof = {
        service: has(ViBangService),
        controller: has(ViBangController),
        transport: has(FleetService),
        orders: has(OrdersService),
        zalo: has(ZaloUserClient),
        status: moved.status,
        jumped,
      };
      await context.close();
      process.stdout.write('<<VI_BANG_BOOT_PROOF>>' + JSON.stringify(proof));
    `;
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      delete env.DEEPSEEK_API_KEY;
      delete env.FLOWISE_API_KEY;
      delete env.FLOWISE_BASE_URL;
      delete env.FLOWISE_FLOW_ID;
      delete env.ZALO_BOT_TOKEN;
      delete env.TENANT;
      env.TENANT_DIR = fixtureDir;
      env.PERSISTENCE = 'memory';
      env.NODE_ENV = 'test';

      const child = spawnSync(
        process.execPath,
        ['--import', '@swc-node/register/esm-register', '--input-type=module', '--eval', script],
        { cwd: apiDir, env, encoding: 'utf8', timeout: BOOT_SPAWN_TIMEOUT_MS },
      );

      expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
      const proof = child.stdout.split('<<VI_BANG_BOOT_PROOF>>')[1];
      expect(proof, `khong tim thay dau moc:\n${child.stdout}`).toBeDefined();
      expect(JSON.parse(proof ?? '{}')).toEqual({
        service: true,
        controller: true,
        transport: false,
        orders: false,
        zalo: false,
        status: 'IN_PROGRESS',
        jumped: 'TRANSITION_NOT_ALLOWED',
      });
    },
    BOOT_TEST_TIMEOUT_MS,
  );
});
