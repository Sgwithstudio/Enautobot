// Pronunciation helpers for Vietnamese learners: IPA -> approximate Vietnamese respelling,
// per-sound articulation tips, word-level tips, and a connected-speech (linking) analyzer.
const dict = require('./dict');

/* ---------- IPA tokenizing ---------- */
const MULTI = ['tʃ', 'dʒ', 'aɪ', 'aʊ', 'eɪ', 'oʊ', 'əʊ', 'ɔɪ', 'ɪə', 'eə', 'ʊə', 'ɛə', 'ɪɚ', 'ɔː', 'ɑː', 'iː', 'uː', 'ɜː'];
const VOWELS = new Set(['i', 'ɪ', 'e', 'ɛ', 'æ', 'ɑ', 'a', 'ɒ', 'ɔ', 'ʊ', 'u', 'ʌ', 'ə', 'ɜ', 'ɝ', 'ɚ', 'ɐ', 'o', 'y',
  'iː', 'ɔː', 'ɑː', 'uː', 'ɜː', 'aɪ', 'aʊ', 'eɪ', 'oʊ', 'əʊ', 'ɔɪ', 'ɪə', 'eə', 'ʊə', 'ɛə', 'ɪɚ']);
const isV = p => VOWELS.has(p);

function normIpa(s) {
  return String(s || '').replace(/[\/\[\]]/g, '').replace(/[()]/g, '').replace(/͡|͜|[̀-ͯ]/g, '')
    .replace(/ɡ/g, 'g').replace(/ɹ/g, 'r').replace(/ʧ/g, 'tʃ').replace(/ʤ/g, 'dʒ').replace(/ɫ/g, 'l').replace(/ɾ/g, 't')
    .replace(/ʔ/g, '').replace(/ɒː/g, 'ɒ').replace(/ᵻ/g, 'ɪ').replace(/ɐ/g, 'ʌ').replace(/ɘ/g, 'ə').trim();
}
// -> array of tokens: {p: phoneme} | {s: 'ˈ'|'ˌ'|'.'} | {sp: true}
function tokenize(ipa) {
  const s = normIpa(ipa), out = [];
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === ' ') { out.push({ sp: true }); i++; continue; }
    if (c === 'ˈ' || c === 'ˌ' || c === '.') { out.push({ s: c }); i++; continue; }
    if (c === 'ː') { i++; continue; }
    const m = MULTI.find(x => s.startsWith(x, i));
    if (m) { out.push({ p: m }); i += m.length; continue; }
    out.push({ p: c }); i++;
  }
  return out;
}
const phonemes = ipa => tokenize(ipa).filter(t => t.p).map(t => t.p);

/* ---------- respelling ---------- */
const ONSET = { p: 'p', b: 'b', t: 't', d: 'đ', k: 'c', g: 'g', f: 'ph', v: 'v', θ: 'th', ð: 'đ', s: 'x', z: 'z', ʃ: 's', ʒ: 'gi', h: 'h', tʃ: 'ch', dʒ: 'gi', m: 'm', n: 'n', ŋ: 'ng', l: 'l', r: 'r', j: 'y', w: 'u' };
const CODA = { p: 'p', b: 'b', t: 't', d: 'd', k: 'k', g: 'g', f: 'f', v: 'v', θ: 'th', ð: 'đ', s: 's', z: 'z', ʃ: 'ts', ʒ: 'j', tʃ: 'ch', dʒ: 'j', m: 'm', n: 'n', ŋ: 'ng', l: 'l', r: 'r', h: '', j: '', w: '' };
const VOW = { i: 'i', ɪ: 'i', e: 'e', ɛ: 'e', æ: 'e', ɑ: 'a', a: 'a', ɒ: 'o', ɔ: 'o', ʊ: 'u', u: 'u', ʌ: 'â', ə: 'ơ', ɜ: 'ơ', ɝ: 'ơ', ɚ: 'ơ', o: 'ô', y: 'i', aɪ: 'ai', aʊ: 'ao', eɪ: 'ei', oʊ: 'âu', əʊ: 'âu', ɔɪ: 'oi', ɪə: 'ia', eə: 'eo', ʊə: 'ua', ɛə: 'eo', ɪɚ: 'ia', 'iː': 'i', 'uː': 'u', 'ɔː': 'o', 'ɑː': 'a', 'ɜː': 'ơ' };
const STOPLIKE = new Set(['p', 'b', 't', 'd', 'k', 'g', 'f', 'v', 'θ']);

