// Merge data/seed/base-lessons.json + data/gen-lessons/*.json -> data/seed/lessons.json
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const base = JSON.parse(fs.readFileSync(path.join(root, 'data/seed/base-lessons.json'), 'utf8')).topics;
const LEVEL = { meeting: 'intermediate', negotiation: 'advanced', 'email-phone': 'intermediate', sales: 'intermediate', interview: 'intermediate', smalltalk: 'beginner', restaurant: 'beginner', travel: 'beginner', shopping: 'beginner', health: 'beginner', directions: 'beginner' };
base.forEach(t => { t.level = t.level || LEVEL[t.id] || 'intermediate'; });

const dir = path.join(root, 'data/gen-lessons');
const gen = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) : [];
// keep the order of scripts/topics.txt
const order = fs.readFileSync(path.join(__dirname, 'topics.txt'), 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('|')[2]);
gen.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

const ids = new Set(), out = [];
for (const t of [...base, ...gen]) { if (ids.has(t.id)) continue; ids.add(t.id); out.push(t); }
fs.writeFileSync(path.join(root, 'data/seed/lessons.json'), JSON.stringify({ topics: out }));
const by = {}; out.forEach(t => { const k = t.group + '/' + t.level; by[k] = (by[k] || 0) + 1; });
console.log(out.length + ' lessons', by);
