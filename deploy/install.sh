#!/bin/sh
# Cài 2 service systemd *user* riêng cho Enautobot (không đụng docker/service khác).
set -e
D=$(cd "$(dirname "$0")" && pwd)
mkdir -p ~/.config/systemd/user
cp "$D/enautobot.service" "$D/cloudflared-enautobot.service" ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now enautobot.service
systemctl --user enable cloudflared-enautobot.service
systemctl --user restart cloudflared-enautobot.service || true
echo "Xong. Sau khi dán CF_TUNNEL_TOKEN vào .env: systemctl --user restart cloudflared-enautobot"
