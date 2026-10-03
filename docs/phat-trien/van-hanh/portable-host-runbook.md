# Runbook: dựng stack khách trên máy chủ Ubuntu tự sở hữu

> Đường triển khai **không cần Google Cloud**. Quyết định + số liệu chi phí:
> [portable-deployment-va-chi-phi.md](../../kien-truc/portable-deployment-va-chi-phi.md).
> Task nguồn: Issue #224.

## 0. Điều kiện tối thiểu của một máy chủ khách

| Hạng mục | Yêu cầu | Vì sao |
|---|---|---|
| Hệ điều hành | Ubuntu 22.04 hoặc 24.04 (Debian cũng chạy) | `install-host.sh` chỉ hỗ trợ hai họ này |
| CPU / RAM | **2 vCPU / 4 GB** | Đo được, xem ma trận sizing §1.7 tài liệu kiến trúc |
| Đĩa | **40 GB** trở lên | Dữ liệu nghiệp vụ ~88 MB; phần còn lại là image Docker |
| Quyền | `root` (qua `sudo`) | Cài Docker Engine, tạo `/srv/netviet` |
| Mạng | Ra Internet được | Kho apt của Docker, kho backup offsite, API của LLM |
| Tên miền + DNS | Một bản ghi A trỏ vào IP máy chủ | Caddy xin chứng chỉ TLS qua ACME |
| **Không cần** | `gcloud`, metadata GCE, Secret Manager, GCS, Artifact Registry | Đó chính là điểm của đường này |

## 1. Bootstrap máy chủ

```bash
sudo bash deploy/portable/install-host.sh
```

Cài Docker Engine + Compose plugin (kho chính thức của Docker) và `restic`, tạo cây `/srv/netviet`
với `secrets/` ở quyền `0700`, rồi **kiểm tra `docker.service` đã được bật khi khởi động** — nếu
chưa, script thoát khác 0. Đó là điều kiện để stack tự trở lại sau khi máy chủ reboot.

Script **không** cài Google Ops Agent (khác `deploy/netviet/install-vm.sh`): một máy chủ của khách
không được gửi đo đạc về một project Google mà họ không sở hữu.

## 2. Hợp đồng bí mật — không cần Secret Manager

Mỗi bí mật là **một tệp**, quyền **`0600`**, trong `/srv/netviet/secrets/`.

```bash
umask 077
printf '%s' '<đặt giá trị>' > /srv/netviet/secrets/zalo-<stack>-postgres-admin-password
chmod 0600 /srv/netviet/secrets/zalo-<stack>-postgres-admin-password
```

> **Không** truyền giá trị bí mật trên dòng lệnh của một lệnh khác (`docker run -e KEY=...`,
> `echo <khoá> | ...`): nó hiện trong bảng tiến trình của mọi người dùng trên máy.

`deploy/portable/secret-source.sh` **từ chối đọc** một tệp có quyền lỏng hơn `0600` và nói rõ lệnh
cần chạy để sửa. Một thư mục bí mật ai cũng đọc được sẽ không bao giờ tự lộ ra lúc chạy — stack vẫn
xanh — nên nó phải là lỗi tại chỗ đọc.

Bí mật bắt buộc cho hồ sơ giá thấp (Flowise **off**, parser **deepseek**):

| Tên tệp | Dùng cho |
|---|---|
| `zalo-<stack>-postgres-admin-password` | superuser PostgreSQL |
| `zalo-<stack>-zalo-db-password` | user ứng dụng |
| `zalo-<stack>-deepseek-api-key` | parser |
| `zalo-<stack>-api-key` | API key máy-tới-máy |
| `zalo-<stack>-operator-password` | tài khoản Sale đầu tiên |
| `restic-repo-password` | **mật khẩu kho backup** |
| `restic-repository` | vd `s3:https://<account>.r2.cloudflarestorage.com/<bucket>/<stack>` |
| `restic-s3-access-key-id`, `restic-s3-secret-access-key` | khoá của kho offsite |

Bật Flowise thì cần thêm 8 bí mật `zalo-<stack>-flowise-*`; dùng Claude cho agent tư vấn thì thêm
`zalo-<stack>-anthropic-api-key`.

### Xoay vòng một bí mật

