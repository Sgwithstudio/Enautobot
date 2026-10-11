// Offline English–Vietnamese dictionary (SQLite, CC BY-SA 4.0 — see data/dict/ATTRIBUTION.md).
// Uses Node's built-in node:sqlite; degrades to "unavailable" if the DB file is missing.
const path = require('path');
const fs = require('fs');

const FILE = path.join(__dirname, '..', 'data', 'dict', 'dictionary_en_vi.db');
const POS = { N: 'danh từ', V: 'động từ', A: 'tính từ', D: 'trạng từ', P: 'giới từ', C: 'liên từ', I: 'thán từ', idiom: 'thành ngữ' };

let db = null, qWord, qDefs, qIpa, qPrefix;
function open() {
  if (db || !fs.existsSync(FILE)) return !!db;
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(FILE, { readOnly: true });
  qWord = db.prepare('SELECT id, word FROM words WHERE word = ?');
  qDefs = db.prepare(`SELECT d.pos, d.definition, wd.example FROM word_definitions wd JOIN definitions d ON d.id = wd.definition_id WHERE wd.word_id = ? ORDER BY wd.id LIMIT 30`);
  qIpa = db.prepare('SELECT ipa, region FROM pronunciations WHERE word_id = ? ORDER BY id LIMIT 4');
  qPrefix = db.prepare(`SELECT word FROM words WHERE word >= ? AND word < ? ORDER BY length(word), word LIMIT ?`);
  return true;
}
const available = () => open();

// candidate base forms for simple inflections: running -> run, cities -> city, went stays as typed
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

function clean(q) { return String(q || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' \-\.]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); }

function lookup(q) {
  if (!open()) return null;
  const w = clean(q);
  if (!w) return { found: false, word: '' };
  for (const c of candidates(w)) {
    const row = qWord.get(c);
    if (!row) continue;
    const defs = qDefs.all(row.id).map(d => ({ pos: POS[d.pos] || d.pos || '', vi: d.definition, ex: d.example || '' }));
    if (!defs.length) continue;
    return { found: true, word: row.word, query: w, ipa: qIpa.all(row.id).map(p => ({ ipa: p.ipa, region: p.region || '' })), defs };
  }
  return { found: false, word: w };
}

function suggest(q, limit = 10) {
  if (!open()) return [];
  const w = clean(q);
  if (!w) return [];
  return qPrefix.all(w, w + '￿', limit).map(r => r.word);
}

module.exports = { available, lookup, suggest, ipaOf: w => { const r = open() && qWord.get(clean(w)); return r ? qIpa.all(r.id).map(p => p.ipa) : []; } };
