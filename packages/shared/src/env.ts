import { z } from 'zod';

// Credential MAC DINH cho AdminJS o local. Khai bao thanh hang so de loadEnv co the CHAN
// dung lai chinh chung o production (khong doan chuoi, khong lap lai literal o hai noi).
const DEV_ADMIN_PASSWORD = 'netviet-admin';
const DEV_ADMIN_COOKIE_SECRET = 'netviet-admin-dev-cookie-secret-doi-o-production';
// Do dai toi thieu cho credential AdminJS o production (panel /admin sua duoc gia + map nhom).
const MIN_ADMIN_PASSWORD_LENGTH = 16;
const MIN_ADMIN_COOKIE_SECRET_LENGTH = 32;

/**
 * CSV ten dang nhap → danh sach da chuan hoa (bo khoang trang, chu thuong, bo rong, bo trung).
 * Chu thuong vi `AuthService` luu ten dang nhap o dang chu thuong — so khop phai cung mot dang.
 */
export function parseUsernameList(value: string): readonly string[] {
  const names = value
    .split(',')
    .map((name) => name.trim().toLocaleLowerCase('en-US'))
    .filter((name) => name.length > 0);
  return [...new Set(names)];
}

/**
 * Schema bien moi truong dung chung cho toan he thong.
 * Nguyen tac (CLAUDE.md - Luu y bao mat): khong hardcode secret,
 * validate ngay khi khoi dong, fail fast voi thong bao ro rang.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://netviet:netviet_local@localhost:5432/netviet'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  // Lop luu tru don/tin: memory (in-memory, MAC DINH — demo/CI khong can DB) | prisma (Postgres).
  // Tach RIENG khoi DATABASE_URL (vi .env da co URL cho docker) -> bat Prisma phai CHU DONG dat = prisma.
  PERSISTENCE: z.enum(['memory', 'prisma']).default('memory'),
  // Khoa xac thuc API (header `x-api-key`). BO TRONG -> guard MO (demo/CI/HF chay nhu cu).
  // DAT GIA TRI -> MOI route deu can key, tru route gan @Public (vd /health).
  // NODE_ENV=production BAT BUOC co (xem superRefine ben duoi): API nay co /broadcast gui tin
  // Zalo THAT toi nhieu nhom + /knowledge lo bang gia — khong duoc phoi ra Internet khi khong khoa.
  // Luu y: app web goi API tu TRINH DUYET (NEXT_PUBLIC_API_URL) nen KHONG dat key vao bien
  // NEXT_PUBLIC_* (se lo cho moi nguoi). Production: cho web goi qua proxy phia server, hoac cho
  // toi khi co dang nhap nguoi dung that (quyet dinh D5).
  API_KEY: z.string().min(16, 'API_KEY qua ngan — dung chuoi ngau nhien >= 16 ky tu').optional(),
  // CONG TAC XAC THUC TOAN HE THONG (mot bien duy nhat, de bat lai):
  //   api-key = MAC DINH. Guard toan cuc theo header `x-api-key` khi API_KEY co gia tri,
  //             kiem Origin cho mutation, CORS bo theo CORS_ORIGIN, AdminJS doi dang nhap.
  //   session = dang nhap nguoi dung bang cookie HttpOnly + RBAC. Production/customer luu phien
  //             trong Postgres qua Prisma, khong dung MemoryStore.
  //   none    = TAT TOAN BO xac thuc cua ung dung: khong x-api-key, khong kiem Origin,
  //             CORS mo, AdminJS khong doi dang nhap. Caddy cung bo Basic Auth (xem Caddyfile).
  // `none` la QUYET DINH VAN HANH cho VM dev/demo (yeu cau nguoi dung 04/08/2026) — doi lai
  // he thong luon truy cap duoc khong can mat khau. CHI dung khi nhom/du lieu la TEST, khong PII
  // that: bat ky ai biet URL deu doc duoc bang gia/don va goi duoc /broadcast (gui tin Zalo THAT).
  // Truoc khi chay du lieu khach: dat lai AUTH_MODE=api-key + API_KEY va bat lai Basic Auth.
  AUTH_MODE: z.enum(['api-key', 'session', 'none']).default('api-key'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET qua ngan — dung chuoi ngau nhien >= 32 ky tu')
    .optional(),
  SESSION_COOKIE_NAME: z.string().trim().min(1).max(64).default('netviet.sid'),
  SESSION_MAX_AGE_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(8 * 60 * 60 * 1_000),
  // TAI KHOAN HE THONG (#395), CSV ten dang nhap — vd tai khoan van hanh ma `bootstrap-auth-user.mjs`
  // tao va moi lan smoke dang nhap. Man hinh quan tri KHONG khoa / ha vai / doi quyen / dat lai mat
  // khau duoc cac tai khoan nay (ly do `PROTECTED_SERVICE_ACCOUNT`): lam vay se lam lan trien khai
  // SAU chet o buoc bootstrap. De rong = khong tai khoan nao duoc bao ve. Deploy GCP truyen
  // `PILOT_OPERATOR_USERNAME` vao day (`deploy/netviet/compose.yaml`, service `api`).
  PROTECTED_ACCOUNT_USERNAMES: z
    .string()
    .default('')
    .transform((value) => parseUsernameList(value)),
  // De trong duoc o local; cac module dung den (parser, bot) tu kiem tra khi bat.
  ANTHROPIC_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  // Flowise chi la adapter parser noi bo. Khi PARSER_MODE=flowise, ca ba bien duoi BAT BUOC
  // co; loadEnv fail-fast de production khong am tham roi ve MockParser.
  FLOWISE_BASE_URL: z.string().url().optional(),
  FLOWISE_FLOW_ID: z.string().min(1).optional(),
  FLOWISE_API_KEY: z.string().min(1).optional(),
  FLOWISE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  // Bao cao bake-off golden set do tenant mount vao runtime. Optional; readiness layer tu doc/validate.
  GOLDEN_EVAL_REPORT_PATH: z.string().trim().min(1).optional(),
  ZALO_BOT_TOKEN: z.string().optional(),
  ZALO_BOT_WEBHOOK_SECRET: z.string().optional(),
  /**
   * Che do parser: claude | deepseek truc tiep | flowise (Agentflow V2 noi bo).
   *
   * KHONG con `mock` (18/08/2026). Truoc do `mock` vua la mot lua chon hop le vua la MAC DINH,
   * nen mot stack quen dat bien nay se chay parser GIA (khop mau, khong goi LLM) tren du lieu
   * that: moi don deu sai, khong log loi, khong ai biet. Parser gia gio nam trong `__tests__/`
   * va chi den duoc bang cach test tu dung no.
   *
   * Mac dinh `deepseek` de khop cau hinh pilot; van phai co DEEPSEEK_API_KEY (fail-fast duoi).
   */
  PARSER_MODE: z.enum(['claude', 'deepseek', 'flowise']).default('deepseek'),
  /**
   * Ban soan tu van (AdviceComposer): LLM viet lai cau tra loi tu van tu cac manh FAQ DA DUYET,
   * thay cho viec noi nguyen van. `off` = giu ban noi FAQ nhu truoc 15/08/2026.
   *
   * Vi sao la cong tac RIENG chu khong bam theo PARSER_MODE: pilot dang chay `PARSER_MODE=flowise`
   * (Agentflow NOI BO). Bat ban soan Claude o do la them MOT NGUOI NHAN DU LIEU moi vao luong —
   * Claude nam trong danh sach ben thu 3 duoc duyet (CLAUDE.md), nhung viec them phai la mot quyet
   * dinh CO Y CUA NGUOI VAN HANH, khong phai he qua phu cua viec chon parser. Mac dinh `off`.
   */
  ADVICE_COMPOSER: z.enum(['off', 'claude', 'deepseek']).default('off'),
  /**
   * Model cho AGENT TU VAN khi `ADVICE_COMPOSER=deepseek`. Tach khoi `DEEPSEEK_MODEL` (parser) vi
   * hai viec khac do kho: parser trich xuat co rang buoc, agent tu van VIET CAU cho khach doc va
   * phai goi cong cu nhieu vong.
   */
  ADVICE_DEEPSEEK_MODEL: z.string().trim().min(1).default('deepseek-v4-flash'),
  /**
   * Model cho tung viec. Truoc 18/08/2026 hai gia tri nay hardcode `claude-haiku-4-5` ngay
   * trong ma nguon — vua khong doi duoc khi chay, vua la nguyen nhan truc tiep cua "AI tra loi
   * kem thong minh": ca hai cho RA QUYET DINH NGON NGU deu chay model re nhat.
   *
   * Chia viec theo dung do kho:
   *   PARSER_MODEL = trich xuat co rang buoc trong tu dien dong (tool use ep JSON) -> Sonnet 5.
   *   ADVICE_MODEL = viet cau cho KHACH doc -> Opus 5. Day la chu khach that su nhin thay.
   *
   * De bien moi truong (khong phai hang so) chinh la duong dao nguoc tuc thi neu chi phi vuot
   * du kien: doi mot dong .env va restart, khong can build lai.
   */
  PARSER_MODEL: z.string().trim().min(1).default('claude-sonnet-5'),
  ADVICE_MODEL: z.string().trim().min(1).default('claude-opus-5'),
  /** Model khi PARSER_MODE=deepseek. Xem ghi chu nang luc trong deepseek-parser.ts. */
  DEEPSEEK_MODEL: z.string().trim().min(1).default('deepseek-v4-flash'),
  /**
   * DOC ANH PHIEU DO DAU (Lane C / C3) — mot cong tac RIENG, khong bam theo `PARSER_MODE`.
   *
   * Cung ly le voi `ADVICE_COMPOSER`, va o day con nang hon: mot buc anh phieu do dau la du lieu
   * VAN HANH cua khach (bien so, dia diem, thoi diem). Gui no ra mot dich vu ngoai phai la mot
   * quyet dinh CO Y cua nguoi van hanh, khong phai he qua phu cua viec da chon mot parser don hang.
   *
   * `stub` (mac dinh) KHONG doc anh va KHONG goi ra ngoai — no sinh mot ket qua tat dinh tu bam
   * byte. Mac dinh nay la co y: mot stack quen dat bien se KHONG lang le gui anh cua khach di dau.
   * `http` goi mot diem cuoi tuong thich OpenAI do `FUEL_EXTRACTION_BASE_URL` chi ra — co the la
   * mot mo hinh TU DUNG trong chinh mang cua khach, va khi do khong byte nao roi khoi mang do.
   */
  FUEL_EXTRACTION_MODE: z.enum(['stub', 'http']).default('stub'),
  FUEL_EXTRACTION_BASE_URL: z.string().url().optional(),
  FUEL_EXTRACTION_MODEL: z.string().trim().min(1).optional(),
  /** Bo trong cho mot mo hinh tu dung khong doi xac thuc. */
  FUEL_EXTRACTION_API_KEY: z.string().trim().min(1).optional(),
  /** Doc mot buc anh cham hon doc mot dong chu; 60s la mot lan cho co that, khong phai mot treo. */
  FUEL_EXTRACTION_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(60_000),
  /**
   * Thu muc chua ANH/VIDEO CATALOG SAN PHAM, phuc vu qua route cong khai `/media/catalog/*`.
   *
   * TACH HAN khoi `MEDIA_*` co chu y — hai loai du lieu nay khac han nhau ve ban chat:
   *   MEDIA_*     = anh KHACH gui vao. PII (CCCD, dia chi), bucket PHAI private, thuoc ho so D22.
   *   CATALOG_DIR = anh san pham cong ty phat hanh. Tai lieu tiep thi, PHAI cong khai de Zalo fetch.
   * De chung mot kho nghia la mot loi cau hinh duy nhat co the phat PII ra Internet. Tach thanh hai
   * duong rieng thi dieu do khong the xay ra ke ca khi cau hinh sai.
   */
  CATALOG_DIR: z.string().default('./catalog-assets'),
  /** Goc URL cong khai cua API — de sinh locator tuyet doi cho Zalo di tai anh ve. */
  PUBLIC_BASE_URL: z.string().url().optional(),
  // Phan loai du lieu dang chay:
  //   test     = mock/demo/dev, khong PII that; cho phep parser/kho/media mock de lap trinh nhanh.
  //   customer = du lieu khach hang that; bat readiness gate ben duoi de fail-fast neu cau hinh
  //              con duong demo/test (mock parser, DeepSeek, memory DB, khong auth, khong luu media).
  DATA_CLASSIFICATION: z.enum(['test', 'customer']).default('test'),
  // KENH ZALO — nguon su that DUY NHAT chon kenh doc/gui tin:
  //   mock  = offline (demo qua /demo/simulate) — mac dinh, khong can dang nhap Zalo.
  //   bot   = Zalo Bot Platform chinh thuc (can ZALO_BOT_TOKEN) — CHI nhan tin @mention.
  //   zca   = thu vien ngoai zca-js (userbot tai khoan ca nhan) — doc MOI tin nhom, khong can tag.
  // Luu y: zca vi pham ToS Zalo, co the bi khoa tai khoan -> dung TAI KHOAN PHU + can van ban
  // chap nhan rui ro cua khach (xem CLAUDE.md muc "Kenh Zalo").
  CHANNEL_MODE: z.enum(['mock', 'bot', 'zca', 'hybrid']).default('mock'),
  // Bat/tat worker doc tin Zalo Bot (Bot Platform). GIU cho tuong thich nguoc: neu CHANNEL_MODE
  // khong dat nhung BOT_MODE=on thi loadEnv suy ra CHANNEL_MODE='bot'. Mac dinh off.
  BOT_MODE: z.enum(['on', 'off']).default('off'),
  // Duong dan file luu PHIEN dang nhap zca-js (cookie + imei + userAgent) sau khi quet QR lan dau,
  // de cac lan sau tu dang nhap lai khong can quet. Cred = session token -> bao mat nhu secret,
  // KHONG commit (da gitignore thu muc secrets/).
  ZALO_CRED_PATH: z.string().default('./secrets/zalo-cred.json'),
  // Allowlist nhom duoc phep dua vao LLM. File nay duoc cap nhat tu trang van hanh Zalo;
  // mac dinh rong = nghe socket nhung KHONG xu ly bat ky nhom nao.
  ZALO_ALLOWED_GROUPS_PATH: z.string().default('./secrets/zalo-allowed-groups.json'),
  // Origin HTTPS cua trang operator. Dung de chong CSRF cho cac mutation QR/allowlist.
  ZALO_OPERATOR_ORIGIN: z.string().url().optional(),
  // Nghe ca tin do CHINH tai khoan zca gui (message.isSelf). Mac dinh off de tranh vong lap
  // (bot gui xac nhan -> lai doc chinh no) + giam nhieu.
  ZALO_SELF_LISTEN: z.enum(['on', 'off']).default('off'),
  // Auto-ack: bot tu nhan "da ghi nhan" khi intent=Khac (LLM khong hieu). Mac dinh off
  // (GD1: AI khong tu tra loi nhom) — chi bat khi khach dong y cho bot nhan tin.
  AUTO_ACK: z.enum(['on', 'off']).default('off'),
  // Auto-send (GD2): AI TU CHOT + gui xac nhan don vao nhom, KHONG can Sale duyet — CHI khi
  // Giam sat khong phat hien rui ro (riskLevel='none'); co van de -> giu Sale duyet. Mac dinh
  // off theo GD1 (CLAUDE.md: AI khong tu gui khi CHUA co van ban dong y cua khach).
  AUTO_SEND: z.enum(['on', 'off']).default('off'),
  // Gom cac tin ngan gui lien tiep cua CUNG nhom + CUNG thanh vien thanh mot luot parse.
  // Tin tho van duoc luu rieng ngay khi nhan; 0 = tat. Cua so ngan de khong tron hai y dinh doc lap.
  MESSAGE_BURST_WINDOW_MS: z.coerce.number().int().nonnegative().max(10_000).default(1_200),
  // Ten bot de boc @mention khoi noi dung tin. KHONG co mac dinh (Dot B1): ten bot la cua tung
  // khach, de mac dinh o day nghia la nhan dung chung mang san ten bot cua MOT khach. Nguon that
  // su la goi khach (`persona.mentionName`); bien nay chi con la duong GHI DE theo moi truong
  // chay — xem apps/api/src/channels/bot-name.ts.
  BOT_NAME: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  // Broadcast (KH2): gian cach giua 2 lan gui de tranh vuot rate-limit Zalo (chua cong bo).
  BROADCAST_THROTTLE_MS: z.coerce.number().int().nonnegative().default(1500),
  // Tran so nhom moi lan gui — chan blast nham vao qua nhieu nhom.
  BROADCAST_MAX_TARGETS: z.coerce.number().int().positive().default(50),
  // Streaming 6 agent qua SSE. on -> frontend dung /events real-time; off -> quay ve polling (luoi an toan demo).
  STREAM_MODE: z.enum(['on', 'off']).default('on'),
  // Gian nhe giua cac buoc rules (tuc thi) cho de nhin. Router van co do tre THAT (LLM). 0 = thuan real.
  STREAM_STEP_DELAY_MS: z.coerce.number().int().nonnegative().default(280),
  // --- Admin panel "Nguon su that" (AdminJS, mount tai /admin) ---
  // Bat/tat panel quan tri nguon su that (Dealer/Group/Product/Price/Glossary/Override).
  // CHI mount khi ADMIN_UI=on VA PERSISTENCE=prisma (AdminJS can Postgres). Mac dinh off ->
  // demo/CI/che do memory KHONG dung toi AdminJS (khong nap thu vien ESM nang o boot).
  // --- Kho luu ANH (Dot A' Task 2) ---
  // Zalo XOA object anh phia server sau <=35 ngay (do that 11/08/2026: HEAD link cua 07/07 -> 404,
  // URL khong co chu ky/`expires` nen khong phai pre-signed). DB chi luu link = 35 ngay nua mat.
  //   none  = MAC DINH: khong tai anh ve (demo/CI offline, khong can bucket).
  //   local = ghi xuong dia — CHI cho dev.
  //   gcs   = Google Cloud Storage bang JSON API + ADC (tai khoan dich vu GAN SAN tren may chu).
  //           KHONG co khoa tinh nao. Dung tren pilot GCP hom nay — xem ghi chu duoi.
  //   s3    = chuan S3: OVHcloud/MinIO, va ca GCS neu co khoa HMAC.
  //
  // Vi sao co CA HAI (13/08/2026): quyet dinh 11/08 chon chuan S3 de doi GCP -> OVHcloud khong phai
  // sua code. Ranh gioi giu duoc dieu do la CONG `MediaStore`, khong phai viec chi co mot hien thuc.
  // Thuc te chan duong S3-tren-GCS: GCS chi ky S3 bang khoa HMAC, ma to chuc dang bat
  // `constraints/iam.disableServiceAccountKeyCreation` nen KHONG tao duoc khoa. Doi lai, ADC dung
  // danh tinh may chu, khong sinh bi mat dai han nao — an toan hon han khoa tinh. `s3` giu nguyen
  // cho OVHcloud; chuyen nha cung cap van chi la doi bien moi truong.
  MEDIA_STORE: z.enum(['none', 'local', 'gcs', 's3']).default('none'),
  MEDIA_BUCKET: z.string().min(1).optional(),
  MEDIA_ENDPOINT: z.string().url().optional(),
  MEDIA_REGION: z.string().default('auto'),
  MEDIA_ACCESS_KEY_ID: z.string().min(1).optional(),
  MEDIA_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  MEDIA_LOCAL_DIR: z.string().default('./tmp/media'),
  /** Diem cuoi JSON API cua GCS. Tach khoi MEDIA_ENDPOINT (cua S3) de hai duong khong lan nhau. */
  MEDIA_GCS_ENDPOINT: z.string().url().default('https://storage.googleapis.com'),
  // Tran byte cho mot anh. Vuot -> huy tai giua chung, ghi mediaError, tin VAN o trong DB.
  MEDIA_MAX_BYTES: z.coerce.number().int().positive().default(15_000_000),
  MEDIA_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  // So luot tai song song (p-limit) — chan bao tai khi nhieu nhom cung gui anh.
  MEDIA_CONCURRENCY: z.coerce.number().int().positive().default(3),
  // Ten mien duoc phep tai anh, CSV. URL anh den TU TIN NHAN = du lieu ben ngoai, nen day la cong
  // chan SSRF: khong de server bi sai di goi dia chi noi bo / metadata may chu dam may.
  // De RONG = chan het (fail closed), khong phai "cho phep tat ca".
  MEDIA_ALLOWED_HOSTS: z.string().default('zdn.vn'),
  ADMIN_UI: z.enum(['on', 'off']).default('off'),
  // Thong tin dang nhap panel. Mac dinh la GIA TRI DEV (khop nguyen tac env.ts: co default de chay
  // local); BAT BUOC dat lai o production (dat ADMIN_PASSWORD/ADMIN_COOKIE_SECRET manh qua env).
  ADMIN_EMAIL: z.string().default('admin@netviet.local'),
  ADMIN_PASSWORD: z.string().default(DEV_ADMIN_PASSWORD),
  // Secret ky cookie phien AdminJS. Default dev — production PHAI thay bang chuoi ngau nhien dai.
  ADMIN_COOKIE_SECRET: z.string().default(DEV_ADMIN_COOKIE_SECRET),
});

