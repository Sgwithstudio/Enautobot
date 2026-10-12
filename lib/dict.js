// Offline dictionary (SQLite via node:sqlite): English->Vietnamese (~1.3M entries) and Vietnamese->English.
// Built by scripts/build-dict.js into data/dict/dict.db. Sources: MinhQND/skypediacode EN-VI DB and
// Wiktionary (kaikki.org) — all CC BY-SA, see data/dict/ATTRIBUTION.md. Falls back to the old DB if dict.db is missing.
const path = require('path');
const fs = require('fs');

const DIR = path.join(__dirname, '..', 'data', 'dict');
const NEW = path.join(DIR, 'dict.db'), OLD = path.join(DIR, 'dictionary_en_vi.db');
const POS = { N: 'danh từ', V: 'động từ', A: 'tính từ', D: 'trạng từ', P: 'giới từ', C: 'liên từ', I: 'thán từ', PR: 'đại từ', DET: 'hạn định từ', NUM: 'số từ', PHR: 'cụm từ / thành ngữ', NAME: 'tên riêng', PART: 'tiểu từ', CON: 'dạng rút gọn', ABBR: 'viết tắt', SYM: 'ký hiệu', SUF: 'hậu tố', PRE: 'tiền tố', AFF: 'phụ tố', CL: 'loại từ', idiom: 'thành ngữ', O: 'khác' };

let db = null, legacy = false, st = {};
function open() {
  if (db) return true;
  const f = fs.existsSync(NEW) ? NEW : fs.existsSync(OLD) ? OLD : null;
  if (!f) return false;
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(f, { readOnly: true });
  legacy = f === OLD;
  if (!legacy) {
    st.en = db.prepare('SELECT word, ipa, data FROM en WHERE word = ?');
    st.enPrefix = db.prepare('SELECT word FROM en WHERE word >= ? AND word < ? ORDER BY hv DESC, length(word), word LIMIT ?');
    st.viNorm = db.prepare('SELECT word, data FROM vi WHERE norm = ? LIMIT 40');
    st.viPrefix = db.prepare('SELECT DISTINCT word FROM vi WHERE norm >= ? AND norm < ? LIMIT 300');
    st.viLike = db.prepare('SELECT word, data FROM vi WHERE norm >= ? AND norm < ? LIMIT 12');
    st.count = db.prepare("SELECT v FROM meta WHERE k = 'counts'");
  } else {
    st.w = db.prepare('SELECT id, word FROM words WHERE word = ?');
    st.defs = db.prepare('SELECT d.pos, d.definition, wd.example FROM word_definitions wd JOIN definitions d ON d.id = wd.definition_id WHERE wd.word_id = ? ORDER BY wd.id LIMIT 30');
    st.ipa = db.prepare('SELECT ipa, region FROM pronunciations WHERE word_id = ? ORDER BY id LIMIT 4');
    st.prefix = db.prepare('SELECT word FROM words WHERE word >= ? AND word < ? LIMIT 600');
  }
  return true;
}
const available = () => open();
const hasVi = () => open() && !legacy;
const counts = () => { try { return open() && !legacy ? JSON.parse(st.count.get().v) : null; } catch { return null; } };

const noMarks = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
function clean(q) { return String(q || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}0-9' \-\.&]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); }

// candidate base forms for simple inflections
function candidates(w) {
  const c = [w];
  if (w.endsWith('ies')) c.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) c.push(w.slice(0, -2));
  if (w.endsWith('s')) c.push(w.slice(0, -1));
  if (w.endsWith('ied')) c.push(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) { c.push(w.slice(0, -2), w.slice(0, -1)); if (/(.)\1ed$/.test(w)) c.push(w.slice(0, -3)); }
  if (w.endsWith('ing')) { c.push(w.slice(0, -3), w.slice(0, -3) + 'e'); if (/(.)\1ing$/.test(w)) c.push(w.slice(0, -4)); }
  if (w.endsWith('er')) c.push(w.slice(0, -2), w.slice(0, -1));
  if (w.endsWith('est')) c.push(w.slice(0, -3), w.slice(0, -2));
  if (w.endsWith('ly')) c.push(w.slice(0, -2));
  return [...new Set(c)];
}
const parseIpa = s => { try { return JSON.parse(s).map(([ipa, region]) => ({ ipa, region })); } catch { return []; } };
const posName = p => POS[p] || p || '';

