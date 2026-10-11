'use strict';
const $app = document.getElementById('app');
const S = { lessons: [], voices: [], tab: 'learn', topic: null, mode: 'vocab', level: 'intermediate', cat: 'all', lvf: 'all', q: '', dq: '' };
const store = {
  get(k, d) { try { const v = localStorage.getItem('eb_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('eb_' + k, JSON.stringify(v)); } catch {} },
};
const cfg = Object.assign({ rate: 1, vi: true, vA: 'en-US-JennyNeural', vB: 'en-US-GuyNeural', vAi: 'en-GB-SoniaNeural' }, store.get('cfg', {}));
const known = new Set(store.get('known', []));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = async (path, opt) => {
  const r = await fetch(path, opt && opt.body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opt.body) } : undefined);
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/api/login') { renderLogin(); throw new Error('unauthorized'); }
  if (!r.ok) throw new Error(j.error || 'Lỗi ' + r.status);
  return j;
};

/* ---------- audio ---------- */
const audio = new Audio();
audio.preload = 'auto';
let playToken = 0;
function speak(text, voice, onend) {
  const tok = ++playToken;
  audio.pause();
  audio.src = `/api/tts?voice=${encodeURIComponent(voice)}&rate=${cfg.rate}&text=${encodeURIComponent(text)}`;
  return new Promise(res => {
    const done = () => { audio.onended = audio.onerror = null; res(tok === playToken); onend && onend(); };
    audio.onended = done;
    audio.onerror = () => { // fallback: browser TTS
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = cfg.rate; u.onend = done; speechSynthesis.speak(u);
      } else done();
    };
    audio.play().catch(() => audio.onerror());
  });
}
const stopSpeak = () => { playToken++; audio.pause(); };
function prefetch(text, voice) { fetch(`/api/tts?voice=${encodeURIComponent(voice)}&rate=${cfg.rate}&text=${encodeURIComponent(text)}`).catch(() => {}); }

/* ---------- speech recognition ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen(lang = 'en-US') {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error('Trình duyệt không hỗ trợ nhận giọng nói. Hãy gõ chữ.'));
    stopSpeak();
    const r = new SR(); r.lang = lang; r.interimResults = false; r.maxAlternatives = 1;
    let got = '';
    r.onresult = e => { got = e.results[0][0].transcript; };
    r.onerror = e => reject(new Error(e.error === 'not-allowed' ? 'Hãy cho phép micro trong Safari' : 'Không nghe rõ, thử lại'));
    r.onend = () => resolve(got);
    r.start();
  });
}
const norm = s => s.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);
function scoreHtml(target, said) {
  const t = norm(target), s = new Set(norm(said));
  let ok = 0;
  const html = t.map(w => s.has(w) ? (ok++, `<span class="g">${esc(w)}</span>`) : `<span class="x">${esc(w)}</span>`).join(' ');
  const pct = t.length ? Math.round(ok * 100 / t.length) : 0;
  return `<div class="score">${pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪'} ${pct}% — ${html}<div class="muted">Bạn nói: “${esc(said)}”</div></div>`;
}

/* ---------- layout ---------- */
function shell(title, body, { back } = {}) {
  $app.innerHTML = `<header>${back ? '<button class="back" id="back">‹ Quay lại</button>' : ''}<h1>${esc(title)}</h1></header><main id="main">${body}</main>
  <nav>${[['learn', '📚', 'Học'], ['dict', '📖', 'Từ điển'], ['talk', '🎙️', 'Nói'], ['set', '⚙️', 'Giọng']].map(([k, i, l]) => `<button data-tab="${k}" class="${S.tab === k && !back ? 'on' : S.tab === k ? 'on' : ''}"><span>${i}</span>${l}</button>`).join('')}</nav>`;
  $app.querySelectorAll('nav button').forEach(b => b.onclick = () => { stopSpeak(); S.tab = b.dataset.tab; S.topic = null; route(); });
  if (back) document.getElementById('back').onclick = back;
}
function voiceOptions(sel) {
  return S.voices.map(v => `<option value="${v.id}" ${v.id === sel ? 'selected' : ''}>${v.gender === 'F' ? '👩' : '👨'} ${v.label} — ${v.accent}</option>`).join('');
}

