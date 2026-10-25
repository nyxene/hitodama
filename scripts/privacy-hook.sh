#!/bin/sh
# Claude Code PreToolUse hook for Bash (.claude/settings.json): refuses (exit 2) a gh command whose text, or a
# file it names, fails `privacy.sh text`, before anything reaches GitHub. Commit messages are commit-msg's.
here=$(cd "$(dirname "$0")" && pwd)
command -v jq >/dev/null || { echo "privacy-hook: jq is missing, gh commands go unchecked" >&2; exit 0; }
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
printf '%s\n' "$cmd" | grep -q -E '(^|[;&|(`/[:space:]])gh[[:space:]]' || exit 0
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
[ -n "$cwd" ] && cd "$cwd"
status=0
printf '%s\n' "$cmd" | sh "$here/privacy.sh" text || status=2
# Any word naming a file is checked, so --body-file, -F, --input, field=@file, $(cat f), < f and pipes are all seen.
# A word after a flag that posts a file must be readable, or the command is refused rather than passed unchecked.
# ponytail: words split on blanks, so a path with spaces or one built from a variable is refused, never expanded.
set -f
prev=
for t in $cmd; do
    f=$t
    posts=
    case $prev in --body-file | -F | --input | --notes-file) posts=1 ;; esac
    case $f in
    --body-file=* | --input=* | --notes-file=*) f=${f#*=} posts=1 ;;
    *=@*) f=${f#*=@} posts=1 ;;
    *=*) posts= ;; # a gh api field (-F key=value), not a file
    esac
    prev=$t
    f=${f#[\"\']}
    f=${f%[\"\']}
    f=${f%)}
    f=${f#[<@]}
    case $f in "~/"*) f=$HOME/${f#"~/"} ;; esac
    case $f in - | /dev/stdin) continue ;; esac
    if [ -f "$f" ]; then
        sh "$here/privacy.sh" text < "$f" || { echo "privacy: in $f" >&2; status=2; }
    elif [ -n "$posts" ]; then
        echo "privacy: cannot read the posted file $f, so it cannot be checked; name it by a plain path" >&2
        status=2
    fi
done
exit $status
