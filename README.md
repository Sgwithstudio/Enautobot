# Enautobot
Web app học giao tiếp tiếng Anh (nghe, nói, từ vựng, hội thoại kinh doanh & hằng ngày), tối ưu cho iPhone.

- Backend Node 22 (không phụ thuộc npm), AI qua `codex exec` (gpt-5.5), TTS qua `edge-tts` (nhiều giọng/giọng vùng miền).
- Chạy tại `http://127.0.0.1:3470`, public qua Cloudflare Tunnel `https://en.smarc-wms.cloud`.

## Nội dung
- **250+ bài học** (cơ bản A2 → nâng cao C1): kinh doanh, hằng ngày, du lịch, sức khỏe, công nghệ, học thuật/IELTS, xã hội, thành ngữ, cụm động từ, ngữ pháp, phát âm. Mỗi bài: từ vựng + IPA + ví dụ, mẫu câu, hội thoại có audio.
- **Từ điển Anh–Việt offline** (~105.000 mục, IPA, ví dụ) — tab "Từ điển", hoặc chạm vào từ trong bài để tra. Dùng `node:sqlite` (không cần npm). Nguồn: CC BY-SA 4.0, xem `data/dict/ATTRIBUTION.md`.
- Tải từ điển: `sh scripts/get-dict.sh` (file 44MB, không commit vào git).
- Thêm/sinh lại bài: sửa `scripts/topics.txt` → `node scripts/gen-lessons.js 4` (dùng codex, chạy tiếp được) → `node scripts/merge-lessons.js` → restart service.

## Cài đặt
```bash
python3 -m venv .venv && .venv/bin/pip install edge-tts
cp .env.example .env   # đặt APP_PIN, dán CF_TUNNEL_TOKEN
sh deploy/install.sh   # 2 service systemd --user: enautobot, cloudflared-enautobot
```
Trong Cloudflare Zero Trust: Public hostname `en.smarc-wms.cloud` → `HTTP` `127.0.0.1:3470`.
Sau khi dán token: `systemctl --user restart cloudflared-enautobot`.

Không dùng Docker, không ảnh hưởng các dự án khác.
