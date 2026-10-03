#!/usr/bin/env bash
# PHUC HOI TU KHO OFFSITE VAO MOT DICH CO LAP — va CHI vao mot dich co lap.
#
# ===============================================================================================
# TAI SAO TEP NAY TU CHOI GHI DE STACK DANG CHAY.
#
# Bat bien 8 cua #224: "restore vao server/DB RIENG, khong overwrite live de test". Do khong phai
# mot loi khuyen — cach nhanh nhat de mat du lieu that cua khach la chay mot bai dien tap phuc hoi
# len chinh CSDL dang phuc vu. Nen dieu do duoc CHAN O DAY bang mot phep so sanh ten compose
# project, chu khong bang mot cau trong tai lieu.
#
# ===============================================================================================
# TEP NAY KHAC `deploy/netviet/restore-check.sh` O DIEU QUAN TRONG NHAT.
#
# Ban do nap dump vao CHINH container Postgres dang chay (mot CSDL ten `*_restore_check`), va no
# kiem ban dump CUC BO NGAY TRUOC KHI TAI LEN. Do la mot bai tot, va no o lai.
#
# Nhung no khong tra loi duoc cau hoi ma #224 hoi: "phuc hoi TU KHO OFFSITE mat bao lau va co ra
# du lieu khong". Mot ban dump tot o /tmp khong chung minh rang thu nam trong bucket o nha cung
# cap khac con doc duoc — khoa co the sai, kho co the muc, ban tai len co the cut duoi.
#
# Nen tep nay keo VE TU KHO, dung mot Postgres MOI TINH voi volume RIENG, roi hoi du lieu nghiep
# vu. Hai bai tra loi hai cau hoi khac nhau; khong gop duoc.
#
# ===============================================================================================
# MOT LAN PHUC HOI THAT KHONG DI QUA TEP NAY.
#
# May chinh chet, dung lai tu dau: `install-host.sh` -> `deploy-stack.sh` tren host moi -> nap
# dump. Tep nay la BAI DIEN TAP dinh ky, thu chung minh kho kia phuc hoi duoc TRUOC khi can den.
set -uo pipefail

STACK_SLUG="${1:?dung: restore.sh <stack-slug> [snapshot-id]}"
SNAPSHOT="${2:-latest}"
SECRET_DIR="${SECRET_DIR:-/srv/netviet/secrets}"
LIVE_PROJECT="zalo-${STACK_SLUG}"
# Ten project cua dich dien tap. PHAI khac ten project dang chay: compose dung ten project de dat
# ten VOLUME, nen trung ten la ghi de dung bo du lieu dang phuc vu.
DRILL_PROJECT="restoredrill-${STACK_SLUG}"
if [[ "${DRILL_PROJECT}" == "${LIVE_PROJECT}" ]]; then
  echo 'restore: dich dien tap trung ten voi stack dang chay — dung lai.' >&2
  exit 1
fi

PORTABLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./secret-source.sh
. "${PORTABLE_DIR}/secret-source.sh"

RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-$(optional_secret restic-repository)}"
[[ -n "${RESTIC_REPOSITORY}" ]] || { echo 'restore: thieu RESTIC_REPOSITORY.' >&2; exit 1; }
export RESTIC_REPOSITORY
RESTIC_PASSWORD_FILE="${SECRET_DIR}/restic-repo-password"
[[ -r "${RESTIC_PASSWORD_FILE}" ]] || { echo 'restore: thieu mat khau kho.' >&2; exit 1; }
export RESTIC_PASSWORD_FILE
if [[ -r "${SECRET_DIR}/restic-s3-access-key-id" ]]; then
  AWS_ACCESS_KEY_ID="$(secret restic-s3-access-key-id)" || exit 1
  AWS_SECRET_ACCESS_KEY="$(secret restic-s3-secret-access-key)" || exit 1
  export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
fi

