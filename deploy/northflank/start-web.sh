#!/bin/sh
# KHOI DONG WEB TREN NORTHFLANK: Caddy (cong 3000, cong khai) + Next (cong 3100, chi loopback) trong
# MOT container. Chay trong container `web`, cwd = /app.
#
# Vi sao hai tien trinh: Developer Sandbox chi co 2 service, nen khong co cho cho gateway rieng.
# Hop dong route mot-origin cua stack (cookie `lax`, `X-Forwarded-Proto https`) van phai giu — xem
# `Caddyfile`.
#
# MOT TRONG HAI CHET LA CA CONTAINER CHET: de Northflank khoi dong lai, thay vi de lai mot edge song
# truoc mot Next da chet (hoac nguoc lai) voi readiness van xanh.
set -eu

: "${API_UPSTREAM:?API_UPSTREAM la bat buoc (vi du api:3001)}"

apps/web/node_modules/.bin/next start apps/web -p 3100 -H 127.0.0.1 &
next_pid=$!

caddy run --config /app/deploy/northflank/Caddyfile --adapter caddyfile &
caddy_pid=$!

stop() {
  kill "$next_pid" "$caddy_pid" 2>/dev/null || true
  wait "$next_pid" "$caddy_pid" 2>/dev/null || true
}
trap 'stop; exit 0' TERM INT

while kill -0 "$next_pid" 2>/dev/null && kill -0 "$caddy_pid" 2>/dev/null; do
  sleep 2
done

echo 'start-web: mot trong hai tien trinh (next/caddy) da dung — thoat de Northflank khoi dong lai.' >&2
stop
exit 1