Ghi đè đúng một tệp, `chmod 0600`, chạy lại `render-secrets.sh` rồi `deploy-stack.sh`. Không tệp
nào khác bị đụng tới.

### Chính sách sao lưu bí mật — TÁCH RIÊNG

`.runtime/secrets.env` **có** đi vào kho restic, và điều đó an toàn **chỉ vì** kho được mã hoá phía
client. Nhưng `restic-repo-password` **không được** nằm trong chính kho đó — mất máy chủ là mất luôn
khoá mở kho.

> **Giữ `restic-repo-password` ở ngoài hệ thống**: trình quản lý mật khẩu của chủ sở hữu, hoặc bản
> in cất két. Đây là thứ duy nhất mà mất đi thì mọi bản sao lưu trở thành rác không giải mã được.

### Bàn giao cho khách tự vận hành

Khi khách tự sở hữu máy chủ: chuyển quyền `root`, đưa danh sách tên tệp bí mật (không đưa giá trị
qua kênh không mã hoá), đổi toàn bộ giá trị ngay sau khi bàn giao, và ghi biên bản ai còn giữ
`restic-repo-password`.

## 3. Render cấu hình và dựng stack

```bash
export SECRET_BACKEND=file
export SECRET_DIR=/srv/netviet/secrets
export TENANT_SLUG=<slug> STACK_SLUG=<slug>
export APP_IMAGE=<registry>/<image>:<sha>
export PUBLIC_IP=<ip công khai>
export PROFILE_FLOWISE=off PROFILE_PARSER=deepseek
export MEDIA_STORE=local
echo 'ACME_EMAIL=<email>' > /srv/netviet/edge/.runtime/caddy.env

cd /srv/netviet/apps/zalo-<slug>
bash ./render-secrets.sh
bash ./deploy-stack.sh
```

`SECRET_BACKEND=file` là điểm cắm duy nhất phải đổi so với đường GCP. `deploy/netviet/deploy-stack.sh`
(735 dòng logic rollout) **không cần sửa một dòng nào** — nó vốn không nhắc tới GCP.

### Không có registry thì nạp image bằng tệp tar

```bash
docker save <image>:<sha> | gzip > image.tgz
```

```bash
gunzip -c image.tgz | docker load
```

## 4. Sao lưu offsite

```bash
sudo STACK_SLUG=<slug> bash deploy/portable/backup.sh
```

- `pg_dump --format=custom` rót **thẳng** vào `restic backup --stdin` — bản dump không bao giờ chạm
  đĩa ở dạng chưa mã hoá.
- Kho phải là `s3:`/`b2:`/`sftp:`/`rest:`/… — script **từ chối** một đường dẫn cục bộ, vì đó không
  phải offsite (đặt `ALLOW_LOCAL_REPO=1` chỉ khi đang diễn tập).
- Giữ **7 daily / 4 weekly / 3 monthly**, phân nhóm bằng `--group-by host,tags` để các loại
  (`db-zalo`, `db-flowise`, `files`, `media`) **không chia nhau một cửa sổ**.
- Kết quả ghi vào `.runtime/backup-status` và `logger`, khác 0 khi hỏng.

Bật hàng ngày bằng systemd timer (mẫu ở `deploy/netviet/systemd/netviet-backup@.{service,timer}`,
đổi `ExecStart` sang `deploy/portable/backup.sh`).

### Quan sát tình trạng backup

```bash
cat /srv/netviet/apps/zalo-<slug>/.runtime/backup-status
```

```bash
journalctl -t netviet-backup --since '2 days ago'
```

## 5. Kho ảnh: `local` hay `s3`

| Hồ sơ | Đặt | Ghi chú |
|---|---|---|
| Giá thấp, một máy chủ | `MEDIA_STORE=local` | Ảnh nằm trong volume `media-data`, được `backup.sh` đưa vào kho dưới nhãn `kind:media` |
| Có object storage | `MEDIA_STORE=s3` + `MEDIA_ENDPOINT`/`MEDIA_BUCKET` + hai khoá | Bất kỳ S3-compatible: Backblaze B2, Cloudflare R2, OVHcloud… |
| GCP | `MEDIA_STORE=gcs` + `MEDIA_BUCKET` | Xác thực bằng ADC |

