#!/usr/bin/env bash
# BOOTSTRAP MOT UBUNTU SACH THANH MOT HOST CHAY DUOC STACK KHACH.
#
# DIEU KIEN DUY NHAT: mot Ubuntu (22.04/24.04) co quyen root va co mang. KHONG doi `gcloud`, khong
# doi metadata cua Compute Engine, khong doi Secret Manager, khong doi GCS, khong doi Artifact
# Registry. Do la toan bo diem khac nhau giua tep nay va `deploy/netviet/install-vm.sh`.
#
# `install-vm.sh` KHONG bi xoa va khong bi coi la sai: no la ban GCP, va no cai them Google Ops
# Agent — mot thu chi co nghia khi may nam trong GCP. Giu hai tep la co y: mot host khach khong
# duoc cai mot agent gui do do ve mot du an Google ma ho khong so huu.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

STACK_ROOT="${STACK_ROOT:-/srv/netviet}"
SECRET_DIR="${SECRET_DIR:-${STACK_ROOT}/secrets}"

require_root() {
  [[ "$(id -u)" == '0' ]] || { echo 'install-host: phai chay bang root (sudo).' >&2; exit 1; }
}
require_root

. /etc/os-release
case "${ID:-}" in
  ubuntu | debian) ;;
  *)
    echo "install-host: chi ho tro Ubuntu/Debian, thay '${ID:-khong ro}'." >&2
    exit 1
    ;;
esac

echo "install-host: ${PRETTY_NAME}"

# --- 1. DOCKER ENGINE + COMPOSE -----------------------------------------------------------------
# Kho chinh thuc cua Docker chu khong phai `docker.io` cua distro: `docker compose` (plugin v2) la
# thu ma moi script trong repo goi, va goi `docker.io` cua Ubuntu khong mang plugin do.
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y --no-install-recommends ca-certificates curl gnupg rsync
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/${ID}
Suites: ${VERSION_CODENAME}
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update
  apt-get install -y --no-install-recommends \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo 'install-host: docker da co, bo qua buoc cai.'
fi
systemctl enable --now docker 2>/dev/null || true

# --- 2. RESTIC ----------------------------------------------------------------------------------
# Cong cu sao luu. Xem `deploy/portable/backup.sh` de biet vi sao la restic chu khong phai borg.
if ! command -v restic >/dev/null 2>&1; then
  apt-get update
  apt-get install -y --no-install-recommends restic
fi

# --- 3. CAY THU MUC -----------------------------------------------------------------------------
# `0700` cho thu muc bi mat, khong phai `0750`: tren host khach khong co nhom van hanh nao duoc
# doc bi mat cua stack. `secret-source.sh` con kiem lai quyen CUA TUNG TEP luc doc.
install -d -m 0755 "${STACK_ROOT}" "${STACK_ROOT}/apps"
install -d -m 0700 "${SECRET_DIR}"
install -d -m 0750 "${STACK_ROOT}/edge/.runtime" "${STACK_ROOT}/edge/tenants"

# --- 4. TU KHOI DONG SAU REBOOT -----------------------------------------------------------------
# Compose dat `restart: always` tren tung service, nen dieu kien duy nhat de stack tro lai sau
# reboot la docker.service duoc bat. Kiem tuong minh: mot host khach reboot ma stack khong len la
# dung cai loi ma khong ai thay cho toi luc can no.
systemctl is-enabled docker >/dev/null 2>&1 \
  || { echo 'install-host: docker.service KHONG duoc bat khi khoi dong.' >&2; exit 1; }

echo
echo 'install-host: xong.'
docker --version
docker compose version
restic version
echo
echo "Bi mat: dat tung tep mot vao ${SECRET_DIR}/ voi quyen 0600, vi du:"
echo "  install -m 0600 /dev/null ${SECRET_DIR}/zalo-<stack>-postgres-admin-password"
echo "  printf '%s' '<gia tri>' > ${SECRET_DIR}/zalo-<stack>-postgres-admin-password"
echo "KHONG dat gia tri bi mat tren dong lenh cua mot lenh khac: no se hien trong bang tien trinh."
