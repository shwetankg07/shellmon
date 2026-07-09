# VHS tape for shellmon — record with:  vhs demo.tape
# https://github.com/charmbracelet/vhs
Output demo.gif

Set FontSize 20
Set Width 1000
Set Height 780
Set Padding 24
Set Theme "Catppuccin Mocha"

# start from a clean, isolated pet so the demo is reproducible
Hide
Type "export SHELLMON_HOME=$(mktemp -d)" Enter
Type "alias shellmon='node cli.mjs'" Enter
Ctrl+L
Show

Type "shellmon" Sleep 800ms Enter
Sleep 2.5s

Type "# it feeds on ANY command — not just git" Sleep 500ms Enter
Type "shellmon run -- sh -c 'echo running your tests…; exit 0'" Sleep 400ms Enter
Sleep 2.5s

Type "# pick a species" Sleep 500ms Enter
Type "shellmon species dragon" Sleep 400ms Enter
Sleep 2.5s

Type "# feed it a few commits and watch it grow" Sleep 500ms Enter
Type "shellmon commit -q; shellmon commit -q; shellmon test --pass -q; shellmon" Sleep 400ms Enter
Sleep 2.5s

Type "# live mode: it blinks, hovers, and takes hotkeys" Sleep 500ms Enter
Type "shellmon watch" Sleep 400ms Enter
Sleep 2s
Type "f" Sleep 1s
Type "p" Sleep 1s
Type "f" Sleep 1.5s
Type "q" Sleep 500ms

Type "shellmon stats" Sleep 400ms Enter
Sleep 3.5s