/* ---------- login ---------- */
function renderLogin(msg) {
  $app.innerHTML = `<div class="center"><div style="font-size:56px">🗣️</div><h1>Enautobot</h1><p class="muted">Nhập mã PIN để vào</p>
  <input id="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="PIN" style="text-align:center;font-size:22px">
  <p class="muted" id="err" style="color:var(--bad)">${esc(msg || '')}</p><button class="btn full" id="go">Vào học</button></div>`;
  const go = async () => {
    try { await api('/api/login', { body: { pin: document.getElementById('pin').value } }); init(); }
    catch (e) { document.getElementById('err').textContent = e.message; }
  };
  document.getElementById('go').onclick = go;
  document.getElementById('pin').onkeydown = e => { if (e.key === 'Enter') go(); };
}

/* ---------- learn ---------- */
const CATS = [['all', 'Tất cả'], ['business', '💼 Kinh doanh'], ['daily', '🏠 Hằng ngày'], ['travel', '✈️ Du lịch'], ['health', '🩺 Sức khỏe'], ['tech', '💻 Công nghệ'], ['academic', '🎓 Học thuật'], ['society', '🌍 Xã hội'], ['idioms', '💬 Thành ngữ'], ['phrasal', '🔗 Cụm động từ'], ['grammar', '📐 Ngữ pháp'], ['speaking', '👄 Phát âm & nói']];
const LVF = [['all', 'Mọi trình độ'], ['beginner', 'Cơ bản'], ['intermediate', 'Trung cấp'], ['advanced', 'Nâng cao']];
const LV_BADGE = { beginner: 'A2', intermediate: 'B1-B2', advanced: 'C1' };
const lessonDone = t => t.vocab.length && t.vocab.every(v => known.has(t.id + ':' + v.w));
const lessonKnown = t => t.vocab.filter(v => known.has(t.id + ':' + v.w)).length;
function filteredLessons() {
  const q = S.q.trim().toLowerCase();
  return S.lessons.filter(t => (S.cat === 'all' || t.group === S.cat) && (S.lvf === 'all' || (t.level || 'intermediate') === S.lvf)
    && (!q || t.title.toLowerCase().includes(q) || t.vocab.some(v => v.w.toLowerCase().includes(q))));
}
function drawTopics() {
  const list = filteredLessons(), box = document.getElementById('tl');
  document.getElementById('cnt').textContent = `${list.length} / ${S.lessons.length} bài`;
  box.innerHTML = list.length ? list.map(t => {
    const k = lessonKnown(t);
    return `<button class="topic" data-id="${t.id}"><b>${t.icon}</b>${esc(t.title)}<span class="meta">${LV_BADGE[t.level || 'intermediate']}${k ? ` · ${lessonDone(t) ? '✓' : k + '/' + t.vocab.length}` : ''}</span></button>`;
  }).join('') : '<p class="muted">Không tìm thấy bài nào.</p>';
  box.querySelectorAll('.topic').forEach(b => b.onclick = () => { S.topic = S.lessons.find(t => t.id === b.dataset.id); S.mode = 'vocab'; S.scroll = document.getElementById('main').scrollTop; route(); });
}
function renderLearn() {
  const done = S.lessons.filter(lessonDone).length;
  shell('Học tiếng Anh', `<p class="muted">${S.lessons.length} bài · đã thuộc ${done} bài · ${known.size} từ</p>
  <input id="sq" type="search" placeholder="🔎 Tìm bài hoặc từ vựng..." value="${esc(S.q)}">
  <div class="chips scroll" id="cf">${CATS.map(([k, l]) => `<button class="chip ${S.cat === k ? 'on' : ''}" data-c="${k}">${l}</button>`).join('')}</div>
  <div class="chips scroll" id="lf">${LVF.map(([k, l]) => `<button class="chip ${S.lvf === k ? 'on' : ''}" data-l="${k}">${l}</button>`).join('')}</div>
  <h2 id="cnt"></h2><div class="grid" id="tl"></div>
  <h2>Tạo bài mới bằng AI</h2><div class="card"><input id="gt" placeholder="Chủ đề, vd: hỏi lương, đặt phòng khách sạn"><div class="chips" id="gl">${lvChips()}</div>
  <div class="chips" id="gg"><button class="chip on" data-g="business">Kinh doanh</button><button class="chip" data-g="daily">Hằng ngày</button></div>
  <button class="btn full" id="gen">✨ Tạo bài (mất ~30 giây)</button><p class="muted" id="gs"></p></div>`);
  drawTopics();
  if (S.scroll) { document.getElementById('main').scrollTop = S.scroll; S.scroll = 0; }
  document.getElementById('sq').oninput = e => { S.q = e.target.value; drawTopics(); };
  const bindF = (id, attr, key) => $app.querySelectorAll(`#${id} .chip`).forEach(c => c.onclick = () => { S[key] = c.dataset[attr]; $app.querySelectorAll(`#${id} .chip`).forEach(x => x.classList.toggle('on', x === c)); drawTopics(); });
  bindF('cf', 'c', 'cat'); bindF('lf', 'l', 'lvf');
  bindLv('gl');
  let grp = 'business';
  $app.querySelectorAll('#gg .chip').forEach(c => c.onclick = () => { grp = c.dataset.g; $app.querySelectorAll('#gg .chip').forEach(x => x.classList.toggle('on', x === c)); });
  document.getElementById('gen').onclick = async e => {
    const topic = document.getElementById('gt').value.trim(); if (!topic) return;
    e.target.disabled = true; document.getElementById('gs').innerHTML = '<span class="dots">AI đang soạn bài</span>';
    try {
      const t = await api('/api/generate', { body: { topic, level: S.level, group: grp } });
      t.icon = '✨'; t.title = t.title || topic; S.topic = t; S.mode = 'vocab'; route();
    } catch (er) { document.getElementById('gs').textContent = '⚠️ ' + er.message; e.target.disabled = false; }
  };
}
const LV = [['beginner', 'Cơ bản'], ['intermediate', 'Trung cấp'], ['advanced', 'Nâng cao']];
const lvChips = () => LV.map(([k, l]) => `<button class="chip ${S.level === k ? 'on' : ''}" data-l="${k}">${l}</button>`).join('');
function bindLv(id) { const box = document.getElementById(id); box.querySelectorAll('.chip').forEach(c => c.onclick = () => { S.level = c.dataset.l; box.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); }); }

