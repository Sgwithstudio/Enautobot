const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const env = require('./lib/env');
const codex = require('./lib/codex');
const tts = require('./lib/tts');
const dict = require('./lib/dict');
const pron = require('./lib/pron');

const PORT = parseInt(env.PORT || '3470', 10);
const HOST = env.HOST || '127.0.0.1';
const PIN = env.APP_PIN || '';
const SECRET = crypto.createHash('sha256').update('enautobot|' + PIN + '|' + (env.CF_TUNNEL_TOKEN || '')).digest('hex');
const PUB = path.join(__dirname, 'public');
const GEN_DIR = path.join(__dirname, 'data', 'cache', 'gen');
fs.mkdirSync(GEN_DIR, { recursive: true });

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'seed', 'lessons.json'), 'utf8'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };

const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const makeToken = () => { const t = Date.now().toString(36); return t + '.' + sign(t); };
function authed(req) {
  if (!PIN) return true;
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)eb=([^;]+)/);
  if (!m) return false;
  const [t, s] = m[1].split('.');
  return !!s && s === sign(t);
}
const failBy = new Map();

function json(res, code, obj, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}
function body(req, limit = 20000) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > limit) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } });
  });
}
const clip = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
const LEVELS = { beginner: 'A2 (beginner, simple words)', intermediate: 'B1-B2 (intermediate)', advanced: 'C1 (advanced, natural idioms)' };

function cached(key, fn) {
  const f = path.join(GEN_DIR, crypto.createHash('sha1').update(key).digest('hex') + '.json');
  if (fs.existsSync(f)) return Promise.resolve(JSON.parse(fs.readFileSync(f, 'utf8')));
  return fn().then(r => { fs.writeFileSync(f, JSON.stringify(r)); return r; });
}

async function generate({ topic, level, group }) {
  const lv = LEVELS[level] || LEVELS.intermediate;
  const prompt = `Bạn là giáo viên tiếng Anh giao tiếp cho người Việt. Tạo bài học chủ đề "${topic}" (${group === 'business' ? 'tiếng Anh kinh doanh' : 'giao tiếp hằng ngày'}), trình độ ${lv}.
Schema JSON: {"id":"gen","title":"tiêu đề tiếng Anh ngắn","vocab":[{"w":"từ/cụm","ipa":"/IPA/","vi":"nghĩa tiếng Việt","ex":"câu ví dụ tiếng Anh tự nhiên","exvi":"dịch tiếng Việt"}] (đúng 8 mục),"dialogue":{"title":"...","roles":{"A":"tên người nói A","B":"tên người nói B"},"lines":[{"r":"A hoặc B","en":"câu tiếng Anh","vi":"dịch tiếng Việt"}] (10 câu, tự nhiên, dùng một số từ vựng trên)}}`;
  const r = await codex.askJson(prompt);
  if (!r.vocab || !r.dialogue || !r.dialogue.lines) throw new Error('bad generated lesson');
  return r;
}

async function chat({ scenario, level, history, user }) {
  const lv = LEVELS[level] || LEVELS.intermediate;
  const hist = (Array.isArray(history) ? history.slice(-8) : []).map(h => `${h.role === 'ai' ? 'AI' : 'Learner'}: ${clip(h.text, 400)}`).join('\n');
  const prompt = `Bạn là bạn luyện nói tiếng Anh cho người Việt, trình độ ${lv}. Tình huống: ${clip(scenario, 200)}. Bạn đóng vai đối tác trong tình huống đó.
Hội thoại trước:\n${hist || '(bắt đầu)'}
${user ? 'Learner vừa nói: ' + clip(user, 500) : 'Hãy mở đầu cuộc hội thoại bằng 1 câu.'}
Trả JSON: {"reply":"câu trả lời tiếng Anh tự nhiên, tối đa 2 câu ngắn, kết thúc bằng câu hỏi để tiếp tục","reply_vi":"dịch tiếng Việt","correction":"nếu Learner nói sai/thiếu tự nhiên thì viết lại câu đúng tiếng Anh, ngược lại chuỗi rỗng","note_vi":"giải thích ngắn tiếng Việt về lỗi (rỗng nếu không có lỗi)","better":"một cách nói hay hơn/tự nhiên hơn cho ý của Learner (rỗng nếu bắt đầu)"}`;
  return codex.askJson(prompt);
}

