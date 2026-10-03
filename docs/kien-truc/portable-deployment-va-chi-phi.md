# Triển khai portable & chi phí hạ tầng cho một khách

> Quyết định kiến trúc + mô hình chi phí, dựng từ **đo đạc thật** trên VM đang chạy và **giá đọc
> từ trang chính thức của nhà cung cấp**, ngày **07/09/2026**. Task nguồn: Issue #224.
>
> Anchor: `main` tại `00b18a01e763ae987c1f3a14a3d7d9931026219f` (đã re-measure, khớp issue).

## 0. Tóm tắt cho người quyết định

| Câu hỏi | Trả lời đo được |
|---|---|
| Ultty thật sự cần bao nhiêu? | **0,06 vCPU trung bình**, **RAM đỉnh 1,55 GB** (có Flowise) / **0,55 GB** (không Flowise), **~88 MB** dữ liệu nghiệp vụ |
| 4 GB có đủ không? | **Có**, dư ~1,85 GB kể cả khi giữ Flowise |
| 8 GB có cần không? | **Không**, cho riêng Ultty |
| Có phương án ≤500k/tháng không? | **Có, ba phương án** — rẻ nhất **285.000–313.500 ₫**/tháng all-in, xem §4 |
| Backup offsite tốn bao nhiêu? | 10 GB **0 ₫** · 50 GB **7.297 ₫** · 100 GB **16.419 ₫** (B2); R2 **0 / 15.750 / 35.438 ₫** |
| Restore từ số 0 mất bao lâu? | **13 giây** cho CSDL (đo thật, §5) |
| Deploy được không cần GCP? | **Được** — đã boot full stack trên Ubuntu 24.04 sạch, §5 |

---

## 1. Đo thật trên VM đang chạy — chỉ stack Ultty

Nguồn số: cgroup v2 (`memory.peak`, `cpu.stat`) đọc trực tiếp trên VM `netviet`
(`asia-southeast1-b`, `e2-standard-2`). Đây là **bộ đếm tích luỹ từ lúc container khởi động**, tức
lịch sử thật 17–25 ngày, **không phải một cửa sổ lấy mẫu ngắn**.

### 1.1 Stack `zalo-ultty` (production)

| Container | Uptime | RAM hiện tại | **RAM đỉnh lịch sử** | CPU tích luỹ | **CPU TB (% 1 core)** |
|---|---|---|---|---|---|
| `api` | 17,4 ngày | 119 MB | 201 MB | 27.313 s | 1,82 % |
| `web` | 17,4 ngày | 133 MB | 148 MB | 29.965 s | 2,00 % |
| `flowise` | 17,4 ngày | 560 MB | **1.004 MB** | 8.212 s | 0,55 % |
| `postgres` | 24,6 ngày | 71 MB | 122 MB | 24.539 s | 1,15 % |
| **Tổng** | | **883 MB** | **1.475 MB** | | **5,52 %** |

Cộng edge dùng chung (`netviet-edge-gateway`, Caddy): 35 MB hiện tại / **74 MB đỉnh** / 0,51 % CPU.
Trên VM hiện tại edge chia cho 5 stack; trên một máy chủ một khách nó tính trọn.

### 1.2 Lưu trữ

| Hạng mục | Đo được |
|---|---|
| Volume `zalo-ultty_postgres-data` | **79 MB** |
| CSDL logic: `zalo` / `flowise` / `postgres` | 11 MB / 12 MB / 7,5 MB |
| `pg_wal` | 32 MB (3 tệp) |
| `/srv/netviet/apps/zalo-ultty` | 5,1 MB (trong đó `catalog-assets` 4,0 MB) |
| `zalo-ultty_flowise-data` | 20 KB |
| **Tổng dữ liệu nghiệp vụ Ultty** | **≈ 88 MB** |

Bảng nghiệp vụ lớn nhất: `Order` 672 KB (172 dòng), `Message` 272 KB (202 dòng), `AuditLog` 232 KB
(316 dòng). Đây là một hệ thống **nhỏ về dữ liệu**, đúng với 10–20 đơn/ngày trong CLAUDE.md.