// split a phoneme list (one word) into syllables [{ps:[...], stress:0|1|2}]
function syllables(tokens) {
  const syl = []; let cur = null, pend = 0, cons = [];
  const flush = () => { if (cur) { syl.push(cur); cur = null; } };
  for (const t of tokens) {
    if (t.s === 'ˈ') { pend = 1; continue; }
    if (t.s === 'ˌ') { pend = 2; continue; }
    if (t.s === '.') { if (cur) { flush(); } continue; }
    if (!t.p) continue;
    if (isV(t.p)) {
      if (cur) { // consonants between two vowels: split
        let i = 0;
        const okOnset = cons[0] === 's' || (STOPLIKE.has(cons[0]) && (cons[1] === 'r' || cons[1] === 'w' || cons[1] === 'j' || (cons[1] === 'l' && !['t', 'd', 'θ'].includes(cons[0]))));
        if (cons.length >= 2 && !okOnset) i = 1;
        cur.ps.push(...cons.slice(0, i)); cons = cons.slice(i); flush();
      }
      cur = { ps: [...cons, t.p], stress: pend, nuc: cons.length }; pend = 0; cons = [];
    } else if (!cur && !syl.length) cons.push(t.p);
    else cons.push(t.p);
  }
  if (cur) { cur.ps.push(...cons); flush(); }
  else if (cons.length && syl.length) syl[syl.length - 1].ps.push(...cons);
  return syl;
}
function respellSyl(sy) {
  let nucAt = sy.ps.findIndex(isV); if (nucAt < 0) nucAt = sy.ps.length;
  const on = sy.ps.slice(0, nucAt).map(p => ONSET[p] ?? p).join('');
  const v = sy.ps[nucAt] ? VOW[sy.ps[nucAt]] || sy.ps[nucAt] : '';
  const co = sy.ps.slice(nucAt + 1).map(p => CODA[p] ?? p).join('');
  const w = sy.ps[0] === 'w' && sy.ps.length > 1 ? (on === 'u' ? 'u' : on) : on; // keep simple
  return w + v + co;
}
function respell(ipa) {
  const words = [[]];
  for (const t of tokenize(ipa)) t.sp ? words.push([]) : words[words.length - 1].push(t);
  return words.filter(w => w.length).map(w => {
    const sy = syllables(w);
    const hasStress = sy.some(s => s.stress === 1);
    return sy.map((s, i) => { const r = respellSyl(s); return (s.stress === 1 || (!hasStress && sy.length > 1 && s.stress === 2)) ? r.toUpperCase() : r; }).join('-');
  }).join(' ');
}
const syllableCount = ipa => tokenize(ipa).filter(t => t.p && isV(t.p)).length;
function stressIndex(ipa) {
  const words = [[]]; for (const t of tokenize(ipa)) t.sp ? words.push([]) : words[words.length - 1].push(t);
  const sy = syllables(words[0] || []); const i = sy.findIndex(s => s.stress === 1);
  return { count: sy.length, primary: i < 0 ? 0 : i + 1 };
}

