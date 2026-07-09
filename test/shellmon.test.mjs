// shellmon test suite — zero-dependency, runs on `node --test`.
// Unit tests import cli.mjs directly; integration tests spawn it as a process.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.env.NO_COLOR = '1'; // deterministic, plain-text output for assertions

import {
  clamp, vlen, stripAnsi, pad, hexToRgb, stageFor, nextStage, moodOf, quipFor,
  sparkline, statBar, renderBox, cleanName, checkAchievements, ACHIEVEMENTS,
  updateStreak, dayKey, applyDecay, feed, commitFeed, testResult, play, rest,
  defaultState, load, save, segmentOf, setTheme, setDecay, THEMES,
  classifyCommand, buildResult, activity, applyEvent, reactionFor,
  SPECIES, artFor, pickSpecies, elderBranch, stageDisplayName,
  blinkFace, renderWatchFrame, VERSION, renderSvg, hexOf,
} from '../cli.mjs';

const CLI = fileURLToPath(new URL('../cli.mjs', import.meta.url));
function freshHome() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-')); process.env.SHELLMON_HOME = d; return d; }
function run(args, env = {}) {
  return execFileSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ...env } });
}
function runFail(args, env = {}) {
  try { run(args, env); return null; } catch (e) { return e; }
}

beforeEach(() => { setTheme('classic'); setDecay('normal'); });

// ---------- primitives ----------
test('clamp bounds 0..100', () => {
  assert.equal(clamp(-5), 0); assert.equal(clamp(150), 100); assert.equal(clamp(42), 42);
});
test('stripAnsi / vlen ignore color codes', () => {
  const s = '\x1b[31mhi\x1b[0m';
  assert.equal(stripAnsi(s), 'hi'); assert.equal(vlen(s), 2);
});
test('pad left/right/center by visible width', () => {
  assert.equal(pad('ab', 5), 'ab   ');
  assert.equal(pad('ab', 5, 'right'), '   ab');
  assert.equal(pad('ab', 5, 'center'), ' ab  ');
  assert.equal(vlen(pad('\x1b[31mab\x1b[0m', 5)), 5); // padding counts visible length only
});
test('hexToRgb parses with and without hash', () => {
  assert.deepEqual(hexToRgb('#ff8000'), { r: 255, g: 128, b: 0 });
  assert.deepEqual(hexToRgb('00ff00'), { r: 0, g: 255, b: 0 });
});

// ---------- creature progression ----------
test('stageFor thresholds', () => {
  assert.equal(stageFor(0).key, 'egg');
  assert.equal(stageFor(9).key, 'egg');
  assert.equal(stageFor(10).key, 'blob');
  assert.equal(stageFor(49).key, 'blob');
  assert.equal(stageFor(50).key, 'critter');
  assert.equal(stageFor(150).key, 'beast');
  assert.equal(stageFor(400).key, 'elder');
  assert.equal(stageFor(99999).key, 'elder');
});
test('nextStage reports remaining XP, null at max', () => {
  assert.deepEqual(nextStage(0), { name: 'Blobling', remaining: 10 });
  assert.deepEqual(nextStage(62), { name: 'Beast', remaining: 88 });
  assert.equal(nextStage(400), null);
});

// ---------- mood ----------
function baseHealthy() { return { alive: true, health: 90, hunger: 90, energy: 90, happiness: 90, streakDays: 0 }; }
test('moodOf priority order', () => {
  assert.equal(moodOf({ ...baseHealthy(), alive: false }).key, 'ko');
  assert.equal(moodOf({ ...baseHealthy(), health: 0 }).key, 'ko');
  assert.equal(moodOf({ ...baseHealthy(), health: 20 }).key, 'sick');
  assert.equal(moodOf({ ...baseHealthy(), hunger: 10 }).key, 'hungry');
  assert.equal(moodOf({ ...baseHealthy(), energy: 10 }).key, 'sleepy');
  assert.equal(moodOf(baseHealthy()).key, 'ecstatic');
  assert.equal(moodOf({ ...baseHealthy(), happiness: 60 }).key, 'happy');
  assert.equal(moodOf({ ...baseHealthy(), happiness: 40 }).key, 'content');
});
test('sick outranks hungry when both low', () => {
  assert.equal(moodOf({ alive: true, health: 10, hunger: 5, energy: 90, happiness: 90 }).key, 'sick');
});

