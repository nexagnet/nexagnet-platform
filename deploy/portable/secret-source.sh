#!/usr/bin/env bash
# MOT NOI DUY NHAT TRA LOI "BI MAT NAY LAY O DAU RA".
#
# Duoc SOURCE, khong duoc chay: no chi dinh nghia `secret` va `optional_secret`.
#
# VI SAO TON TAI. Truoc ban nay `render-secrets.sh` goi thang `gcloud secrets versions access`.
# Hai dong do la TOAN BO chuyen GCP con lai trong duong render — `deploy-stack.sh` (735 dong, ca
# lan rollout) khong nhac toi GCP mot lan nao. Nghia la khoang cach tu "chi chay duoc tren GCP" den
# "chay duoc tren mot Ubuntu bat ky" khong phai mot ban viet lai, ma la MOT DIEM CAM.
#
# HOP DONG. Ai source tep nay se co hai ham, va chi hai ham:
#   secret <ten>            -> in gia tri ra stdout; THOAT KHAC 0 neu khong co (fail fast)
#   optional_secret <ten>   -> in gia tri hoac chuoi rong; KHONG BAO GIO lam chet lan deploy
# Ca hai deu `tr -d '\r'`: bi mat tao tu may Windows mang mot CR o cuoi, va tu khi khoa duoc dat
# thang vao cau hinh Caddy thi CR do lam Caddy tra 502 (su co 15/08/2026). Loc tai NGUON.
#
# CHON NGUON BANG `SECRET_BACKEND`:
#   file                 (MAC DINH) — mot tep mot bi mat trong `SECRET_DIR`. Duong customer-owned.
#   gcp-secret-manager   — `gcloud secrets versions access`. Duong dang chay hom nay.
#
# MAC DINH LA `file` CHU KHONG PHAI GCP, va do la mot lua chon. Tang portable khong duoc phep coi
# mot nha cung cap cu the la mac dinh; ai muon GCP thi noi ra. Duong GCP van duoc ho tro day du —
# no chuyen tu "nen mong" thanh "mot hien thuc", dung yeu cau cua #224 Phase D.

set -uo pipefail

NETVIET_SECRET_BACKEND="${SECRET_BACKEND:-file}"
NETVIET_SECRET_DIR="${SECRET_DIR:-/srv/netviet/secrets}"
# Thu muc hien thuc cua cac nha cung cap. Suy tu vi tri CUA CHINH TEP NAY nen no dung ca khi
# thu muc `deploy/` da duoc rsync len mot host khach o duong dan khac.
NETVIET_PROVIDER_DIR="${NETVIET_PROVIDER_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../providers" \n  2>/dev/null && pwd || echo /srv/netviet/providers)}"

# --- BACKEND: file ------------------------------------------------------------------------------
#
# QUYEN TRUY CAP DUOC KIEM, KHONG DUOC GIA DINH. Mot thu muc bi mat doc duoc boi ca may la dung
# cai su co ma hop dong nay sinh ra de chan; va no khong bao gio tu lo ra luc chay — stack van
# xanh. Nen no phai la mot loi TAI CHO DOC, khong phai mot dong trong tai lieu.
netviet_secret_file_read() {
  local name="$1" path="${NETVIET_SECRET_DIR}/$1" mode
  [[ -f "${path}" ]] || return 1
  mode="$(stat -c '%a' "${path}" 2>/dev/null || echo '')"
  # 0600 hoac chat hon. `stat -c %a` bo so 0 dau nen '600' va '400' deu la 3 ky tu.
  case "${mode}" in
    600 | 400 | 000) ;;
    *)
      echo "secret-source: '${name}' co quyen ${mode}, phai la 0600 hoac chat hon." >&2
      echo "  sua bang: chmod 0600 ${path}" >&2
      return 78
      ;;
  esac
  tr -d '\r' <"${path}"
}

# --- BACKEND: nha cung cap ngoai ----------------------------------------------------------------
#
# Moi backend khong-phai-file song trong `deploy/providers/<ten>/secret-source.sh` va chi phai dinh
# nghia MOT ham: `netviet_secret_backend_read <ten>`. Tang portable KHONG duoc chua mot dong lenh
# nao cua mot nha cung cap cu the — do la ca ranh gioi, va co mot bai hop dong do no.
netviet_secret_provider_read() {
  local backend="$1" name="$2" impl
  impl="${NETVIET_PROVIDER_DIR}/${backend%%-*}/secret-source.sh"
  case "${backend}" in
    gcp-secret-manager) impl="${NETVIET_PROVIDER_DIR}/gcp/secret-source.sh" ;;
  esac
  if [[ ! -r "${impl}" ]]; then
    echo "secret-source: khong tim thay hien thuc cho backend '${backend}' tai ${impl}" >&2
    return 64
  fi
  # shellcheck disable=SC1090
  . "${impl}"
  netviet_secret_backend_read "${name}"
}

netviet_secret_read() {
  case "${NETVIET_SECRET_BACKEND}" in
    file) netviet_secret_file_read "$1" ;;
    *) netviet_secret_provider_read "${NETVIET_SECRET_BACKEND}" "$1" ;;
  esac
}

# BAT BUOC. Thieu -> chet ngay, khong lui ve chuoi rong: mot stack boot voi mat khau DB rong la mot
# stack hong am tham.
secret() {
  local value
  if ! value="$(netviet_secret_read "$1")" || [[ -z "${value}" ]]; then
    echo "secret-source: thieu bi mat bat buoc '$1' (backend ${NETVIET_SECRET_BACKEND})." >&2
    return 1
  fi
  printf '%s' "${value}"
}

# TUY CHON. Khong co -> chuoi rong. Chi dung cho he thong con that su tuy chon.
optional_secret() {
  netviet_secret_read "$1" 2>/dev/null || true
}