> ⚠️ **Đừng nhầm image Docker với dữ liệu nghiệp vụ.** `docker system df` trên VM: **144,8 GB image,
> trong đó 124,7 GB (86 %) reclaimable**. Đĩa 200 GB đang dùng 147 GB **không phải vì dữ liệu khách**
> — dữ liệu khách của cả 5 stack cộng lại là 3,3 GB volume. Một máy chủ một khách cần **chính sách
> `docker image prune`**, không cần đĩa lớn.

### 1.3 Đĩa, I/O, mạng (toàn host, 37 ngày)

- Đĩa: 193 GB tổng, 147 GB dùng, 47 GB trống (76 %).
- Ghi tích luỹ: ~1,95 TB / 37 ngày ≈ **53 GB/ngày** — phần lớn là ClickHouse của stack gd1-test.
- Mạng `ens4`: RX 40,06 GB + TX 31,84 GB / 37 ngày ≈ **58 GB/tháng cho TOÀN host** (5 stack + CI +
  kéo image). Phần của riêng Ultty nhỏ hơn nhiều. Mọi phương án ở §3 đều cấp ≥500 GB, nên **băng
  thông không phải ràng buộc**.

### 1.4 Áp lực CPU — và thủ phạm không phải Ultty

Cloud Monitoring, cửa sổ 7 ngày, `ALIGN_MAX` theo giờ (168 mẫu):
**max 101,2 % · p99 100,2 % · p95 96,0 % · trung vị 67,8 % · trung bình 72,6 %** của 2 vCPU.

Host **đang gần bão hoà CPU**, nhưng đó là toàn bộ 27 container. Phân rã trung bình theo project
(% của **một** core): `zalo-ultty-gd1-test` **50,57 %** (riêng ClickHouse 29,76 %, hatchet-postgres
7,13 %, hatchet-engine 3,29 %) · `zalo-ultty` 5,52 % · `zalo-amico` 5,46 % · `zalo-wata` 5,50 % ·
`zalo-transport-preview-gd1-test` 5,57 % · edge 0,51 %.

PSI của host: `memory.pressure some avg300=0.04`, `full=0.00` — **không hề thiếu RAM**;
`cpu.pressure some avg300=41.74` — thiếu CPU. Tức bài toán của VM hiện tại là **stack tham chiếu
gd1-test**, không phải khách nào.

### 1.5 Hatchet / observability — optional, không cộng mặc định

Đo được: `hatchet-*`, `clickhouse`, `otel-collector` **chỉ tồn tại trong `zalo-ultty-gd1-test`**.
Stack `zalo-ultty` production **không có** container nào trong số đó. Theo yêu cầu Phase A mục 9,
chúng nằm ngoài sizing của Ultty production.

### 1.6 Flowise — 63 % bộ nhớ cho một thành phần gần như không được gọi

`PARSER_MODE=deepseek` trên stack Ultty đang chạy. Log `zalo-ultty-flowise-1`: lần gọi
`POST /api/v1/prediction/...` **cuối cùng là 20/08/2026**; từ đó tới nay chỉ còn vài
`POST /api/v1/auth/resolve`. Trong khi đó nó chiếm **560 MB hiện tại / 1.004 MB đỉnh** = 63 % bộ nhớ
của cả stack.

Tài liệu này **không tắt Flowise trên live** và không đề nghị làm vậy trong Issue #224. Nó chỉ ghi
cả hai hồ sơ để chủ sở hữu quyết định riêng.

### 1.7 Ma trận sizing

Nền: OS + `dockerd` ≈ **480 MB** (đo: host dùng 6.033 MB, tổng RAM hiện tại của 27 container
5.551 MB). Lấy tròn **600 MB** cho an toàn.

| Cấu hình | Ultty **không** Flowise (545 MB đỉnh + 600 MB nền) | Ultty **có** Flowise (1.549 MB + 600 MB) |
|---|---|---|
| 2 vCPU / 2 GB | **MARGINAL** — dư ~0,85 GB, hẹp khi deploy/kéo image | **FAIL** — vượt |
| **2 vCPU / 4 GB** | **PASS** — dư ~2,85 GB | **PASS** — dư ~1,85 GB |
| 4 vCPU / 4 GB | PASS — CPU thừa nhiều | PASS |
| 4 vCPU / 8 GB | PASS nhưng **thừa**, không có dữ liệu nào biện minh |

CPU: nhu cầu trung bình đo được **0,06 vCPU**. Kể cả nhân 10 lần cho đỉnh vẫn là 0,6 vCPU — 2 vCPU
dư lớn.

