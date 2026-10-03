#!/usr/bin/env bash
# HIEN THUC GCP CUA NGUON BI MAT — mot NHA CUNG CAP, khong phai nen mong.
#
# Duoc `deploy/portable/secret-source.sh` source khi `SECRET_BACKEND=gcp-secret-manager`.
# Tep nay la NOI DUY NHAT trong duong render duoc phep goi `gcloud`. Co mot bai hop dong
# (`deploy/portable/portable-boundary.contract.test.mjs`) do dung dieu do va se do neu mot lenh
# `gcloud` nao quay lai `deploy/portable/`.
#
# Vi sao khong xoa duong GCP: stack Ultty dang chay tren GCP hom nay. #224 Phase D yeu cau GCP tro
# thanh "mot provider/bootstrap implementation, van duoc ho tro" — chung minh portability bang cach
# pha duong dang chay la mot cach chung minh sai.
set -uo pipefail

# `--secret` nhan TEN chu khong phai gia tri, nen khong bi mat nao di qua bang tien trinh.
# `tr -d '\r'`: bi mat tao tu may Windows mang mot CR o cuoi (su co Caddy 502, 15/08/2026).
netviet_secret_backend_read() {
  gcloud secrets versions access latest \
    --project "${PROJECT_ID:?PROJECT_ID bat buoc voi SECRET_BACKEND=gcp-secret-manager}" \
    --secret "$1" 2>/dev/null | tr -d '\r'
}