// ---------- quips ----------
test('quipFor is time and context aware', () => {
  const s = { ...baseHealthy(), lastActive: Date.now(), streakDays: 0 };
  const at = (h) => new Date(2026, 5, 15, h, 0, 0).getTime();
  assert.match(quipFor(s, at(2)), /asleep/);                       // late night
  const away = { ...s, lastActive: at(12) - 4 * 86400000 };
  assert.match(quipFor(away, at(12)), /welcome back.*4 days/);     // long absence
  const streaky = { ...s, streakDays: 8, happiness: 60, lastActive: at(12) };
  assert.match(quipFor(streaky, at(12)), /8 days straight/);       // streak flex
  const plain = { ...s, happiness: 40, lastActive: at(12) };
  assert.equal(quipFor(plain, at(12)), moodOf(plain).quip);        // falls back to mood
});
test('ko never gets a cheerful quip', () => {
  const s = { alive: false, health: 0, hunger: 0, energy: 0, happiness: 0, streakDays: 10, lastActive: Date.now() };
  assert.match(quipFor(s), /faint|revive/);
});

// ---------- rendering ----------
test('sparkline maps counts to blocks', () => {
  assert.equal(sparkline([]), '');
  assert.equal(sparkline([1, 2, 4]), '▂▄█');
  assert.equal(sparkline([0, 0]), '  ');
});
test('statBar fills proportionally and shows value', () => {
  assert.match(statBar('Food', 100), /██████████ 100/);
  assert.match(statBar('Food', 0), /░░░░░░░░░░\s+0/);
  assert.equal(stripAnsi(statBar('Food', 50)).indexOf('█████░'), 5);
});
test('renderBox produces a rectangular, aligned box', () => {
  const lines = renderBox([{ text: 'hi' }, { text: 'a longer line' }], { title: 'T' }).split('\n');
  const widths = new Set(lines.map(vlen));
  assert.equal(widths.size, 1, 'all rows share one visible width');
  assert.ok(lines[0].startsWith('╭'));
  assert.ok(lines.at(-1).startsWith('╰') && lines.at(-1).endsWith('╯'));
});
test('renderBox stays aligned even with colored content', () => {
  setTheme('classic');
  const painted = `\x1b[31mred\x1b[0m`;
  const lines = renderBox([{ text: painted }, { text: 'plain' }]).split('\n');
  const widths = new Set(lines.map(vlen));
  assert.equal(widths.size, 1);
});

// ---------- name safety (the audit fix) ----------
test('cleanName strips ANSI, control chars, trims, caps length', () => {
  assert.equal(cleanName('\x1b[31mEvil\x1b[0m'), 'Evil');
  assert.equal(cleanName('a\nb\tc'), 'abc');
  assert.equal(cleanName('  spaced  '), 'spaced');
  assert.equal(cleanName('x'.repeat(50)).length, 20);
  assert.equal(cleanName(''), 'Pet');
  assert.equal(cleanName(null), 'Pet');
  assert.equal(cleanName('rm -rf $(whoami)'), 'rm -rf $(whoami)'); // kept literal; it is only ever cat-printed
});

// ---------- streaks ----------
test('updateStreak: first day, consecutive, gap, same-day', () => {
  const now = new Date(2026, 5, 15, 12, 0, 0);
  const y = new Date(now); y.setDate(y.getDate() - 1);

  let s = { lastStreakDay: null, streakDays: 0 };
  updateStreak(s, now); assert.equal(s.streakDays, 1);

  s = { lastStreakDay: dayKey(y), streakDays: 3 };
  updateStreak(s, now); assert.equal(s.streakDays, 4);

  const old = new Date(now); old.setDate(old.getDate() - 3);
  s = { lastStreakDay: dayKey(old), streakDays: 9 };
  updateStreak(s, now); assert.equal(s.streakDays, 1);

  s = { lastStreakDay: dayKey(now), streakDays: 5 };
  updateStreak(s, now); assert.equal(s.streakDays, 5); // no double count
});

