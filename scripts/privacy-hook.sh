#!/bin/sh
# Claude Code PreToolUse hook for Bash (.claude/settings.json): refuses (exit 2) a gh command whose text, or a
# text file it names, fails `privacy.sh text`, before anything reaches GitHub. Commit messages are commit-msg's.
# It guards against posting by mistake, not against a command written to slip past it: the output of a command
# (`$(git log …)`, `… | gh … -F -`) is not seen, and neither are file names with spaces, quotes or globs in them.
here=$(cd "$(dirname "$0")" && pwd)
input=$(cat)
gh='(^|[^[:alnum:]_.-])gh($|[^[:alnum:]_.-])'
if ! command -v jq >/dev/null; then
    printf '%s\n' "$input" | grep -q -E "$gh" || exit 0
    echo "privacy: jq is missing, so this gh command cannot be checked; install jq" >&2
    exit 2
fi
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
printf '%s\n' "$cmd" | grep -q -E "$gh" || exit 0
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
[ -n "$cwd" ] && cd "$cwd"
status=0
printf '%s\n' "$cmd" | sh "$here/privacy.sh" text || status=2
# A variable's value is not in the text, so what it would post cannot be checked.
if printf '%s\n' "$cmd" | grep -q -E '\$[A-Za-z_{]'; then
    echo "privacy: a gh command with a shell variable cannot be checked; write the value plainly, or put the text" >&2
    echo "         in a file (--body-file f, -F query=@f)" >&2
    status=2
fi
# Every path-like run of characters is a candidate, whatever quotes, $( ), <, @ or --flag= surround it, looked up
# from the session's folder and from any folder the command cds or pushds into. Binary files (gh itself) are not
# posted text; the three scripts that spell out the refused patterns are skipped, as privacy.sh skips them.
set -f
dirs=.
prev=
seen=
for t in $(printf '%s\n' "$cmd" | grep -o -E '[[:alnum:]_./~+-]+'); do
    case $t in "~/"*) t=$HOME/${t#"~/"} ;; esac
    case $prev in cd | pushd) dirs="$dirs $t" ;; esac
    prev=$t
    paths=$t
    case $t in /*) ;; *) paths=; for d in $dirs; do paths="$paths $d/$t"; done ;; esac
    for f in $paths; do
        [ -f "$f" ] && grep -q -I . "$f" || continue
        f=$(cd "$(dirname "$f")" && pwd)/${f##*/}
        case $f in */scripts/privacy.sh | */scripts/pr-check.sh | */.githooks/commit-msg) continue ;; esac
        case " $seen " in *" $f "*) continue ;; esac
        seen="$seen $f"
        sh "$here/privacy.sh" text < "$f" || { echo "privacy: in $f" >&2; status=2; }
    done
done
exit $status