> **Giới hạn của phép đo này, nói thẳng:** cgroup cho CPU *tích luỹ*, không cho *đỉnh tức thời*.
> Trong cửa sổ đo, stack Ultty gần như không có tải (`docker logs --since 168h` của `api` trả về
> **0 dòng**). Vì vậy **không có số đỉnh CPU đo được cho Ultty**, và tài liệu này không bịa ra một
> số. Kết luận 2 vCPU dựa trên: trung bình 17–24 ngày + biên độ 30× + tính chất tải (10–20 đơn/ngày,
> mỗi đơn một lần gọi LLM ngoài tiến trình).

---

## 2. Hiện trạng backup — hai sai lệch phát hiện khi đo

**(a) Ultty production đang chạy `backup.sh` CŨ.** `sha256` trên VM: `zalo-ultty/backup.sh` =
`00e243d1…`, `zalo-wata/backup.sh` = `742ce54e…`. Bản của Ultty ghi vào tiền tố legacy
`gs://…-backups/daily/`, **dùng chung với `amico`**; bản của wata ghi vào `stacks/wata/`.

Hệ quả đo được: `stacks/` chỉ có `transport-preview-gd1-test/`, `ultty-gd1-test/`, `wata/` — **không
có `ultty/`**. Thư mục `daily/` có đúng 7 mục, **xen kẽ hai stack mỗi ngày** (vd `20260905T191848Z`
của ultty và `20260905T192601Z` của amico). Tức **Ultty thực nhận ~3,5 đêm retention thay vì 7** —
đúng cái bug mà chú thích trong `deploy/netviet/backup.sh` mô tả là đã sửa. **Bản sửa chưa bao giờ
tới stack Ultty.**

**(b) Backup nằm cùng miền sự cố với VM.** Đích là bucket GCS **trong chính project GCP đang chạy
VM**, và **không mã hoá phía client**. Vi phạm bất biến 1 và 2 của Phase C.

Phụ: `MEDIA_BUCKET` = chính bucket backup, nên ảnh khách (có PII) và bản sao lưu chia chung một
bucket, một miền sự cố.

---

## 3. Nghiên cứu thị trường — giá đọc từ trang chính thức, 07/09/2026

**Tỷ giá** — Vietcombank, **bảng thứ Hai 07/09/2026 mở lúc 08:07:06 +07**, đọc từ
`vietcombank.com.vn/api/exchangerates?date=2026-09-07`:
**USD bán ra 26.250 ₫** · **EUR bán ra 31.059,91 ₫**.

> Một lần đọc sớm hơn cùng điểm cuối trả **26.255 / 31.071,21** đóng dấu `2026-09-06T23:00` — đó là
> **bản chuyển tiếp cuối tuần của thứ Sáu 04/09**, bị thay khi bảng thứ Hai mở. Chênh 0,02 % nên mọi
> tổng dưới đây không đổi quá vài đồng, nhưng con số đúng là **26.250**.
> SBV: tỷ giá trung tâm 25.605 ₫ **của ngày 05/09** (368/TB-NHNN) — không xác nhận được bản 07/09.

### 3.1 Máy chủ Việt Nam, mục tiêu 2 vCPU / 4 GB

