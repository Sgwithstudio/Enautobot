// Build data/dict/dict.db (EN->VI + VI->EN) from:
//  - data/dict/dictionary_en_vi.db   (Vietnamese definitions, CC BY-SA 4.0)
//  - kaikki.org Wiktionary extracts   (English glosses, IPA, vi translations; CC BY-SA 4.0 / GFDL)
// Usage: node --no-warnings scripts/build-dict.js <kaikki-English.jsonl> <kaikki-Vietnamese.jsonl>
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { DatabaseSync } = require('node:sqlite');

const [EN_FILE, VI_FILE] = process.argv.slice(2);
if (!EN_FILE || !VI_FILE) { console.error('usage: build-dict.js <English.jsonl> <Vietnamese.jsonl>'); process.exit(1); }
const DIR = path.join(__dirname, '..', 'data', 'dict');
const OUT = path.join(DIR, 'dict.db');

const POSMAP = { noun: 'N', verb: 'V', adj: 'A', adv: 'D', prep: 'P', conj: 'C', intj: 'I', pron: 'PR', det: 'DET', num: 'NUM', phrase: 'PHR', name: 'NAME', prep_phrase: 'PHR', proverb: 'PHR', particle: 'PART', contraction: 'CON', article: 'DET', abbrev: 'ABBR', symbol: 'SYM', character: 'CH', romanization: 'ROM', suffix: 'SUF', prefix: 'PRE', affix: 'AFF', infix: 'AFF', circumfix: 'AFF', interfix: 'AFF', classifier: 'CL', punct: 'PUNCT' };
const OLDPOS = { N: 'N', V: 'V', A: 'A', D: 'D', P: 'P', C: 'C', I: 'I', idiom: 'PHR' };
const noMarks = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
const okEn = w => w.length <= 60 && /^[\p{L}][\p{L}\p{M}0-9 '\-\.&\/,!?]*$/u.test(w);

const en = new Map();   // key -> {ipa:[], d:[], t:Set, b:null}
const vi = new Map();   // viWord -> {ipa, m:[], d:[]}
const getEn = k => { let e = en.get(k); if (!e) en.set(k, e = { ipa: [], d: [], t: new Set(), b: null, caps: false }); return e; };
const getVi = k => { let e = vi.get(k); if (!e) vi.set(k, e = { ipa: '', m: [], d: [] }); return e; };
const addIpa = (e, ipa, tag) => { if (ipa && !e.ipa.some(x => x[0] === ipa) && e.ipa.length < 3) e.ipa.push([ipa, tag || '']); };

// 1. existing dictionary with Vietnamese definitions
(function loadOld() {
  const f = path.join(DIR, 'dictionary_en_vi.db');
  const db = new DatabaseSync(f, { readOnly: true });
  const rows = db.prepare('SELECT w.id, w.word, d.pos, d.definition, wd.example FROM word_definitions wd JOIN words w ON w.id = wd.word_id JOIN definitions d ON d.id = wd.definition_id ORDER BY w.id, wd.id').all();
  const ipas = new Map();
  for (const r of db.prepare('SELECT word_id, ipa, region FROM pronunciations ORDER BY id').all()) { (ipas.get(r.word_id) || ipas.set(r.word_id, []).get(r.word_id)).push([r.ipa, r.region || '']); }
  const seenIpa = new Set();
  for (const r of rows) {
    const k = r.word.toLowerCase(), e = getEn(k);
    if (!seenIpa.has(r.id)) { seenIpa.add(r.id); (ipas.get(r.id) || []).slice(0, 3).forEach(([i, t]) => addIpa(e, i, t)); }
    if (e.d.length < 14 && !e.d.some(d => d.v === r.definition)) e.d.push({ p: OLDPOS[r.pos] || r.pos || '', v: r.definition, x: r.example || '' });
    // reverse index: short Vietnamese phrases -> English headword
    for (let piece of r.definition.replace(/\([^)]*\)/g, '').split(/[,;.]/)) {
      piece = piece.trim().toLowerCase();
      const n = piece.split(/\s+/).length;
      if (piece.length < 2 || n > 5 || /[0-9\/:"]/.test(piece) || !/\p{L}/u.test(piece)) continue;
      const v = getVi(piece);
      if (v.m.length < 12 && !v.m.some(m => m.e === k)) v.m.push({ e: k, p: OLDPOS[r.pos] || '', s: n <= 2 ? 0 : 1 });
    }
  }
  db.close();
  console.log('old dict: en', en.size, 'vi', vi.size);
})();

async function lines(file, fn) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let n = 0;
  for await (const l of rl) { if (l) { fn(JSON.parse(l)); if (++n % 200000 === 0) console.log('  ', n, 'lines; en', en.size, 'vi', vi.size); } }
  return n;
}

(async () => {
  // 2. Wiktionary English
  await lines(EN_FILE, j => {
    if (j.lang_code !== 'en' || !j.word || !okEn(j.word)) return;
    const k = j.word.toLowerCase(), pos = POSMAP[j.pos] || j.pos || '';
    if (pos === 'CH' || pos === 'ROM' || pos === 'PUNCT') return;
    const e = getEn(k);
    if (j.word !== k && !/[A-Z]/.test(j.word.slice(1)) && pos === 'NAME') e.caps = true;
    for (const s of j.sounds || []) {
      if (!s.ipa) continue;
      const tags = (s.tags || []).join(' ');
      addIpa(e, s.ipa, /General-American|US/.test(tags) ? 'US' : /Received-Pronunciation|UK|British/.test(tags) ? 'UK' : '');
    }
    let added = 0;
    for (const s of j.senses || []) {
      const g = (s.glosses || [])[0]; if (!g) continue;
      const form = (s.form_of && s.form_of[0] && s.form_of[0].word) || (s.alt_of && s.alt_of[0] && s.alt_of[0].word);
      if (form && !e.b) e.b = form;
      if (e.d.some(d => d.e === g.slice(0, 220))) continue;
      if (e.d.length < 14 && added < 4 && !/^(Alternative|Obsolete|Misspelling)/.test(g) || (e.d.length < 14 && !e.d.length)) {
        const x = (s.examples || []).find(x => x.text && x.text.length < 140);
        e.d.push({ p: pos, e: g.slice(0, 220), x: x ? x.text : '' }); added++;
      }
    }
    for (const t of j.translations || []) {
      if (t.lang_code !== 'vi' || !t.word) continue;
      if (e.t.size < 8) e.t.add(t.word);
      const v = getVi(t.word.toLowerCase());
      if (v.m.length < 12 && !v.m.some(m => m.e === k)) v.m.push({ e: k, p: pos, g: (t.sense || '').slice(0, 80), s: 0 });
    }
  });
  console.log('wiktionary en done: en', en.size, 'vi', vi.size);

  // 3. Wiktionary Vietnamese
  await lines(VI_FILE, j => {
    if (!j.word || ['character', 'romanization'].includes(j.pos)) return;
    const w = j.word.toLowerCase(); if (w.length > 50 || /[0-9]/.test(w)) return;
    const v = getVi(w), pos = POSMAP[j.pos] || j.pos || '';
    for (const s of j.sounds || []) if (s.ipa && !v.ipa) v.ipa = s.ipa;
    const gl = (j.senses || []).map(s => (s.glosses || [])[0]).filter(Boolean).slice(0, 5).map(g => g.slice(0, 160));
    if (gl.length && v.d.length < 6) v.d.push({ p: pos, g: gl });
  });
  console.log('wiktionary vi done: vi', vi.size);

  // 4. write
  if (fs.existsSync(OUT)) fs.unlinkSync(OUT);
  const db = new DatabaseSync(OUT);
  db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
    CREATE TABLE en (word TEXT PRIMARY KEY, ipa TEXT, data TEXT, hv INTEGER) WITHOUT ROWID;
    CREATE TABLE vi (word TEXT, norm TEXT, data TEXT);
    CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);`);
  const insEn = db.prepare('INSERT INTO en VALUES (?,?,?,?)'), insVi = db.prepare('INSERT INTO vi VALUES (?,?,?)');
  db.exec('BEGIN');
  let ne = 0, nv = 0;
  for (const [k, e] of en) {
    if (!e.d.length && !e.t.size) continue;
    const rec = { d: e.d };
    if (e.t.size) rec.t = [...e.t];
    if (e.b && e.b.toLowerCase() !== k) rec.b = e.b;
    insEn.run(k, JSON.stringify(e.ipa), JSON.stringify(rec), (e.d.some(x => x.v) || e.t.size ? 2 : 0) + (e.ipa.length ? 1 : 0)); ne++;
  }
  for (const [k, v] of vi) {
    if (!v.m.length && !v.d.length) continue;
    v.m.sort((a, b) => a.s - b.s);
    const rec = {}; if (v.m.length) rec.m = v.m.slice(0, 10); if (v.d.length) rec.d = v.d; if (v.ipa) rec.ipa = v.ipa;
    insVi.run(k, noMarks(k), JSON.stringify(rec)); nv++;
  }
  db.exec('COMMIT; CREATE INDEX vi_word ON vi(word); CREATE INDEX vi_norm ON vi(norm);');
  db.prepare('INSERT INTO meta VALUES (?,?)').run('counts', JSON.stringify({ en: ne, vi: nv, built: new Date().toISOString() }));
  db.exec('VACUUM');
  console.log('written: en', ne, 'vi', nv, (fs.statSync(OUT).size / 1e6).toFixed(0) + ' MB');
})();
