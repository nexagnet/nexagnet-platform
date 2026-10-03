# `deploy/portable/` — tầng triển khai không phụ thuộc nhà cung cấp

Mọi thứ ở đây chạy được trên **một Ubuntu sạch có Docker**, và không được phép gọi công cụ riêng
của một nhà cung cấp nào. Có một bài hợp đồng đo điều đó:
`portable-boundary.contract.test.mjs` đọc từng **dòng lệnh** (bỏ qua chú thích) và đỏ nếu `gcloud`,
`gsutil`, `gs://`, `aws`, `hcloud`… quay lại.

| Tệp | Việc |
|---|---|
| `install-host.sh` | Bootstrap Ubuntu: Docker Engine + Compose + restic + cây `/srv/netviet` |
| `secret-source.sh` | **Được source**, không chạy. Định nghĩa `secret` / `optional_secret` |
| `backup.sh` | `pg_dump` rót thẳng vào kho restic mã hoá phía client, ở nhà cung cấp khác |
| `restore.sh` | Diễn tập phục hồi vào một PostgreSQL **cô lập** — từ chối ghi đè stack đang chạy |
| `portable-boundary.contract.test.mjs` | Khoá ranh giới + hành vi của nguồn bí mật |

Nhà cung cấp cụ thể sống ở `deploy/providers/<tên>/`. Hôm nay có `gcp/` (Secret Manager). GCP
**vẫn được hỗ trợ đầy đủ** — nó chuyển từ *nền móng* thành *một hiện thực*.

## Chọn nguồn bí mật

```bash
SECRET_BACKEND=file                # mặc định của tầng này — một tệp một bí mật, quyền 0600
SECRET_BACKEND=gcp-secret-manager  # dùng deploy/providers/gcp/secret-source.sh
```

Mặc định là `file` **chứ không phải GCP**, và đó là một lựa chọn: một tầng trung tính không được
coi một nhà cung cấp là mặc định. `deploy/netviet/render-secrets.sh` — thư mục của bản triển khai
GCP đang chạy — tự ghim `gcp-secret-manager`, nên không stack nào đang chạy đổi hành vi.

## Vận hành

Quy trình đầy đủ, hợp đồng bí mật, diễn tập phục hồi và runbook chuyển đổi:
[docs/phat-trien/van-hanh/portable-host-runbook.md](../../docs/phat-trien/van-hanh/portable-host-runbook.md).

Quyết định kiến trúc + mô hình chi phí:
[docs/kien-truc/portable-deployment-va-chi-phi.md](../../docs/kien-truc/portable-deployment-va-chi-phi.md).