| Nhà cung cấp · gói | Vị trí | Đĩa | Băng thông | IPv4 | Giá/tháng | VAT |
|---|---|---|---|---|---|---|
| **Long Vân · C2** | HCM (tự sở hữu toà nhà) | 50 GB NVMe | 200 Mb/s | kèm + IPv6 | **285.000 ₫** (giá gia hạn) | **không nêu** |
| **VNSO · VCloud-04** | HCM + HN | 60 GB NVMe | 200 Mbps nội / **10 Mbps quốc tế** | +100k/IP | **280.000 ₫** | chưa gồm |
| **iNET · Turbo Cloud Server 4** | HN/HCM | 40 GB NVMe | 300 Mbps, không giới hạn | kèm | **319.000 ₫** | chưa gồm |
| iNET · Cloud Server Linux 4 | HN/HCM | 60 GB SSD | 200 Mbps | kèm | 299.000 ₫ | chưa gồm |
| Nhân Hoà · NVMe VPS C | VN (DC Viettel/FPT) | 55 GB NVMe | — | kèm | 321.000 ₫ (3 core/4 GB) | không nêu |
| Vietnix · VPS NVME 2 | VN "Tier 3", không nêu tên DC | 40 GB NVMe | 400 Mbps nội / 10 quốc tế | kèm | 460.000 ₫ | chưa gồm |
| VinaHost · NVME 2 + 2 GB RAM | DC của VNPT/Viettel/CMC | 50 GB NVMe | 100/10 Mbps **shared** | kèm | ~460.000 ₫ (tính ra) | chưa gồm |
| AZDIGI · AMD CS 3 | VN | **30 GB** NVMe | 1 Gbps | kèm | 468.000 ₫ @3 tháng | chưa gồm |
| Viettel IDC · CS1 | Bắc/Nam | **20 GB** SSD | 300 Mbps | kèm | 614.000 ₫ | chưa gồm |
| Mắt Bão · CS4-Linux | HCM | 40 GB SSD Enterprise | — | kèm | 819.000 ₫ | chưa gồm, tối thiểu 3 tháng |
| CMC Cloud · C6 Large 2 | 3 DC Tier 3 | **không kèm đĩa** | 500 Mbps | kèm | 1.100.000 ₫ | chưa gồm |
| BizFly · Cloud Server Gói 4 | HN/HCM | 40 GB SSD **ephemeral** | 100 Mbps | không nêu | 240.000 ₫ | chưa gồm |
| GenCloud · Platinum 04 | HCM (colo Viettel/FPT/VNPT) | 50 GB NVMe | 1 Gbps | kèm | 150.000 ₫ | **không nêu** |

### 3.2 Quốc tế + baseline hyperscaler

| Nhà cung cấp · gói | Vị trí | Đĩa | Băng thông | IPv4 | Giá | ₫/tháng |
|---|---|---|---|---|---|---|
| Hetzner CX23 | **chỉ EU** | 40 GB NVMe | 20 TB | +€0,50 | €5,99 | 186.049 |
| OVHcloud VPS-1 | Singapore | 40 GB NVMe | **500 GB rồi 10 Mbps** | kèm | ~US$4,54 | ~119.175 |
| Linode/Akamai 4 GB | Singapore (xác nhận không phụ thu) | 80 GB | 4 TB | kèm | US$24,00 | 630.000 |
| Vultr High Perf 2c/4GB | Singapore (**giá theo DC không công bố**) | 100 GB NVMe | 5 TB | kèm | US$24,00 niêm yết | 630.000 |
| DigitalOcean `s-2vcpu-4gb` | SGP1 | 80 GiB SSD | 4 TiB | kèm | US$24,00 | 630.000 |
| AWS Lightsail 4 GB | Singapore | 80 GB | 4 TB | kèm | US$24,00 | 630.000 |
| Hetzner CPX22 | Singapore | 80 GB NVMe | **1 TB** | +€0,50 | €26,99 | 838.307 |
| GCP `e2-medium` | asia-southeast1 | +$0,11/GiB | riêng | +$3,65 | $30,17+ | ≥1.032.104 |
| **GCP `e2-standard-2` + 200 GB + IP — HIỆN TRẠNG** | asia-southeast1 | 200 GB | riêng | $3,65 | **$86,00** | **2.257.500** |

### 3.3 Lưu trữ offsite

| Nhà cung cấp | Đơn giá | 10 GB | 50 GB | 100 GB | Min lưu | Egress | Vùng gần VN? |
|---|---|---|---|---|---|---|---|
| **Backblaze B2** | $0,00695/GB, **10 GB đầu free** | **0 ₫** | **7.297 ₫** | **16.419 ₫** | **không** | free tới 3× lưu trữ | **KHÔNG** — chỉ US/EU/Canada |
| **Cloudflare R2 Standard** | $0,015/GB, **10 GB free** | **0 ₫** | 15.750 ₫ | 35.438 ₫ | **không** | **$0 luôn luôn** | **Có** (anycast) |
| Cloudflare R2 IA | $0,01/GB (**mất free tier**) | 2.625 ₫ | 13.125 ₫ | 26.250 ₫ | **30 ngày** | $0 + $0,01/GB lấy về | Có |
| Wasabi | $0,00799/GB | 209.738 ₫ | 209.738 ₫ | 209.738 ₫ | **90 ngày** | ≤ dung lượng lưu | — |
| GCS Standard (asia-southeast1) | $0,020/GiB | 5.250 ₫ | 26.250 ₫ | 52.500 ₫ | không | **$0,12/GiB** | Có |
| AWS S3 Standard (ap-southeast-1) | $0,025/GB | 6.563 ₫ | 32.813 ₫ | 65.625 ₫ | không | $0,12/GB | Có |
| Hetzner Storage Box BX11 | 1 TB, **giá không đọc lại được** | — | — | — | không | không giới hạn | Không |

