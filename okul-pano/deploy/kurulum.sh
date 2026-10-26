#!/usr/bin/env bash
# Okul Pano · Türkiye'deki bir VPS'e (Ubuntu 22.04 / 24.04) tek komutla kurulum
#
#   curl -fsSL https://raw.githubusercontent.com/Ertan88/antigravity-web-design-skills/claude/okul-dijital-pano-4oao0y/okul-pano/deploy/kurulum.sh | sudo bash
#
# Kurar: Docker, PostgreSQL, Okul Pano, otomatik HTTPS (Caddy), her gece 03.30'da veritabanı yedeği.
# Sorular yerine ortam değişkeni de verilebilir: DOMAIN, ADMIN_EMAIL, ADMIN_PASSWORD, SEED_DEMO (evet/hayir).
# Yeniden çalıştırılırsa kurulumu bozmaz; uygulamayı günceller.
set -euo pipefail

DIR=/opt/okul-pano
IMAGE=${OKULPANO_IMAGE:-ghcr.io/ertan88/okul-pano:latest}
REPO=${OKULPANO_REPO:-https://github.com/Ertan88/antigravity-web-design-skills.git}
BRANCH=${OKULPANO_BRANCH:-claude/okul-dijital-pano-4oao0y}

say() { printf '\n\033[1;36m» %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die() {
  printf '\n\033[1;31mHata: %s\033[0m\n' "$*" >&2
  exit 1
}

# Soru sorar (değişken önceden verilmişse sormaz). curl | bash ile çalışırken klavye /dev/tty'den okunur.
ask() {
  local var=$1 question=$2 default=${3:-} secret=${4:-} value=""
  [ -n "${!var:-}" ] && return
  while [ -z "$value" ]; do
    if [ -n "$secret" ]; then
      read -rsp "$question: " value </dev/tty
      echo
    else
      read -rp "$question${default:+ [$default]}: " value </dev/tty
    fi
    value=${value:-$default}
  done
  printf -v "$var" '%s' "$value"
}

[ "$(id -u)" -eq 0 ] || die "Betiği sudo ile çalıştırın."
. /etc/os-release
case "${ID:-}" in ubuntu | debian) ;; *) die "Ubuntu ya da Debian gerekli (bulunan: ${PRETTY_NAME:-bilinmiyor})." ;; esac

install_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    say "Docker kuruluyor"
    curl -fsSL https://get.docker.com | sh
  fi
  docker compose version >/dev/null 2>&1 || die "Docker Compose eklentisi bulunamadı."
  systemctl enable --now docker >/dev/null 2>&1 || true
}

# Belleği 3 GB'tan az sunucularda 2 GB takas alanı: derleme ve yoğun anlarda bellek yetmezse süreç ölmesin
add_swap() {
  local mem_mb
  mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
  if [ "$mem_mb" -lt 3000 ] && ! swapon --show | grep -q .; then
    say "Takas alanı (2 GB) ekleniyor"
    if fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile; then
      grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
    else
      warn "Takas alanı eklenemedi (sorun değil, kurulum devam ediyor)."
    fi
  fi
}

# Hazır imaj (GitHub'da derlenmiş) indirilemezse kaynaktan derlenir
get_image() {
  say "Uygulama indiriliyor: $IMAGE"
  if docker pull "$IMAGE"; then
    return
  fi
  if docker image inspect "$IMAGE" >/dev/null 2>&1; then
    warn "İndirilemedi; sunucudaki mevcut $IMAGE kullanılıyor."
    return
  fi
  warn "Hazır imaj indirilemedi; kaynaktan derlenecek (birkaç dakika sürer)."
  command -v git >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq git)
  if [ -d "$DIR/kaynak/.git" ]; then
    git -C "$DIR/kaynak" fetch --depth 1 origin "$BRANCH" && git -C "$DIR/kaynak" reset --hard FETCH_HEAD
  else
    git clone --depth 1 --branch "$BRANCH" "$REPO" "$DIR/kaynak"
  fi
  IMAGE=okul-pano:yerel
  docker build -t "$IMAGE" "$DIR/kaynak/okul-pano"
}

wait_healthy() {
  for _ in $(seq 1 90); do
    if docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  docker compose logs --tail 50 app
  die "Uygulama açılmadı (yukarıdaki kayıtlara bakın)."
}

