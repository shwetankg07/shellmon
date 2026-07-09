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
  blinkFace, renderWatchFrame, screenFrame, VERSION, renderSvg, hexOf,
  achievementToast, snippetFor,
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
test('applyDecay records the TRUE absence, not the decay-capped one', () => {
  // The 240h cap bounds stat decay only. Measuring the absence after capping
  // made Prodigal Pet (14 days away) mathematically unobtainable.
  const T = 1_000_000_000_000;
  const s = { ...defaultState(), lastDecay: T };
  applyDecay(s, T + 500 * 3.6e6); // 500h away ≈ 20.8 days
  assert.equal(s.longestAbsenceDays, 20);
  const away15 = { ...defaultState(), lastDecay: T };
  applyDecay(away15, T + 15 * 24 * 3.6e6);
  assert.ok(checkAchievements(away15).map((a) => a.id).includes('prodigal'), 'Prodigal Pet is reachable again');
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
test('every achievement has a unique id and every secret is flagged hidden', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.ok(ACHIEVEMENTS.some((a) => a.hidden), 'at least one secret exists');
  for (const a of ACHIEVEMENTS) assert.equal(typeof a.test, 'function');
});
test('secret achievements unlock from their signals', () => {
  const dawn = { ...defaultState(), dawnFeed: true };
  assert.ok(checkAchievements(dawn).map((a) => a.id).includes('earlybird'));
  const healthy = { ...defaultState(), hunger: 100, happiness: 96, health: 100, energy: 98 };
  assert.ok(checkAchievements(healthy).map((a) => a.id).includes('perfect'));
  const busy = { ...defaultState(), history: [{ day: 'x', n: 12 }] };
  assert.ok(checkAchievements(busy).map((a) => a.id).includes('busybee'));
});
test('completionist unlocks once every visible achievement is earned', () => {
  const visible = ACHIEVEMENTS.filter((a) => !a.hidden).map((a) => a.id);
  // Seed a state that already holds every visible achievement.
  const s = { ...defaultState(), achievements: [...visible] };
  const ids = checkAchievements(s).map((a) => a.id);
  assert.ok(ids.includes('completionist'), 'meta secret pops when the visible set is complete');
  // A pet missing even one visible achievement does not get it.
  const partial = { ...defaultState(), achievements: visible.slice(0, -1) };
  assert.ok(!checkAchievements(partial).map((a) => a.id).includes('completionist'));
});
test('achievementToast marks secrets differently from regular unlocks', () => {
  const secret = ACHIEVEMENTS.find((a) => a.hidden);
  const regular = ACHIEVEMENTS.find((a) => !a.hidden);
  assert.match(stripAnsi(achievementToast(secret)), /secret unlocked:/);
  assert.match(stripAnsi(achievementToast(regular)), /achievement:/);
  assert.ok(stripAnsi(achievementToast(regular)).includes(regular.name));
});
test('CLI: stats masks locked secrets as ??? but reveals earned ones', () => {
  freshHome();
  const locked = run(['stats']);
  assert.ok(locked.includes('???'), 'a fresh pet sees mystery slots, not the secret names');
  assert.ok(!locked.includes('Early Bird'), 'a locked secret name stays hidden');
  assert.match(locked, /secrets? to find/, 'stats hints that secrets exist');
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
test('screenFrame erases every line to EOL so a narrower frame leaves no ghost border', () => {
  // The box width tracks its content, so a wide frame followed by a narrow one
  // used to leave the wide frame's right border behind. screenFrame must erase
  // each line to end-of-line (\x1b[K) so nothing lingers past the new content.
  const out = screenFrame('wide line here\nx');
  assert.ok(out.startsWith('\x1b[H'), 'homes the cursor first');
  const lines = out.split('\n');
  // Every rendered line carries a clear-to-EOL; the tail clears below.
  assert.ok(lines.every((l) => l.includes('\x1b[K')), 'each line erased to EOL');
  assert.ok(out.endsWith('\x1b[J'), 'clears any rows a taller frame left below');
  // The visible text survives intact.
  assert.ok(out.includes('wide line here') && out.includes('x'));
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

// ---------- regressions: the 3.2.0 audit ----------
test('CLI: run passes a wrapped command\'s -v/--help through untouched', () => {
  freshHome();
  // With `--`: everything after it belongs to the child.
  const v = run(['run', '-q', '--', 'node', '-v']);
  assert.match(v.trim(), /^v\d+\./, 'node -v ran; shellmon did not print its own version');
  const h = run(['run', '-q', '--', 'node', '--help']);
  assert.match(h, /Usage: node/, 'node --help ran; shellmon did not print its own usage');
  // Without `--`: the command starts at the first non-flag token.
  const v2 = run(['run', '-q', 'node', '-v']);
  assert.match(v2.trim(), /^v\d+\./);
  // shellmon's own flags still work when no command is being wrapped.
  assert.equal(run(['-v']).trim(), `shellmon ${VERSION}`);
});
test('prototype-chain keys cannot poison the lookup tables', () => {
  assert.equal(THEMES['constructor'], undefined);
  assert.equal(SPECIES['toString'], undefined);
  // A hand-edited species falls back to a real one instead of crashing render.
  const d = freshHome();
  fs.writeFileSync(path.join(d, 'state.json'), JSON.stringify({ name: 'X', species: 'constructor' }));
  assert.ok(Object.keys(SPECIES).includes(load().species));
});
test('CLI: species/config reject prototype-chain names instead of bricking the pet', () => {
  freshHome();
  assert.equal(runFail(['species', 'constructor']).status, 1);
  assert.equal(runFail(['config', 'theme', 'constructor']).status, 1);
  assert.equal(runFail(['config', 'decay', 'constructor']).status, 1);
  assert.ok(run([]).includes('╭'), 'the pet still renders after the rejected attempts');
});
test('CLI: init honors core.hooksPath (husky-style repos)', () => {
  const d = freshHome();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-repo-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['config', 'core.hooksPath', '.husky'], { cwd: repo });
    execFileSync('node', [CLI, 'init'], { cwd: repo, encoding: 'utf8', env: { ...process.env, SHELLMON_HOME: d, NO_COLOR: '1' } });
    assert.ok(fs.existsSync(path.join(repo, '.husky', 'post-commit')), 'hook lands where git actually looks');
    assert.ok(!fs.existsSync(path.join(repo, '.git', 'hooks', 'post-commit')), 'nothing written to the dir git ignores');
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});
test('load coerces corrupt numeric fields back to finite numbers', () => {
  const d = freshHome();
  fs.writeFileSync(path.join(d, 'state.json'), JSON.stringify({
    name: 'N', xp: '<script>', hunger: null, health: 'NaN',
    history: [{ day: 'x', n: 'lots' }], achievements: ['ok', 42],
  }));
  const s = load();
  for (const k of ['xp', 'hunger', 'health']) assert.ok(Number.isFinite(s[k]), `${k} loads as a finite number`);
  assert.deepEqual(s.history, []); // entries with non-numeric counts are dropped
  assert.deepEqual(s.achievements, ['ok']);
});
test('renderSvg never leaks markup from a hostile xp (exported-API hardening)', () => {
  const svg = renderSvg({ ...defaultState(), xp: '"/><script>alert(1)</script>' });
  assert.ok(!svg.includes('<script>'));
});
test('CLI: card built from a tampered state file contains no injected markup', () => {
  const d = freshHome();
  run([]);
  const p = path.join(d, 'state.json');
  const s = JSON.parse(fs.readFileSync(p, 'utf8'));
  s.xp = '0"/><script>alert(1)</script>';
  fs.writeFileSync(p, JSON.stringify(s));
  assert.ok(!run(['card']).includes('<script>'));
});
test('CLI: config animations requires an explicit on/off', () => {
  freshHome();
  const e = runFail(['config', 'animations']);
  assert.equal(e.status, 1);
  assert.match(e.stderr, /on \| off/);
  assert.match(run(['config', 'animations', 'off']), /animations = off/);
});
test('updateStreak tracks the best streak across resets', () => {
  const s = { lastStreakDay: null, streakDays: 0, bestStreak: 0 };
  updateStreak(s, new Date(2026, 5, 13));
  updateStreak(s, new Date(2026, 5, 14));
  updateStreak(s, new Date(2026, 5, 15));
  assert.equal(s.bestStreak, 3);
  updateStreak(s, new Date(2026, 5, 20)); // gap: the current streak resets, the best survives
  assert.equal(s.streakDays, 1);
  assert.equal(s.bestStreak, 3);
});
test('vlen measures display columns: CJK and emoji double, combining marks zero', () => {
  assert.equal(vlen('猫猫猫'), 6);
  assert.equal(vlen('🐉'), 2);
  assert.equal(vlen('e\u0301'), 1); // e + combining accent
  assert.equal(vlen('✦●▁█╭'), 5); // the UI's own glyphs stay single-width
});
test('renderBox stays rectangular around a wide-character name', () => {
  const lines = renderBox([{ text: '猫猫猫' }, { text: 'plain line' }]).split('\n');
  assert.equal(new Set(lines.map(vlen)).size, 1);
});
test('cleanName caps by code points and never splits a surrogate pair', () => {
  const n = cleanName('🐉'.repeat(30));
  assert.equal([...n].length, 20);
  assert.doesNotThrow(() => encodeURIComponent(n)); // throws on a lone surrogate
});
test('CLI: FORCE_COLOR=0 disables color, per convention', () => {
  freshHome();
  const env = { ...process.env, FORCE_COLOR: '0' };
  delete env.NO_COLOR;
  const out = execFileSync('node', [CLI, 'status'], { encoding: 'utf8', env });
  assert.ok(!out.includes('\x1b['));
});
test('CLI: run rejects an unknown --label instead of silently guessing', () => {
  freshHome();
  const e = runFail(['run', '--label', 'bogus', '--', 'sh', '-c', 'exit 0']);
  assert.equal(e.status, 1);
  assert.match(e.stderr, /--label must be/);
});
test('prompt snippets append (never clobber) and honor SHELLMON_HOME', () => {
  assert.ok(snippetFor('zsh').includes('RPROMPT="$RPROMPT"'), 'zsh appends to an existing RPROMPT');
  for (const sh of ['bash', 'zsh']) assert.ok(snippetFor(sh).includes('${SHELLMON_HOME:-$HOME/.shellmon}'), `${sh} snippet honors SHELLMON_HOME`);
  assert.ok(snippetFor('fish').includes('SHELLMON_HOME'));
});
test('CLI: stats announces achievements it unlocks', () => {
  const d = freshHome();
  fs.writeFileSync(path.join(d, 'state.json'), JSON.stringify({ name: 'T', xp: 10 }));
  assert.match(run(['stats']), /achievement: It's Alive/);
});
