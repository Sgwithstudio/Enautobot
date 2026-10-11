// Bulk-generate lessons with `codex exec`. Resumable: skips topics already in data/gen-lessons/.
// Usage: node scripts/gen-lessons.js [concurrency]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'gen-lessons');
const WORK = path.join(ROOT, '.codex-work');
const CONC = parseInt(process.argv[2] || '4', 10);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(WORK, { recursive: true });

const topics = fs.readFileSync(path.join(__dirname, 'topics.txt'), 'utf8').split('\n')
  .filter(l => l && !l.startsWith('#')).map(l => { const [group, level, id, icon, title] = l.split('|'); return { group, level, id, icon, title }; });

const SIZE = { beginner: [8, 10], intermediate: [10, 12], advanced: [12, 14] };
const LV = {
  beginner: 'A2 (beginner): short, common words, simple sentences, clear pronunciation',
  intermediate: 'B1-B2 (intermediate): natural everyday and professional English, common collocations',
  advanced: 'C1 (advanced): nuanced vocabulary, idioms, collocations, formal/informal register, complex but natural sentences',
};

function prompt(t) {
  const [nv, nl] = SIZE[t.level];
  return `You are an expert English teacher creating a lesson for Vietnamese learners.
Topic: "${t.title}" (category: ${t.group}). Level: ${LV[t.level]}.
Return ONE JSON object, schema:
{"title":"short English title","vocab":[{"w":"word or phrase","ipa":"/IPA (British or American)/","vi":"natural Vietnamese meaning","ex":"natural example sentence in English","exvi":"Vietnamese translation of the example"}],
"phrases":[{"en":"a useful sentence pattern or ready-to-use sentence","vi":"Vietnamese translation"}],
"dialogue":{"title":"scene title","roles":{"A":"name (role)","B":"name (role)"},"lines":[{"r":"A or B","en":"English line","vi":"Vietnamese translation"}]}}
Rules: exactly ${nv} vocab items (mix single words, collocations and phrasal verbs/idioms where fitting; no duplicates); exactly 4 phrases; exactly ${nl} dialogue lines alternating A/B, realistic and natural, reusing several vocab items; Vietnamese must be natural and accurate; examples 8-18 words. Output ONLY valid JSON, no markdown.`;
}

function run(p) {
  return new Promise((resolve, reject) => {
    const c = spawn('codex', ['exec', '--ephemeral', '--skip-git-repo-check', '-m', process.env.CODEX_MODEL || 'gpt-5.5',
      '-c', 'model_reasoning_effort="low"', '-s', 'read-only', '--json', '-'], { cwd: WORK, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { c.kill('SIGKILL'); reject(new Error('timeout')); }, 240000);
    c.stdout.on('data', d => (out += d));
    c.on('error', e => { clearTimeout(timer); reject(e); });
    c.on('close', () => {
      clearTimeout(timer); let text = '';
      for (const l of out.split('\n')) { try { const j = JSON.parse(l); if (j.type === 'item.completed' && j.item && j.item.type === 'agent_message') text = j.item.text; } catch {} }
      text ? resolve(text) : reject(new Error('empty'));
    });
    c.stdin.end(p);
  });
}
function parse(text) {
  const s = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try { return JSON.parse(s); } catch { return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); }
}
function valid(r, t) {
  const [nv, nl] = SIZE[t.level];
  const okV = Array.isArray(r.vocab) && r.vocab.length >= nv - 1 && r.vocab.every(v => v.w && v.vi && v.ex && v.exvi && v.ipa);
  const okL = r.dialogue && Array.isArray(r.dialogue.lines) && r.dialogue.lines.length >= nl - 2 && r.dialogue.lines.every(l => (l.r === 'A' || l.r === 'B') && l.en && l.vi);
  const okP = Array.isArray(r.phrases) && r.phrases.length >= 3 && r.phrases.every(p => p.en && p.vi);
  return okV && okL && okP && r.dialogue.roles && r.dialogue.roles.A && r.dialogue.roles.B;
}

async function one(t) {
  const f = path.join(OUT, t.id + '.json');
  if (fs.existsSync(f)) return 'skip';
  for (let a = 1; a <= 3; a++) {
    try {
      const r = parse(await run(prompt(t)));
      if (!valid(r, t)) throw new Error('invalid shape');
      fs.writeFileSync(f, JSON.stringify({ id: t.id, title: t.title, icon: t.icon, group: t.group, level: t.level, vocab: r.vocab, phrases: r.phrases, dialogue: r.dialogue }));
      return 'ok';
    } catch (e) { console.log(`  retry ${t.id} (${a}): ${e.message}`); }
  }
  return 'FAIL';
}

(async () => {
  const q = topics.slice(); let done = 0;
  const worker = async () => { for (let t; (t = q.shift());) { const s = await one(t); done++; console.log(`[${done}/${topics.length}] ${t.id} ${s}`); } };
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log('finished');
})();
