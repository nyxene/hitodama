#!/bin/sh
# Claude Code PreToolUse hook for Bash (.claude/settings.json): refuses (exit 2) a gh command whose text, or a
# file it posts, fails `privacy.sh text`, before anything reaches GitHub. Commit messages are commit-msg's.
here=$(dirname "$0")
command -v jq >/dev/null || { echo "privacy-hook: jq is missing, gh commands go unchecked" >&2; exit 0; }
cmd=$(jq -r '.tool_input.command // empty')
printf '%s\n' "$cmd" | grep -q -E '(^|[;&|(` ])gh ' || exit 0
status=0
printf '%s\n' "$cmd" | sh "$here/privacy.sh" text || status=2
# ponytail: words split on blanks, so a quoted path with spaces, or a file the same command writes, goes unchecked.
set -f
prev=
for t in $cmd; do
    t=${t#[\"\']}
    t=${t%[\"\']}
    f=
    case $prev in --body-file | -F | --input) f=$t ;; esac
    case $t in --body-file=*) f=${t#--body-file=} ;; --input=*) f=${t#--input=} ;; *=@*) f=${t#*=@} ;; esac
    if [ -n "$f" ] && [ -f "$f" ]; then
        sh "$here/privacy.sh" text < "$f" || { echo "privacy: in $f" >&2; status=2; }
    fi
    prev=$t
done
exit $status