/* ---------- sound tips (Vietnamese) ---------- */
const TIPS = {
  'iː': ['i dài', 'Giống “i” tiếng Việt nhưng kéo dài, môi bành ra như đang cười.', 'sheep, see, team'],
  'ɪ': ['i ngắn', 'Giữa “i” và “ê”, ngắn và thả lỏng, miệng mở hơn “i” một chút. Đừng đọc thành “i” căng.', 'ship, sit, big'],
  'e': ['e/ê', 'Giống “e” trong “xe” nhưng hơi mở hơn “ê”, ngắn.', 'bed, ten, say'],
  'ɛ': ['e', 'Giống “e” trong “xe”, ngắn.', 'bed, ten'],
  'æ': ['ae', 'Mở miệng rộng như nói “a” rồi bật “e”: giữa “a” và “e”, hàm dưới hạ thấp. Không đọc thành “e” thường.', 'cat, man, bad'],
  'ɑː': ['a dài', 'Giống “a” tiếng Việt, mở rộng miệng, kéo dài, họng mở sâu.', 'father, car, calm'],
  'ɑ': ['a', 'Giống “a” tiếng Việt, miệng mở rộng.', 'hot (Mỹ), father'],
  'ɒ': ['o ngắn (Anh)', 'Giống “o” trong “ngon” nhưng ngắn, môi tròn nhẹ, miệng mở.', 'hot, dog (Anh)'],
  'ɔː': ['o dài', 'Giống “o” tiếng Việt, môi tròn, kéo dài.', 'door, law, thought'],
  'ʊ': ['u ngắn', 'Giữa “u” và “ơ”, môi tròn nhẹ, ngắn, thả lỏng. Không đọc “u” căng.', 'book, put, good'],
  'uː': ['u dài', 'Giống “u” tiếng Việt, môi chu tròn, kéo dài.', 'food, blue, too'],
  'ʌ': ['â/ă ngắn', 'Giống “ă”/“â” ngắn, miệng mở vừa, bật ngắn, không tròn môi.', 'cup, run, love'],
  'ə': ['ơ nhẹ (schwa)', 'Âm “ơ” rất yếu và ngắn, miệng thả lỏng hoàn toàn. Xuất hiện ở âm tiết không nhấn — là âm phổ biến nhất tiếng Anh.', 'about, teacher, banana'],
  'ɜː': ['ơ dài', 'Giống “ơ” kéo dài, môi không tròn; người Mỹ cuộn lưỡi nhẹ (er).', 'bird, work, learn'],
  'ɝ': ['ơ + r', 'Như “ơ” kéo dài và cuộn lưỡi về sau (kiểu Mỹ).', 'bird, her'],
  'ɚ': ['ơ + r nhẹ', 'Âm “ơ” ngắn có cuộn lưỡi, ở cuối từ (kiểu Mỹ).', 'teacher, water'],
  'aɪ': ['ai', 'Bắt đầu từ “a” rộng rồi trượt lên “i”. Trượt đủ, đừng cắt ngắn thành “a”.', 'my, time, high'],
  'aʊ': ['ao', 'Từ “a” rộng trượt sang “u” (như “ao” tiếng Việt).', 'now, house, out'],
  'eɪ': ['ây/ei', 'Từ “ê” trượt lên “i”. Phải kéo thành hai nửa, không đọc “e” đơn.', 'day, make, rain'],
  'oʊ': ['âu/ô-u', 'Từ “ô” trượt sang “u”, môi chu dần. Không đọc “ô” đơn.', 'go, home, phone'],
  'əʊ': ['âu', 'Từ “ơ” trượt sang “u” (kiểu Anh). Giống /oʊ/ của Mỹ.', 'go, no, home'],
  'ɔɪ': ['oi', 'Từ “o” trượt lên “i”, như “oi” trong “đòi”.', 'boy, coin, enjoy'],
  'ɪə': ['ia', 'Từ “i” ngắn trượt đến “ơ”.', 'here, idea, near'],
  'eə': ['eo/e-ơ', 'Từ “e” trượt đến “ơ”.', 'hair, there, care'],
  'ʊə': ['ua', 'Từ “u” ngắn trượt đến “ơ”.', 'tour, sure, poor'],
  'p': ['p', 'Hai môi chạm rồi bật hơi ra khi đứng đầu từ (có “hơi” — đặt tờ giấy trước miệng, giấy sẽ bay). Tiếng Việt “p” cuối từ không bật hơi.', 'pen, paper'],
  'b': ['b', 'Hai môi chạm rồi bật, có rung dây thanh. Khác “b” tiếng Việt (nội hơi) — bật nhẹ ra.', 'big, baby'],
  't': ['t', 'Đầu lưỡi chạm lợi trên (sau răng cửa), bật hơi mạnh khi đứng đầu từ. Không giống “t” Việt (không bật hơi) hay “th” Việt.', 'time, ten'],
  'd': ['d', 'Đầu lưỡi chạm lợi trên rồi bật, có rung thanh. Giống “đ” nhưng lưỡi ở lợi, không đặt sau răng.', 'day, do'],
  'k': ['k', 'Cuống lưỡi chạm vòm mềm rồi bật hơi mạnh khi đứng đầu từ (có hơi như “kh” nhẹ).', 'cat, key'],
  'g': ['g', 'Cuống lưỡi chạm vòm mềm rồi bật, có rung thanh, giống “g” trong “gà” nhưng bật rõ hơn.', 'go, give'],
  'f': ['f/ph', 'Răng trên chạm môi dưới, thổi hơi ra. Giống “ph” tiếng Việt. Cuối từ phải nói rõ.', 'fish, life'],
  'v': ['v', 'Răng trên chạm môi dưới và RUNG thanh. Người Việt hay đọc như “d”/“gi” — hãy chạm răng vào môi.', 'very, voice'],
  'θ': ['th (vô thanh)', 'Đặt đầu lưỡi giữa hai hàm răng, thổi hơi ra, KHÔNG rung cổ họng. Không đọc thành “t”, “th” Việt hay “s”.', 'think, three, mouth'],
  'ð': ['th (hữu thanh)', 'Đầu lưỡi giữa hai răng như /θ/ nhưng RUNG cổ họng. Không đọc thành “d” hay “z”.', 'this, the, mother'],
  's': ['s', 'Hơi xì qua kẽ răng, đầu lưỡi gần lợi. Giống “x” tiếng Việt. Cuối từ (số nhiều, “-s”) phải đọc rõ.', 'see, bus'],
  'z': ['z', 'Giống /s/ nhưng rung cổ họng (như tiếng ong vo ve). Không đọc thành “d”/“gi”.', 'zoo, busy, dogs'],
  'ʃ': ['sh', 'Chu môi, lưỡi lùi lên vòm, thổi hơi ra: giống “s” miền Bắc nhưng môi chu tròn và hơi dài hơn.', 'she, ship, nation'],
  'ʒ': ['zh', 'Giống /ʃ/ nhưng rung cổ họng. Giống “gi” miền Nam nhưng môi hơi chu.', 'vision, measure'],
  'h': ['h', 'Thở hơi ra từ cổ họng, nhẹ, giống “h” tiếng Việt.', 'hat, home'],
  'tʃ': ['ch', 'Giống “ch” tiếng Việt nhưng môi chu hơn và bật hơi mạnh hơn, có tiếng “sh” kéo theo.', 'church, watch'],
  'dʒ': ['j/dzh', 'Như /tʃ/ nhưng rung cổ họng; giống “gi/ch” hòa lẫn. Môi hơi chu.', 'job, bridge, age'],
  'm': ['m', 'Ngậm môi, hơi qua mũi. Cuối từ phải ngậm môi hẳn (khác âm “m” Việt thường ngắn).', 'man, name'],
  'n': ['n', 'Đầu lưỡi chạm lợi trên, hơi qua mũi. Cuối từ lưỡi vẫn chạm lợi, không bỏ lửng.', 'no, ten'],
  'ŋ': ['ng', 'Giống “ng” cuối từ “ăng”, cuống lưỡi chạm vòm mềm. Không thêm âm “g” bật ra ở cuối (sing, không phải “sing-g”).', 'sing, long'],
  'l': ['l', 'Đầu lưỡi chạm lợi trên. “l” cuối từ (ball, milk) là “l tối”: lưỡi vẫn chạm lợi, đọc nặng như “ô-l”. Không bỏ qua.', 'light, full'],
  'r': ['r', 'Cuộn đầu lưỡi lên nhưng KHÔNG chạm vòm miệng, môi hơi chu. Không rung lưỡi như “r” Việt miền Nam hay đọc như “z/d”.', 'red, right, car'],
  'j': ['y', 'Như “i” rồi lướt nhanh vào nguyên âm tiếp theo.', 'yes, you, music'],
  'w': ['w', 'Chu tròn môi như “u” rồi nhanh chóng mở ra. Không đọc thành “v” hay “qu”.', 'we, window, water'],
};

