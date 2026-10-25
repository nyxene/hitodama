#!/bin/sh
# Claude Code PreToolUse hook for Bash (.claude/settings.json): refuses (exit 2) a gh command whose text, or a
# text file it names, fails `privacy.sh text`, before anything reaches GitHub. Commit messages are commit-msg's.
here=$(cd "$(dirname "$0")" && pwd)
command -v jq >/dev/null || { echo "privacy-hook: jq is missing, gh commands go unchecked" >&2; exit 0; }
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
printf '%s\n' "$cmd" | grep -q -E '(^|[;&|(`/[:space:]])gh[[:space:]]' || exit 0
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
[ -n "$cwd" ] && cd "$cwd"
status=0
printf '%s\n' "$cmd" | sh "$here/privacy.sh" text || status=2
# A variable's value is not in the text, so what it would post cannot be checked.
if printf '%s\n' "$cmd" | grep -q -E '\$[A-Za-z_{]'; then
    echo "privacy: a gh command with a shell variable cannot be checked; write the value or path plainly" >&2
    status=2
fi
# Every path-like run of characters is a candidate, whatever quotes, $( ), <, @ or --flag= surround it, looked up
# from the session's folder and from any folder the command cds into. Binary files (gh itself) are not posted text;
# the three scripts that spell out the refused patterns are skipped, as privacy.sh skips them in the tree.
top=$(dirname "$here")
set -f
dirs=.
prev=
for t in $(printf '%s\n' "$cmd" | grep -o -E '[[:alnum:]_./~+-]+'); do
    [ "$prev" = cd ] && dirs="$dirs $t"
    prev=$t
    case $t in "~/"*) t=$HOME/${t#"~/"} ;; esac
    case $t in /*) paths=$t ;; *) paths=$(for d in $dirs; do printf '%s\n' "$d/$t"; done) ;; esac
    for f in $paths; do
        [ -f "$f" ] && grep -q -I . "$f" || continue
        case $(cd "$(dirname "$f")" && pwd)/${f##*/} in
        "$top/scripts/privacy.sh" | "$top/scripts/pr-check.sh" | "$top/.githooks/commit-msg") continue ;;
        esac
        sh "$here/privacy.sh" text < "$f" || { echo "privacy: in $f" >&2; status=2; }
    done
done
exit $status