Rủi ro của `local`, nói thẳng: **đĩa của một máy chủ đơn không có dự phòng**. Chấp nhận được **chỉ
khi** backup offsite chạy và đã diễn tập phục hồi. Đổi `local → s3` về sau **không phải viết lại
nghiệp vụ**: `MediaStore` là một cổng, đổi kho là đổi biến môi trường.

Không dựng MinIO một node trên chính máy chủ đó: nó thêm RAM và độ phức tạp mà **không** thêm một
miền sự cố nào — đĩa vẫn là đĩa đó.

## 6. Diễn tập phục hồi — chạy định kỳ, không đợi sự cố

```bash
sudo bash deploy/portable/restore.sh <slug>
```

Kiểm toàn vẹn kho (`restic check --read-data-subset=5%`), kéo snapshot `kind:db-zalo` về, dựng
**một PostgreSQL mới tinh với volume riêng** tên `restoredrill-<slug>`, nạp dump, rồi đếm dữ liệu
nghiệp vụ. Container và volume diễn tập bị xoá khi xong.

Script **từ chối** ghi vào compose project của stack đang chạy. Cách nhanh nhất để mất dữ liệu thật
là diễn tập phục hồi lên chính CSDL đang phục vụ.

**Nhịp đề nghị:** mỗi tháng một lần, và **bắt buộc** sau mỗi lần đổi phiên bản PostgreSQL hoặc đổi
nhà cung cấp kho.

## 7. Khôi phục thật khi máy chủ chính đã chết

1. Dựng máy chủ mới → §1.
2. Khôi phục thư mục bí mật từ nơi cất ngoài hệ thống (§2).
3. `restic restore latest --tag "stack:<slug>,kind:files" --target /` → lấy lại `.runtime`,
   `tenant-pack`, `catalog-assets`.
4. `deploy-stack.sh` để dựng stack rỗng, rồi nạp dump `kind:db-zalo` vào `zalo`.
5. `restic restore latest --tag "stack:<slug>,kind:media"` → giải nén `media.tar.gz` vào volume ảnh.
6. Trỏ DNS sang IP mới.

**RTO đo được:** phần CSDL **13 giây**. Phần còn lại (dựng máy chủ, cài Docker, kéo image) chi phối
tổng thời gian — dự kiến **45–90 phút** nếu image đã có sẵn dạng tar, và đây là **ước lượng**, chưa
đo đầu-cuối trên máy chủ thật.

**RPO:** bằng chu kỳ timer — **≤24 giờ** với nhịp hằng ngày. Muốn đạt mục tiêu ≤6 giờ cho CSDL thì
chạy timer 4 lần/ngày; khối lượng đo được (dump ~285 KB) khiến chi phí gần như bằng không.

---

# Runbook chuyển Ultty khỏi GCP — **CHƯA THỰC HIỆN**

> ⛔ **Chưa có phê duyệt cutover.** Phần này là kế hoạch để chủ sở hữu duyệt sau khi ChatGPT review
> Final Evidence của #224. Không chạy bước nào trong đây nếu chưa có phê duyệt tường minh.

## H.1 Tiền kiểm

- [ ] Chọn nhà cung cấp và mở máy chủ (khuyến nghị: **Long Vân C2** — hỏi trước hai câu ở
      §4 của tài liệu kiến trúc: VAT đã gồm chưa, và 285.000 ₫ có mua theo tháng được không.
      Không thoả đáng thì lấy **iNET Turbo Cloud Server 4**).
- [ ] Mở tài khoản kho offsite ở **nhà cung cấp khác** (khuyến nghị: **Cloudflare R2** — egress
      $0 và có hiện diện gần Việt Nam; Backblaze B2 rẻ hơn nhưng **không có vùng APAC**, nên
      restore là xuyên Thái Bình Dương).
- [ ] Chạy `install-host.sh`, dựng stack **rỗng**, `restore.sh` **đạt** trên máy chủ mới.
- [ ] Đối chiếu phiên bản PostgreSQL nguồn và đích (hiện tại `postgres:16-alpine`).
- [ ] Xác nhận `pricePeriod.validMonth` của tháng cutover đang `active` — sang tháng mới mà chưa gia
      hạn kỳ giá thì mọi SKU về 0 đ.
- [ ] Xác nhận `AUTO_SEND`, `CHANNEL_MODE`, `AUTH_MODE` mong muốn cho lần chạy đầu.

## H.2 DNS