**R2 IA là bẫy cho khối tải này:** rẻ hơn mỗi GB nhưng mất free tier 10 GB, thêm phí lấy về, gấp đôi
Class A, và **tối thiểu 30 ngày** đụng thẳng vào `restic forget --prune` vốn xoá pack file liên tục.
R2 Standard thắng R2 IA ở **cả ba** kịch bản.

---

## 4. Quyết định

### Trần ≤500k: ĐẠT, với biên rộng

Ba phương án Việt Nam đều lọt sâu dưới trần. Câu hỏi không còn là "có đạt không" mà là "chọn cái nào".

| Ghép | Máy chủ | VAT 10 % | Offsite (10 GB) | **TỔNG** |
|---|---|---|---|---|
| **Long Vân C2 + R2** | 285.000 | *chưa rõ* | 0 | **285.000 – 313.500** |
| **VNSO VCloud-04 + R2** | 280.000 | 28.000 | 0 | **308.000** |
| **iNET Turbo 4 + B2** | 319.000 | 31.900 | 0 | **350.900** |

Ở kịch bản 100 GB, cộng thêm 16.419 ₫ (B2) hoặc 35.438 ₫ (R2) — **không phương án nào chạm 400k**.
So sánh hiện trạng GCP **2.257.500 ₫** = **6,4–7,9×**.

### Recommended: **Long Vân C2 + Cloudflare R2** — kèm hai câu phải hỏi trước khi ký

Long Vân là phương án duy nhất trả lời được câu hỏi mà issue coi trọng nhất — *bản sao lưu có nằm
cùng số phận với máy chủ không*: backup **hằng ngày, mã hoá, trên một hệ thống RIÊNG**, giữ 7 ngày.
Cộng với restic offsite ở R2, khách có **ba lớp ở ba miền sự cố** mà vẫn dưới 320k.

Chọn **R2 thay B2** cho lớp offsite dù B2 rẻ hơn ~19k ₫/tháng ở 100 GB: **Backblaze không có vùng
APAC** (chỉ US West/East, EU Central, Canada East), nên restore về một máy chủ Việt Nam là xuyên
Thái Bình Dương. Với 88 MB dữ liệu hôm nay điều đó vô nghĩa; nhưng RTO là một câu hỏi nghiệm thu, và
trả 19k để bỏ một đường truyền dài là đổi đúng chiều. R2 thêm **egress $0 tuyệt đối** — restore bao
nhiêu lần cũng không phát sinh phí, mà diễn tập phục hồi thì phải chạy định kỳ.

**Hai câu phải hỏi Long Vân trước khi chốt** (chưa công bố, cả hai đều đổi con số):
1. **285.000 ₫ đã gồm VAT chưa?** Không trang nào nêu. Nếu chưa, tổng là 313.500 ₫ — vẫn đạt.
2. **285.000 ₫ có mua được theo kỳ 1 tháng không?** Giá khuyến mại 242.250 ₫ kèm "tiết kiệm
   513.000 ₫"; 513.000 ÷ 42.750 = **đúng 12**, nên khuyến mại là cam kết 12 tháng.

### Fallback: **iNET Turbo Cloud Server 4 + B2** — 350.900 ₫

Đắt hơn ~40k nhưng **hai điều kiện thương mại đã rõ trên trang**: "chưa bao gồm VAT" và bậc kỳ hạn
công bố với **tối thiểu 1 tháng**. Nếu hai câu hỏi cho Long Vân không được trả lời thoả đáng, đây là
lựa chọn không cần hỏi ai.

Fallback thứ hai: **VNSO VCloud-04** (280.000 ₫, 60 GB NVMe, có MST, hai thành phố) — rẻ nhất và
nhiều đĩa nhất. Trừ điểm ở **10 Mbps quốc tế dùng chung**: kéo 100 GB từ kho offsite mất ~22 giờ.
Với 88 MB thì không thành vấn đề, nhưng nó **đặt trần cứng lên RTO** khi dữ liệu lớn lên.