function renderTopic() {
  const t = S.topic;
  shell(`${t.icon} ${t.title}${t.level ? ' · ' + LV_BADGE[t.level] : ''}`, `<div class="tabs"><button data-m="vocab" class="${S.mode === 'vocab' ? 'on' : ''}">Từ vựng</button><button data-m="dlg" class="${S.mode === 'dlg' ? 'on' : ''}">Hội thoại</button></div><div id="body"></div>`, { back: () => { stopSpeak(); S.topic = null; route(); } });
  $app.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { stopSpeak(); S.mode = b.dataset.m; renderTopic(); });
  S.mode === 'vocab' ? renderVocab() : renderDialogue();
}
function renderVocab() {
  const t = S.topic, body = document.getElementById('body');
  body.innerHTML = t.vocab.map((v, i) => `<div class="card"><div class="row"><div style="flex:1"><div class="word" data-d="${i}">${esc(v.w)} <small>📖</small></div><div class="ipa">${esc(v.ipa)}</div><div class="vi">${esc(v.vi)}</div></div>
  <button class="icon" data-w="${i}">🔊</button></div><div class="row" style="margin-top:8px"><div class="ex" style="flex:1">“${esc(v.ex)}”${cfg.vi ? `<div class="muted">${esc(v.exvi)}</div>` : ''}</div><button class="icon" data-e="${i}">▶️</button></div>
  <div class="row" style="margin-top:8px"><button class="chip" data-m="${i}">🎤 Nhại câu</button><button class="chip ${known.has(t.id + ':' + v.w) ? 'on' : ''}" data-k="${i}">${known.has(t.id + ':' + v.w) ? '✓ Đã thuộc' : 'Đánh dấu thuộc'}</button></div><div id="sc${i}"></div></div>`).join('');
  body.querySelectorAll('[data-d]').forEach(b => b.onclick = () => openDict(t.vocab[b.dataset.d].w));
  body.querySelectorAll('[data-w]').forEach(b => b.onclick = () => speak(t.vocab[b.dataset.w].w, cfg.vA));
  if (t.phrases && t.phrases.length) {
    body.insertAdjacentHTML('beforeend', `<h2>Mẫu câu hữu ích</h2>` + t.phrases.map((p, i) => `<div class="card"><div class="row"><div style="flex:1" class="ex"><b>${esc(p.en)}</b>${cfg.vi ? `<div class="vi">${esc(p.vi)}</div>` : ''}</div><button class="icon" data-ph="${i}">🔊</button></div></div>`).join(''));
    body.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => speak(t.phrases[b.dataset.ph].en, cfg.vA));
  }
  body.querySelectorAll('[data-e]').forEach(b => b.onclick = () => speak(t.vocab[b.dataset.e].ex, cfg.vA));
  body.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    const k = t.id + ':' + t.vocab[b.dataset.k].w; known.has(k) ? known.delete(k) : known.add(k); store.set('known', [...known]); renderVocab();
  });
  body.querySelectorAll('[data-m]').forEach(b => b.onclick = () => shadow(b, t.vocab[b.dataset.m].ex, document.getElementById('sc' + b.dataset.m)));
}
async function shadow(btn, target, out) {
  btn.textContent = '🎙️ Đang nghe...'; btn.classList.add('on');
  try { const said = await listen(); out.innerHTML = said ? scoreHtml(target, said) : '<div class="muted">Không nghe thấy gì</div>'; }
  catch (e) { out.innerHTML = `<div class="muted">⚠️ ${esc(e.message)}</div>`; }
  btn.textContent = '🎤 Nhại câu'; btn.classList.remove('on');
}