Hạ TTL của bản ghi Ultty xuống **300 giây**, **ít nhất 24 giờ trước** cutover. Không hạ TTL vào
đúng ngày cutover — bản ghi cũ vẫn nằm trong cache của ISP theo TTL cũ.

## H.3 Sao lưu đầy đủ + checksum

Chạy `backup.sh` trên VM GCP, ghi lại ID snapshot và `restic check` phải xanh. Đây là điểm quay lui.

## H.4 Cửa sổ ngừng dịch vụ

1. Thông báo Sale; dừng listener Zalo (`CHANNEL_MODE=mock`) để không nhận thêm tin.
2. `docker compose stop api web` trên VM cũ.
3. `pg_dump` lần cuối → chuyển sang máy chủ mới.
4. `pg_restore` vào máy chủ mới; đối chiếu `count(*)` từng bảng nghiệp vụ giữa hai bên.
5. Chuyển ảnh: đồng bộ từ bucket cũ → kho ảnh mới, đối chiếu số object.

**Ước lượng downtime:** **20–40 phút**, chi phối bởi thao tác thủ công và đối chiếu, không phải
kích thước dữ liệu (dump 285 KB, ảnh 2,4 MB / 9 object — đo 07/09/2026). Đây là **ước lượng**, chưa
diễn tập đầu-cuối.

**RPO của lần cutover:** **0** nếu làm đúng thứ tự (dừng ghi trước khi dump cuối).

## H.5 Bàn giao bí mật

Sinh **giá trị mới** cho mọi bí mật trên máy chủ mới — không bê nguyên giá trị cũ sang. Ngoại lệ
bắt buộc: `DEEPSEEK_API_KEY` và `ZALO_*` (khoá của bên thứ ba, phải giữ nguyên hoặc xoay vòng ở
chính nhà cung cấp đó).

## H.6 Smoke / UAT trước khi chuyển DNS

- [ ] `/health` xanh; đăng nhập được bằng tài khoản Sale thật.
- [ ] Danh mục, giá, đại lý, map nhóm hiển thị đúng.
- [ ] Một tin đặt hàng mẫu đi hết pipeline (chế độ `mock`).
- [ ] Ảnh catalog tải được qua `PUBLIC_BASE_URL`.
- [ ] Timer backup chạy và `restore.sh` đạt **trên máy chủ mới**.

## H.7 Chuyển DNS và theo dõi

Trỏ A record sang IP mới. Theo dõi 60 phút: `/health`, log `api`, hàng việc của Sale.

## H.8 Quay lui

Trỏ DNS về IP cũ và bật lại `api`/`web` trên VM GCP. **Giữ VM GCP chạy nguyên trạng suốt cửa sổ
quay lui** — đó là lý do bước H.4 chỉ `stop`, không `down -v`.

## H.9 Giữ GCP bao lâu, và khi nào được xoá

| Mốc | Hành động |
|---|---|
| 0 → 14 ngày | Giữ VM GCP **chạy**, `api`/`web` dừng. Backup mới chạy trên máy chủ mới |
| 14 → 30 ngày | Dừng VM (giữ đĩa). Giữ bucket backup |
| Sau 30 ngày | Xoá VM + đĩa **chỉ khi** đủ ba điều kiện dưới |

Điều kiện xoá tài nguyên GCP:
1. Máy chủ mới chạy ổn định ≥30 ngày, không sự cố dữ liệu.
2. Đã có **ít nhất 2 lần `restore.sh` đạt** từ kho offsite mới.
3. Chủ sở hữu phê duyệt xoá **bằng văn bản**.

Bucket backup GCS: **giữ thêm ít nhất 90 ngày** sau khi xoá VM.

## H.10 Dữ liệu KHÔNG được chép nếu chưa có uỷ quyền

- Ảnh khách gửi vào (có PII) — cần xác nhận của khách rằng chuyển sang nhà cung cấp mới là được
  phép, theo Luật BVDLCN 91/2025/QH15 + NĐ 356/2025.
- Phiên đăng nhập Zalo (`secrets/zalo-cred.json`) — thuộc tài khoản cá nhân; xác nhận với người sở
  hữu tài khoản trước khi chuyển.
- Log/trace lịch sử trong ClickHouse — **không** thuộc phạm vi chuyển đổi này.
