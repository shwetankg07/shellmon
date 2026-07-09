# shellmon

> A terminal pet that feeds on your dev activity — any test runner, any build,
> any command. It lives in your prompt, grows into real creatures, and has a
> live full-screen mode. Zero dependencies.

[![npm](https://img.shields.io/npm/v/shellmon)](https://www.npmjs.com/package/shellmon)
[![CI](https://github.com/shwetankg07/shellmon/actions/workflows/ci.yml/badge.svg)](https://github.com/shwetankg07/shellmon/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/shellmon)](https://nodejs.org)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](./package.json)
[![license](https://img.shields.io/npm/l/shellmon)](./LICENSE)

```bash
npx shellmon
```

It costs **zero dependencies**, keeps its whole self in one file, and asks for
nothing except that you keep shipping. A little creature sits in your prompt.
Every commit is a meal. A green test suite is medicine. A weekend away is a
weekend away, and it will let you know how that went.

```
╭─ shellmon ─────────────────────────╮
│                                    │
│               + + +                │
│                /\_/\               │
│             <( ^o^ )>              │
│               /|   |\              │
│                ^   ^               │
│                                    │
│    Sericat · Guardian · 640 XP     │
│             final form             │
│                                    │
│ Food █████████░  88                │
│ Mood ████████░░  82                │
│ Life ██████████ 100                │
│ Rest ████████░░  76                │
│                                    │
│ ▃ ▄▅▁▇▄▃▅▁█▄▇▅  last 14d           │
│                                    │
│ green across the board.            │
│ streak 9d · 60 fed                 │
╰────────────────────────────────────╯
```

In your prompt it collapses to a single glyph that tracks its mood:
`Sericat ^o^ 100%`

## It feeds on everything, not just git

Prefix **any** command with `shellmon run --` and the pet reacts to how it went.
shellmon reads the command, decides whether it was a test, a build, or something
else, feeds accordingly, and passes the exit code straight through — so it drops
transparently into any script or CI step:

```bash
shellmon run -- npm test          # green tests heal it, red ones make it ill
shellmon run -- cargo build       # a clean build is a good meal
shellmon run -- pytest -q         # detected as tests, automatically
shellmon run -- ./deploy.sh       # generic command: a small nudge either way
shellmon run --label test -- ./my-weird-test-script
```

```
$ shellmon run -- npm test
… your test output, untouched …
» green across the board. i feel stronger.  (test ok)
```

Plus the classics: the git `post-commit` hook feeds it on every commit, and
`shellmon test --pass` / `--fail` if you'd rather wire it in by hand.

## Live mode

```bash
shellmon watch
```

A full-screen view where the pet is actually *present* — it blinks, hovers, and
reacts in real time to feeds from your **other** terminals (that `npm test` you
just ran in another tab shows up here). Care for it with hotkeys:

```
f  feed     p  play     r  rest     q  quit
```

It's a zero-dependency TUI, and it restores your terminal cleanly no matter how
you leave it.

## Species & evolution

Every pet is one of four species, each with five hand-drawn stages
(**Egg → Blobling → Critter → Beast → Elder**):

```
           /\_/\      \|^|/     /===\
 /~~~\    ( ^-^ )    ( ^-^ )   [ ^-^ ]
( ^-^ )    />   <\     /|\      |=|=|
 \~~~/      " "        ^ ^       " "
Slime     Cat        Dragon    Bot
```

`shellmon species` to browse and choose. The **Elder** form branches on how you
actually worked:

| If you leaned on… | it becomes | crown |
| --- | --- | --- |
| passing tests | **Guardian** | `+ + +` |
| commits | **Titan** | `^ ^ ^` |
| late-night sessions | **Nocturne** | `* . *` |
| a bit of everything | **Elder** | — |

## How it feeds

| It grows from | It wilts from |
| --- | --- |
| **Commits** — the git hook, once per commit (the big meal) | **Neglect** — every stat decays with wall-clock time |
| **Green tests / builds** — via `run`, the hook, or `test --pass` | **Red tests / builds** — they make it ill |
| **Any command** — a small nudge from `shellmon run` | Starving or lonely long enough will KO it (feed to revive) |
| **Care** — `feed`, `play`, `rest`, or the `watch` hotkeys | |

Its face tracks its mood — content, hungry, sleepy, ill, KO, or ecstatic — and
its quips know the time of day and how long you've been gone.

## Share your pet

```bash
shellmon card > pet.svg      # a polished, self-contained SVG for your profile README
shellmon card --plain        # an uncolored ASCII card for issues and chat
```

The SVG is themed, self-contained (no external fetches), and looks like a real
status badge — the creature, live stat bars, sparkline, and a quip. Commit it to
your GitHub profile repo and refresh it from a git hook or a cron. And when
something goes right, `shellmon party`.

## Achievements & themes

Two dozen **achievements** unlock as you go — streak tiers, commit and test
milestones, reviving from a faint, Night Owl, Survivor… see them in `shellmon
stats`. Some are **secret**: they show as `???` until you trip over them, so
there's always something left to discover. Eight zero-dependency truecolor
**themes**: `classic`, `matrix`,
`dracula`, `gruvbox`, `nord`, `tokyonight`, `synthwave`, `catppuccin`. Preview
with `shellmon themes`, set with `shellmon config theme <name>`.

## Setup

```bash
npm i -g shellmon      # so the git hook and prompt can find it
cd your-project
shellmon init          # installs the post-commit hook + prints a prompt snippet
```

`shellmon init` installs a `post-commit` hook (it won't clobber an existing one)
and prints a prompt snippet for your shell (zsh / bash / fish). Paste it into
your rc file and the pet rides along in your prompt, refreshed in the background
on every prompt — the prompt only reads a tiny pre-rendered file
(`~/.shellmon/segment`, written atomically), so your shell stays instant.

`shellmon doctor` checks all of it: state, PATH, the hook, and your config.

## Commands

| command | what it does |
| --- | --- |
| `shellmon` | show the pet (animated reveal in a TTY) |
| `shellmon watch` | live full-screen view with hotkeys |
| `shellmon status` | one-line summary (what the prompt uses) |
| `shellmon stats` | lifetime stats, 14-day history, achievements |
| `shellmon run -- <cmd>` | run any command; feed on its outcome; pass the exit code through |
| `shellmon commit` | feed it a commit (the git hook calls this) |
| `shellmon test --pass` / `--fail` | heal it / make it ill |
| `shellmon feed` · `play` · `rest` | care for it by hand |
| `shellmon species [name]` | browse the four species, or pick one |
| `shellmon init` | wire up the git hook + prompt segment |
| `shellmon doctor` | check your setup |
| `shellmon config [key value]` | theme / decay / animations |
| `shellmon themes` | preview the color themes |
| `shellmon hatch <name>` | name (or rename) your pet |
| `shellmon card [--plain]` | export a shareable SVG (or ASCII) of your pet |
| `shellmon json` | machine-readable state |
| `shellmon reset` | start over with a fresh egg |
| `shellmon uninstall [--purge]` | remove the hook (and optionally `~/.shellmon`) |

`--quiet` silences any command; `--no-anim` skips the reveal animation.

## Wire it into your tests / CI

The transparent exit code makes `run` a drop-in wrapper:

```jsonc
// package.json — the pet lives or dies by your test suite
"scripts": {
  "test": "shellmon run -- vitest run"
}
```

## Uninstall

```bash
shellmon uninstall           # removes this repo's hook, keeps your pet
shellmon uninstall --purge   # also deletes ~/.shellmon
# then remove the shellmon block from your shell rc
```

No telemetry, no network, no account. It's a JSON file and some ASCII that's
happy to see you.

## Development

Dependency-free on purpose — it renders on every prompt.

```bash
npm test            # unit tests (node --test) + interactive PTY suite
npm run test:unit   # just the fast unit tests
npm run test:shell  # drive a real bash/fish prompt AND the watch TUI under a PTY
```

The interactive suite is the important one: it drives an actual shell and the
live TUI under a pseudo-terminal — the class of bug non-TTY tests never catch.
See [CONTRIBUTING.md](./CONTRIBUTING.md) to add a theme, a species, or a new
activity sensor (it's easier than you'd think).

## Publish

```bash
npm run pub    # runs the tests, bumps the patch, publishes
```

---

Minted for people who talk to their terminals. Now your terminal talks back.
