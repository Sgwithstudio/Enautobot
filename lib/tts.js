const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BIN = path.join(__dirname, '..', '.venv', 'bin', 'edge-tts');
const DIR = path.join(__dirname, '..', 'data', 'cache', 'tts');
fs.mkdirSync(DIR, { recursive: true });

const VOICES = [
  { id: 'en-US-JennyNeural', label: 'Jenny', gender: 'F', accent: 'Mỹ' },
  { id: 'en-US-AriaNeural', label: 'Aria', gender: 'F', accent: 'Mỹ' },
  { id: 'en-US-AvaNeural', label: 'Ava', gender: 'F', accent: 'Mỹ' },
  { id: 'en-US-GuyNeural', label: 'Guy', gender: 'M', accent: 'Mỹ' },
  { id: 'en-US-AndrewNeural', label: 'Andrew', gender: 'M', accent: 'Mỹ' },
  { id: 'en-US-BrianNeural', label: 'Brian', gender: 'M', accent: 'Mỹ' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia', gender: 'F', accent: 'Anh' },
  { id: 'en-GB-LibbyNeural', label: 'Libby', gender: 'F', accent: 'Anh' },
  { id: 'en-GB-RyanNeural', label: 'Ryan', gender: 'M', accent: 'Anh' },
  { id: 'en-GB-ThomasNeural', label: 'Thomas', gender: 'M', accent: 'Anh' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha', gender: 'F', accent: 'Úc' },
  { id: 'en-AU-WilliamMultilingualNeural', label: 'William', gender: 'M', accent: 'Úc' },
  { id: 'en-CA-ClaraNeural', label: 'Clara', gender: 'F', accent: 'Canada' },
  { id: 'en-CA-LiamNeural', label: 'Liam', gender: 'M', accent: 'Canada' },
  { id: 'en-IN-NeerjaNeural', label: 'Neerja', gender: 'F', accent: 'Ấn Độ' },
  { id: 'en-IN-PrabhatNeural', label: 'Prabhat', gender: 'M', accent: 'Ấn Độ' },
  { id: 'en-IE-EmilyNeural', label: 'Emily', gender: 'F', accent: 'Ireland' },
  { id: 'en-IE-ConnorNeural', label: 'Connor', gender: 'M', accent: 'Ireland' },
  { id: 'en-NZ-MollyNeural', label: 'Molly', gender: 'F', accent: 'New Zealand' },
  { id: 'en-NZ-MitchellNeural', label: 'Mitchell', gender: 'M', accent: 'New Zealand' },
  { id: 'en-ZA-LeahNeural', label: 'Leah', gender: 'F', accent: 'Nam Phi' },
  { id: 'en-ZA-LukeNeural', label: 'Luke', gender: 'M', accent: 'Nam Phi' },
  { id: 'en-SG-LunaNeural', label: 'Luna', gender: 'F', accent: 'Singapore' },
  { id: 'en-SG-WayneNeural', label: 'Wayne', gender: 'M', accent: 'Singapore' },
  { id: 'en-PH-RosaNeural', label: 'Rosa', gender: 'F', accent: 'Philippines' },
  { id: 'en-PH-JamesNeural', label: 'James', gender: 'M', accent: 'Philippines' },
  { id: 'en-NG-EzinneNeural', label: 'Ezinne', gender: 'F', accent: 'Nigeria' },
  { id: 'en-NG-AbeoNeural', label: 'Abeo', gender: 'M', accent: 'Nigeria' },
];
const VALID = new Set(VOICES.map(v => v.id));
const inflight = new Map();

function rateStr(rate) {
  const r = Math.max(0.5, Math.min(1.5, parseFloat(rate) || 1));
  const pct = Math.round((r - 1) * 100);
  return (pct >= 0 ? '+' : '') + pct + '%';
}

function synth(text, voice, rate) {
  if (!VALID.has(voice)) voice = 'en-US-JennyNeural';
  text = String(text || '').trim().slice(0, 600);
  if (!text) return Promise.reject(new Error('empty text'));
  const rs = rateStr(rate);
  const key = crypto.createHash('sha1').update(`${voice}|${rs}|${text}`).digest('hex');
  const file = path.join(DIR, key + '.mp3');
  if (fs.existsSync(file)) return Promise.resolve(file);
  if (inflight.has(key)) return inflight.get(key);
  const tmp = file + '.' + process.pid + '.tmp';
  const pr = new Promise((resolve, reject) => {
    const p = spawn(BIN, ['--voice', voice, '--rate=' + rs, '--text', text, '--write-media', tmp]);
    let err = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), 20000);
    p.stderr.on('data', d => (err += d));
    p.on('close', code => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(tmp)) { fs.renameSync(tmp, file); resolve(file); }
      else { fs.rm(tmp, () => {}); reject(new Error('tts failed: ' + err.slice(-200))); }
    });
  }).finally(() => inflight.delete(key));
  inflight.set(key, pr);
  return pr;
}

module.exports = { VOICES, synth };