async function api(req, res, url) {
  const p = url.pathname;
  if (p === '/api/login' && req.method === 'POST') {
    const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;
    const f = failBy.get(ip) || { n: 0, t: 0 };
    if (f.n >= 5 && Date.now() - f.t < 600e3) return json(res, 429, { error: 'Thử lại sau 10 phút' });
    const b = await body(req);
    const a = Buffer.from(String(b.pin || '')), c = Buffer.from(PIN);
    if (PIN && a.length === c.length && crypto.timingSafeEqual(a, c)) {
      failBy.delete(ip);
      return json(res, 200, { ok: true }, { 'Set-Cookie': `eb=${makeToken()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000` });
    }
    failBy.set(ip, { n: f.n + 1, t: Date.now() });
    return json(res, 401, { error: 'Sai mã PIN' });
  }
  if (p === '/api/session') return json(res, 200, { authed: authed(req), pin: !!PIN });
  if (!authed(req)) return json(res, 401, { error: 'unauthorized' });

  if (p === '/api/voices') return json(res, 200, tts.VOICES);
  if (p === '/api/lessons') return json(res, 200, seed);
  if (p === '/api/dict') {
    const r = dict.lookup(url.searchParams.get('q'));
    if (!r) return json(res, 503, { error: 'Chưa có dữ liệu từ điển (chạy scripts/get-dict.sh)' });
    if (r.found) {
      r.ipa = r.ipa.map(i => ({ ...i, say: pron.respell(i.ipa) }));
      const first = r.ipa[0];
      r.pron = first ? pron.wordTips(r.word, first.ipa) : null;
    }
    r.counts = dict.counts();
    return json(res, 200, r);
  }
  if (p === '/api/dict/suggest') return json(res, 200, dict.suggest(url.searchParams.get('q'), 12));
  if (p === '/api/dict/vi') {
    const r = dict.lookupVi(url.searchParams.get('q'));
    if (!r) return json(res, 503, { error: 'Chưa có từ điển Việt–Anh (chạy scripts/build-dict.js)' });
    for (const row of r.rows || []) for (const m of (row.m || []).slice(0, 6)) {
      const ip = dict.ipasOf(m.e)[0];
      if (ip) { m.ipa = ip.ipa; m.say = pron.respell(ip.ipa); }
    }
    return json(res, 200, r);
  }
  if (p === '/api/dict/vi/suggest') return json(res, 200, dict.suggestVi(url.searchParams.get('q'), 12));
  if (p === '/api/dict/translate') {
    const w = clip(url.searchParams.get('q'), 60).toLowerCase().trim(), r = dict.lookup(w);
    if (!r || !r.found) return json(res, 404, { error: 'Không có từ này' });
    const glosses = r.defs.filter(d => d.en).slice(0, 4).map(d => `${d.pos}: ${d.en.slice(0, 160)}`);
    try {
      return json(res, 200, await cached(`dtr|${w}`, () => codex.askJson(`Dịch nghĩa từ tiếng Anh "${r.word}" sang tiếng Việt cho người học. Định nghĩa gốc:\n${glosses.join('\n')}\nTrả JSON: {"vi":["nghĩa tiếng Việt ngắn gọn, tự nhiên cho từng định nghĩa theo đúng thứ tự (mỗi định nghĩa một chuỗi)"],"ex":"một câu ví dụ tiếng Anh tự nhiên dùng từ này","exvi":"dịch tiếng Việt"}`)));
    } catch (e) { return json(res, 502, { error: e.message }); }
  }
  if (p === '/api/pron/link') {
    const r = pron.analyze(url.searchParams.get('text'));
    return json(res, r.error ? 400 : 200, r);
  }
  if (p === '/api/pron/guide') return json(res, 200, pron.GUIDE);
  if (p === '/api/pron/sounds') return json(res, 200, Object.entries(pron.TIPS).map(([ipa, t]) => ({ ipa, name: t[0], how: t[1], eg: t[2] })));
  if (p === '/api/tts') {
    try {
      const f = await tts.synth(url.searchParams.get('text'), url.searchParams.get('voice'), url.searchParams.get('rate'));
      const st = fs.statSync(f);
      const range = req.headers.range && req.headers.range.match(/bytes=(\d*)-(\d*)/);
      const base = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=86400' };
      if (range) {
        const s = range[1] ? parseInt(range[1], 10) : 0, e = range[2] ? parseInt(range[2], 10) : st.size - 1;
        res.writeHead(206, { ...base, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Content-Length': e - s + 1 });
        return fs.createReadStream(f, { start: s, end: e }).pipe(res);
      }
      res.writeHead(200, { ...base, 'Content-Length': st.size });
      return fs.createReadStream(f).pipe(res);
    } catch (e) { return json(res, 502, { error: e.message }); }
  }
  if (p === '/api/generate' && req.method === 'POST') {
    const b = await body(req);
    const topic = clip(b.topic, 80), level = LEVELS[b.level] ? b.level : 'intermediate', group = b.group === 'business' ? 'business' : 'daily';
    if (!topic) return json(res, 400, { error: 'Thiếu chủ đề' });
    try { return json(res, 200, await cached(`gen|${topic.toLowerCase()}|${level}|${group}`, () => generate({ topic, level, group }))); }
    catch (e) { return json(res, 502, { error: e.message }); }
  }
  if (p === '/api/chat' && req.method === 'POST') {
    try { return json(res, 200, await chat(await body(req))); }
    catch (e) { return json(res, 502, { error: e.message }); }
  }
  return json(res, 404, { error: 'not found' });
}

function serveStatic(req, res, url) {
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const f = path.normalize(path.join(PUB, p));
  if (!f.startsWith(PUB) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': /\.(html|js|css)$/.test(p) ? 'no-store' : 'public, max-age=86400' });
  fs.createReadStream(f).pipe(res);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (e) { if (!res.headersSent) json(res, 500, { error: e.message }); else res.end(); }
}).listen(PORT, HOST, () => console.log(`Enautobot on http://${HOST}:${PORT}`));