// ---------- decay ----------
test('applyDecay reduces stats over elapsed hours', () => {
  const T = 1_000_000_000_000;
  const s = { ...defaultState(), hunger: 75, happiness: 70, energy: 80, health: 100, lastDecay: T };
  applyDecay(s, T + 10 * 3.6e6); // 10 hours
  assert.equal(s.hunger, 35); assert.equal(s.happiness, 40); assert.equal(s.energy, 55);
  assert.equal(s.health, 100); // fed, so no starvation
});
test('applyDecay starves and KOs a neglected pet', () => {
  const T = 1_000_000_000_000;
  const s = { ...defaultState(), hunger: 0, happiness: 90, health: 10, lastDecay: T };
  applyDecay(s, T + 10 * 3.6e6);
  assert.equal(s.health, 0); assert.equal(s.alive, false);
});
test('applyDecay ignores a backwards clock', () => {
  const T = 1_000_000_000_000;
  const s = { ...defaultState(), hunger: 60, lastDecay: T + 5 * 3.6e6 };
  applyDecay(s, T); // "now" is earlier than lastDecay
  assert.equal(s.hunger, 60); assert.equal(s.lastDecay, T);
});
test('applyDecay records longest absence and caps runaway decay', () => {
  const T = 1_000_000_000_000;
  const s = { ...defaultState(), lastDecay: T };
  applyDecay(s, T + 500 * 3.6e6); // 500h, capped to 240h (10 days)
  assert.equal(s.longestAbsenceDays, 10);
});
test('decay speed multiplier applies', () => {
  const T = 1_000_000_000_000;
  setDecay('hardcore');
  const s = { ...defaultState(), hunger: 75, lastDecay: T };
  applyDecay(s, T + 10 * 3.6e6); // 2x => -80 => clamps to 0
  assert.equal(s.hunger, 0);
  setDecay('normal');
});

// ---------- interactions ----------
test('feed nourishes and grants a little XP', () => {
  const s = { ...defaultState(), hunger: 50, xp: 0 };
  feed(s);
  assert.equal(s.hunger, 70); assert.equal(s.xp, 3);
});
test('commit is a big meal + streak + history', () => {
  const s = { ...defaultState(), hunger: 50, xp: 0, totalCommits: 0, history: [], lastStreakDay: null };
  commitFeed(s);
  assert.equal(s.hunger, 85); assert.equal(s.xp, 8); assert.equal(s.totalCommits, 1);
  assert.ok(s.streakDays >= 1);
  assert.equal(s.history.at(-1).n, 1);
  commitFeed(s);
  assert.equal(s.history.at(-1).n, 2); // same day accumulates
});
test('tests heal or harm', () => {
  const pass = { ...defaultState(), health: 50, xp: 0 };
  testResult(pass, true);
  assert.equal(pass.health, 62); assert.equal(pass.xp, 5); assert.equal(pass.totalTestsPassed, 1);
  const fail = { ...defaultState(), health: 50, xp: 0 };
  testResult(fail, false);
  assert.equal(fail.health, 35); assert.equal(fail.totalTestsFailed, 1);
});
test('play trades energy for mood; rest restores energy', () => {
  const s = { ...defaultState(), happiness: 50, energy: 50 };
  play(s); assert.equal(s.happiness, 68); assert.equal(s.energy, 40);
  const r = { ...defaultState(), energy: 50 };
  rest(r); assert.equal(r.energy, 80);
});
test('feeding a fainted pet revives it exactly once', () => {
  const s = { ...defaultState(), alive: false, health: 0, revives: 0 };
  commitFeed(s);
  assert.equal(s.alive, true); assert.equal(s.revives, 1);
  const before = s.revives;
  commitFeed(s); // already alive, must not re-count
  assert.equal(s.revives, before);
});

// ---------- achievements ----------
test('checkAchievements unlocks once, never twice', () => {
  const s = { ...defaultState(), xp: 10 };
  const first = checkAchievements(s).map((a) => a.id);
  assert.ok(first.includes('hatch'));
  assert.deepEqual(checkAchievements(s), []); // idempotent
  assert.ok(s.achievements.includes('hatch'));
});
test('reaching Elder unlocks all XP milestones at once', () => {
  const s = { ...defaultState(), xp: 400 };
  const ids = checkAchievements(s).map((a) => a.id);
  for (const id of ['hatch', 'critter', 'beast', 'elder']) assert.ok(ids.includes(id));
});

