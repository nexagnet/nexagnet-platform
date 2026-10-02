import { Injectable } from '@nestjs/common';
import type { PermissionDomain } from './permission-domain.js';
import { PLATFORM_PERMISSION_PREFIX } from './platform-permissions.js';

/**
 * SO DANG KY cac mien phan quyen (`#395`).
 *
 * VI SAO LA MOT SO GHI DUOC, khong mot mang tiem san: `AuthModule` thuoc `foundation` va duoc nap
 * truoc moi mien. Mot mang tiem vao luc dung no se buoc nen tang biet ten tung mien. Nen chieu phu
 * thuoc bi dao — dung khuon `FileDomainAuthorizerRegistry`: mien tu dang ky trong HAM DUNG cua mot
 * provider thuoc module cua chinh no, nen lan dang ky xay ra luc Nest khoi tao module, khong phu
 * thuoc thu tu hook `onModuleInit`.
 *
 * `register()` NEM khi mot `id` bi khai hai lan: hai cau tra loi cho cung mot cau hoi "nguoi nay lam
 * duoc gi" thi cai long hon se la cai that su chay.
 */
@Injectable()
export class PermissionDomainRegistry {
  private readonly domains = new Map<string, PermissionDomain>();

  register(domain: PermissionDomain): void {
    if (!/^[a-z][a-z0-9-]*$/.test(domain.id)) {
      throw new Error(`Ma mien phan quyen khong hop le: "${domain.id}"`);
    }
    if (`${domain.id}.` === PLATFORM_PERMISSION_PREFIX) {
      throw new Error('Tien to "platform." thuoc rieng nen tang — mien khong dung duoc');
    }
    if (this.domains.has(domain.id)) {
      throw new Error(
        `Mien phan quyen "${domain.id}" da duoc dang ky — hai cau tra loi cho mot cau hoi`,
      );
    }
    this.domains.set(domain.id, domain);
  }

  /** Moi mien, theo thu tu dang ky. */
  all(): readonly PermissionDomain[] {
    return [...this.domains.values()];
  }

  get(id: string): PermissionDomain | null {
    return this.domains.get(id) ?? null;
  }

  /**
   * Mien so huu mot ma quyen, theo tien to `<id>.` — hoac `null` khi khong mien nao nhan (ma do la
   * `UNKNOWN_PERMISSION` o tang nen tang). DUNG MOT cho quy uoc tien to, de moi noi chia quyen rieng
   * theo mien deu chia giong nhau.
   */
  owning(permission: string): PermissionDomain | null {
    const dot = permission.indexOf('.');
    if (dot <= 0) return null;
    return this.get(permission.slice(0, dot));
  }
}
