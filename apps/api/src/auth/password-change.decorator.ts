import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const ALLOW_DURING_PASSWORD_CHANGE_KEY = 'netviet.auth.allow-during-password-change';

/**
 * Route van mo khi tai khoan dang dung MAT KHAU TAM (`#395`, `mustChangePassword`).
 *
 * `SessionAuthGuard` chan MOI route khac bang `403 PASSWORD_CHANGE_REQUIRED` cho toi khi nguoi dung
 * tu doi mat khau. Chi ba route can cho viec do mang dau nay: `GET /auth/me` (man hinh biet phai
 * hien trang doi mat khau), `POST /auth/credentials/change`, `POST /auth/logout`. Route `@Public`
 * (`/auth/csrf`, `/auth/config`, `/auth/login`) khong can — guard da tha chung truoc do.
 */
export const AllowDuringPasswordChange = (): CustomDecorator<string> =>
  SetMetadata(ALLOW_DURING_PASSWORD_CHANGE_KEY, true);
