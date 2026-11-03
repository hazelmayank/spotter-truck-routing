#!/usr/bin/env bash
# Installs the API on an Ubuntu 24.04 server: gunicorn under systemd, Caddy in front for HTTPS.
# Run from a clone of the repository, after creating backend/.env: deploy/setup.sh <api-domain>
set -euo pipefail

domain="${1:?usage: deploy/setup.sh <api-domain>}"
repo="$(cd "$(dirname "$0")/.." && pwd)"

[ -f "$repo/backend/.env" ] || { echo "backend/.env is missing" >&2; exit 1; }

sudo apt-get update
sudo apt-get install -y python3-venv git curl gpg debian-keyring debian-archive-keyring apt-transport-https

curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update
sudo apt-get install -y caddy

cd "$repo/backend"
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py collectstatic --noinput

sed -e "s|REPO_DIR|$repo|g" -e "s|APP_USER|$USER|g" "$repo/deploy/spotter-api.service" \
  | sudo tee /etc/systemd/system/spotter-api.service >/dev/null
sed "s|API_DOMAIN|$domain|g" "$repo/deploy/Caddyfile" | sudo tee /etc/caddy/Caddyfile >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable spotter-api
sudo systemctl restart spotter-api
sudo systemctl restart caddy