const tipFor = p => TIPS[p] ? { p, name: TIPS[p][0], how: TIPS[p][1], eg: TIPS[p][2] } : null;
// word-level extras from spelling + IPA
function wordTips(word, ipa) {
  const w = String(word || '').toLowerCase(), tips = [], ph = phonemes(ipa);
  const si = stressIndex(ipa);
  if (si.count > 1) tips.push(`Từ có ${si.count} âm tiết, nhấn mạnh âm tiết thứ ${si.primary} (viết HOA trong phần phát âm gần đúng). Âm nhấn đọc to, dài, cao hơn; âm còn lại đọc nhẹ và nhanh (thường là /ə/).`);
  else if (si.count === 1) tips.push('Từ một âm tiết: đọc gọn, nhấn rõ nguyên âm.');
  const last = ph[ph.length - 1];
  if (last && !isV(last)) tips.push(`Âm cuối /${last}/ phải đọc ra (tiếng Việt hay bỏ âm cuối). Nếu là /t d k p/ thì dừng hơi gọn, đóng hẳn, không thêm “ờ”.`);
  if (/ed$/.test(w) && w.length > 3) tips.push('Đuôi -ed: đọc /t/ sau âm vô thanh (worked /wɜːkt/), /d/ sau âm hữu thanh (played /pleɪd/), /ɪd/ sau t, d (wanted /ˈwɒntɪd/).');
  if (/(es|s)$/.test(w) && !/(ss|us|is)$/.test(w) && w.length > 3) tips.push('Đuôi -s/-es: đọc /s/ sau âm vô thanh (books), /z/ sau âm hữu thanh (dogs), /ɪz/ sau s, z, ʃ, ʒ, tʃ, dʒ (watches).');
  if (/tion$|sion$/.test(w)) tips.push('Đuôi -tion/-sion đọc /ʃən/ (hoặc /ʒən/): âm nhấn rơi vào âm tiết ngay trước đuôi (information → in-for-MA-tion).');
  if (/(ough)/.test(w)) tips.push('“ough” có nhiều cách đọc (though, through, rough, cough, thought) — phải học thuộc từng từ.');
  if (/^kn|^wr|^gn/.test(w)) tips.push('Chữ cái đầu câm: kn-, wr-, gn- không đọc chữ đầu (know /nəʊ/, write /raɪt/).');
  if (/mb$/.test(w)) tips.push('“mb” cuối từ: b câm (climb, bomb, thumb).');
  const seen = new Set(), sounds = [];
  for (const p of ph) if (!seen.has(p) && TIPS[p]) { seen.add(p); sounds.push(tipFor(p)); }
  return { tips, sounds, stress: si };
}

