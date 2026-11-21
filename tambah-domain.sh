#!/usr/bin/env bash
# Menambahkan domain (dan www.) ke alamat Absensi Jamaah di Caddy VPS. HTTPS dibuat otomatis oleh Caddy
# begitu DNS domain mengarah ke VPS (record A @ dan A www → 31.58.103.170).
#
# Pakai (dari folder absensi-jamaah):  bash tambah-domain.sh domainlain.web.id
set -euo pipefail

DOMAIN="${1:-}"
if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$ ]]; then
  echo "Pakai: bash tambah-domain.sh namadomain.web.id"; exit 1
fi
DOMAIN="${DOMAIN,,}"
VPS="${VPS:-root@31.58.103.170}"
KEY="${KEY:-$HOME/.ssh/pakaicloud_mmb}"

ssh -i "$KEY" -o BatchMode=yes "$VPS" bash -s -- "$DOMAIN" <<'REMOTE'
set -euo pipefail
DOMAIN="$1"; F=/opt/laporan/Caddyfile
BARIS=$(grep -n "^# ABSENSI-PROGRAM-DOMAIN" "$F" | cut -d: -f1)
[ -n "$BARIS" ] || { echo "Penanda ABSENSI-PROGRAM-DOMAIN tidak ditemukan. Jalankan deploy.sh dulu."; exit 1; }
ALAMAT=$(sed -n "$((BARIS+1))p" "$F")
if echo "$ALAMAT" | grep -qE "(^|[ ,])$DOMAIN(,| |$)"; then echo "$DOMAIN sudah terpasang."; exit 0; fi
cp "$F" "$F.bak-$(date +%Y%m%d-%H%M%S)"
# Ditulis ulang ke file yang sama (bukan sed -i) karena Caddyfile di-mount sebagai satu file ke container.
TMP=$(mktemp)
sed "$((BARIS+1))s/^/$DOMAIN, www.$DOMAIN, /" "$F" > "$TMP"
docker exec -i laporan-caddy-1 caddy validate --config /dev/stdin --adapter caddyfile < "$TMP" >/dev/null
cat "$TMP" > "$F"; rm -f "$TMP"
docker exec -w /etc/caddy laporan-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
echo "✓ $DOMAIN & www.$DOMAIN ditambahkan. Alamat sekarang:"
sed -n "$((BARIS+1))p" "$F"
REMOTE
