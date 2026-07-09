# Changelog

All notable changes to shellmon. Format follows
[Keep a Changelog](https://keepachangelog.com); versioning is
[SemVer](https://semver.org).

## [3.2.0]

Hardening release: a full audit of the CLI, with a regression test locking in
every fix.

### Fixed
- **`shellmon run` swallowed the wrapped command's `-v`/`--version`/`-h`/`--help`.**
  The global flag scan read the whole argv, so `shellmon run -- node -v` printed
  *shellmon's* version and never ran the command — breaking the transparent-wrapper
  promise. Flags are now only shellmon's own before `--` (and for `run`, only the
  leading ones); everything else reaches the child untouched.
- **Prototype-chain names could brick the pet.** `SPECIES`, `THEMES`, and the
  decay table were plain objects, so `shellmon species constructor` passed the
  existence check, saved, and made every subsequent render crash — and
  `shellmon config decay constructor` turned the decay multiplier into a
  function, silently wiping the pet's stats to NaN on the next tick. The lookup
  tables now have a null prototype; inherited keys are rejected like any other
  typo.
- **`shellmon init` installed the git hook where git never looks** in repos
  using `core.hooksPath` (husky, lefthook, …) — it reported success while the
  flagship feature silently did nothing. The hook path now comes from
  `git rev-parse --git-path hooks`, which honors the setting; `doctor` and
  `uninstall` follow suit.
- **The Prodigal Pet secret was mathematically unobtainable.** The absence was
  measured *after* the 10-day decay cap, so `longestAbsenceDays` could never
  reach the required 14. The true absence is now recorded before the cap (which
  still bounds stat decay).
- **A tampered `state.json` could inject markup into the shareable SVG.**
  Numeric fields weren't validated on load, so a string `xp` flowed raw into
  `shellmon card` output. Every numeric field is now coerced to a finite number
  on load (falling back to its default), and `renderSvg` coerces `xp` again as
  a belt-and-braces for library callers.
- **Wide characters sheared the card.** Width was counted in UTF-16 code units,
  so a pet named 猫猫猫 (or an emoji name) broke the box borders. Rendering now
  measures display columns — CJK and emoji count two, combining marks zero —
  and names are capped by code points so a surrogate pair is never split in half.
- **`shellmon config animations` with no value** silently set it to `true` and
  reported `✓ animations = undefined`; it now demands an explicit `on`/`off`.
- **`FORCE_COLOR=0` forced color *on*.** Zero now disables, per convention.
- **`run --label bogus`** silently fell back to auto-classification; unknown
  labels are now rejected with a usage error.
- **`stats` unlocked achievements silently.** An unlock triggered by viewing
  stats now gets its toast like everywhere else.
- **The zsh snippet clobbered an existing `RPROMPT`**; it now appends, matching
  the bash snippet's treatment of `PS1`. All prompt snippets also honor
  `SHELLMON_HOME` (with the usual `~/.shellmon` fallback) instead of hardcoding
  the path.

### Changed
- **`stats` now shows an honest streak line.** The old `best streak` label
  actually displayed the *current* streak. The pet now tracks a real
  `bestStreak` across resets, and `stats` shows both.

## [3.1.0]

### Added
- **More achievements, and secret ones.** Twelve new achievements — higher tiers
  (Centurion, Green Machine, Master Builder, Unstoppable) plus eight **hidden**
  secrets that read as `???` in `shellmon stats` until you stumble into them
  (Early Bird, Picture of Health, Busy Bee, Renaissance Dev, Battle-Scarred,
  Comeback Kid, Prodigal Pet, and a Completionist meta-secret). Secrets unlock
  with their own louder reveal toast; `stats` teases how many are left to find.
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
- **Creature art drifted off-centre** in the terminal card: rows were centered
  independently, so unequal-width lines (like the egg) landed a column or two
  apart. Art is now trimmed before centering, so every creature stacks true.
- **`watch` left ghost box borders** as the pet fed and evolved. The box width
  tracks its content (XP digits, quip, art), so a narrower frame drawn over a
  wider one left the old right border behind — the `│` edges stacked up as
  doubled and tripled sides. Each line is now erased to end-of-line on redraw.

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