// ---------- activity sensing (beyond git) ----------
test('classifyCommand recognizes test / build / generic commands', () => {
  for (const c of ['npm test', 'npm t', 'yarn test', 'pnpm run test', 'vitest', 'jest --watch', 'pytest -q', 'cargo test', 'go test ./...', 'rspec', './run-tests.sh'])
    assert.equal(classifyCommand(c), 'test', c);
  for (const c of ['npm run build', 'vite build', 'cargo build --release', 'go build', 'make', 'tsc -p .', 'webpack', 'docker build .'])
    assert.equal(classifyCommand(c), 'build', c);
  for (const c of ['ls -la', 'git push', 'echo hi', 'node server.js', 'curl example.com'])
    assert.equal(classifyCommand(c), 'run', c);
});
test('buildResult and activity move the right stats', () => {
  const b = { ...defaultState(), hunger: 50, xp: 0, totalBuilds: 0 };
  buildResult(b, true);
  assert.equal(b.hunger, 58); assert.equal(b.xp, 4); assert.equal(b.totalBuilds, 1);
  const bf = { ...defaultState(), health: 50, xp: 0 };
  buildResult(bf, false);
  assert.equal(bf.health, 44); assert.equal(bf.xp, 1);
  const a = { ...defaultState(), xp: 0, hunger: 50 };
  activity(a, true);
  assert.equal(a.xp, 1); assert.equal(a.hunger, 54);
});
test('applyEvent dispatches to the right effect', () => {
  const t = { ...defaultState(), health: 50 }; applyEvent(t, 'test', false); assert.equal(t.totalTestsFailed, 1);
  const b = { ...defaultState() }; applyEvent(b, 'build', true); assert.equal(b.totalBuilds, 1);
  const r = { ...defaultState(), xp: 0 }; applyEvent(r, 'run', true); assert.equal(r.xp, 1);
});
test('reactionFor always returns a line for every kind/outcome', () => {
  for (const k of ['test', 'build', 'run']) for (const p of [true, false])
    assert.ok(typeof reactionFor(k, p) === 'string' && reactionFor(k, p).length > 0);
});

// ---------- species + branching evolution ----------
test('every species renders non-empty art for every stage', () => {
  for (const sp of Object.keys(SPECIES)) {
    for (const stage of ['egg', 'blob', 'critter', 'beast', 'elder']) {
      const lines = artFor(sp, stage, '^-^');
      assert.ok(Array.isArray(lines) && lines.length >= 1, `${sp}/${stage} has art`);
      for (const l of lines) assert.equal(typeof l, 'string');
    }
  }
});
test('artFor injects the mood face and falls back for unknown species', () => {
  assert.ok(artFor('cat', 'critter', 'x_x').some((l) => l.includes('x_x')));
  assert.deepEqual(artFor('not-a-species', 'blob', '^-^'), artFor('slime', 'blob', '^-^'));
});
test('pickSpecies returns a real species key', () => {
  for (let i = 0; i < 20; i++) assert.ok(SPECIES[pickSpecies()]);
});
test('elderBranch reflects playstyle', () => {
  assert.equal(elderBranch({ totalTestsPassed: 30, totalCommits: 10 }).key, 'guardian');
  assert.equal(elderBranch({ totalCommits: 50, totalTestsPassed: 5 }).key, 'titan');
  assert.equal(elderBranch({ totalCommits: 3, totalTestsPassed: 3, nightFeed: true }).key, 'nocturne');
  assert.equal(elderBranch({ totalCommits: 3, totalTestsPassed: 3 }).key, 'elder');
});
test('stageDisplayName uses the branch name only at Elder', () => {
  assert.equal(stageDisplayName({ xp: 62, totalCommits: 99 }), 'Critter'); // not elder yet
  assert.equal(stageDisplayName({ xp: 400, totalCommits: 50, totalTestsPassed: 5 }), 'Titan');
});
test('load assigns a valid species to a legacy pet and keeps a good one', () => {
  let d = freshHome();
  fs.writeFileSync(path.join(d, 'state.json'), JSON.stringify({ name: 'Old', xp: 5 })); // no species
  assert.ok(SPECIES[load().species]);
  d = freshHome();
  fs.writeFileSync(path.join(d, 'state.json'), JSON.stringify({ name: 'Keep', species: 'dragon' }));
  assert.equal(load().species, 'dragon');
});

