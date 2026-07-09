#!/usr/bin/env bash
# Interactive-path audit: drive a REAL interactive shell under a PTY (via
# util-linux `script`) with shellmon's own prompt snippet, and confirm the pet
# actually renders in the prompt. Non-TTY tests can't catch this class of bug.
#
# Exits 0 if every available shell passes; non-zero otherwise. Missing shells
# and a missing `script` are skipped, not failed.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
CLI="$(cd "$HERE/.." && pwd)/cli.mjs"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

export HOME="$WORK"          # so the snippet's ~/.shellmon resolves into our sandbox
export SHELLMON_HOME=""      # unset -> defaults to $HOME/.shellmon (matches the snippet)
unset SHELLMON_HOME
BIN="$WORK/bin"; mkdir -p "$BIN"
printf '#!/bin/sh\nexec node "%s" "$@"\n' "$CLI" > "$BIN/shellmon"
chmod +x "$BIN/shellmon"
export PATH="$BIN:$PATH"

# Print a shell's raw prompt snippet straight from the CLI's own source of truth.
# Pass args via env, not argv, so the import doesn't look like `node cli.mjs` and
# accidentally trip the run-as-main guard.
snippet() { SM_CLI="$CLI" SM_KIND="$1" node -e 'import(process.env.SM_CLI).then(m=>process.stdout.write(m.snippetFor(process.env.SM_KIND)+"\n"))'; }

# Birth a recognizably-named pet.
shellmon commit --quiet
shellmon hatch TESTPET --quiet
[ -f "$HOME/.shellmon/segment" ] || { echo "setup failed: no segment file"; exit 1; }

if ! command -v script >/dev/null 2>&1; then
  echo "SKIP: util-linux \`script\` not available; cannot allocate a PTY."
  exit 0
fi

pass=0; fail=0
report() { if [ "$2" -eq 0 ]; then echo "  ok   — $1"; pass=$((pass+1)); else echo "  FAIL — $1"; fail=$((fail+1)); fi; }

# ---- bash ----
if command -v bash >/dev/null 2>&1; then
  echo "[bash] interactive prompt renders the pet"
  RC="$WORK/bashrc"
  { echo 'PS1="READY> "'; snippet bash; } > "$RC"
  OUT="$WORK/out_bash.txt"
  printf 'true\nexit\n' | script -q -e -c "bash --noprofile --rcfile $RC -i" "$OUT" >/dev/null 2>&1
  grep -q "TESTPET" "$OUT"; report "pet name appears in the bash prompt" $?
  grep -q "READY>" "$OUT"; report "base PS1 is preserved (snippet appends, not clobbers)" $?
fi

# ---- fish ----
# fish's full interactive prompt under a PTY is polluted by system config on many
# machines, so test the snippet's mechanism directly: source it (proves it parses)
# and confirm fish_right_prompt emits the pet.
if command -v fish >/dev/null 2>&1; then
  echo "[fish] right-prompt renders the pet"
  snippet fish > "$WORK/snip.fish"
  OUT="$(fish --no-config -c "source $WORK/snip.fish; and fish_right_prompt" 2>/dev/null)"
  printf '%s' "$OUT" | grep -q "TESTPET"; report "fish snippet parses and fish_right_prompt emits the pet" $?
fi

# ---- watch (live TUI) ----
echo "[watch] live full-screen mode under a PTY"
OUT="$WORK/out_watch.txt"
( printf 'f'; sleep 0.4; printf 'r'; sleep 0.4; printf 'q' ) | script -q -e -c "shellmon watch" "$OUT" >/dev/null 2>&1
grep -qaF "$(printf '\033[?1049h')" "$OUT"; report "entered the alt screen" $?
grep -qaF "$(printf '\033[?1049l')" "$OUT"; report "restored the terminal on quit (clean teardown)" $?
grep -qaF "$(printf '\033[?25h')" "$OUT"; report "restored the cursor on quit" $?
grep -qa "TESTPET" "$OUT"; report "the pet rendered live" $?

echo
echo "interactive checks: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
