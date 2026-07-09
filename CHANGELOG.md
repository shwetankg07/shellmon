# Changelog

All notable changes to shellmon. Format follows
[Keep a Changelog](https://keepachangelog.com); versioning is
[SemVer](https://semver.org).

## [3.1.0]

### Added
- **Shareable SVG card.** `shellmon card` exports a polished, self-contained SVG
  of your pet — themed accent, the creature, real stat bars, sparkline, and quip
  — ready to drop into a GitHub profile README (`shellmon card > pet.svg`).
  `shellmon card --plain` prints an uncolored ASCII card for issues and chat.
- **`shellmon party`** — a hue-cycling celebration of your pet. Pure eye candy,
  TTY-guarded, restores the cursor on exit.

### Fixed
- **Critical: `shellmon` did nothing when installed via a symlink** (i.e. every
  `npm i -g` global install). The run-as-main check compared `import.meta.url`
  (the real path) against `process.argv[1]` (the unresolved symlink), so `main()`
  never ran. It now resolves the symlink first. Latent since 1.0.0.
- **`run` without `--` could drop a command argument** that happened to equal the
  `--label` value (e.g. `run --label test npm test` ran `npm` with no `test`). It
  now consumes only the leading flags and passes the rest through verbatim.

## [3.0.0]

The "best terminal buddy" release. shellmon is no longer just a git pet — it
feeds on your whole workflow, grows into real creatures, and now has a live mode.

### Added
- **Universal activity sensing.** `shellmon run -- <command>` runs anything,
  detects whether it was a test / build / generic command (or take `--label`),
  feeds the pet on the outcome, and passes the exit code straight through — so it
  drops into any test script or CI step. No longer git-only.
- **Species + branching evolution.** Four species (Slime, Cat, Dragon, Bot),
  each with five hand-drawn stages. The Elder form branches on how you played:
  tests → Guardian, commits → Titan, late nights → Nocturne. `shellmon species`
  to browse and choose.
- **Live watch mode.** `shellmon watch` is a full-screen, zero-dependency TUI:
  the pet blinks and hovers, reacts to hotkeys (`f` feed, `p` play, `r` rest,
  `q` quit), and picks up feeds from your other terminals in real time. Restores
  the terminal cleanly on any exit.
- **Top-tier repo:** GitHub Actions CI (Node 18/20/22 + a PTY interactive job),
  `CONTRIBUTING.md` with theme/species/sensor extension guides, this changelog.

### Changed
- Card shows the species-specific creature and, at Elder, its branch name and a
  small crown.
- `stats` and `json` report species and evolution branch.

## [2.0.0]

### Added
- Eight truecolor **themes** (`shellmon themes`, `shellmon config theme`).
- Twelve **achievements** with unlock toasts and a `shellmon stats` screen.
- 14-day commit **sparkline** on the card and in stats.
- Care verbs `play` and `rest`; commands `doctor`, `stats`, `config`, `themes`,
  `uninstall`, `json`.
- Decay-speed config (`chill` / `normal` / `hardcore`) and time/context-aware
  quips (late night, "welcome back", streak flexing).
- Default reveal animation in a TTY (`--no-anim` to disable).
- A real test suite: `node --test` plus a PTY-based interactive shell suite.

### Fixed
- Feeding a fainted pet now revives it (food nurses health; tests still dominate).
- `hatch` sanitizes names (the prompt segment is `cat`'d into your shell).
- Atomic segment writes (the prompt reads it while a background tick writes it).
- `tick` write throttling to cut churn and avoid clobbering commit increments.
- TTY-aware color, and correct parsing of leading flags (`-v`, `--no-anim`).

## [1.0.0]

- Initial release: a terminal pet fed by git commits (post-commit hook), healed
  by passing tests, that decays with neglect and lives in your prompt.
  Zero dependencies.