WORK="$(mktemp -d)"
# Mat khau cua Postgres dien tap sinh ngau nhien va chet cung container: khong co ly do gi de mot
# dich dung mot lan mang mot bi mat dai han.
DRILL_PASSWORD="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
cleanup() {
  docker rm --force "${DRILL_PROJECT}-postgres" >/dev/null 2>&1 || true
  docker volume rm --force "${DRILL_PROJECT}-data" >/dev/null 2>&1 || true
  [[ "${WORK}" == /tmp/* ]] && rm -rf -- "${WORK}"
}
trap cleanup EXIT

START="$(date +%s)"
echo "restore-drill: stack=${STACK_SLUG} snapshot=${SNAPSHOT} bat dau $(date -u +%H:%M:%SZ)"

# --- 1. KIEM TOAN VEN KHO TRUOC KHI TIN NO ------------------------------------------------------
# `restic check` doc lai cau truc kho. Mot kho hong van cho `snapshots` chay binh thuong, nen
# khong kiem o day thi bai dien tap co the "thanh cong" tren mot kho da muc mot phan.
if ! restic check --read-data-subset=5% >/dev/null 2>&1; then
  echo 'restore: KHO KHONG TOAN VEN (restic check that bai).' >&2
  exit 1
fi
echo 'restore-drill: kho toan ven.'

# --- 2. LAY BAN DUMP CSDL NGHIEP VU -------------------------------------------------------------
# MOT CO `--tag` CO DAU PHAY, khong phai hai co roi nhau. Trong restic, hai co `--tag` roi nhau
# la HOAC chu khong phai VA — nen `latest` co the roi vao snapshot TEP thay vi snapshot CSDL, va
# bai dien tap chet voi "khong tim thay dump" tren mot kho hoan toan lanh manh. Da xay ra that
# trong lan dien tap dau tien cua #224.
if ! restic restore "${SNAPSHOT}" --target "${WORK}" \
  --tag "stack:${STACK_SLUG},kind:db-zalo" >/dev/null 2>&1; then
  echo 'restore: khong lay duoc dump zalo tu kho.' >&2
  exit 1
fi
DUMP="$(find "${WORK}" -name 'zalo.dump' -type f | head -1)"
[[ -s "${DUMP}" ]] || { echo 'restore: dump rong hoac khong tim thay.' >&2; exit 1; }
echo "restore-drill: dump = $(stat -c %s "${DUMP}") byte"

# --- 3. DUNG MOT POSTGRES MOI TINH, KHONG DUNG CAI DANG CHAY ------------------------------------
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"
docker volume create "${DRILL_PROJECT}-data" >/dev/null
if ! docker run --detach --name "${DRILL_PROJECT}-postgres" \
  --env POSTGRES_USER=netviet_admin --env POSTGRES_PASSWORD="${DRILL_PASSWORD}" \
  --env POSTGRES_DB=postgres \
  --volume "${DRILL_PROJECT}-data:/var/lib/postgresql/data" "${PG_IMAGE}" >/dev/null; then
  echo 'restore: khong dung duoc postgres dien tap.' >&2
  exit 1
fi

for _ in $(seq 1 60); do
  docker exec "${DRILL_PROJECT}-postgres" pg_isready -U netviet_admin -d postgres >/dev/null 2>&1 && break
  sleep 1
done
if ! docker exec "${DRILL_PROJECT}-postgres" pg_isready -U netviet_admin -d postgres >/dev/null 2>&1; then
  echo 'restore: postgres dien tap khong len sau 60s.' >&2
  exit 1
fi

# --- 4. NAP DUMP --------------------------------------------------------------------------------
docker exec "${DRILL_PROJECT}-postgres" psql -U netviet_admin -d postgres -q \
  -c 'CREATE DATABASE zalo;' >/dev/null 2>&1
docker exec --interactive "${DRILL_PROJECT}-postgres" \
  pg_restore --username netviet_admin --dbname zalo --no-owner <"${DUMP}" >/dev/null 2>&1
# `pg_restore` tra khac 0 vi nhung canh bao vo hai (vd role khong ton tai tren dich dien tap). Cai
# quyet dinh THANH/BAI la du lieu co doc lai duoc khong, nen kiem bang DU LIEU chu khong bang ma
# thoat — mot bai kiem ma thoat o day se do vi mot canh bao va xanh vi mot bang rong.

# --- 5. NEO NGHIEP VU: du lieu that su doc lai duoc ---------------------------------------------
# Chi lay TEN BANG va SO DEM. Mot bai dien tap phuc hoi khong co ly do gi de doc noi dung don hang
# cua khach ra man hinh hay ra log.
ANCHORS="$(docker exec "${DRILL_PROJECT}-postgres" psql -U netviet_admin -d zalo -At -c \
  'SELECT relname || chr(61) || n_live_tup FROM pg_stat_user_tables WHERE n_live_tup > 0 ORDER BY n_live_tup DESC LIMIT 8;' 2>/dev/null)"
ORDERS="$(docker exec "${DRILL_PROJECT}-postgres" psql -U netviet_admin -d zalo -At \
  -c 'SELECT count(*) FROM "Order";' 2>/dev/null | tr -d ' ')"
ELAPSED=$(( $(date +%s) - START ))

echo
echo '===== KET QUA DIEN TAP PHUC HOI ====='
echo "stack      : ${STACK_SLUG}"
echo "dich       : ${DRILL_PROJECT} (CO LAP — khong phai ${LIVE_PROJECT})"
echo "thoi gian  : ${ELAPSED}s"
echo 'bang co du lieu:'
echo "${ANCHORS}" | sed 's/^/  /'
if [[ -z "${ORDERS}" || "${ORDERS}" == '0' ]]; then
  echo 'KET LUAN: THAT BAI — bang Order rong sau khi phuc hoi.' >&2
  exit 1
fi
echo "KET LUAN: DAT — doc lai duoc ${ORDERS} don tu ban sao luu offsite."