let dlgRun = 0;
function renderDialogue() {
  const d = S.topic.dialogue, body = document.getElementById('body'), voice = { A: cfg.vA, B: cfg.vB };
  body.innerHTML = `<div class="muted">${esc(d.title || '')}</div><div class="row" style="margin:8px 0"><button class="btn" id="pa" style="flex:1">▶️ Nghe cả đoạn</button><button class="btn sec" id="rp" style="flex:1">🎭 Đóng vai ${esc(d.roles.B)}</button></div>
  <div id="lines">${d.lines.map((l, i) => `<div class="line ${l.r}" data-i="${i}"><button class="icon" data-p="${i}">🔊</button><div class="bubble"><div class="who">${esc(d.roles[l.r])}</div>${esc(l.en)}${cfg.vi ? `<div class="vi">${esc(l.vi)}</div>` : ''}<div id="ds${i}"></div></div></div>`).join('')}</div>`;
  d.lines.slice(0, 3).forEach(l => prefetch(l.en, voice[l.r]));
  const mark = i => body.querySelectorAll('.line').forEach(x => x.classList.toggle('on', +x.dataset.i === i));
  body.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { dlgRun++; const l = d.lines[b.dataset.p]; mark(+b.dataset.p); speak(l.en, voice[l.r]); });
  async function play(roleplay) {
    const run = ++dlgRun;
    for (let i = 0; i < d.lines.length; i++) {
      if (run !== dlgRun) return;
      const l = d.lines[i]; mark(i);
      if (d.lines[i + 1]) prefetch(d.lines[i + 1].en, voice[d.lines[i + 1].r]);
      document.querySelector(`[data-i="${i}"]`).scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (roleplay && l.r === 'B') {
        const out = document.getElementById('ds' + i); out.innerHTML = '<div class="muted">🎙️ Đến lượt bạn — hãy đọc câu này...</div>';
        try { const said = await listen(); if (run !== dlgRun) return; out.innerHTML = said ? scoreHtml(l.en, said) : ''; } catch (e) { out.innerHTML = `<div class="muted">⚠️ ${esc(e.message)}</div>`; }
        await new Promise(r => setTimeout(r, 1200));
      } else { const ok = await speak(l.en, voice[l.r]); if (!ok) return; await new Promise(r => setTimeout(r, 300)); }
    }
    mark(-1);
  }
  document.getElementById('pa').onclick = () => play(false);
  document.getElementById('rp').onclick = () => play(true);
}


