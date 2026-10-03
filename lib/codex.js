const { spawn } = require('child_process');
const path = require('path');
const env = require('./env');

const MODEL = env.CODEX_MODEL || 'gpt-5.5';
const EFFORT = env.CODEX_EFFORT || 'low';
const MAX_CONC = parseInt(env.CODEX_CONCURRENCY || '2', 10);
const MAX_PER_HOUR = parseInt(env.CODEX_MAX_PER_HOUR || '60', 10);
const CWD = path.join(__dirname, '..', '.codex-work');
const TIMEOUT_MS = 90000;

let running = 0;
const queue = [];
const stamps = [];

function underLimit() {
  const now = Date.now();
  while (stamps.length && now - stamps[0] > 3600e3) stamps.shift();
  return stamps.length < MAX_PER_HOUR;
}

function runOnce(prompt) {
  return new Promise((resolve, reject) => {
    const p = spawn('codex', [
      'exec', '--ephemeral', '--skip-git-repo-check', '-m', MODEL,
      '-c', `model_reasoning_effort="${EFFORT}"`, '-s', 'read-only', '--json', '-',
    ], { cwd: CWD, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('codex timeout')); }, TIMEOUT_MS);
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (err += d));
    p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('close', () => {
      clearTimeout(timer);
      let text = '';
      for (const l of out.split('\n')) {
        try {
          const j = JSON.parse(l);
          if (j.type === 'item.completed' && j.item && j.item.type === 'agent_message') text = j.item.text;
        } catch {}
      }
      text ? resolve(text) : reject(new Error('codex empty: ' + err.slice(-200)));
    });
    p.stdin.end(prompt);
  });
}

function pump() {
  while (running < MAX_CONC && queue.length) {
    const job = queue.shift();
    running++;
    runOnce(job.prompt).then(job.resolve, job.reject).finally(() => { running--; pump(); });
  }
}

function ask(prompt) {
  if (!underLimit()) return Promise.reject(new Error('Đã đạt giới hạn lượt AI mỗi giờ'));
  stamps.push(Date.now());
  return new Promise((resolve, reject) => { queue.push({ prompt, resolve, reject }); pump(); });
}

function extractJson(text) {
  const s = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
  throw new Error('invalid JSON from codex');
}

async function askJson(prompt) {
  const t = await ask(prompt + '\n\nTrả lời CHỈ bằng một JSON hợp lệ, không markdown, không giải thích.');
  return extractJson(t);
}

module.exports = { ask, askJson };
