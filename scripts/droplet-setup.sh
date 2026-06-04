#!/usr/bin/env bash
#
# One-command setup for the DigitalOcean Inference Benchmark web app on a fresh
# Ubuntu 24.04 Droplet. Run this from inside the repo directory.
#
#   chmod +x scripts/droplet-setup.sh
#   export DO_MODEL_ACCESS_KEY=your_key     # optional shared key; omit to let
#                                           # each user paste their own in the UI
#   sudo -E ./scripts/droplet-setup.sh
#
set -euo pipefail

PORT="${PORT:-3000}"

echo "==> Installing Docker (if missing)"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker.io
  systemctl enable --now docker
fi

echo "==> Building image (this takes a couple of minutes the first time)"
docker build -t do-bench .

echo "==> (Re)starting container on port ${PORT}"
docker rm -f do-bench >/dev/null 2>&1 || true
docker run -d --name do-bench --restart unless-stopped \
  -p "${PORT}:3000" \
  ${DO_MODEL_ACCESS_KEY:+-e DO_MODEL_ACCESS_KEY="${DO_MODEL_ACCESS_KEY}"} \
  do-bench

IP="$(curl -s ifconfig.me || echo YOUR_DROPLET_IP)"
echo ""
echo "==> Done. App is running at: http://${IP}:${PORT}"
echo "    Open the firewall for this port (ideally restricted to your IP):"
echo "      sudo ufw allow from YOUR_IP to any port ${PORT} proto tcp"
echo "    Logs:    docker logs -f do-bench"
echo "    Restart: docker restart do-bench"