/* ---------- dictionary ---------- */
function dictHtml(r) {
  if (!r.found) return `<div class="muted">Không tìm thấy “${esc(r.word)}”. Thử từ gốc (vd: run thay vì running) hoặc kiểm tra chính tả.</div>`;
  const ipa = r.ipa.length ? r.ipa[0].ipa : '';
  const byPos = {};
  r.defs.forEach(d => (byPos[d.pos || '—'] = byPos[d.pos || '—'] || []).push(d));
  return `<div class="row"><div style="flex:1"><div class="word">${esc(r.word)}</div><div class="ipa">${esc(r.ipa.map(p => p.ipa + (p.region ? ' (' + p.region + ')' : '')).join('  '))}</div></div>
  <button class="icon" data-say="${esc(r.word)}">🔊</button></div>` + Object.entries(byPos).map(([pos, ds]) =>
    `<h2>${esc(pos)}</h2>` + ds.map(d => `<div class="def"><div class="vi">${esc(d.vi)}</div>${d.ex ? `<div class="ex">“${esc(d.ex)}” <button class="mini" data-say="${esc(d.ex)}">▶️</button></div>` : ''}</div>`).join('')).join('');
}
function bindSay(root) { root.querySelectorAll('[data-say]').forEach(b => b.onclick = () => speak(b.dataset.say, cfg.vA)); }
async function openDict(word) {
  const sh = document.createElement('div'); sh.className = 'sheet';
  sh.innerHTML = `<div class="sheet-in"><button class="chip" id="sx" style="float:right">✕ Đóng</button><div id="sb"><span class="dots">Đang tra</span></div></div>`;
  document.body.appendChild(sh);
  sh.onclick = e => { if (e.target === sh) sh.remove(); };
  sh.querySelector('#sx').onclick = () => sh.remove();
  try { const r = await api('/api/dict?q=' + encodeURIComponent(word)); const sb = sh.querySelector('#sb'); sb.innerHTML = dictHtml(r); bindSay(sb); }
  catch (e) { sh.querySelector('#sb').textContent = '⚠️ ' + e.message; }
}
let dictTimer = 0;
function renderDict() {
  const hist = store.get('dhist', []);
  shell('Từ điển Anh – Việt', `<input id="dq" type="search" placeholder="Nhập từ hoặc cụm từ tiếng Anh..." value="${esc(S.dq)}" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">
  <div class="chips scroll" id="dsug"></div><div id="dres"></div>
  <p class="muted" style="margin-top:20px">Dữ liệu: ~105.000 từ & cụm từ, có phiên âm và ví dụ. CC BY-SA 4.0 (MinhQND, Wiktionary…).</p>`);
  const res = document.getElementById('dres'), sug = document.getElementById('dsug'), inp = document.getElementById('dq');
  const showHist = () => { res.innerHTML = hist.length ? `<h2>Đã tra gần đây</h2><div class="chips">${hist.map(h => `<button class="chip" data-h="${esc(h)}">${esc(h)}</button>`).join('')}</div>` : ''; res.querySelectorAll('[data-h]').forEach(b => b.onclick = () => look(b.dataset.h)); };
  async function look(w) {
    w = w.trim(); if (!w) return;
    inp.value = S.dq = w; sug.innerHTML = ''; res.innerHTML = '<span class="dots">Đang tra</span>';
    try {
      const r = await api('/api/dict?q=' + encodeURIComponent(w));
      res.innerHTML = dictHtml(r); bindSay(res);
      if (r.found) { const h = [r.word, ...hist.filter(x => x !== r.word)].slice(0, 20); store.set('dhist', h); hist.splice(0, hist.length, ...h); }
    } catch (e) { res.textContent = '⚠️ ' + e.message; }
  }
  inp.oninput = () => {
    S.dq = inp.value; clearTimeout(dictTimer);
    if (!inp.value.trim()) { sug.innerHTML = ''; return showHist(); }
    dictTimer = setTimeout(async () => {
      try { const l = await api('/api/dict/suggest?q=' + encodeURIComponent(inp.value)); sug.innerHTML = l.map(w => `<button class="chip" data-s="${esc(w)}">${esc(w)}</button>`).join(''); sug.querySelectorAll('[data-s]').forEach(b => b.onclick = () => look(b.dataset.s)); } catch {}
    }, 150);
  };
  inp.onkeydown = e => { if (e.key === 'Enter') { inp.blur(); look(inp.value); } };
  S.dq ? look(S.dq) : showHist();
}

