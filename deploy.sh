#!/usr/bin/env bash
# Upload versi terbaru Absensi Jamaah ke VPS lalu build & jalankan ulang container-nya.
# Pakai (dari folder absensi-jamaah):  bash deploy.sh
#
# Alamat: https://absensiprogram.web.id (cadangan: https://absensi.<ip-vps>.sslip.io), HTTPS oleh Caddy.
# Data (db.json, foto, cadangan harian) di VPS ada di $DIR/data dan TIDAK tertimpa.
# Hanya saat deploy pertama (data di VPS masih kosong) data dari laptop (dev/.data) ikut disalin.
set -euo pipefail
cd "$(dirname "$0")"

VPS="${VPS:-root@31.58.103.170}"
KEY="${KEY:-$HOME/.ssh/pakaicloud_mmb}"
DIR="${DIR:-/opt/absensi-program}"
DOMAIN="${DOMAIN:-absensiprogram.web.id}"
CADANGAN="${CADANGAN:-absensi.31-58-103-170.sslip.io}"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ServerAliveInterval=20 -o ServerAliveCountMax=15 "$VPS")

echo "→ Upload kode ke $VPS:$DIR"
tar --exclude=./dev/.data --exclude=./.git --exclude=./data --exclude=node_modules -czf - . \
  | "${SSH[@]}" "mkdir -p $DIR/data && tar -xzf - -C $DIR"

if ! "${SSH[@]}" "test -s $DIR/data/db.json"; then
  if [ -f dev/.data/db.json ]; then
    echo "→ Deploy pertama: salin data dari laptop (tanpa sesi login)"
    node -e '
      const fs = require("fs"); const d = JSON.parse(fs.readFileSync("dev/.data/db.json", "utf8"));
      for (const k of Object.keys(d.props || {})) if (k.startsWith("tok_")) delete d.props[k];   // sesi login laptop tidak ikut
      process.stdout.write(JSON.stringify(d));' > /tmp/absensi-db.json
    tar -czf - -C /tmp absensi-db.json -C "$PWD/dev/.data" $( [ -d dev/.data/drive ] && echo drive ) \
      | "${SSH[@]}" "tar -xzf - -C $DIR/data && mv $DIR/data/absensi-db.json $DIR/data/db.json"
    rm -f /tmp/absensi-db.json
  fi
fi
"${SSH[@]}" "chown -R 1000:1000 $DIR/data && chmod 700 $DIR/data"

echo "→ Build & jalankan ulang container"
"${SSH[@]}" "cd $DIR && APP_URL=https://$DOMAIN docker compose up -d --build --remove-orphans && docker image prune -f >/dev/null && docker ps --filter name=absensi-program --format '{{.Names}}: {{.Status}}'"

echo "→ Pastikan alamat terpasang di Caddy"
"${SSH[@]}" bash -s -- "$DOMAIN" "$CADANGAN" <<'REMOTE'
set -euo pipefail
DOMAIN="$1"; CADANGAN="$2"; F=/opt/laporan/Caddyfile
if grep -q "^# ABSENSI-PROGRAM-DOMAIN" "$F"; then echo "  sudah terpasang"; exit 0; fi
cp "$F" "$F.bak-$(date +%Y%m%d-%H%M%S)"
# Ditulis ulang ke file yang sama (bukan sed -i) karena Caddyfile di-mount sebagai satu file ke container.
TMP=$(mktemp)
cat "$F" > "$TMP"
cat >> "$TMP" <<EOF

# ===== Absensi Jamaah (container absensi-program) =====
# ABSENSI-PROGRAM-DOMAIN (baris di bawah ini = daftar alamat)
$DOMAIN, www.$DOMAIN, $CADANGAN {
	encode gzip
	request_body {
		max_size 5MB
	}
	reverse_proxy absensi-program:3000
}
EOF
docker exec -i laporan-caddy-1 caddy validate --config /dev/stdin --adapter caddyfile < "$TMP" >/dev/null
cat "$TMP" > "$F"; rm -f "$TMP"
docker exec -w /etc/caddy laporan-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
echo "  alamat ditambahkan & Caddy dimuat ulang"
REMOTE

echo "✓ Selesai: https://$DOMAIN (cadangan: https://$CADANGAN)"
