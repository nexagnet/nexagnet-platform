import { Global, Module } from '@nestjs/common';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { OperationalSettingsModule } from '../settings/operational-settings.module.js';
import { PrismaModule } from '../config/prisma.module.js';
import { PrismaService } from '../config/prisma.service.js';
import { PermissionDomainRegistry } from './access/permission-domain.registry.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { Argon2PasswordService, PasswordService } from './password.service.js';
import { PrismaUserRepository } from './prisma-user.repository.js';
import { InMemoryUserRepository, UserRepository } from './user.repository.js';
import { UsersController } from './users.controller.js';

@Global()
@Module({
  imports: [PrismaModule, OperationalSettingsModule],
  controllers: [AuthController, UsersController],
  providers: [
    {
      provide: UserRepository,
      useFactory: (prisma: PrismaService): UserRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaUserRepository(prisma)
          : new InMemoryUserRepository(),
      inject: [PrismaService],
    },
    { provide: PasswordService, useClass: Argon2PasswordService },
    AuthService,
    /*
     * So dang ky cac mien phan quyen (`#395`). O day vi `AuthModule` la `@Global` va thuoc
     * `foundation`: moi mien (vd `TransportModule`) tiem duoc no de tu dang ky, ma nen tang khong
     * phai biet ten mien nao.
     */
    PermissionDomainRegistry,
  ],
  exports: [AuthService, UserRepository, PasswordService, PermissionDomainRegistry],
})
export class AuthModule {}
