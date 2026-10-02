import { z } from 'zod';
import { PERMISSION_EFFECTS } from './access/permission-domain.js';
import { USER_ROLES } from './auth.types.js';

/**
 * Ten dang nhap: dung chung cho DANG NHAP va TAO tai khoan.
 *
 * `#395`: danh sach ten DANH CHO HE THONG (`operator`, `internal-service`…) KHONG nam o day. Schema
 * nay con phuc vu `loginSchema`, va `operator` la tai khoan ADMIN THAT tren gd1-test — mot `.refine`
 * o day se khoa nguoi van hanh ra ngoai. Kiem ten danh rieng chi o `AuthService.createUser`.
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i, 'Tên đăng nhập chỉ gồm chữ, số, dấu chấm, gạch nối');

const passwordSchema = z.string().min(12).max(128);

/** Chuoi rong / toan khoang trang tu man hinh = "khong co" (NULL), khong phai mot gia tri. */
const blankToNull = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const emailSchema = z.preprocess(
  blankToNull,
  z.string().trim().email().max(254).nullable().optional(),
);
const phoneSchema = z.preprocess(
  blankToNull,
  z.string().trim().min(8).max(24).nullable().optional(),
);
/** Chuc danh hien thi — KHONG mang nghia phan quyen nao (CHECK `User_jobTitle_not_blank`). */
const jobTitleSchema = z.preprocess(
  blankToNull,
  z.string().trim().min(1).max(80).nullable().optional(),
);

const permissionGrantSchema = z
  .object({
    permission: z.string().trim().min(1).max(120),
    effect: z.enum(PERMISSION_EFFECTS),
  })
  .strict();

/** TOAN BO bo quyen rieng sau thay doi (khong phai phan chenh). */
const grantsSchema = z.array(permissionGrantSchema).max(200);

export const loginSchema = z
  .object({ username: usernameSchema, password: z.string().min(1).max(128) })
  .strict();

/**
 * Tao tai khoan (`#395`). `password` TUY CHON (tuong thich man hinh cu): bo trong thi he thong tu
 * sinh mat khau tam. Du co hay khong, tai khoan moi LUON phai doi mat khau o lan dang nhap dau.
 */
export const createUserSchema = z
  .object({
    username: usernameSchema,
    name: z.string().trim().min(1).max(120),
    email: emailSchema,
    phone: phoneSchema,
    jobTitle: jobTitleSchema,
    password: passwordSchema.optional(),
    role: z.enum(USER_ROLES),
    grants: grantsSchema.default([]),
    confirmEscalation: z.boolean().default(false),
  })
  .strict();

/** Sua thong tin hien thi. `username` BAT BIEN — so kiem toan va tach nhiem so theo no. */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: emailSchema,
    phone: phoneSchema,
    jobTitle: jobTitleSchema,
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Không có thông tin nào để sửa',
  });

export const setAccessSchema = z
  .object({
    role: z.enum(USER_ROLES),
    grants: grantsSchema,
    confirmEscalation: z.boolean().default(false),
    dryRun: z.boolean().default(false),
  })
  .strict();

/** Duong CU `PATCH :id/role`: doi vai va XOA moi quyen rieng trong cung mot giao dich. */
export const assignRoleSchema = z
  .object({ role: z.enum(USER_ROLES), confirmEscalation: z.boolean().default(false) })
  .strict();

export const resetPasswordSchema = z.object({ password: passwordSchema.optional() }).strict();

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
  });

export const disableUserSchema = z
  .object({ confirmed: z.literal(true), reason: z.string().trim().max(500).optional() })
  .strict();

export const enableUserSchema = z.object({ confirmed: z.literal(true) }).strict();

export const ACCOUNT_STATUS_FILTERS = ['active', 'disabled', 'pending'] as const;

export const listUsersQuerySchema = z
  .object({
    q: z.preprocess(blankToNull, z.string().trim().max(100).nullable().optional()),
    status: z.preprocess(blankToNull, z.enum(ACCOUNT_STATUS_FILTERS).nullable().optional()),
    role: z.preprocess(blankToNull, z.enum(USER_ROLES).nullable().optional()),
  })
  .strip();

export const suggestUsernameSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    /** Tien to do man hinh chon (vd `lx.` cho lai xe) — chi chu thuong, so, `.`, `-`, `_`. */
    prefix: z
      .string()
      .trim()
      .max(16)
      .regex(/^[a-z0-9][a-z0-9._-]*$/, 'Tiền tố không hợp lệ')
      .optional(),
  })
  .strict();

export const historyQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
  .strip();

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.input<typeof createUserSchema>;
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
export type SetAccessInput = z.input<typeof setAccessSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type AssignRoleInput = z.input<typeof assignRoleSchema>;
export type DisableUserInput = z.input<typeof disableUserSchema>;
export type EnableUserInput = z.input<typeof enableUserSchema>;
export type ListUsersQuery = z.input<typeof listUsersQuerySchema>;
export type SuggestUsernameInput = z.input<typeof suggestUsernameSchema>;
export type HistoryQuery = z.input<typeof historyQuerySchema>;
export type AccountStatusFilter = (typeof ACCOUNT_STATUS_FILTERS)[number];
