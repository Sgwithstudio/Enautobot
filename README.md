# Enautobot
Web app học giao tiếp tiếng Anh (nghe, nói, từ vựng, hội thoại kinh doanh & hằng ngày), tối ưu cho iPhone.

- Backend Node 22 (không phụ thuộc npm), AI qua `codex exec` (gpt-5.5), TTS qua `edge-tts` (nhiều giọng/giọng vùng miền).
- Chạy tại `http://127.0.0.1:3470`, public qua Cloudflare Tunnel `https://en.smarc-wms.cloud`.

## Cài đặt
```bash
python3 -m venv .venv && .venv/bin/pip install edge-tts
cp .env.example .env   # đặt APP_PIN, dán CF_TUNNEL_TOKEN
sh deploy/install.sh   # 2 service systemd --user: enautobot, cloudflared-enautobot
```
Trong Cloudflare Zero Trust: Public hostname `en.smarc-wms.cloud` → `HTTP` `127.0.0.1:3470`.
Sau khi dán token: `systemctl --user restart cloudflared-enautobot`.

Không dùng Docker, không ảnh hưởng các dự án khác.