export type AppEnv = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Bien moi truong khong hop le:\n- ${issues.join('\n- ')}`);
    this.name = 'EnvValidationError';
  }
}

type ParserMode = AppEnv['PARSER_MODE'];
type ChannelMode = AppEnv['CHANNEL_MODE'];

export interface EnvRuntimeRequirements {
  /** `false` khi composition khong nap capability can parser. Mac dinh giu contract cu. */
  parser?: false | { allowedModes?: readonly ParserMode[] };
  /** `false` khi composition khong nap capability messaging/channel. Mac dinh giu contract cu. */
  channel?: false | { allowedModes?: readonly ChannelMode[] };
}

const DEFAULT_RUNTIME_REQUIREMENTS = { parser: {}, channel: {} } as const;

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
  requirements: EnvRuntimeRequirements = DEFAULT_RUNTIME_REQUIREMENTS,
): AppEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new EnvValidationError(issues);
  }
  const parsedData = result.data;
  // Tuong thich nguoc: chuan hoa truoc khi validate credential. Neu BOT_MODE=on thi do chinh la
  // bot mode va phai qua cung cua ZALO_BOT_TOKEN; khong duoc validate `mock` roi doi thanh `bot`.
  const data =
    source.CHANNEL_MODE === undefined &&
    parsedData.BOT_MODE === 'on' &&
    parsedData.CHANNEL_MODE === 'mock'
      ? { ...parsedData, CHANNEL_MODE: 'bot' as const }
      : parsedData;
  const parserRequired = requirements.parser !== false;
  const channelRequired = requirements.channel !== false;
  const parserRequirement = requirements.parser === false ? undefined : requirements.parser;
  const channelRequirement = requirements.channel === false ? undefined : requirements.channel;

  if (
    parserRequired &&
    parserRequirement?.allowedModes &&
    !parserRequirement.allowedModes.includes(data.PARSER_MODE)
  ) {
    throw new EnvValidationError([
      `PARSER_MODE=${data.PARSER_MODE}: khong nam trong integrations.parser.allowedAdapters cua tenant`,
    ]);
  }
  if (
    channelRequired &&
    channelRequirement?.allowedModes &&
    !channelRequirement.allowedModes.includes(data.CHANNEL_MODE)
  ) {
    throw new EnvValidationError([
      `CHANNEL_MODE=${data.CHANNEL_MODE}: khong nam trong integrations.channel.allowedAdapters cua tenant`,
    ]);
  }
  // Production BAT BUOC co API_KEY. API nay co POST /broadcast (gui tin Zalo THAT toi nhieu nhom
  // khach) va GET /knowledge (bang gia + map nhom -> dai ly) — phoi ra Internet ma khong khoa la
  // su co bao mat, khong phai thieu sot nho. Fail fast luc khoi dong (CLAUDE.md - Luu y bao mat).
  // AUTH_MODE=none = da CHU DONG chon chay khong xac thuc (VM dev/demo). Van la mot lua chon
  // TUONG MINH, greppable — khac han "quen dat API_KEY", nen fail-fast duoi day duoc mien:
  // dieu kien `AUTH_MODE === 'api-key'` da loai san 'none' va 'session'.
  if (data.NODE_ENV === 'production' && data.AUTH_MODE === 'api-key' && !data.API_KEY) {
    throw new EnvValidationError([
      'API_KEY: BAT BUOC khi NODE_ENV=production (API co /broadcast gui tin Zalo that + /knowledge lo bang gia). Moi truong dev/demo khong can khoa thi dat AUTH_MODE=none',
    ]);
  }
  if (data.AUTH_MODE === 'session') {
    const sessionIssues = [
      !data.SESSION_SECRET
        ? 'SESSION_SECRET: BAT BUOC khi AUTH_MODE=session (chuoi ngau nhien >= 32 ky tu)'
        : null,
      data.NODE_ENV === 'production' && data.PERSISTENCE !== 'prisma'
        ? 'PERSISTENCE: production + AUTH_MODE=session bat buoc dung prisma/Postgres, khong dung MemoryStore'
        : null,
    ].filter((issue): issue is string => issue !== null);
    if (sessionIssues.length > 0) throw new EnvValidationError(sessionIssues);
  }
  // `FUEL_EXTRACTION_MODE=http` ma thieu diem cuoi hoac ten mo hinh la mot cau hinh KHONG chay
  // duoc, va no phai do LUC KHOI DONG. Neu de den luc chay, cai hong nay lo ra duoi dang moi buc
  // anh deu `EXTRACTION_UNAVAILABLE` — trong y het mot su co mang, va nguoi truc se di tim mot
  // dich vu khong he ton tai.
  //
  // KHONG rang buoc `FUEL_EXTRACTION_API_KEY`: mot mo hinh tu dung trong mang cua khach thuong
  // khong doi xac thuc, va bat buoc mot khoa rong o do se day nguoi ta di dat mot chuoi gia.
  if (data.FUEL_EXTRACTION_MODE === 'http') {
    const missingExtractionVariables = [
      !data.FUEL_EXTRACTION_BASE_URL
        ? 'FUEL_EXTRACTION_BASE_URL: BAT BUOC khi FUEL_EXTRACTION_MODE=http'
        : null,
      !data.FUEL_EXTRACTION_MODEL
        ? 'FUEL_EXTRACTION_MODEL: BAT BUOC khi FUEL_EXTRACTION_MODE=http'
        : null,
    ].filter((issue): issue is string => issue !== null);
    if (missingExtractionVariables.length > 0) {
      throw new EnvValidationError(missingExtractionVariables);
    }
  }
  if (parserRequired && data.PARSER_MODE === 'flowise') {
    const missingFlowiseVariables = [
      !data.FLOWISE_BASE_URL ? 'FLOWISE_BASE_URL: BAT BUOC khi PARSER_MODE=flowise' : null,
      !data.FLOWISE_FLOW_ID ? 'FLOWISE_FLOW_ID: BAT BUOC khi PARSER_MODE=flowise' : null,
      !data.FLOWISE_API_KEY ? 'FLOWISE_API_KEY: BAT BUOC khi PARSER_MODE=flowise' : null,
    ].filter((issue): issue is string => issue !== null);
    if (missingFlowiseVariables.length > 0) {
      throw new EnvValidationError(missingFlowiseVariables);
    }
  }
  if (parserRequired && data.PARSER_MODE === 'claude' && !data.ANTHROPIC_API_KEY) {
    throw new EnvValidationError([
      'ANTHROPIC_API_KEY: BAT BUOC khi PARSER_MODE=claude; khong duoc roi ve parser gia',
    ]);
  }
  // Cung ly do voi nhanh claude o tren: khong co khoa thi parser.provider am tham tra ve
  // MockParser — production se chay parser TAT DINH ma khong ai biet, moi don deu sai.
  // Truoc 18/08/2026 nhanh nay thieu; no thanh ra dang khi deepseek tro thanh parser mac dinh.
  if (parserRequired && data.PARSER_MODE === 'deepseek' && !data.DEEPSEEK_API_KEY) {
    throw new EnvValidationError([
      'DEEPSEEK_API_KEY: BAT BUOC khi PARSER_MODE=deepseek; khong duoc roi ve parser gia',
    ]);
  }
  if (data.DATA_CLASSIFICATION === 'customer') {
    const customerReadinessIssues = [
      parserRequired && data.PARSER_MODE !== 'claude'
        ? 'PARSER_MODE: du lieu khach that bat buoc dung claude (LLM duoc phe duyet), khong dung deepseek/flowise'
        : null,
      parserRequired && !data.ANTHROPIC_API_KEY
        ? 'ANTHROPIC_API_KEY: BAT BUOC khi DATA_CLASSIFICATION=customer'
        : null,
      data.PERSISTENCE !== 'prisma'
        ? 'PERSISTENCE: du lieu khach that bat buoc dung prisma/Postgres, khong dung memory'
        : null,
      data.AUTH_MODE === 'none' ? 'AUTH_MODE: du lieu khach that khong duoc tat xac thuc' : null,
      channelRequired && data.CHANNEL_MODE !== 'mock' && data.MEDIA_STORE === 'none'
        ? 'MEDIA_STORE: du lieu khach that + kenh Zalo that bat buoc dung local/gcs/s3, khong duoc none'
        : null,
    ].filter((issue): issue is string => issue !== null);
    if (customerReadinessIssues.length > 0) {
      throw new EnvValidationError(customerReadinessIssues);
    }
  }
  // MEDIA_STORE=s3 ma thieu cau hinh -> FAIL FAST. Neu am tham quay ve "khong luu" thi anh moi
  // ngay bi vut ma khong ai biet, va khong hoi to duoc (Zalo xoa object sau <=35 ngay).
  if (data.MEDIA_STORE === 's3') {
    const missingMediaVariables = [
      !data.MEDIA_BUCKET ? 'MEDIA_BUCKET: BAT BUOC khi MEDIA_STORE=s3' : null,
      !data.MEDIA_ENDPOINT ? 'MEDIA_ENDPOINT: BAT BUOC khi MEDIA_STORE=s3' : null,
      !data.MEDIA_ACCESS_KEY_ID ? 'MEDIA_ACCESS_KEY_ID: BAT BUOC khi MEDIA_STORE=s3' : null,
      !data.MEDIA_SECRET_ACCESS_KEY ? 'MEDIA_SECRET_ACCESS_KEY: BAT BUOC khi MEDIA_STORE=s3' : null,
    ].filter((issue): issue is string => issue !== null);
    if (missingMediaVariables.length > 0) {
      throw new EnvValidationError(missingMediaVariables);
    }
  }
  // `gcs` chi can bucket: danh tinh den tu tai khoan dich vu gan san (ADC), khong co khoa de dat.
  // Thieu quyen thi lo ra o `MediaStore.check()` chu khong phai o day — env khong biet IAM.
  if (data.MEDIA_STORE === 'gcs' && !data.MEDIA_BUCKET) {
    throw new EnvValidationError(['MEDIA_BUCKET: BAT BUOC khi MEDIA_STORE=gcs']);
  }
  if (
    channelRequired &&
    (data.CHANNEL_MODE === 'bot' || data.CHANNEL_MODE === 'hybrid') &&
    !data.ZALO_BOT_TOKEN
  ) {
    throw new EnvValidationError([
      `ZALO_BOT_TOKEN: BAT BUOC khi CHANNEL_MODE=${data.CHANNEL_MODE}; khong duoc roi ve kenh gia`,
    ]);
  }
  if (
    channelRequired &&
    data.NODE_ENV === 'production' &&
    (data.CHANNEL_MODE === 'zca' || data.CHANNEL_MODE === 'hybrid')
  ) {
    const operatorUrl = data.ZALO_OPERATOR_ORIGIN ? new URL(data.ZALO_OPERATOR_ORIGIN) : null;
    if (!operatorUrl || operatorUrl.protocol !== 'https:') {
      throw new EnvValidationError([
        'ZALO_OPERATOR_ORIGIN: BAT BUOC va phai dung HTTPS khi production + CHANNEL_MODE=zca|hybrid',
      ]);
    }
  }
  // Panel /admin sua duoc bang gia, map nhom -> dai ly va chinh sach. Bat o production bang
  // credential dev (hoac chuoi ngan) = giao quyen ghi nguon su that cho bat ky ai doc repo.
  if (data.NODE_ENV === 'production' && data.ADMIN_UI === 'on' && data.AUTH_MODE === 'api-key') {
    const weakAdminCredentials = [
      data.ADMIN_PASSWORD === DEV_ADMIN_PASSWORD
        ? 'ADMIN_PASSWORD: dang dung gia tri MAC DINH dev — bat buoc doi khi ADMIN_UI=on o production'
        : null,
      data.ADMIN_PASSWORD.length < MIN_ADMIN_PASSWORD_LENGTH
        ? `ADMIN_PASSWORD: qua ngan — can >= ${MIN_ADMIN_PASSWORD_LENGTH} ky tu khi ADMIN_UI=on o production`
        : null,
      data.ADMIN_COOKIE_SECRET === DEV_ADMIN_COOKIE_SECRET
        ? 'ADMIN_COOKIE_SECRET: dang dung gia tri MAC DINH dev — bat buoc doi khi ADMIN_UI=on o production'
        : null,
      data.ADMIN_COOKIE_SECRET.length < MIN_ADMIN_COOKIE_SECRET_LENGTH
        ? `ADMIN_COOKIE_SECRET: qua ngan — can >= ${MIN_ADMIN_COOKIE_SECRET_LENGTH} ky tu khi ADMIN_UI=on o production`
        : null,
    ].filter((issue): issue is string => issue !== null);
    if (weakAdminCredentials.length > 0) {
      throw new EnvValidationError(weakAdminCredentials);
    }
  }
  return data;
}
