# Contributing to shellmon

Thanks for wanting to feed the pet. This is a small, deliberately simple
project, and the bar for a good change is: it works, it's tested, and it kept
the one rule.

## The one rule: zero dependencies

shellmon renders on every shell prompt. It has no business dragging a
`node_modules` behind it, and no business being slow. The entire runtime is one
file, `cli.mjs`, with **no production dependencies** and no build step. Tests use
Node's built-in `node:test` — also zero-dependency.

If a change wants a dependency, it almost certainly wants to be a smaller change.

## Running it

```bash
git clone https://github.com/shwetank/shellmon
cd shellmon
node cli.mjs            # meet the pet
SHELLMON_HOME=/tmp/sm node cli.mjs commit   # play without touching your real pet
```

`SHELLMON_HOME` relocates all state — use it to experiment (and it's how the
tests stay isolated).

## Running the tests

```bash
npm test            # everything
npm run test:unit   # node --test (fast, pure logic + CLI integration)
npm run test:shell  # drives a REAL bash/fish prompt and the watch TUI under a PTY
```

The shell suite is the one that matters most. Prompt libraries and terminal apps
lie in non-TTY environments; the only way to trust the prompt snippet and the
`watch` mode is to run them in an actual interactive shell under a pseudo-terminal
(via util-linux `script`). If you touch the prompt integration or `watch`, that
suite is your proof.

Add a test for anything you add. The unit suite imports `cli.mjs` directly (it
only runs `main()` when executed, not when imported), so exported functions are
easy to test in isolation.

## Where things live (all in `cli.mjs`)

It's one file, sectioned with `// ----------` banners. The extension points:

### Add a theme

Themes are truecolor palettes keyed by role. Add an entry to `THEMES`:

```js
mytheme: { red: '#..', green: '#..', yellow: '#..', blue: '#..',
           magenta: '#..', cyan: '#..', white: '#..', gray: '#..' },
```

That's it — `shellmon themes` and `shellmon config theme mytheme` pick it up.

### Add a species

Species are five-stage ASCII creatures. Add an entry to `SPECIES` with a
`stages` map (`egg`, `blob`, `critter`, `beast`, `elder`); the `${f}` slot holds
the 3-character mood face. The box centers every line, so widths need not match:

```js
fox: { name: 'Fox', stages: {
  egg:     (f) => ['  .-.', ' ( ^ )', "  '-'"],
  blob:    (f) => [' /\\_/\\', `( ${f} )`, "  ~ ~"],
  critter: (f) => [' /\\_/\\', `( ${f} )`, ' >   <'],
  beast:   (f) => [' /\\_/\\', `( ${f} )`, ' /|   |\\'],
  elder:   (f) => [' /\\_/\\', `<( ${f} )>`, ' /|   |\\', '  ^   ^'],
} },
```

The species-render test iterates every species and stage automatically, so a new
one is covered the moment you add it.

### Add an activity sensor

`shellmon run -- <cmd>` classifies commands with `classifyCommand()` (the
`TEST_RE` / `BUILD_RE` regexes) and applies `applyEvent()`. To recognize a new
test/build tool, extend the relevant regex — and add it to the `classifyCommand`
test, keeping an eye out for false positives (`latest` must not read as a test).

## Style

Match the surrounding code: two-space indent, ES modules, small pure functions,
comments only where intent isn't obvious. No emoji in output or docs — tasteful
ANSI and box-drawing only.

## Commit + PR

- Keep commits focused; describe the behavior change.
- `npm test` must be green (CI runs it on Node 18/20/22 plus the PTY suite).
- New behavior needs a test. New user-facing behavior needs a `CHANGELOG.md`
  line and, usually, a `README.md` line.