### Loại — và lý do

| Loại | Lý do |
|---|---|
| **BizFly Gói 4** (240k) | Đĩa root **ephemeral** — trang của họ ghi rõ dữ liệu trên root disk bị xoá cùng máy chủ. Không đặt PostgreSQL lên đó |
| **GenCloud** (150k) | Rẻ hơn đối thủ 2–3,5× cho **cùng** cấu hình — dấu hiệu overselling kinh điển. **Không công bố MST** ở bất kỳ trang nào kể cả điều khoản; liên hệ là **số di động cá nhân**; mâu thuẫn nội bộ (backup 1 vs 2 lần/tuần, port 1 vs 10 Gbps); không nêu VAT, kỳ hạn, giá gia hạn |
| **Wasabi** | **Sàn 1 TB** (209.738 ₫ dù dùng 100 MB) + **min 90 ngày** — xung khắc trực tiếp với `restic forget --prune` |
| Vultr / DO / Linode / Lightsail | US$24 = 630.000 ₫, vượt trần trước cả khi cộng backup |
| Hetzner CPX22 Singapore | 838.307 ₫; giá SG **+66 %** từ 15/06/2026, băng thông 1 TB (EU 20 TB) |
| CMC Cloud C6 | 1.100.000 ₫ **và không kèm đĩa** — thực tế còn cao hơn |
| Viettel IDC CS1 | 614.000 ₫, **chỉ 20 GB**; backup bán riêng |
| Mắt Bão CS4 | 819.000 ₫, tối thiểu 3 tháng |
| AZDIGI | **Không có billing theo tháng** (sàn 3 tháng); AMD CS 3 chỉ 30 GB |
| VinaHost | Không có bậc 4 GB; phải cộng RAM lẻ; băng thông yếu nhất bảng (100/10 Mbps **shared**); không sở hữu DC |
| Vietnix | 460.000 ₫ — đạt trần nhưng đắt hơn nhóm dẫn đầu ~60 % mà không hơn về an toàn dữ liệu |
| OVHcloud VPS-1 | Rẻ nhất Singapore nhưng **bóp còn 10 Mbps sau 500 GB** và **không công bố giá gia hạn** |
| Oracle Cloud Always Free | Tài liệu Oracle nói rõ "out of host capacity" và **thu hồi instance nhàn rỗi** |
| Giữ nguyên GCP `e2-standard-2` | 2.257.500 ₫ = **6,4×** phương án dẫn đầu, cho khối tải dùng 0,06 vCPU |
| VNG Cloud/GreenNode · TinoHost · trang cloud-server của Viettel IDC | **Không đọc được giá** từ nguồn chính thức — render bằng JS hoặc đang đổi thương hiệu |

---

## 5. Bằng chứng chạy thật

Quy trình vận hành: [portable-host-runbook.md](../phat-trien/van-hanh/portable-host-runbook.md).
Log đầy đủ: Final Evidence của Issue #224.

Tóm tắt đã chứng minh trên **Ubuntu 24.04 sạch, không `gcloud`, không biến `GOOGLE_*`, không tới
được metadata GCE**:

1. `deploy/portable/install-host.sh` → Docker 29.8.0 + Compose v5.5.1 + restic 0.16.4.
2. Nạp image bằng **đường tar offline** (`docker save | docker load`) — không cần registry.
3. `render-secrets.sh` với `SECRET_BACKEND=file` → `secrets.env` 0600, **không gọi `gcloud`**.
4. `prisma migrate deploy` → 26 migration.
5. Bootstrap operator → đăng nhập `POST /auth/login` **201**, `/auth/me` **200**.
6. Đọc nghiệp vụ có xác thực: `/knowledge/products` → **19 sản phẩm** từ gói khách đã gieo.
7. `MEDIA_STORE=local`: ghi/đọc lại khớp sha256.
8. `deploy/portable/backup.sh` → kho restic **mã hoá phía client** trên MinIO (nhà cung cấp khác),
   **5,7 giây**.