// ---------- shareable SVG card ----------
test('hexOf resolves theme colors, mapping the base ANSI theme to hex', () => {
  setTheme('classic');
  assert.match(hexOf('green'), /^#[0-9a-f]{6}$/i); // ANSI theme -> mapped hex
  setTheme('dracula');
  assert.equal(hexOf('green'), '#50fa7b'); // hex theme -> its own hex
  setTheme('classic');
});
test('renderSvg produces a well-formed, self-contained SVG of the pet', () => {
  const s = { ...defaultState(), name: 'Pixel', species: 'cat', xp: 62, hunger: 80, happiness: 70, health: 100, energy: 60 };
  const svg = renderSvg(s);
  assert.ok(svg.startsWith('<svg') && svg.trimEnd().endsWith('</svg>'));
  assert.ok(svg.includes('Pixel') && svg.includes('shellmon') && svg.includes('Cat'));
  assert.equal((svg.match(/<text/g) || []).length, (svg.match(/<\/text>/g) || []).length); // balanced
  assert.ok(!/\shref=|<image\b|<use\b|@import/i.test(svg)); // no fetched assets — self-contained (xmlns URI is fine)
});
test('renderSvg escapes XML-special characters in the name', () => {
  const svg = renderSvg({ ...defaultState(), name: '<b>&', species: 'slime' });
  assert.ok(svg.includes('&lt;b&gt;&amp;'));
  assert.ok(!svg.includes('<b>&<')); // the raw sequence must not leak into markup
});

// ---------- live watch mode ----------
test('blinkFace closes the eyes, keeping the mouth', () => {
  assert.equal(blinkFace('^-^'), '---');
  assert.equal(blinkFace('^o^'), '-o-');
  assert.equal(blinkFace('o~o'), '-~-');
});
test('renderWatchFrame draws the card, a pulse, and the hotkey hints', () => {
  const s = defaultState();
  const f0 = renderWatchFrame(s, 0);
  assert.ok(f0.includes('╭') && /feed/.test(f0) && /quit/.test(f0));
  assert.ok(f0.includes('●')); // even frame => filled pulse
  assert.ok(renderWatchFrame(s, 1).includes('○')); // odd frame => hollow pulse
});
test('CLI: card emits SVG, and --plain emits an uncolored box', () => {
  freshHome();
  const svg = run(['card']);
  assert.ok(svg.trim().startsWith('<svg') && svg.includes('</svg>'));
  const plain = run(['card', '--plain']);
  assert.ok(plain.includes('╭') && !plain.includes('\x1b['));
});
test('CLI: party does not hang on non-TTY (prints the card once)', () => {
  const d = freshHome();
  const out = execFileSync('node', [CLI, 'party'], { encoding: 'utf8', timeout: 5000, env: { ...process.env, SHELLMON_HOME: d, NO_COLOR: '1' } });
  assert.ok(out.includes('╭'));
});
test('watch must not hang or leave the terminal broken on non-TTY stdio', () => {
  const d = freshHome();
  // No PTY here, so watch must take the single-frame branch and exit promptly.
  const out = execFileSync('node', [CLI, 'watch'], { encoding: 'utf8', timeout: 5000, env: { ...process.env, SHELLMON_HOME: d, NO_COLOR: '1' } });
  assert.ok(out.includes('╭'));
  assert.ok(!out.includes('\x1b[?1049h')); // never entered the alt screen when non-interactive
});

// ---------- segment ----------
test('segmentOf is a compact one-liner', () => {
  const s = defaultState();
  const seg = segmentOf(s);
  assert.match(seg, new RegExp(`^${s.name} \\S{3} 100%$`));
});

// ---------- persistence (isolated dirs) ----------
test('save/load round-trips state', () => {
  freshHome();
  const s = defaultState(); s.xp = 123; s.name = 'Round';
  save(s);
  const back = load();
  assert.equal(back.xp, 123); assert.equal(back.name, 'Round');
});
test('load merges defaults into an old/partial state', () => {
  const d = freshHome();
  fs.writeFileSync(path.join(d, 'state.json'), JSON.stringify({ name: 'Legacy', xp: 5 }));
  const s = load();
  assert.equal(s.name, 'Legacy'); assert.equal(s.xp, 5);
  assert.equal(s.health, 100); assert.ok(Array.isArray(s.history)); // filled from defaults
});
test('load self-heals a corrupt state file', () => {
  const d = freshHome();
  fs.writeFileSync(path.join(d, 'state.json'), '{ not valid json ');
  const s = load();
  assert.ok(s.name && s.alive === true); // fresh pet instead of a crash
});
test('load sanitizes a hand-edited malicious name', () => {
  const d = freshHome();
  fs.writeFileSync(path.join(d, 'state.json'), JSON.stringify({ name: '\x1b[31mx\x1b[0m\n\n' }));
  assert.equal(load().name, 'x');
});

// ---------- integration: the actual CLI ----------
test('CLI: version matches the package', () => { freshHome(); assert.equal(run(['version']).trim(), `shellmon ${VERSION}`); });
test('VERSION and package.json agree', () => {
  const pkg = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
  assert.equal(pkg.version, VERSION);
});
test('CLI: fresh run renders a box and writes state', () => {
  const d = freshHome();
  const out = run([]);
  assert.match(out, /shellmon/); assert.ok(out.includes('╭'));
  assert.ok(fs.existsSync(path.join(d, 'state.json')));
  assert.ok(fs.existsSync(path.join(d, 'segment')));
});
test('CLI: test with no flag exits non-zero with usage', () => {
  freshHome();
  const e = runFail(['test']);
  assert.ok(e && e.status === 1);
  assert.match(e.stderr, /usage: shellmon test/);
});
test('CLI: commit --quiet is silent but persists', () => {
  const d = freshHome();
  const out = run(['commit', '--quiet']);
  assert.equal(out, '');
  const s = JSON.parse(fs.readFileSync(path.join(d, 'state.json'), 'utf8'));
  assert.equal(s.totalCommits, 1);
});
test('CLI: json emits valid, parseable state', () => {
  freshHome();
  run(['commit', '--quiet']);
  const j = JSON.parse(run(['json']));
  assert.equal(j.totalCommits, 1); assert.ok(j.name); assert.ok(j.stage);
});
test('CLI: unknown command exits non-zero', () => {
  freshHome();
  const e = runFail(['definitely-not-a-command']);
  assert.ok(e && e.status === 1);
});
test('CLI: FORCE_COLOR emits ANSI, NO_COLOR suppresses it', () => {
  freshHome();
  const env = { ...process.env, FORCE_COLOR: '1' };
  delete env.NO_COLOR; // NO_COLOR wins even when empty (per no-color.org), so it must be absent
  const colored = execFileSync('node', [CLI, 'status'], { encoding: 'utf8', env });
  assert.ok(colored.includes('\x1b['));
  const plain = run(['status']); // NO_COLOR=1 from run() default
  assert.ok(!plain.includes('\x1b['));
});
test('CLI: run passes the child exit code straight through', () => {
  freshHome();
  assert.equal(runFail(['run', '--', 'sh', '-c', 'exit 0']), null); // exit 0 => no throw
  assert.equal(runFail(['run', '--', 'sh', '-c', 'exit 7']).status, 7);
});
test('CLI: run feeds the pet based on the outcome', () => {
  const d = freshHome();
  run(['run', '--label', 'test', '--', 'sh', '-c', 'exit 0']);
  const s = JSON.parse(fs.readFileSync(path.join(d, 'state.json'), 'utf8'));
  assert.equal(s.totalTestsPassed, 1); // forced label => counted as a green test
});
test('CLI: runs when invoked through a symlink (how npm installs the global bin)', () => {
  const d = freshHome();
  const link = path.join(d, 'shellmon-link.mjs');
  fs.symlinkSync(CLI, link); // argv[1] is the symlink; import.meta.url is the real path
  const out = execFileSync('node', [link, 'version'], { encoding: 'utf8', env: { ...process.env, SHELLMON_HOME: d, NO_COLOR: '1' } });
  assert.equal(out.trim(), `shellmon ${VERSION}`);
});
test('CLI: run consumes only leading flags; a command arg equal to the label survives', () => {
  freshHome();
  const script = 'process.exit(process.argv.slice(1).includes("test") ? 0 : 9)';
  // `run --label test node -e <script> test` (no `--`): the trailing `test` is a command arg.
  assert.equal(runFail(['run', '--label', 'test', 'node', '-e', script, 'test']), null); // exit 0 => arg survived
});
test('CLI: run reports a missing command without crashing the harness', () => {
  freshHome();
  const e = runFail(['run', '--', 'definitely-not-a-real-binary-xyz']);
  assert.equal(e.status, 127);
  assert.match(e.stderr, /command not found/);
});
test('CLI: tick throttles state writes but refreshes the segment', () => {
  const d = freshHome();
  run(['commit', '--quiet']);
  const mtime1 = fs.statSync(path.join(d, 'state.json')).mtimeMs;
  run(['tick']); // within 15s => should not rewrite state.json
  const mtime2 = fs.statSync(path.join(d, 'state.json')).mtimeMs;
  assert.equal(mtime1, mtime2);
  run(['tick', '--force']); // forced => rewrites
  const mtime3 = fs.statSync(path.join(d, 'state.json')).mtimeMs;
  assert.ok(mtime3 >= mtime2);
});