/* ---------- talk (AI chat) ---------- */
const SCEN = ['Họp với đồng nghiệp', 'Đàm phán giá với nhà cung cấp', 'Gọi điện cho khách hàng', 'Phỏng vấn xin việc', 'Gọi món ở nhà hàng', 'Hỏi đường ở sân bay', 'Trò chuyện làm quen'];
const SCEN_EN = { 'Họp với đồng nghiệp': 'a team meeting at work', 'Đàm phán giá với nhà cung cấp': 'negotiating a price with a supplier', 'Gọi điện cho khách hàng': 'a business phone call with a customer', 'Phỏng vấn xin việc': 'a job interview (you are the interviewer)', 'Gọi món ở nhà hàng': 'ordering at a restaurant (you are the waiter)', 'Hỏi đường ở sân bay': 'asking for help at an airport (you are airport staff)', 'Trò chuyện làm quen': 'friendly small talk with a new acquaintance' };
let chat = { scen: null, hist: [], busy: false };
function renderTalk() {
  if (!chat.scen) {
    shell('Luyện nói với AI', `<p class="muted">Chọn tình huống. AI (gpt-5.5) sẽ đóng vai đối tác, đọc to và sửa lỗi cho bạn.</p><div class="chips" id="gl">${lvChips()}</div>
    ${SCEN.map(s => `<button class="topic" style="width:100%;margin:6px 0;text-align:left" data-s="${esc(s)}">${esc(s)}</button>`).join('')}
    <input id="cs" placeholder="Hoặc tự nhập tình huống..." style="margin-top:8px"><button class="btn full" id="cg" style="margin-top:8px">Bắt đầu</button>`);
    bindLv('gl');
    $app.querySelectorAll('[data-s]').forEach(b => b.onclick = () => startChat(SCEN_EN[b.dataset.s]));
    document.getElementById('cg').onclick = () => { const v = document.getElementById('cs').value.trim(); if (v) startChat(v); };
    return;
  }
  shell('Luyện nói', `<div class="chat" id="chat"></div>`, { back: () => { stopSpeak(); chat = { scen: null, hist: [], busy: false }; route(); } });
  const comp = document.createElement('div'); comp.className = 'composer';
  comp.innerHTML = `<button class="icon mic" id="mic">🎤</button><input id="ti" placeholder="Nói hoặc gõ tiếng Anh..." autocomplete="off" autocapitalize="sentences"><button class="icon" id="snd">➤</button>`;
  $app.insertBefore(comp, $app.querySelector('nav'));
  drawChat();
  const send = t => { t = t.trim(); if (t && !chat.busy) { document.getElementById('ti').value = ''; turn(t); } };
  document.getElementById('snd').onclick = () => send(document.getElementById('ti').value);
  document.getElementById('ti').onkeydown = e => { if (e.key === 'Enter') send(e.target.value); };
  const mic = document.getElementById('mic');
  mic.onclick = async () => {
    if (chat.busy) return; mic.classList.add('rec');
    try { send(await listen()); } catch (e) { alert(e.message); }
    mic.classList.remove('rec');
  };
}
function drawChat() {
  const c = document.getElementById('chat'); if (!c) return;
  c.innerHTML = chat.hist.map(m => m.role === 'me'
    ? `<div class="msg me">${esc(m.text)}</div>${m.fix ? `<div class="fix">✏️ <b>${esc(m.fix)}</b>${m.note ? `<br>${esc(m.note)}` : ''}${m.better ? `<br>💡 ${esc(m.better)}` : ''}</div>` : ''}`
    : `<div class="msg ai">${esc(m.text)}${cfg.vi && m.vi ? `<div class="vi">${esc(m.vi)}</div>` : ''}<div><button class="chip" data-r="${esc(m.text)}">🔊 Nghe lại</button></div></div>`).join('')
    + (chat.busy ? '<div class="msg ai"><span class="dots">AI đang trả lời</span></div>' : '');
  c.querySelectorAll('[data-r]').forEach(b => b.onclick = () => speak(b.dataset.r, cfg.vAi));
  const m = document.getElementById('main'); m.scrollTop = m.scrollHeight;
}
function startChat(scen) { chat = { scen, hist: [], busy: false }; renderTalk(); turn(''); }
async function turn(user) {
  if (user) chat.hist.push({ role: 'me', text: user });
  chat.busy = true; drawChat();
  try {
    const r = await api('/api/chat', { body: { scenario: chat.scen, level: S.level, user, history: chat.hist.slice(0, user ? -1 : undefined).map(m => ({ role: m.role, text: m.text })) } });
    if (user) { const me = chat.hist[chat.hist.length - 1]; me.fix = r.correction; me.note = r.note_vi; me.better = r.better; }
    chat.hist.push({ role: 'ai', text: r.reply, vi: r.reply_vi });
    chat.busy = false; drawChat(); speak(r.reply, cfg.vAi);
  } catch (e) { chat.busy = false; chat.hist.push({ role: 'ai', text: '⚠️ ' + e.message }); drawChat(); }
}