9. Huỷ toàn bộ dữ liệu stack (`down --volumes`): 0 volume, 0 container.
10. `deploy/portable/restore.sh` → **13 giây**, vào target **cô lập** `restoredrill-drill`, đọc lại
    `Order=3, Product=19, Price=19, GlossaryEntry=10, ContentReadiness=19`.
11. Reboot host → systemd trở lại, `docker.service` active+enabled, **stack tự lên mà không chạy
    lệnh deploy nào**; volume và tệp media còn nguyên.

**Phân loại:** `PROVEN_LOCAL / NEEDS_PROVIDER_RUNTIME_PROOF` — chủ sở hữu chưa cấp credential cho
một VPS thật hay một bucket offsite thật, nên "nhà cung cấp khác" được mô phỏng bằng MinIO trên một
mạng riêng. Mọi đường mã đi qua là đường thật (S3 API, mã hoá restic, restore vào máy chủ mới).

---

## 6. Google còn lại ở đâu — theo tầng

| Tầng | Còn phụ thuộc GCP? | Ghi chú |
|---|---|---|
| `apps/`, `packages/` (ứng dụng) | **Không** | `MediaStore` đã trung tính (`none/local/gcs/s3`); không có gói `@google-cloud` nào; image là Debian 12, **không có `gcloud`** |
| `deploy/portable/` | **Không** — có contract test khoá | `portable-boundary.contract.test.mjs` đọc từng dòng lệnh và đỏ nếu `gcloud`/`gs://`/… quay lại |
| `deploy/providers/gcp/` | **Có, cố ý** | Hiện thực Secret Manager. GCP là **một nhà cung cấp**, vẫn hỗ trợ |
| `deploy/netviet/render-secrets.sh` | Mặc định GCP, **cắm được** | Tự ghim `SECRET_BACKEND=gcp-secret-manager` để stack đang chạy không đổi hành vi; host khách đặt `file` |
| `deploy/netviet/backup.sh` | **Có** | `gcloud storage cp`. Bản portable thay bằng restic; **chưa** thay trên live |
| `deploy/netviet/deploy-remote.sh` | **Có** | `gcloud compute scp/ssh` — chỉ là **phương tiện vận chuyển**, thay bằng `ssh`/`rsync` là đủ |
| `deploy/netviet/install-vm.sh` | **Có** | Cài Google Ops Agent — đúng cho VM GCP, không đúng cho máy khách |
| `.github/workflows/` | **Có** | WIF + Artifact Registry. Ngoài ranh giới runtime portable |

`deploy/netviet/deploy-stack.sh` — **735 dòng, toàn bộ logic rollout — không nhắc GCP một lần nào.**
Đó là lý do khoảng cách từ "chỉ chạy được trên GCP" tới "chạy trên Ubuntu bất kỳ" nhỏ hơn nhiều so
với giả định ban đầu của issue.

---

## 7. Việc chưa làm / ngoài phạm vi

- **Chưa cutover Ultty.** Xem `NO LIVE ULTTY CUTOVER PERFORMED` trong Final Evidence.
- **Chưa có bằng chứng trên VPS thật hay bucket offsite thật** (thiếu credential).
- **Chưa đo đỉnh CPU của Ultty** — không có tải trong cửa sổ đo; §1.7 nói rõ.
- **Chưa sửa `deploy/netviet/backup.sh` của live** sang restic; hai sai lệch ở §2 mới chỉ được *ghi
  nhận*, chưa vá trên stack đang chạy.
- **Chưa xác nhận giá gia hạn của OVHcloud**, **phí vị trí Singapore của Contabo**, và **giá theo
  datacenter của Vultr** — đều không công bố công khai.
- **Hai câu hỏi cho Long Vân** (VAT đã gồm chưa; 285.000 ₫ có mua theo tháng được không) **chưa có
  câu trả lời** — chúng quyết định ô Recommended, xem §4.
- **Giá Backblaze $6.95/TB đọc gián tiếp**: backblaze.com chặn fetch tự động; con số được ba lần
  tìm kiếm giới hạn trong tên miền của họ xác nhận trùng nhau, nhưng **không phải một lần đọc
  trang trực tiếp**. Kết luận không đổi theo con số này (ở 10 GB chi phí là 0 ₫ nhờ free tier, và
  kể cả gấp đôi thì tổng vẫn dưới 400k).
- **Giá Hetzner Storage Box không đọc lại được** (trang render bằng JS) — bỏ khỏi bảng §3.3.