/* ---------- connected speech ---------- */
const WEAK = {
  to: 'tə', of: 'əv', and: 'ən', can: 'kən', for: 'fər', the: 'ðə', a: 'ə', an: 'ən', are: 'ər', was: 'wəz', were: 'wər', have: 'əv', has: 'əz', had: 'əd',
  you: 'jə', your: 'jər', at: 'ət', that: 'ðət', but: 'bət', them: 'ðəm', do: 'də', does: 'dəz', would: 'wəd', could: 'kəd', should: 'ʃəd', will: 'wəl', am: 'əm', is: 'z', he: 'i', him: 'ɪm', her: 'ər', his: 'ɪz', some: 'səm', than: 'ðən', there: 'ðər', from: 'frəm', as: 'əz', or: 'ər', not: 'nt',
};
const HDROP = new Set(['he', 'him', 'his', 'her', 'have', 'has', 'had']);
const wordsOf = text => String(text || '').toLowerCase().replace(/[’‘]/g, "'").match(/[a-z]+(?:'[a-z]+)?/g) || [];
function ipaWord(w) {
  const l = dict.ipaOf ? dict.ipaOf(w) : [];
  // prefer a candidate without region marks/UK-only quirks: first listed
  return l.length ? normIpa(l[0]) : '';
}
const strip = s => s.replace(/[ˈˌ.]/g, '');
const lastP = ipa => { const p = phonemes(ipa); return p[p.length - 1] || ''; };
const firstP = ipa => { const p = phonemes(ipa); return p[0] || ''; };
const VOICELESS = new Set(['p', 't', 'k', 'f', 'θ', 's', 'ʃ', 'tʃ']);

function analyze(text) {
  const ws = wordsOf(text).slice(0, 14);
  if (ws.length < 2) return { error: 'Nhập một cụm từ hoặc câu (2 từ trở lên).' };
  const items = ws.map(w => ({ w, ipa: ipaWord(w) }));
  const unknown = items.filter(i => !i.ipa).map(i => i.w);
  const n = items.length, out = { words: items, links: [], unknown, linked: '', weak: [] };
  // pass 1: base form of each word (strip stress, weak forms, h-dropping)
  const parts = items.map((it, i) => {
    let p = strip(it.ipa || it.w);
    if (WEAK[it.w] && i < n - 1 && it.ipa) { out.weak.push({ w: it.w, strong: it.ipa, weak: WEAK[it.w] }); p = WEAK[it.w]; }
    if (it.w === 'the' && i < n - 1 && isV(firstP(items[i + 1].ipa || ''))) p = 'ði';
    if (HDROP.has(it.w) && i > 0 && p.startsWith('h')) { p = p.slice(1); out.weak.push({ w: it.w, strong: it.ipa, weak: p, note: 'bỏ /h/' }); }
    return p;
  });
  // pass 2: pair rules, modify parts in place
  for (let i = 0; i < n - 1; i++) {
    const c = items[i], x = items[i + 1];
    if (!c.ipa || !x.ipa) continue;
    const pa = phonemes(parts[i]), pb = phonemes(parts[i + 1]);
    const a = pa[pa.length - 1], b = pb[0]; if (!a || !b) continue;
    const pair = `${c.w} ${x.w}`, aV = isV(a), bV = isV(b);
    const add = (type, vi) => out.links.push({ pair, type, vi, ipa: `${parts[i]}‿${parts[i + 1]}` });
    if (!aV && bV) {
      add('Nối phụ âm → nguyên âm', `Âm cuối /${a}/ của “${c.w}” được nối sang âm đầu của “${x.w}”, đọc liền như một từ: ${respell(parts[i] + parts[i + 1])}.` + ((a === 't' || a === 'd') ? ' (Giọng Mỹ: /t/ giữa hai nguyên âm thường thành âm “d” nhẹ — flap, vd “get up” ≈ “gedap”.)' : ''));
    } else if (aV && bV) {
      const glide = ['iː', 'eɪ', 'aɪ', 'ɔɪ', 'ɪ', 'i'].includes(a) ? 'j' : ['uː', 'oʊ', 'aʊ', 'əʊ', 'u', 'ʊ'].includes(a) ? 'w' : (['ɔː', 'ɑː', 'ə', 'ɜː', 'ɚ'].includes(a) && /re?$/.test(c.w) ? 'r' : '');
      if (glide) { parts[i] += glide; add(`Chèn âm lướt /${glide}/`, `Giữa hai nguyên âm, chèn thêm âm /${glide}/ rất nhẹ để nối “${c.w}” với “${x.w}” cho trơn.`); }
      else add('Nối nguyên âm', 'Hai nguyên âm đứng cạnh nhau: đọc liền, không ngắt hơi giữa hai từ.');
    } else if (!aV && !bV) {
      if (a === b || (a === 'd' && b === 't') || (a === 't' && b === 'd')) {
        parts[i] = parts[i].slice(0, parts[i].length - a.length);
        add('Hai âm giống nhau', `Hai âm /${a}/ – /${b}/ giống nhau: chỉ đọc một lần, giữ lâu hơn một chút.`);
      } else if ((a === 't' || a === 'd') && b === 'j') {
        parts[i] = parts[i].slice(0, -1) + (a === 't' ? 'tʃ' : 'dʒ'); parts[i + 1] = parts[i + 1].replace(/^j/, '');
        add('Biến âm (yod)', `/${a}/ + /j/ → ${a === 't' ? '/tʃ/ (ch)' : '/dʒ/ (j)'}: “${pair}” nghe như ${a === 't' ? '“…ch-u”' : '“…j-u”'}. Ví dụ: “meet you” → “mee-chu”, “did you” → “di-ju”.`);
      } else if (a === 'n' && ['p', 'b', 'm'].includes(b)) {
        parts[i] = parts[i].slice(0, -1) + 'm'; add('Đồng hóa (assimilation)', `/n/ đứng trước /${b}/ thường đọc thành /m/ (vd “in my” → “im my”).`);
      } else if (['t', 'd'].includes(a)) {
        parts[i] = parts[i].slice(0, -1); add('Lược âm cuối (elision)', `Giữa hai phụ âm, /${a}/ cuối của “${c.w}” thường bị nuốt: lưỡi đặt vào vị trí nhưng không bật hơi, nghe như “${c.w.slice(0, -1)}” (vd “next day” ≈ “nex day”, “last night” ≈ “las night”).`);
      } else if (['k', 'p', 'b', 'g'].includes(a)) add('Âm cuối không bật', `/${a}/ cuối “${c.w}”: ngậm môi/lưỡi lại nhưng KHÔNG bật hơi, rồi đọc ngay âm tiếp theo.`);
    }
  }
  let s = '';
  items.forEach((it, i) => { s += parts[i]; if (i < n - 1) s += out.links.some(l => l.pair === `${it.w} ${items[i + 1].w}`) ? '‿' : ' '; });
  out.linked = '/' + s + '/';
  out.vi_respell = respell(s.replace(/‿/g, ''));
  out.stress_tip = 'Trong câu: từ nội dung (danh từ, động từ chính, tính từ, trạng từ) được nhấn; từ chức năng (to, of, and, the, a…) đọc yếu và nhanh. Đọc theo nhịp, không đều từng âm.';
  return out;
}


/* ---------- static guide ---------- */
const GUIDE = [
  { title: '🎯 Nguyên tắc nền tảng', items: [
    { h: 'Tiếng Anh là ngôn ngữ nhấn nhịp, không có thanh điệu', t: 'Tiếng Việt có 6 thanh điệu, còn tiếng Anh không đổi nghĩa theo dấu. Thay vào đó, nghĩa và độ tự nhiên phụ thuộc vào TRỌNG ÂM (âm tiết đọc to, dài, cao) và NHỊP CÂU. Đọc đều từng âm như tiếng Việt sẽ nghe rất “cứng”.', eg: 'photograph /ˈfoʊtəɡræf/ – photographer /fəˈtɑːɡrəfər/' },
    { h: 'Đọc ĐỦ âm cuối', t: 'Người Việt hay bỏ hoặc nuốt âm cuối (-s, -t, -d, -k, -l…). Trong tiếng Anh âm cuối có thể là cả ý nghĩa: “bat/bad/back/bag” khác nhau chỉ ở âm cuối. Hãy đóng lưỡi/môi đúng vị trí và dừng gọn.', eg: 'cat – cap – cab – back' },
    { h: 'Âm schwa /ə/ là âm phổ biến nhất', t: 'Âm tiết không nhấn thường yếu thành /ə/ (gần “ơ” rất ngắn). Đừng đọc rõ mọi nguyên âm như chữ viết.', eg: 'banana /bəˈnɑːnə/, teacher /ˈtiːtʃər/' },
    { h: 'Nguyên âm dài – ngắn', t: 'Dài /iː uː ɑː ɔː ɜː/ kéo gấp đôi so với ngắn /ɪ ʊ ʌ ɒ/. Phân biệt dài–ngắn đổi nghĩa.', eg: 'ship /ʃɪp/ – sheep /ʃiːp/; full /fʊl/ – fool /fuːl/' },
    { h: 'Bật hơi: p, t, k', t: 'Đầu từ, /p t k/ bật hơi mạnh (đặt tờ giấy trước miệng thấy bay). Sau /s/ thì không bật (spin, stop, sky).', eg: 'pin vs spin' },
    { h: 'Hữu thanh – vô thanh', t: 'Đặt ngón tay lên cổ họng: nếu rung là âm hữu thanh (b d g v z ð ʒ dʒ), không rung là vô thanh (p t k f s θ ʃ tʃ).', eg: 'seat /s/ vs zeal /z/' },
    { h: 'Luyện bằng nhại (shadowing)', t: 'Nghe một câu, bấm 🔊, nhại lại ngay cùng nhịp và ngữ điệu, rồi ghi âm so sánh. 10 phút mỗi ngày hiệu quả hơn 1 giờ một lần.', eg: '' },
  ]},
  { title: '🔗 Nối âm (connected speech)', items: [
    { h: '1. Phụ âm + nguyên âm → nối', t: 'Phụ âm cuối từ trước đọc “sang” nguyên âm đầu từ sau như thể một từ.', eg: 'pick it up → “pi-ki-tâp”; an apple → “a-nap-ple”' },
    { h: '2. Nguyên âm + nguyên âm → chèn /j/, /w/, /r/', t: 'Sau /i: eɪ aɪ/ chèn /j/; sau /u: oʊ aʊ/ chèn /w/; sau “r/re” cuối từ chèn /r/ (giọng Anh).', eg: 'I am → “ai-y-am”; go out → “gâu-w-aut”; far away → “fa-r-away”' },
    { h: '3. /t, d/ + /j/ → /tʃ, dʒ/', t: '“t + you” thành “chu”, “d + you” thành “ju”.', eg: 'nice to meet you → “mee-chu”; would you → “wu-ju”; did you → “di-ju”' },
    { h: '4. Hai âm giống nhau → đọc một lần', t: 'Âm cuối từ trước giống âm đầu từ sau: gộp thành một âm kéo dài.', eg: 'good day, big girl, a nice song, hot tea' },
    { h: '5. /t, d/ giữa hai phụ âm bị nuốt', t: 'Ngậm lưỡi vào vị trí nhưng không bật, nghe như thiếu âm cuối.', eg: 'next day → “nex day”; last night → “las night”; handbag → “hanbag”' },
    { h: '6. /t/ giữa hai nguyên âm → /d/ nhẹ (giọng Mỹ)', t: 'Flap T: “t” thành “d” nhẹ, nhanh.', eg: 'water → “wa-der”; get up → “ge-dup”; a lot of → “a-lo-da”' },
    { h: '7. Đồng hóa: n+p/b/m → m', t: '/n/ đứng trước môi–môi chuyển thành /m/.', eg: 'in my → “im my”; ten people → “tem people”' },
    { h: '8. Rút gọn từ chức năng (weak forms)', t: 'to, of, and, for, a, the, can, have… yếu thành /tə əv ən fər ə ðə kən əv/. Từ nội dung (danh, động, tính, trạng từ) mới nhấn mạnh.', eg: 'a cup of tea → “a-cup-ə-tea”; fish and chips → “fish-ən-chips”' },
    { h: '9. Bỏ /h/ trong he, him, her, his, have, has, had', t: 'Khi không đứng đầu câu, /h/ thường biến mất và nối với từ trước.', eg: 'tell him → “tel-im”; give her → “gi-ver”; I have → “aiv”' },
    { h: '10. Rút gọn thông dụng (nói nhanh)', t: 'going to → gonna, want to → wanna, got to → gotta, kind of → kinda, give me → gimme, let me → lemme, don’t know → dunno.', eg: 'I’m gonna go. I wanna know.' },
  ]},
  { title: '🔔 Trọng âm (word stress)', items: [
    { h: 'Danh từ / động từ 2 âm tiết', t: 'Danh từ và tính từ thường nhấn âm đầu; động từ thường nhấn âm sau.', eg: 'REcord (n) – reCORD (v); PREsent – preSENT' },
    { h: 'Đuôi kéo trọng âm về trước', t: 'Nhấn âm tiết ngay trước đuôi: -tion, -sion, -ic, -ical, -ity, -ial, -ious, -eous.', eg: 'inforMAtion, ecoNOmic, abiLIty, imPORtant' },
    { h: 'Đuôi không đổi trọng âm', t: '-er, -ing, -ed, -ly, -ful, -ness, -ment giữ nguyên trọng âm của từ gốc.', eg: 'HAPpy → HAPpiness; deVELop → deVELopment' },
    { h: 'Từ ghép', t: 'Danh từ ghép nhấn từ đầu; động từ ghép/ cụm động từ nhấn từ sau.', eg: 'GREENhouse (nhà kính) vs green HOUSE (ngôi nhà màu xanh)' },
    { h: 'Nhấn trong câu', t: 'Nhấn từ mang thông tin chính; bạn đổi từ nhấn là đổi ý.', eg: 'I didn’t SAY he stole it vs I didn’t say HE stole it' },
  ]},
  { title: '📈 Ngữ điệu (intonation)', items: [
    { h: 'Câu hỏi Yes/No: lên giọng ↗', t: 'Lên giọng ở cuối.', eg: 'Are you ready? ↗' },
    { h: 'Câu hỏi Wh- và câu khẳng định: xuống giọng ↘', t: 'Xuống giọng ở cuối.', eg: 'Where do you live? ↘  I live in Hanoi. ↘' },
    { h: 'Liệt kê: lên ↗ ↗ ↘', t: 'Mỗi mục lên nhẹ, mục cuối xuống.', eg: 'We need milk ↗, eggs ↗ and bread ↘.' },
    { h: 'Ngạc nhiên / xác nhận lại: lên', t: 'Câu khẳng định mà lên giọng thành câu hỏi.', eg: 'You’re leaving tomorrow? ↗' },
  ]},
  { title: '🔚 Đuôi -s / -es và -ed', items: [
    { h: 'Đuôi -s / -es', t: '/s/ sau âm vô thanh (p t k f θ): books, stops. /z/ sau âm hữu thanh và nguyên âm: dogs, plays. /ɪz/ sau s, z, ʃ, ʒ, tʃ, dʒ: watches, buses.', eg: 'cats /s/ – dogs /z/ – boxes /ɪz/' },
    { h: 'Đuôi -ed', t: '/t/ sau âm vô thanh (worked, stopped). /d/ sau âm hữu thanh và nguyên âm (played, loved). /ɪd/ sau t, d (wanted, needed).', eg: 'walked /t/ – lived /d/ – wanted /ɪd/' },
  ]},
  { title: '⚠️ Lỗi thường gặp của người Việt', items: [
    { h: 'Bỏ âm cuối', t: 'Luyện: nói “bag” thành “ba” sẽ nghe như “ba”. Hãy đọc /g/ rồi dừng gọn.', eg: 'bag, bad, back, bat' },
    { h: 'th → t/d/s', t: 'Đưa đầu lưỡi giữa hai hàm răng. Luyện: think /θɪŋk/ ≠ sink ≠ tink; this /ðɪs/ ≠ dis.', eg: 'think, thank, this, that' },
    { h: 'v → d/gi, z → d, ʒ', t: 'Chạm răng trên vào môi dưới cho /v/; rung cổ họng cho /z/.', eg: 'very, visit, zoo, easy' },
    { h: 'Cụm phụ âm: đừng chèn nguyên âm', t: 'Đọc “street” không phải “sờ-trít”. Nối phụ âm liền nhau, chỉ một âm tiết.', eg: 'street, strong, spring, world, asked' },
    { h: 'r và l', t: '/r/: lưỡi cuộn nhưng không chạm; /l/: đầu lưỡi chạm lợi trên. Luyện: right – light, road – load.', eg: 'right/light, rice/lice' },
    { h: '/ɪ/ vs /iː/, /æ/ vs /e/', t: 'Phân biệt ngắn-dài, mở-khép miệng. Luyện cặp tối thiểu: sit/seat, bad/bed, pen/pan.', eg: 'ship/sheep, bad/bed' },
    { h: 'Ngữ điệu bằng', t: 'Người Việt hay nói đều và phẳng. Hãy đẩy lên – xuống rõ rệt, kéo dài âm nhấn.', eg: '' },
  ]},
];

module.exports = { GUIDE, respell, phonemes, wordTips, tipFor, TIPS, analyze, normIpa, syllableCount };
