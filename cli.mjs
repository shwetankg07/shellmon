#!/usr/bin/env node
// shellmon — a terminal pet that feeds on your dev activity.
// Commits feed it, green tests evolve it, neglect makes it sad.
// Zero dependencies. State lives in ~/.shellmon/.
//
// This file is both the CLI (run directly) and a library (import for tests):
// main() only runs when the file is executed, not when imported.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const VERSION = '3.1.0';

// ---------- paths (lazy, so SHELLMON_HOME can be swapped per-test) ----------
export function dir() { return process.env.SHELLMON_HOME || path.join(os.homedir(), '.shellmon'); }
function stateFile() { return path.join(dir(), 'state.json'); }
function configFile() { return path.join(dir(), 'config.json'); }
function segmentFile() { return path.join(dir(), 'segment'); }
function ensureDir() { fs.mkdirSync(dir(), { recursive: true }); }

const NAMES = ['Blip', 'Byte', 'Momo', 'Pixel', 'Sprocket', 'Nibble', 'Gizmo', 'Pip', 'Taro', 'Echo', 'Bit', 'Waffle', 'Noodle', 'Kernel'];

// ---------- themes (zero-dep truecolor; 'classic' uses base ANSI) ----------
export const THEMES = {
  classic:   { red: '31', green: '32', yellow: '33', blue: '34', magenta: '35', cyan: '36', white: '37', gray: '90' },
  matrix:    { red: '#ff3355', green: '#00ff66', yellow: '#7CFC00', blue: '#00aa44', magenta: '#39ff14', cyan: '#00ffaa', white: '#c8ffc8', gray: '#2f6f3f' },
  dracula:   { red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2', gray: '#6272a4' },
  gruvbox:   { red: '#fb4934', green: '#b8bb26', yellow: '#fabd2f', blue: '#83a598', magenta: '#d3869b', cyan: '#8ec07c', white: '#ebdbb2', gray: '#928374' },
  nord:      { red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b', blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0', gray: '#4c566a' },
  tokyonight:{ red: '#f7768e', green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#c0caf5', gray: '#565f89' },
  synthwave: { red: '#fe4450', green: '#72f1b8', yellow: '#fede5d', blue: '#03edf9', magenta: '#ff7edb', cyan: '#36f9f6', white: '#ffffff', gray: '#848bbd' },
  catppuccin:{ red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af', blue: '#89b4fa', magenta: '#cba6f7', cyan: '#94e2d5', white: '#cdd6f4', gray: '#6c7086' },
};

let currentThemeName = 'classic';
export function setTheme(name) { if (THEMES[name]) currentThemeName = name; return currentThemeName; }
function theme() { return THEMES[currentThemeName] || THEMES.classic; }

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return { r: 255, g: 255, b: 255 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

// ---------- color ----------
let colorOverride = null; // null = auto, true/false = forced
function colorOn() {
  if ('NO_COLOR' in process.env) return false;
  if (colorOverride !== null) return colorOverride;
  return !!(process.env.FORCE_COLOR || process.stdout.isTTY);
}
function sgr(role) {
  if (role === 'b') return '1';
  if (role === 'dim') return '2';
  const v = theme()[role];
  if (!v) return null;
  if (typeof v === 'string' && v[0] === '#') { const { r, g, b } = hexToRgb(v); return `38;2;${r};${g};${b}`; }
  return String(v);
}
export function paint(role, s) {
  if (!colorOn()) return String(s);
  const code = sgr(role);
  return code ? `\x1b[${code}m${s}\x1b[0m` : String(s);
}
export function stripAnsi(s) { return String(s).replace(/\x1b\[[0-9;]*m/g, ''); }
export function vlen(s) { return stripAnsi(s).length; }
export function pad(s, w, align = 'left') {
  const gap = Math.max(0, w - vlen(s));
  if (align === 'center') { const l = Math.floor(gap / 2); return ' '.repeat(l) + s + ' '.repeat(gap - l); }
  if (align === 'right') return ' '.repeat(gap) + s;
  return s + ' '.repeat(gap);
}
const clamp = (v) => Math.max(0, Math.min(100, v));
export { clamp };

// ---------- the creature ----------
export const STAGES = [
  { key: 'egg',     name: 'Egg',      min: 0,   color: 'white' },
  { key: 'blob',    name: 'Blobling', min: 10,  color: 'cyan' },
  { key: 'critter', name: 'Critter',  min: 50,  color: 'green' },
  { key: 'beast',   name: 'Beast',    min: 150, color: 'magenta' },
  { key: 'elder',   name: 'Elder',    min: 400, color: 'yellow' },
];
export function stageFor(xp) { let s = STAGES[0]; for (const st of STAGES) if (xp >= st.min) s = st; return s; }
export function nextStage(xp) {
  for (const st of STAGES) if (st.min > xp) return { name: st.name, remaining: st.min - xp };
  return null;
}

// Four species, each with five evolution stages. The `${f}` slot holds the
// 3-char mood face. The box centers every line, so widths need not match.
export const SPECIES = {
  slime: { name: 'Slime', stages: {
    egg:     (f) => ['  .-.', ' ( . )', "  '-'"],
    blob:    (f) => [' .---.', `( ${f} )`, " '---'"],
    critter: (f) => [' (~~~)', `( ${f} )`, ' (___)'],
    beast:   (f) => [' /~~~\\', `( ${f} )`, ' \\~~~/'],
    elder:   (f) => [' /~~~~~\\', `(( ${f} ))`, ' \\~~~~~/'],
  } },
  cat: { name: 'Cat', stages: {
    egg:     (f) => ['  .-.', ' ( ^ )', "  '-'"],
    blob:    (f) => [' /\\_/\\', `( ${f} )`, '  " "'],
    critter: (f) => [' /\\_/\\', `( ${f} )`, ' > ^ <'],
    beast:   (f) => [' /\\_/\\', `( ${f} )`, ' />   <\\', '  " "'],
    elder:   (f) => [' /\\_/\\', `<( ${f} )>`, ' /|   |\\', '  ^   ^'],
  } },
  dragon: { name: 'Dragon', stages: {
    egg:     (f) => ['  .-.', ' ( ~ )', "  '-'"],
    blob:    (f) => ['  _^_', `( ${f} )`, "  '-'"],
    critter: (f) => [' <(^)>', `( ${f} )`, '  /_\\'],
    beast:   (f) => [' \\|^|/', `( ${f} )`, '  /|\\', '  ^ ^'],
    elder:   (f) => [' \\\\|^|//', `<( ${f} )>`, ' //|_|\\\\', '  ^   ^'],
  } },
  bot: { name: 'Bot', stages: {
    egg:     (f) => ['  [=]', ' [   ]', "  '='"],
    blob:    (f) => [' .---.', `[ ${f} ]`, " '---'"],
    critter: (f) => [' ,---.', `[ ${f} ]`, ' |[o]|'],
    beast:   (f) => [' /===\\', `[ ${f} ]`, ' |=|=|', '  " "'],
    elder:   (f) => [' /====\\', `[[ ${f} ]]`, ' |=||=|', '  ^  ^'],
  } },
};
export function pickSpecies() { const k = Object.keys(SPECIES); return k[Math.floor(Math.random() * k.length)]; }
export function artFor(species, stageKey, face) {
  const sp = SPECIES[species] || SPECIES.slime;
  return (sp.stages[stageKey] || sp.stages.blob)(face);
}
// The Elder form branches on how you played: tests -> Guardian, commits -> Titan,
// late nights -> Nocturne, otherwise a plain Elder.
export function elderBranch(s) {
  const c = s.totalCommits || 0, t = s.totalTestsPassed || 0;
  if (t >= 25 && t >= c) return { key: 'guardian', name: 'Guardian', crown: '+ + +' };
  if (c >= 40 && c > t) return { key: 'titan', name: 'Titan', crown: '^ ^ ^' };
  if (s.nightFeed) return { key: 'nocturne', name: 'Nocturne', crown: '* . *' };
  return { key: 'elder', name: 'Elder', crown: null };
}
export function stageDisplayName(s) {
  const st = stageFor(s.xp);
  return st.key === 'elder' ? elderBranch(s).name : st.name;
}

export const MOODS = {
  ko:       { face: 'X_X', color: 'gray',   quip: 'fainted. feed me to revive.' },
  sick:     { face: 'x_x', color: 'red',    quip: 'feeling ill. i need green tests.' },
  hungry:   { face: 'o~o', color: 'yellow', quip: 'starving. commit something?' },
  sleepy:   { face: '-_-', color: 'blue',   quip: 'so sleepy. running on fumes.' },
  ecstatic: { face: '^o^', color: 'green',  quip: 'on top of the world.' },
  happy:    { face: '^-^', color: 'green',  quip: 'vibing. what are we building?' },
  content:  { face: 'o-o', color: 'cyan',   quip: 'present and accounted for.' },
};
export function moodOf(s) {
  if (!s.alive || s.health <= 0) return { key: 'ko', ...MOODS.ko };
  if (s.health < 30) return { key: 'sick', ...MOODS.sick };
  if (s.hunger < 25) return { key: 'hungry', ...MOODS.hungry };
  if (s.energy < 25) return { key: 'sleepy', ...MOODS.sleepy };
  if (s.happiness > 80 && s.hunger > 60 && s.health > 75) return { key: 'ecstatic', ...MOODS.ecstatic };
  if (s.happiness > 55) return { key: 'happy', ...MOODS.happy };
  return { key: 'content', ...MOODS.content };
}

// A quip that knows the time and recent history, falling back to the mood's.
export function quipFor(s, now = Date.now()) {
  const mood = moodOf(s);
  const hoursAway = (now - (s.lastActive || now)) / 3.6e6;
  const hour = new Date(now).getHours();
  if (mood.key !== 'ko') {
    if (hoursAway > 72) return `welcome back. it has been ${Math.floor(hoursAway / 24)} days.`;
    if (hour >= 0 && hour < 5) return 'you should be asleep. so should i.';
    if (s.streakDays >= 7 && mood.key !== 'sick') return `${s.streakDays} days straight. unstoppable.`;
  }
  return mood.quip;
}

// ---------- achievements ----------
// `hidden: true` achievements don't show their name/desc until earned — they
// read as `???` in `stats`, so stumbling into one is a genuine surprise. The
// unlock toast is where the reveal (and the fun) lands.
export const ACHIEVEMENTS = [
  { id: 'hatch',      name: 'It\'s Alive',      desc: 'hatch your egg',                test: (s) => s.xp >= 10 },
  { id: 'critter',    name: 'Growing Up',       desc: 'reach the Critter stage',       test: (s) => s.xp >= 50 },
  { id: 'beast',      name: 'Absolute Unit',    desc: 'reach the Beast stage',         test: (s) => s.xp >= 150 },
  { id: 'elder',      name: 'Ancient One',      desc: 'reach the Elder stage',         test: (s) => s.xp >= 400 },
  { id: 'streak3',    name: 'Warming Up',       desc: 'a 3-day streak',                test: (s) => s.streakDays >= 3 },
  { id: 'streak7',    name: 'Habit Formed',     desc: 'a 7-day streak',                test: (s) => s.streakDays >= 7 },
  { id: 'streak30',   name: 'Machine',          desc: 'a 30-day streak',               test: (s) => s.streakDays >= 30 },
  { id: 'streak100',  name: 'Unstoppable',      desc: 'a 100-day streak',              test: (s) => s.streakDays >= 100 },
  { id: 'commits100', name: 'Well Fed',         desc: 'feed it 100 commits',           test: (s) => s.totalCommits >= 100 },
  { id: 'commits500', name: 'Centurion',        desc: 'feed it 500 commits',           test: (s) => s.totalCommits >= 500 },
  { id: 'green50',    name: 'Test Driven',      desc: '50 passing tests',              test: (s) => s.totalTestsPassed >= 50 },
  { id: 'green200',   name: 'Green Machine',    desc: '200 passing tests',             test: (s) => s.totalTestsPassed >= 200 },
  { id: 'builds50',   name: 'Master Builder',   desc: '50 clean builds',               test: (s) => (s.totalBuilds || 0) >= 50 },
  { id: 'phoenix',    name: 'Phoenix',          desc: 'revive it from a faint',        test: (s) => (s.revives || 0) >= 1 },
  { id: 'nightowl',   name: 'Night Owl',        desc: 'feed it after midnight',        test: (s) => !!s.nightFeed },
  { id: 'survivor',   name: 'Survivor',         desc: 'return after 3+ days away',     test: (s) => (s.longestAbsenceDays || 0) >= 3 },
  // ---- secrets: hidden until earned ----
  { id: 'earlybird',  name: 'Early Bird',       desc: 'feed it at the crack of dawn',  test: (s) => !!s.dawnFeed, hidden: true },
  { id: 'perfect',    name: 'Picture of Health', desc: 'every stat above 95 at once',  test: (s) => Math.min(s.hunger, s.happiness, s.health, s.energy) >= 95, hidden: true },
  { id: 'busybee',    name: 'Busy Bee',         desc: '12 commits in a single day',    test: (s) => Math.max(0, ...((s.history || []).map((h) => h.n))) >= 12, hidden: true },
  { id: 'renaissance', name: 'Renaissance Dev',  desc: 'a commit, a green test, and a clean build', test: (s) => s.totalCommits >= 1 && s.totalTestsPassed >= 1 && (s.totalBuilds || 0) >= 1, hidden: true },
  { id: 'battlescars', name: 'Battle-Scarred',  desc: 'weather 50 failing tests',      test: (s) => (s.totalTestsFailed || 0) >= 50, hidden: true },
  { id: 'comeback',   name: 'Comeback Kid',     desc: 'bring it back from the brink 5 times', test: (s) => (s.revives || 0) >= 5, hidden: true },
  { id: 'prodigal',   name: 'Prodigal Pet',     desc: 'return after two full weeks away', test: (s) => (s.longestAbsenceDays || 0) >= 14, hidden: true },
  { id: 'completionist', name: 'Completionist', desc: 'earn every one of the visible achievements', test: (s, have) => VISIBLE_IDS.every((id) => have.has(id)), hidden: true },
];
// Computed after ACHIEVEMENTS is defined; the `completionist` test closes over
// it and only runs later, so the forward reference is safe.
const VISIBLE_IDS = ACHIEVEMENTS.filter((a) => !a.hidden).map((a) => a.id);
export function checkAchievements(s) {
  const have = new Set(s.achievements || []);
  const newly = [];
  // `have` is passed so meta-achievements (completionist) can see siblings that
  // just unlocked in this same pass — those secrets sit last in the list.
  for (const a of ACHIEVEMENTS) {
    if (!have.has(a.id) && a.test(s, have)) { have.add(a.id); newly.push(a); }
  }
  s.achievements = [...have];
  return newly;
}
// The unlock toast — secrets get a distinct, louder reveal.
export function achievementToast(a) {
  return a.hidden
    ? paint('magenta', '✦ secret unlocked: ') + paint('b', a.name) + paint('dim', ` — ${a.desc}`)
    : paint('yellow', '✦ achievement: ') + paint('b', a.name) + paint('dim', ` — ${a.desc}`);
}

// ---------- rendering ----------
export function renderBox(rows, { title = '', accent = 'white' } = {}) {
  let inner = 18;
  for (const r of rows) inner = Math.max(inner, vlen(r.text));
  if (title) inner = Math.max(inner, vlen(title) + 4);
  const out = [];
  if (title) {
    const fill = (inner + 2) - 3 - vlen(title);
    out.push(paint(accent, '╭─ ') + paint('b', title) + paint(accent, ' ' + '─'.repeat(Math.max(0, fill)) + '╮'));
  } else {
    out.push(paint(accent, '╭' + '─'.repeat(inner + 2) + '╮'));
  }
  for (const r of rows) out.push(paint(accent, '│') + ' ' + pad(r.text, inner, r.align || 'left') + ' ' + paint(accent, '│'));
  out.push(paint(accent, '╰' + '─'.repeat(inner + 2) + '╯'));
  return out.join('\n');
}

export function statBar(label, value) {
  const w = 10;
  const v = clamp(value);
  const filled = Math.round((v / 100) * w);
  const color = v >= 60 ? 'green' : v >= 30 ? 'yellow' : 'red';
  const b = paint(color, '█'.repeat(filled)) + paint('dim', '░'.repeat(w - filled));
  return `${label} ${b} ${String(Math.round(v)).padStart(3)}`;
}

const SPARKS = ' ▁▂▃▄▅▆▇█';
export function sparkline(counts) {
  if (!counts || !counts.length) return '';
  const max = Math.max(1, ...counts);
  return counts.map((n) => SPARKS[Math.min(8, Math.round((n / max) * 8))]).join('');
}

export function renderCard(s, now = Date.now(), faceOverride = null) {
  const st = stageFor(s.xp);
  const mood = moodOf(s);
  const rows = [];
  rows.push({ text: '' });
  const branch = st.key === 'elder' ? elderBranch(s) : null;
  if (branch && branch.crown) rows.push({ text: paint('yellow', branch.crown), align: 'center' });
  // Trim before centering: the art is authored as a left-aligned block, but each
  // row is centered independently — trimming centres the visible glyphs so the
  // (symmetric) creature stacks true instead of drifting on odd/even widths.
  for (const line of artFor(s.species, st.key, faceOverride || mood.face)) rows.push({ text: paint(st.color, line.trim()), align: 'center' });
  rows.push({ text: '' });
  rows.push({ text: `${paint('b', s.name)} ${paint('dim', '·')} ${paint(st.color, stageDisplayName(s))} ${paint('dim', '·')} ${paint('dim', s.xp + ' XP')}`, align: 'center' });
  const nxt = nextStage(s.xp);
  rows.push({ text: paint('dim', nxt ? `${nxt.remaining} XP to ${nxt.name}` : 'final form'), align: 'center' });
  rows.push({ text: '' });
  rows.push({ text: statBar('Food', s.hunger) });
  rows.push({ text: statBar('Mood', s.happiness) });
  rows.push({ text: statBar('Life', s.health) });
  rows.push({ text: statBar('Rest', s.energy) });
  const spark = sparkline((s.history || []).map((h) => h.n));
  if (spark.length >= 2) { rows.push({ text: '' }); rows.push({ text: paint('dim', `${spark}  last ${s.history.length}d`) }); }
  rows.push({ text: '' });
  rows.push({ text: paint('dim', quipFor(s, now)) });
  const streak = s.streakDays > 0 ? `streak ${s.streakDays}d` : 'no streak yet';
  rows.push({ text: paint('dim', `${streak} · ${s.totalCommits} fed`) });
  return renderBox(rows, { title: 'shellmon', accent: st.color });
}

export function segmentOf(s) {
  const prev = colorOverride;
  colorOverride = 'NO_COLOR' in process.env ? false : true; // prompt always wants color unless NO_COLOR
  try {
    const st = stageFor(s.xp);
    const mood = moodOf(s);
    return `${paint(st.color, s.name)} ${paint(mood.color, mood.face)} ${paint('dim', Math.round(s.health) + '%')}`;
  } finally { colorOverride = prev; }
}

// ---------- shareable SVG card ----------
// Hex for a role in the current theme; the base ANSI theme has no hex, so map it.
const ANSI_HEX = { red: '#e06c75', green: '#98c379', yellow: '#e5c07b', blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#e6e6e6', gray: '#8b93a1' };
export function hexOf(role) { const v = theme()[role]; return (typeof v === 'string' && v[0] === '#') ? v : (ANSI_HEX[role] || '#e6e6e6'); }
const xmlEsc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A self-contained SVG of the pet — drop it in a GitHub profile README.
export function renderSvg(s) {
  const st = stageFor(s.xp);
  const mood = moodOf(s);
  const acc = hexOf(st.color), fg = hexOf('white'), dim = hexOf('gray');
  const W = 460, pad = 22, fsz = 16, chW = fsz * 0.6;
  const el = [];
  let y = pad + 20;
  el.push(`<text x="${pad}" y="${y}" font-size="15" font-weight="700" fill="${acc}">shellmon</text>`);
  el.push(`<text x="${W - pad}" y="${y}" font-size="12" text-anchor="end" fill="${dim}">${xmlEsc((SPECIES[s.species] || SPECIES.slime).name)}</text>`);
  const art = [];
  const branch = st.key === 'elder' ? elderBranch(s) : null;
  if (branch && branch.crown) art.push(branch.crown);
  art.push(...artFor(s.species, st.key, mood.face));
  const maxLen = Math.max(...art.map((l) => l.length));
  const artX = (W - maxLen * chW) / 2;
  y += 26;
  for (const ln of art) { el.push(`<text x="${artX.toFixed(1)}" y="${y}" font-size="${fsz}" fill="${acc}" xml:space="preserve">${xmlEsc(ln)}</text>`); y += 20; }
  y += 10;
  el.push(`<text x="${W / 2}" y="${y}" font-size="14" text-anchor="middle"><tspan font-weight="700" fill="${fg}">${xmlEsc(s.name)}</tspan><tspan fill="${dim}">  ·  </tspan><tspan fill="${acc}">${xmlEsc(stageDisplayName(s))}</tspan><tspan fill="${dim}">  ·  ${s.xp} XP</tspan></text>`);
  y += 26;
  const barX = pad + 52, barW = W - pad - barX - 46;
  for (const [label, val] of [['Food', s.hunger], ['Mood', s.happiness], ['Life', s.health], ['Rest', s.energy]]) {
    const v = clamp(val);
    const col = v >= 60 ? hexOf('green') : v >= 30 ? hexOf('yellow') : hexOf('red');
    el.push(`<text x="${pad}" y="${y + 9}" font-size="12" fill="${dim}">${label}</text>`);
    el.push(`<rect x="${barX}" y="${y}" width="${barW}" height="10" rx="5" fill="${fg}" fill-opacity="0.10"/>`);
    el.push(`<rect x="${barX}" y="${y}" width="${(barW * v / 100).toFixed(1)}" height="10" rx="5" fill="${col}"/>`);
    el.push(`<text x="${W - pad}" y="${y + 9}" font-size="12" text-anchor="end" fill="${fg}">${Math.round(v)}</text>`);
    y += 20;
  }
  const spark = sparkline((s.history || []).map((h) => h.n));
  if (spark.length >= 2) { y += 6; el.push(`<text x="${W / 2}" y="${y}" font-size="13" text-anchor="middle" fill="${dim}" xml:space="preserve">${xmlEsc(spark)}</text>`); y += 8; }
  y += 12;
  el.push(`<text x="${W / 2}" y="${y}" font-size="12" text-anchor="middle" fill="${dim}">${xmlEsc(quipFor(s))}</text>`);
  const H = y + pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="#0d1117" stroke="${acc}" stroke-width="1.5"/>
${el.join('\n')}
</svg>`;
}

// ---------- config ----------
const DECAY_SPEEDS = { chill: 0.5, normal: 1, hardcore: 2 };
let decayMult = 1;
export function setDecay(name) { if (DECAY_SPEEDS[name] != null) decayMult = DECAY_SPEEDS[name]; return decayMult; }
function defaultConfig() { return { theme: 'classic', decay: 'normal', animations: true }; }
export function loadConfig() {
  let c = null;
  try { c = JSON.parse(fs.readFileSync(configFile(), 'utf8')); } catch { c = null; }
  return (c && typeof c === 'object') ? { ...defaultConfig(), ...c } : defaultConfig();
}
function saveConfig(c) {
  ensureDir();
  const tmp = `${configFile()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2));
  fs.renameSync(tmp, configFile());
}
function applyConfig() { const c = loadConfig(); setTheme(c.theme); setDecay(c.decay); return c; }

// ---------- state ----------
export function cleanName(n) {
  return stripAnsi(String(n == null ? '' : n)).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 20) || 'Pet';
}
export function defaultState() {
  const now = Date.now();
  return {
    version: 3,
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    species: pickSpecies(),
    born: now,
    xp: 0, hunger: 75, happiness: 70, health: 100, energy: 80,
    streakDays: 0, lastStreakDay: null,
    totalCommits: 0, totalTestsPassed: 0, totalTestsFailed: 0, totalBuilds: 0,
    revives: 0, nightFeed: false, dawnFeed: false, longestAbsenceDays: 0,
    history: [], achievements: [],
    lastFed: now, lastActive: now, lastDecay: now, lastTick: 0,
    alive: true,
  };
}
export function load() {
  ensureDir();
  let s = null;
  try { s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { s = null; }
  if (!s || typeof s !== 'object') s = defaultState();
  else s = { ...defaultState(), ...s };
  s.name = cleanName(s.name);
  if (!SPECIES[s.species]) s.species = pickSpecies(); // legacy/invalid -> assign one (persisted on next save)
  if (!Array.isArray(s.history)) s.history = [];
  if (!Array.isArray(s.achievements)) s.achievements = [];
  applyDecay(s);
  return s;
}
export function save(s) {
  ensureDir();
  const tmp = `${stateFile()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, stateFile());
}
function writeSegment(s) {
  ensureDir();
  try { // atomic: the prompt cats this file constantly while a background tick rewrites it
    const tmp = `${segmentFile()}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, segmentOf(s));
    fs.renameSync(tmp, segmentFile());
  } catch { /* non-fatal */ }
}

export function applyDecay(s, now = Date.now()) {
  let hrs = (now - (s.lastDecay || now)) / 3.6e6;
  if (!(hrs > 0)) { s.lastDecay = now; return; }
  if (hrs > 240) hrs = 240; // cap runaway decay at ~10 days
  const days = hrs / 24;
  if (days > (s.longestAbsenceDays || 0)) s.longestAbsenceDays = Math.floor(days);
  const d = hrs * decayMult;
  s.hunger = clamp(s.hunger - 4 * d);
  s.happiness = clamp(s.happiness - 3 * d);
  s.energy = clamp(s.energy - 2.5 * d);
  if (s.hunger <= 0) s.health = clamp(s.health - 5 * d);   // starvation
  if (s.happiness <= 0) s.health = clamp(s.health - 2 * d); // loneliness
  if (s.health <= 0) { s.health = 0; s.alive = false; }
  s.lastDecay = now;
}

export function dayKey(d = new Date()) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
export function updateStreak(s, now = new Date()) {
  const k = dayKey(now);
  if (s.lastStreakDay === k) return;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  s.streakDays = s.lastStreakDay === dayKey(y) ? (s.streakDays || 0) + 1 : 1;
  s.lastStreakDay = k;
}
function recordCommitDay(s, now = new Date()) {
  const k = dayKey(now);
  const h = s.history;
  const last = h[h.length - 1];
  if (last && last.day === k) last.n++;
  else h.push({ day: k, n: 1 });
  while (h.length > 14) h.shift();
}
export { recordCommitDay as recordCommit };
function reviveIfPossible(s) { if (!s.alive && s.health > 0) { s.alive = true; s.revives = (s.revives || 0) + 1; } }
function markNightFeed(s, now = new Date()) {
  const h = now.getHours();
  if (h >= 0 && h < 5) s.nightFeed = true;   // Night Owl
  if (h >= 5 && h < 7) s.dawnFeed = true;    // Early Bird (secret)
}

// ---------- interactions ----------
export function feed(s) {
  s.hunger = clamp(s.hunger + 20);
  s.happiness = clamp(s.happiness + 5);
  s.energy = clamp(s.energy + 8);
  s.health = clamp(s.health + 5); // a meal nurses it back; tests still drive most of health
  s.xp += 3;
  s.lastFed = s.lastActive = Date.now();
  markNightFeed(s);
  reviveIfPossible(s);
}
export function commitFeed(s) {
  s.hunger = clamp(s.hunger + 35);
  s.happiness = clamp(s.happiness + 10);
  s.energy = clamp(s.energy + 5);
  s.health = clamp(s.health + 8);
  s.xp += 8;
  s.totalCommits++;
  s.lastFed = s.lastActive = Date.now();
  updateStreak(s);
  recordCommitDay(s);
  markNightFeed(s);
  reviveIfPossible(s);
}
export function testResult(s, pass) {
  if (pass) {
    s.health = clamp(s.health + 12); s.happiness = clamp(s.happiness + 6); s.energy = clamp(s.energy + 3);
    s.xp += 5; s.totalTestsPassed++;
  } else {
    s.health = clamp(s.health - 15); s.happiness = clamp(s.happiness - 8); s.energy = clamp(s.energy - 5);
    s.xp += 1; s.totalTestsFailed++;
  }
  s.lastActive = Date.now();
  updateStreak(s);
  reviveIfPossible(s);
}
export function play(s) {
  s.happiness = clamp(s.happiness + 18);
  s.energy = clamp(s.energy - 10);
  s.xp += 2;
  s.lastActive = Date.now();
  reviveIfPossible(s);
}
export function rest(s) {
  s.energy = clamp(s.energy + 30);
  s.health = clamp(s.health + 4);
  s.lastActive = Date.now();
  reviveIfPossible(s);
}
export function buildResult(s, pass) {
  if (pass) { s.hunger = clamp(s.hunger + 8); s.happiness = clamp(s.happiness + 5); s.energy = clamp(s.energy + 3); s.xp += 4; s.totalBuilds = (s.totalBuilds || 0) + 1; }
  else { s.happiness = clamp(s.happiness - 6); s.health = clamp(s.health - 6); s.energy = clamp(s.energy - 4); s.xp += 1; }
  s.lastActive = Date.now();
  updateStreak(s);
  reviveIfPossible(s);
}
export function activity(s, pass) {
  if (pass) { s.hunger = clamp(s.hunger + 4); s.happiness = clamp(s.happiness + 2); s.xp += 1; }
  else { s.happiness = clamp(s.happiness - 2); }
  s.lastActive = Date.now();
  reviveIfPossible(s);
}

// ---------- activity sensing: feed on ANY command, not just git ----------
const TEST_RE = /(^|[\s/])(test|tests|spec|specs|jest|vitest|mocha|ava|tap|pytest|py\.test|unittest|rspec|minitest|phpunit|check)\b|\brun[-_]tests?\b|\btest[-_]?runner\b|\b(cargo|go|gradle|mvn|dotnet|swift|ctest)\s+test\b|\b(npm|yarn|pnpm|bun)\s+(run\s+)?test\b|\bnpm\s+t\b/i;
const BUILD_RE = /(^|[\s/])(build|compile|bundle|tsc|webpack|rollup|esbuild|make|cmake|ninja)\b|\b(cargo|go|gradle|swift|dotnet)\s+build\b|\bvite\s+build\b|\bmvn\s+(package|install)\b|\bdocker\s+build\b|\bnpm\s+run\s+build\b/i;
export function classifyCommand(cmdStr) {
  if (TEST_RE.test(cmdStr)) return 'test';
  if (BUILD_RE.test(cmdStr)) return 'build';
  return 'run';
}

export const REACTIONS = {
  'test:pass': ['green across the board. i feel stronger.', 'all passing. you are on it.', 'tests love you today.'],
  'test:fail': ["red tests — that's just a to-do list.", 'ouch. we go again.', 'failing test located. squash it.'],
  'build:pass': ['built clean. chef kiss.', 'it compiles. beautiful.', 'green build. ship it.'],
  'build:fail': ['build broke. shake it off.', 'red build. deep breath, then logs.', 'the compiler has notes.'],
  'run:pass': ['nice.', 'done and dusted.', 'onward.', 'smooth.'],
  'run:fail': ['that exited angry.', 'hmm, non-zero. want to look?', 'it fell over. we lift it back up.'],
};
export function reactionFor(kind, pass) {
  const arr = REACTIONS[`${kind}:${pass ? 'pass' : 'fail'}`] || REACTIONS[`run:${pass ? 'pass' : 'fail'}`];
  return arr[Math.floor(Math.random() * arr.length)];
}
export function applyEvent(s, kind, pass) {
  if (kind === 'test') testResult(s, pass);
  else if (kind === 'build') buildResult(s, pass);
  else activity(s, pass);
}

// ---------- animation (safe: line reveal only, no cursor math) ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function printCard(cardStr, animate) {
  if (!animate) { console.log(cardStr); return; }
  for (const line of cardStr.split('\n')) { process.stdout.write(line + '\n'); await sleep(16); }
}

// ---------- live watch mode ----------
export function blinkFace(face) { return '-' + (face[1] || '_') + '-'; }
// Pure: builds one frame of the live view. `frame` drives the blink, bob, and pulse.
export function renderWatchFrame(s, frame = 0) {
  const mood = moodOf(s);
  const awake = mood.key !== 'ko' && mood.key !== 'sick' && mood.key !== 'sleepy';
  const face = (awake && frame % 8 === 0) ? blinkFace(mood.face) : mood.face;
  const card = renderCard(s, Date.now(), face);
  const hover = (frame % 4 < 2) ? '' : '\n'; // gentle bob
  const pulse = paint('green', frame % 2 === 0 ? '●' : '○');
  const keys = `${paint('b', 'f')} ${paint('dim', 'feed')}   ${paint('b', 'p')} ${paint('dim', 'play')}   ${paint('b', 'r')} ${paint('dim', 'rest')}   ${paint('b', 'q')} ${paint('dim', 'quit')}`;
  return `${hover}${card}\n  ${pulse} ${paint('dim', quipFor(s))}\n  ${keys}`;
}

// Encode a frame for the alt-screen redraw. The box width tracks its content
// (XP digits grow, the stage name changes on evolution, the quip changes), so
// consecutive frames differ in width. Cursor-home + write + clear-below is not
// enough: a narrower frame leaves the previous, wider frame's right border in
// place, so the `│` edges stack up as ghostly "double/triple" sides. Erasing
// each line to end-of-line (\x1b[K) as we draw wipes those trailing glyphs;
// the final \x1b[J clears any rows a taller previous frame left below.
export function screenFrame(body) {
  return '\x1b[H' + body.split('\n').join('\x1b[K\n') + '\x1b[K\x1b[J';
}

// ---------- act: run a mutation, handle evolution + achievements + output ----------
async function act(mutate, { quiet, animate }) {
  const s = load();
  const before = stageFor(s.xp).key;
  mutate(s);
  const evolved = stageFor(s.xp).key !== before ? stageFor(s.xp) : null;
  const newly = checkAchievements(s);
  s.lastTick = Date.now(); // the state is fresh; let the next prompt tick throttle
  save(s);
  writeSegment(s);
  if (quiet) return;
  if (evolved) console.log(paint(evolved.color, `★ ${s.name} evolved into a ${evolved.name}!`) + '\n');
  for (const a of newly) console.log(achievementToast(a));
  if (newly.length) console.log('');
  await printCard(renderCard(s), animate);
}

// ---------- init / shell wiring ----------
const HOOK_SCRIPT = `#!/bin/sh
# shellmon: feed the pet on every commit
if command -v shellmon >/dev/null 2>&1; then
  shellmon commit --quiet >/dev/null 2>&1
else
  npx --no-install shellmon commit --quiet >/dev/null 2>&1
fi
exit 0
`;
const HOOK_LINE = 'command -v shellmon >/dev/null 2>&1 && shellmon commit --quiet >/dev/null 2>&1';

export function snippetFor(shell) {
  if (shell === 'zsh') {
    return [
      '# shellmon',
      'setopt PROMPT_SUBST 2>/dev/null',
      '_shellmon() { ( shellmon tick --quiet & ) ; SHELLMON="$(cat ~/.shellmon/segment 2>/dev/null)" }',
      'precmd_functions+=(_shellmon)',
      "RPROMPT='$SHELLMON'",
    ].join('\n');
  }
  if (shell === 'fish') {
    return [
      '# shellmon  (in ~/.config/fish/config.fish)',
      'function _shellmon --on-event fish_prompt',
      '    command shellmon tick --quiet & ; disown',
      'end',
      'function fish_right_prompt',
      '    cat ~/.shellmon/segment 2>/dev/null',
      'end',
    ].join('\n');
  }
  return [
    '# shellmon',
    '_shellmon() { ( shellmon tick --quiet & ) ; }',
    'PROMPT_COMMAND="_shellmon${PROMPT_COMMAND:+;$PROMPT_COMMAND}"',
    "PS1=\"$PS1\"'$(cat ~/.shellmon/segment 2>/dev/null)'",
  ].join('\n');
}

function repoHookPath() {
  const gitDir = execSync('git rev-parse --git-dir', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  const resolved = path.isAbsolute(gitDir) ? gitDir : path.join(process.cwd(), gitDir);
  return path.join(resolved, 'hooks', 'post-commit');
}

function cmdInit() {
  const shell = path.basename(process.env.SHELL || '') || 'bash';
  console.log(paint('b', 'shellmon setup') + '\n');
  try {
    const hookPath = repoHookPath();
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    if (fs.existsSync(hookPath)) {
      const cur = fs.readFileSync(hookPath, 'utf8');
      if (cur.includes('shellmon')) console.log(paint('green', '  ✓') + ' git hook already feeds shellmon on commit.');
      else { console.log(paint('yellow', '  !') + ' You already have a post-commit hook. Add this line to it:'); console.log('      ' + paint('dim', HOOK_LINE)); }
    } else {
      fs.writeFileSync(hookPath, HOOK_SCRIPT); fs.chmodSync(hookPath, 0o755);
      console.log(paint('green', '  ✓') + ' Installed git post-commit hook — every commit now feeds your pet.');
    }
  } catch { console.log(paint('dim', '  · not a git repo here — run `shellmon init` inside one to feed on commits.')); }
  console.log('\n  Add your pet to your prompt (' + paint('b', shell) + '):\n');
  console.log(snippetFor(shell).split('\n').map((l) => '    ' + paint('dim', l)).join('\n'));
  const s = load(); save(s); writeSegment(s);
  console.log('\n  Then open a new shell. `' + paint('b', 'shellmon') + '` shows the full pet anytime.');
}

function cmdDoctor() {
  const ok = (m) => console.log(paint('green', '  ✓ ') + m);
  const warn = (m) => console.log(paint('yellow', '  ! ') + m);
  const info = (m) => console.log(paint('dim', '  · ') + m);
  console.log(paint('b', 'shellmon doctor') + '\n');

  let s = null;
  try { s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')); ok(`state file OK (${stateFile()})`); }
  catch { warn('no readable state yet — run `shellmon` once to create your pet.'); }
  if (s) { const st = stageFor(s.xp || 0); info(`${cleanName(s.name)} · ${st.name} · ${s.xp || 0} XP · ${(s.achievements || []).length}/${ACHIEVEMENTS.length} achievements`); }

  const c = loadConfig();
  info(`theme: ${c.theme} · decay: ${c.decay} · animations: ${c.animations ? 'on' : 'off'}`);

  try { execSync('command -v shellmon', { stdio: 'ignore', shell: '/bin/sh' }); ok('shellmon is on your PATH (hooks + prompt will find it).'); }
  catch { warn('shellmon is not on PATH — `npm i -g shellmon` so the hook/prompt can call it.'); }

  try {
    const hookPath = repoHookPath();
    if (fs.existsSync(hookPath) && fs.readFileSync(hookPath, 'utf8').includes('shellmon')) ok('git post-commit hook is installed in this repo.');
    else warn('no shellmon post-commit hook here — run `shellmon init`.');
  } catch { info('not inside a git repo (that is fine).'); }
  console.log();
}

function cmdConfig(argv) {
  const key = argv[1];
  const val = argv[2];
  const c = loadConfig();
  if (!key) {
    console.log(paint('b', 'shellmon config') + '\n');
    console.log(`  theme       ${paint('cyan', c.theme)}   ${paint('dim', '(shellmon themes)')}`);
    console.log(`  decay       ${paint('cyan', c.decay)}   ${paint('dim', '(chill | normal | hardcore)')}`);
    console.log(`  animations  ${paint('cyan', String(c.animations))}   ${paint('dim', '(on | off)')}`);
    console.log('\n  set with: ' + paint('dim', 'shellmon config <key> <value>'));
    return;
  }
  if (key === 'theme') { if (!THEMES[val]) { console.error(`unknown theme "${val}". try: ${Object.keys(THEMES).join(', ')}`); process.exit(1); } c.theme = val; }
  else if (key === 'decay') { if (!DECAY_SPEEDS[val]) { console.error('decay must be: chill | normal | hardcore'); process.exit(1); } c.decay = val; }
  else if (key === 'animations') { c.animations = !(val === 'off' || val === 'false' || val === '0'); }
  else { console.error(`unknown config key "${key}" (theme | decay | animations)`); process.exit(1); }
  saveConfig(c);
  applyConfig();
  console.log(paint('green', '✓') + ` ${key} = ${val}`);
}

function cmdThemes() {
  applyConfig();
  const active = loadConfig().theme;
  console.log(paint('b', 'themes') + paint('dim', '  —  shellmon config theme <name>') + '\n');
  for (const name of Object.keys(THEMES)) {
    const prev = currentThemeName;
    setTheme(name);
    const swatch = ['green', 'cyan', 'magenta', 'yellow', 'red'].map((c) => paint(c, '●')).join('');
    setTheme(prev);
    const mark = name === active ? paint('green', ' ← active') : '';
    console.log(`  ${swatch}  ${name}${mark}`);
  }
  console.log();
}

function cmdStats() {
  const s = load(); save(s); writeSegment(s);
  const newly = checkAchievements(s);
  const st = stageFor(s.xp);
  const spark = sparkline((s.history || []).map((h) => h.n)) || paint('dim', '(commit something)');
  const rows = [];
  rows.push({ text: `${paint('b', s.name)} the ${paint(st.color, stageDisplayName(s))}` });
  rows.push({ text: paint('dim', `${(SPECIES[s.species] || SPECIES.slime).name} · born ${new Date(s.born).toLocaleDateString()}`) });
  rows.push({ text: '' });
  rows.push({ text: `commits fed   ${paint('cyan', s.totalCommits)}` });
  rows.push({ text: `tests green   ${paint('green', s.totalTestsPassed)}   ${paint('dim', 'red ' + s.totalTestsFailed)}` });
  rows.push({ text: `best streak   ${paint('yellow', s.streakDays + 'd')}` });
  rows.push({ text: `revives       ${paint('magenta', s.revives || 0)}` });
  rows.push({ text: '' });
  rows.push({ text: `${spark}  ${paint('dim', 'commits, last ' + (s.history || []).length + 'd')}` });
  rows.push({ text: '' });
  const have = new Set(s.achievements || []);
  const secrets = ACHIEVEMENTS.filter((a) => a.hidden && !have.has(a.id)).length;
  const secretNote = secrets ? paint('magenta', `   + ${secrets} secret${secrets > 1 ? 's' : ''} to find`) : '';
  rows.push({ text: paint('b', `achievements  ${have.size}/${ACHIEVEMENTS.length}`) + secretNote });
  for (const a of ACHIEVEMENTS) {
    const got = have.has(a.id);
    // A locked secret shows as ??? — earning it is the reveal.
    if (!got && a.hidden) { rows.push({ text: `${paint('dim', '·')} ${paint('magenta', '???')} ${paint('dim', '— hidden achievement')}` }); continue; }
    const mark = got ? paint(a.hidden ? 'magenta' : 'green', '✦') : paint('dim', '·');
    rows.push({ text: `${mark} ${got ? a.name : paint('dim', a.name)} ${paint('dim', '— ' + a.desc)}` });
  }
  console.log(renderBox(rows, { title: 'stats', accent: st.color }));
  if (newly.length) save(s);
}

function cmdUninstall(argv) {
  console.log(paint('b', 'shellmon uninstall') + '\n');
  try {
    const hookPath = repoHookPath();
    if (fs.existsSync(hookPath) && fs.readFileSync(hookPath, 'utf8').includes('shellmon')) {
      fs.rmSync(hookPath); console.log(paint('green', '  ✓') + ' removed the post-commit hook from this repo.');
    } else console.log(paint('dim', '  · no shellmon hook in this repo.'));
  } catch { console.log(paint('dim', '  · not a git repo here.')); }
  if (argv.includes('--purge')) { try { fs.rmSync(dir(), { recursive: true, force: true }); console.log(paint('green', '  ✓') + ' deleted ~/.shellmon (pet and all).'); } catch {} }
  else console.log(paint('dim', '  · kept your pet. add --purge to delete ~/.shellmon.'));
  console.log('\n  Last step: remove the shellmon block from your shell rc file.');
}

function cmdJson() {
  const s = load(); save(s); writeSegment(s);
  const st = stageFor(s.xp); const mood = moodOf(s);
  process.stdout.write(JSON.stringify({
    name: s.name, species: s.species, stage: st.key, stageName: stageDisplayName(s),
    branch: st.key === 'elder' ? elderBranch(s).key : null, xp: s.xp, mood: mood.key, face: mood.face,
    hunger: Math.round(s.hunger), happiness: Math.round(s.happiness), health: Math.round(s.health), energy: Math.round(s.energy),
    alive: s.alive, streakDays: s.streakDays, totalCommits: s.totalCommits,
    totalTestsPassed: s.totalTestsPassed, totalTestsFailed: s.totalTestsFailed,
    achievements: s.achievements, revives: s.revives || 0,
  }, null, 2) + '\n');
}

async function cmdSpecies(argv, animate) {
  const name = (argv[1] || '').toLowerCase();
  if (!name) {
    const cur = load().species;
    console.log(paint('b', 'species') + paint('dim', '  —  shellmon species <name>') + '\n');
    for (const k of Object.keys(SPECIES)) {
      const mine = k === cur;
      console.log(`  ${paint(mine ? 'green' : 'b', SPECIES[k].name)}${mine ? paint('green', '  ← yours') : ''}`);
      for (const line of artFor(k, 'critter', '^-^')) console.log('   ' + paint(mine ? 'cyan' : 'dim', line));
      console.log('');
    }
    return;
  }
  if (!SPECIES[name]) { console.error(`unknown species "${name}". try: ${Object.keys(SPECIES).join(', ')}`); process.exit(1); }
  const s = load(); s.species = name; save(s); writeSegment(s);
  console.log(paint('green', '✓') + ` your pet is now a ${SPECIES[name].name}.\n`);
  await printCard(renderCard(s), animate);
}

// Run any command; feed the pet on its outcome; pass the exit code straight
// through so `shellmon run -- <anything>` is a transparent wrapper for CI/scripts.
function cmdRun(argv) {
  // shellmon's own flags come before the command. With `--`, everything after it
  // is the command verbatim. Without `--`, consume only the leading known flags
  // and treat the rest as the command (so a command arg like `test` is never
  // mistaken for a flag value).
  const sep = argv.indexOf('--');
  let head, cmd;
  if (sep >= 0) { head = argv.slice(1, sep); cmd = argv.slice(sep + 1); }
  else {
    head = [];
    const rest = argv.slice(1);
    let i = 0;
    for (; i < rest.length; i++) {
      const a = rest[i];
      if (a === '--quiet' || a === '-q') head.push(a);
      else if (a === '--label') { head.push(a, rest[i + 1]); i++; }
      else break; // first non-flag token starts the command
    }
    cmd = rest.slice(i);
  }
  const quiet = head.includes('--quiet') || head.includes('-q');
  const li = head.indexOf('--label');
  const label = li >= 0 ? head[li + 1] : null;
  if (!cmd.length) { console.error('usage: shellmon run [--label test|build|run] -- <command> [args...]'); process.exit(1); }
  const kind = (label === 'test' || label === 'build' || label === 'run') ? label : classifyCommand(cmd.join(' '));

  const res = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit' });
  if (res.error) { console.error(`shellmon run: ${res.error.code === 'ENOENT' ? `command not found: ${cmd[0]}` : res.error.message}`); process.exit(127); }
  const code = res.status == null ? 1 : res.status;
  const pass = code === 0;

  const s = load();
  const before = stageFor(s.xp).key;
  applyEvent(s, kind, pass);
  const evolved = stageFor(s.xp).key !== before ? stageFor(s.xp) : null;
  const newly = checkAchievements(s);
  s.lastTick = Date.now();
  save(s); writeSegment(s);
  if (!quiet) {
    const mood = moodOf(s);
    console.log(paint(mood.color, `» ${reactionFor(kind, pass)}`) + paint('dim', `  (${kind} ${pass ? 'ok' : 'exit ' + code})`));
    if (evolved) console.log(paint(evolved.color, `★ ${s.name} evolved into a ${evolved.name}!`));
    for (const a of newly) console.log(achievementToast(a));
  }
  process.exit(code);
}

// A full-screen live view. The pet blinks, hovers, reacts to hotkeys, and picks
// up feeds from other terminals (commits, `run`) because it re-reads state each
// frame. Non-interactive stdio prints a single frame and exits (never hangs).
function cmdWatch() {
  const interactive = !!(process.stdout.isTTY && process.stdin.isTTY);
  if (!interactive) { const s = load(); save(s); writeSegment(s); console.log(renderCard(s)); return; }

  let frame = 0;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return; cleaned = true;
    try { process.stdin.setRawMode(false); } catch { /* not a raw tty */ }
    process.stdout.write('\x1b[?25h\x1b[?1049l'); // show cursor, leave alt screen
  };
  const quit = (code = 0) => { try { const s = load(); save(s); writeSegment(s); } catch { /* best effort */ } cleanup(); process.exit(code); };
  const draw = () => { const s = load(); process.stdout.write(screenFrame(renderWatchFrame(s, frame))); };

  process.stdout.write('\x1b[?1049h\x1b[?25l'); // enter alt screen, hide cursor
  process.on('exit', cleanup); // guarantees the terminal is restored no matter how we die
  process.on('SIGINT', () => quit(0));
  process.on('SIGTERM', () => quit(0));

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    if (chunk === '\x1b') return quit(0);        // lone Esc
    if (chunk[0] === '\x1b') return;             // arrow / function keys — ignore, don't quit
    let acted = false;
    for (const key of chunk) {                   // a batched paste/pipe may carry several keys
      if (key === 'q' || key === '\x03') return quit(0); // q or Ctrl-C
      const s = load();
      if (key === 'f') feed(s);
      else if (key === 'p') play(s);
      else if (key === 'r') rest(s);
      else continue;
      checkAchievements(s); s.lastTick = Date.now(); save(s); writeSegment(s); acted = true;
    }
    if (acted) draw();
  });

  draw();
  setInterval(() => { frame++; draw(); }, 500);
}

function cmdCard(argv) {
  const s = load(); save(s); writeSegment(s);
  if (argv.includes('--plain')) { // uncolored ASCII, for pasting into issues/chat
    const prev = colorOverride; colorOverride = false;
    try { console.log(renderCard(s)); } finally { colorOverride = prev; }
    return;
  }
  if (process.stdout.isTTY) process.stderr.write(paint('dim', 'tip: redirect to a file — shellmon card > pet.svg\n'));
  process.stdout.write(renderSvg(s) + '\n');
}

// A little celebration: hue-cycle the whole card, then settle. Pure eye candy.
async function cmdParty() {
  const s = load(); save(s); writeSegment(s);
  const card = renderCard(s);
  if (!(colorOn() && process.stdout.isTTY && loadConfig().animations)) { console.log(card); return; }
  const lines = card.split('\n');
  const hues = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
  process.stdout.write('\x1b[?25l');
  try {
    for (let i = 0; i < 18; i++) {
      if (i > 0) process.stdout.write(`\x1b[${lines.length}A`);
      process.stdout.write(lines.map((l) => paint(hues[i % hues.length], stripAnsi(l))).join('\n') + '\n');
      await sleep(85);
    }
    process.stdout.write(`\x1b[${lines.length}A` + card + '\n');
  } finally { process.stdout.write('\x1b[?25h'); }
}

// ---------- usage ----------
function usage() {
  console.log(`shellmon ${VERSION} — a terminal pet that feeds on your dev activity

Usage
  shellmon                 show your pet
  shellmon status          one-line summary (for prompts)
  shellmon watch           live full-screen view (f feed · p play · r rest · q quit)
  shellmon stats           lifetime stats, history, achievements
  shellmon feed            a snack (+small)
  shellmon commit          feed it a commit (+big, +streak)
  shellmon test --pass     a green test heals it
  shellmon test --fail     a red test makes it ill
  shellmon run -- <cmd>    run any command; feed on its exit code (test/build/any)
  shellmon play            play with it (+mood, -energy)
  shellmon rest            let it nap (+energy)
  shellmon tick            apply time, refresh the prompt segment
  shellmon init            wire up the git hook + prompt segment
  shellmon doctor          check your setup
  shellmon config          view or change theme / decay / animations
  shellmon themes          list color themes
  shellmon hatch <name>    name (or rename) your pet
  shellmon species [name]  view the four species, or pick one (slime/cat/dragon/bot)
  shellmon card            export a shareable SVG (or --plain for ascii)
  shellmon json            machine-readable state
  shellmon reset           start over with a fresh egg
  shellmon uninstall       remove hook (add --purge to delete ~/.shellmon)

Flags
  --quiet, -q              no output (used by hooks and the prompt tick)
  --no-anim                skip the reveal animation (it is on by default in a TTY)

It feeds on commits, test results, and care. It wilts from neglect.`);
}

// ---------- dispatch ----------
export async function main(argvIn = process.argv.slice(2)) {
  applyConfig();
  const argv = argvIn;
  const has = (f) => argv.includes(f);
  const quiet = has('--quiet') || has('-q');
  const cfg = loadConfig();
  // Animate the reveal by default in a real terminal; off for hooks, pipes,
  // --quiet, --no-anim, NO_COLOR, and when the user turned animations off.
  const animate = !quiet && !has('--no-anim') && cfg.animations && colorOn() && !!process.stdout.isTTY;

  // Version/help work as either a word or a flag, in any position.
  if (argv[0] === 'version' || has('-v') || has('--version')) { console.log(`shellmon ${VERSION}`); return; }
  if (argv[0] === 'help' || has('-h') || has('--help')) { usage(); return; }
  // A leading flag (e.g. `shellmon --no-anim`) means "the default view, with flags".
  const cmd = (argv[0] && !argv[0].startsWith('-')) ? argv[0].toLowerCase() : '';

  switch (cmd) {
    case '': case 'show': {
      const s = load();
      const newly = checkAchievements(s);
      save(s); writeSegment(s);
      for (const a of newly) console.log(achievementToast(a));
      if (newly.length) console.log('');
      await printCard(renderCard(s), animate);
      break;
    }
    case 'card':      cmdCard(argv); break;
    case 'party':     await cmdParty(); break;
    case 'status': { const s = load(); save(s); writeSegment(s); process.stdout.write(segmentOf(s) + '\n'); break; }
    case 'tick': {
      const s = load();
      const now = Date.now();
      const due = has('--force') || !s.lastTick || (now - s.lastTick) >= 15000;
      if (due) { s.lastTick = now; checkAchievements(s); save(s); }
      writeSegment(s);
      break;
    }
    case 'feed':   await act((s) => feed(s), { quiet, animate }); break;
    case 'commit': await act((s) => commitFeed(s), { quiet, animate }); break;
    case 'play':   await act((s) => play(s), { quiet, animate }); break;
    case 'rest':   await act((s) => rest(s), { quiet, animate }); break;
    case 'test': {
      const fail = has('--fail') || argv[1] === 'fail';
      const pass = has('--pass') || argv[1] === 'pass';
      if (!fail && !pass) { console.error('usage: shellmon test --pass | --fail'); process.exit(1); }
      await act((s) => testResult(s, pass && !fail), { quiet, animate });
      break;
    }
    case 'hatch': case 'rename': case 'name': {
      const name = argv.slice(1).filter((a) => !a.startsWith('-')).join(' ');
      if (!name) { console.error('usage: shellmon hatch <name>'); process.exit(1); }
      const s = load(); s.name = cleanName(name); save(s); writeSegment(s);
      if (!quiet) await printCard(renderCard(s), animate);
      break;
    }
    case 'reset': case 'adopt': {
      ensureDir();
      const s = defaultState(); save(s); writeSegment(s);
      if (!quiet) { console.log(paint('dim', 'a fresh egg appears.\n')); await printCard(renderCard(s), animate); }
      break;
    }
    case 'run':       cmdRun(argv); break;
    case 'watch':     cmdWatch(); break;
    case 'species':   await cmdSpecies(argv, animate); break;
    case 'stats':     cmdStats(); break;
    case 'init':      cmdInit(); break;
    case 'doctor':    cmdDoctor(); break;
    case 'config':    cmdConfig(argv); break;
    case 'themes':    cmdThemes(); break;
    case 'uninstall': cmdUninstall(argv); break;
    case 'json':      cmdJson(); break;
    default: console.error(`shellmon: unknown command "${argv[0]}"\n`); usage(); process.exit(1);
  }
}

// Run only when executed directly, not when imported by tests. argv[1] may be a
// symlink (npm installs the bin as one) while import.meta.url is the real path,
// so resolve argv[1] before comparing — otherwise `main()` silently never runs.
function invokedDirectly() {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href; }
  catch { return false; }
}
if (invokedDirectly()) main().catch((e) => { console.error('shellmon:', e && e.message ? e.message : e); process.exit(1); });