function enRow(w) {
  if (legacy) {
    const r = st.w.get(w); if (!r) return null;
    const defs = st.defs.all(r.id).map(d => ({ pos: d.pos, v: d.definition, x: d.example || '' }));
    return defs.length ? { word: r.word, ipa: st.ipa.all(r.id).map(p => ({ ipa: p.ipa, region: p.region || '' })), data: { d: defs } } : null;
  }
  const r = st.en.get(w); if (!r) return null;
  return { word: r.word, ipa: parseIpa(r.ipa), data: JSON.parse(r.data) };
}
const shapeDefs = d => d.map(x => ({ pos: posName(x.p), vi: x.v || '', en: x.e || '', ex: x.x || '' }));

function lookup(q) {
  if (!open()) return null;
  const w = clean(q);
  if (!w) return { found: false, word: '' };
  for (const c of candidates(w)) {
    const r = enRow(c); if (!r) continue;
    const dd = r.data.d || [];
    let defs = shapeDefs(dd);
    // prefer entries with Vietnamese meanings first
    defs.sort((a, b) => (b.vi ? 1 : 0) - (a.vi ? 1 : 0));
    const res = { found: true, word: r.word, query: w, ipa: r.ipa, defs, tr: r.data.t || [], base: r.data.b || '' };
    if (res.base && !defs.some(d => d.vi)) { // inflected form: show the base word's meanings too
      const b = enRow(res.base.toLowerCase());
      if (b) res.baseDefs = shapeDefs(b.data.d || []).slice(0, 5), res.baseWord = b.word;
    }
    res.needVi = !defs.some(d => d.vi) && !res.tr.length && !(res.baseDefs || []).some(d => d.vi);
    return res;
  }
  return { found: false, word: w };
}

function suggest(q, limit = 12) {
  if (!open()) return [];
  const w = clean(q); if (!w) return [];
  const hi = w + '\uffff';
  if (!legacy) return st.enPrefix.all(w, hi, BigInt(limit)).map(r => r.word);
  return st.prefix.all(w, hi).map(r => r.word).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).slice(0, limit);
}

// Vietnamese -> English
function lookupVi(q) {
  if (!hasVi()) return null;
  const raw = String(q || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!raw) return { found: false, word: '' };
  const norm = noMarks(raw);
  let rows = st.viNorm.all(norm);
  let fuzzy = false;
  if (!rows.length) { rows = st.viLike.all(norm, norm + '￿'); fuzzy = true; }
  rows = rows.map(r => ({ word: r.word, ...JSON.parse(r.data) }))
    .sort((a, b) => (b.word === raw) - (a.word === raw) || (b.m ? b.m.length : 0) - (a.m ? a.m.length : 0)).slice(0, 8);
  return { found: rows.length > 0, query: raw, fuzzy, rows };
}
function suggestVi(q, limit = 12) {
  if (!hasVi()) return [];
  const n = noMarks(q); if (!n) return [];
  const raw = String(q).toLowerCase().trim();
  const rows = st.viPrefix.all(n, n + '￿').map(r => r.word);
  // words matching the typed diacritics first, then shorter
  return rows.sort((a, b) => (b.startsWith(raw) - a.startsWith(raw)) || a.length - b.length || (a < b ? -1 : 1)).slice(0, limit);
}

function ipaOf(w) {
  if (!open()) return [];
  const r = enRow(clean(w)); return r ? r.ipa.map(p => p.ipa) : [];
}
function ipasOf(w) { if (!open()) return []; const r = enRow(clean(w)); return r ? r.ipa : []; }

module.exports = { available, hasVi, counts, lookup, suggest, lookupVi, suggestVi, ipaOf, ipasOf, noMarks, posName };