/* ---------- settings ---------- */
function renderSettings() {
  shell('Giọng & cài đặt', `<div class="card">
  <label>Giọng người nói A (hội thoại)</label><select id="vA">${voiceOptions(cfg.vA)}</select><button class="chip" data-t="vA" style="margin-top:6px">🔊 Thử</button>
  <label>Giọng người nói B (hội thoại)</label><select id="vB">${voiceOptions(cfg.vB)}</select><button class="chip" data-t="vB" style="margin-top:6px">🔊 Thử</button>
  <label>Giọng AI khi luyện nói</label><select id="vAi">${voiceOptions(cfg.vAi)}</select><button class="chip" data-t="vAi" style="margin-top:6px">🔊 Thử</button>
  <label>Tốc độ đọc: <b id="rv">${cfg.rate}×</b></label><input type="range" id="rate" min="0.6" max="1.3" step="0.1" value="${cfg.rate}">
  <label><input type="checkbox" id="vi" ${cfg.vi ? 'checked' : ''} style="width:auto"> Hiện bản dịch tiếng Việt</label></div>
  <p class="muted">Giọng đọc: Mỹ, Anh, Úc, Canada, Ấn Độ, Ireland, New Zealand, Nam Phi, Singapore, Philippines, Nigeria — nam & nữ.</p>`);
  const save = () => { store.set('cfg', cfg); };
  ['vA', 'vB', 'vAi'].forEach(k => document.getElementById(k).onchange = e => { cfg[k] = e.target.value; save(); speak('Hello! Nice to meet you. How are you today?', cfg[k]); });
  document.getElementById('rate').oninput = e => { cfg.rate = +e.target.value; document.getElementById('rv').textContent = cfg.rate + '×'; save(); };
  document.getElementById('vi').onchange = e => { cfg.vi = e.target.checked; save(); };
  $app.querySelectorAll('[data-t]').forEach(b => b.onclick = () => speak('Hello! Nice to meet you. Shall we begin the meeting?', cfg[b.dataset.t]));
}

function route() {
  if (S.tab === 'learn') S.topic ? renderTopic() : renderLearn();
  else if (S.tab === 'dict') renderDict();
  else if (S.tab === 'talk') renderTalk();
  else renderSettings();
}
async function init() {
  try {
    const s = await api('/api/session');
    if (!s.authed) return renderLogin();
    [S.lessons, S.voices] = await Promise.all([api('/api/lessons').then(j => j.topics), api('/api/voices')]);
    route();
  } catch (e) { if (e.message !== 'unauthorized') $app.innerHTML = `<div class="center">⚠️ ${esc(e.message)}</div>`; }
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
init();