# Caddy sertifikayı alıp HTTPS'i açana kadar bekler. Alan adı henüz bu sunucuyu göstermiyorsa uyarır; kurulum geçerlidir.
wait_https() {
  for _ in $(seq 1 45); do
    if curl -fsk --max-time 5 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  warn "HTTPS henüz açılmadı. DNS kaydı bu sunucuyu gösterince sertifika kendiliğinden alınır; durum: cd $DIR && docker compose logs caddy"
}

write_files() {
  cat >"$DIR/docker-compose.yml" <<'YAML'
# Okul Pano · VPS kurulumu (kurulum.sh tarafından yazıldı)
name: okul-pano
services:
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: okulpano
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: okulpano
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U okulpano']
      interval: 10s
      retries: 6

  app:
    image: ${OKULPANO_IMAGE}
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://okulpano:${POSTGRES_PASSWORD}@db:5432/okulpano
      JWT_SECRET: ${JWT_SECRET}
      PUBLIC_URL: https://${DOMAIN}
      # Görseller de veritabanında: tek yedek dosyası her şeyi içerir
      FILE_STORAGE: db
      TZ: Europe/Istanbul
      SEED_SUPERADMIN_EMAIL: ${SEED_SUPERADMIN_EMAIL:-}
      SEED_SUPERADMIN_PASSWORD: ${SEED_SUPERADMIN_PASSWORD:-}
      SEED_DEMO: ${SEED_DEMO:-false}
      PUSH_ACCESS_TOKEN: ${PUSH_ACCESS_TOKEN:-}
    depends_on:
      db:
        condition: service_healthy

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    environment:
      DOMAIN: ${DOMAIN}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - app

volumes:
  pgdata:
  caddy_data:
  caddy_config:
YAML

  cat >"$DIR/Caddyfile" <<'CADDY'
{$DOMAIN} {
	encode zstd gzip
	reverse_proxy app:3000 {
		# Panolara canlı yayın (SSE) bekletilmeden iletilsin
		flush_interval -1
	}
}
CADDY

  cat >"$DIR/yedekle.sh" <<'SH'
#!/usr/bin/env bash
# Veritabanı yedeği (görseller dahil). Her gece 03.30'da kendiliğinden çalışır; elle de çalıştırılabilir.
set -euo pipefail
cd /opt/okul-pano
mkdir -p yedekler
f="yedekler/okulpano-$(date +%F-%H%M).dump"
docker compose exec -T db pg_dump -U okulpano -Fc okulpano >"$f.tmp"
mv "$f.tmp" "$f"
# Son 14 günün yedeği tutulur (YEDEK_GUN ile değiştirilebilir)
find yedekler -name 'okulpano-*.dump' -mtime +"${YEDEK_GUN:-14}" -delete
echo "$(date '+%F %T') yedek alındı: $f ($(du -h "$f" | cut -f1))"
SH

  cat >"$DIR/geri-yukle.sh" <<'SH'
#!/usr/bin/env bash
# Yedekten geri yükleme:  sudo /opt/okul-pano/geri-yukle.sh yedekler/okulpano-2026-10-26-0330.dump
set -euo pipefail
cd /opt/okul-pano
f=${1:?Kullanım: geri-yukle.sh <yedek dosyası>}
[ -f "$f" ] || { echo "Dosya bulunamadı: $f"; exit 1; }
if [ "${ONAY:-}" != evet ]; then
  read -rp "Şu anki veriler bu yedekle değiştirilecek (önce şu anki hâl yedeklenir). Devam? (evet/hayir) " ONAY </dev/tty
fi
[ "$ONAY" = evet ] || { echo "Vazgeçildi."; exit 1; }
./yedekle.sh
docker compose stop app
docker compose exec -T db pg_restore -U okulpano -d okulpano --clean --if-exists --no-owner <"$f"
docker compose start app
echo "Geri yüklendi: $f"
SH

  cat >"$DIR/guncelle.sh" <<'SH'
#!/usr/bin/env bash
# Uygulamayı en son sürüme günceller (veriler korunur; veritabanı değişiklikleri açılışta uygulanır)
set -euo pipefail
cd /opt/okul-pano
./yedekle.sh
image=$(grep '^OKULPANO_IMAGE=' .env | cut -d= -f2-)
if [ "$image" = okul-pano:yerel ]; then
  branch=$(grep '^OKULPANO_BRANCH=' .env | cut -d= -f2-)
  git -C kaynak fetch --depth 1 origin "$branch" && git -C kaynak reset --hard FETCH_HEAD
  docker build -t okul-pano:yerel kaynak/okul-pano
elif ! docker compose pull app; then
  echo "Uyarı: yeni sürüm indirilemedi, mevcut sürümle devam ediliyor."
fi
docker compose up -d
docker image prune -f >/dev/null
echo "Güncellendi."
SH
  chmod 700 "$DIR"/*.sh
}

# ---------------------------------------------------------------------------

mkdir -p "$DIR/yedekler"
cd "$DIR"

if [ -f "$DIR/.env" ]; then
  say "Kurulum zaten var: uygulama güncelleniyor"
  install_docker
  write_files
  ./guncelle.sh
  exit 0
fi

echo
echo "Okul Pano kurulumu · birkaç soru:"
ask DOMAIN "Alan adı (DNS kaydı bu sunucunun IP adresini göstermeli; ör. pano.sirketiniz.com)"
ask ADMIN_EMAIL "Platform yöneticisi e-postası"
ask ADMIN_PASSWORD "Platform yöneticisi şifresi (en az 12 karakter)" "" gizli
[ ${#ADMIN_PASSWORD} -ge 12 ] || die "Şifre en az 12 karakter olmalı."
case "$ADMIN_PASSWORD" in *"'"* | *'"'* | *'$'* | *'\'*) die "Şifrede ' \" \$ ve \\ karakterleri kullanılamaz." ;; esac
ask SEED_DEMO "Tanıtım için örnek okul da kurulsun mu? (evet/hayir)" hayir
case "$SEED_DEMO" in e | E | evet | Evet | EVET | true) SEED_DEMO=true ;; *) SEED_DEMO=false ;; esac

# Alan adı bu sunucuyu göstermiyorsa HTTPS sertifikası alınamaz: uyar (kurulum devam eder)
if [ "$DOMAIN" != localhost ]; then
  public_ip=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)
  dns_ip=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1 {print $1}' || true)
  if [ -n "$public_ip" ] && [ "$dns_ip" != "$public_ip" ]; then
    warn "$DOMAIN şu an ${dns_ip:-hiçbir adresi} gösteriyor; bu sunucu $public_ip. DNS kaydı düzelince HTTPS kendiliğinden açılır."
  fi
fi

install_docker
add_swap
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q 'Status: active'; then
  ufw allow 22/tcp >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
fi
get_image

say "Ayarlar yazılıyor"
umask 077
cat >"$DIR/.env" <<ENV
DOMAIN=$DOMAIN
OKULPANO_IMAGE=$IMAGE
OKULPANO_BRANCH=$BRANCH
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
SEED_SUPERADMIN_EMAIL=$ADMIN_EMAIL
SEED_SUPERADMIN_PASSWORD='$ADMIN_PASSWORD'
SEED_DEMO=$SEED_DEMO
ENV
umask 022
write_files

say "Başlatılıyor"
docker compose up -d
say "Uygulamanın açılması bekleniyor"
wait_healthy

# İlk yönetici oluşturuldu: şifre artık sunucuda düz metin olarak durmasın (uygulama yeni ayarla yeniden açılır)
sed -i '/^SEED_SUPERADMIN_PASSWORD=/d' "$DIR/.env"
docker compose up -d app >/dev/null 2>&1
wait_healthy
say "HTTPS bekleniyor"
wait_https

cat >/etc/cron.d/okul-pano <<CRON
# Okul Pano: her gece veritabanı yedeği
30 3 * * * root $DIR/yedekle.sh >>/var/log/okul-pano-yedek.log 2>&1
CRON
"$DIR/yedekle.sh" >/dev/null && say "İlk yedek alındı ($DIR/yedekler)"

say "Kurulum tamam"
cat <<DONE

  Yönetim paneli : https://$DOMAIN/admin/
  Pano (TV)      : https://$DOMAIN/display/
  Mobil (web)    : https://$DOMAIN/app/
  Android uygulamada sunucu adresi: https://$DOMAIN

  Giriş: $ADMIN_EMAIL ve belirlediğiniz şifre
$(if [ "$SEED_DEMO" = true ]; then echo "  Örnek okul: mudur@okulpano.local / ogretmen@okulpano.local (şifre aynı)"; fi)

  Yedekler  : $DIR/yedekler (her gece 03.30, son 14 gün)
  Güncelleme: sudo $DIR/guncelle.sh
  Geri yükle: sudo $DIR/geri-yukle.sh $DIR/yedekler/<dosya>.dump

DONE
