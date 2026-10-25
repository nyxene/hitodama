#!/bin/sh
# Refuses what must never reach the public tree: links to private Claude sessions and pages, and anything the
# maintainer lists locally in .git/info (outside the repository, never pushed):
#   private-words   one grep -E pattern per line, refused in tracked files
#   local-branches  one branch name per line; such branches skip these local lists and pre-push refuses them
cd "$(git rev-parse --show-toplevel)"
info="$(git rev-parse --git-common-dir)/info"
files=$(git ls-files --cached --others --exclude-standard | grep -v -E '^(scripts|.githooks)/')
[ -z "$files" ] && exit 0
if printf '%s\n' "$files" | xargs grep -n -I -E 'claude\.ai/(code|artifact|chat|share|project)|Claude-Session:' 2>/dev/null; then
    echo "privacy: private Claude links in the tree" >&2
    exit 1
fi
branch=$(git symbolic-ref --short HEAD 2>/dev/null)
[ -n "$branch" ] && [ -s "$info/local-branches" ] && grep -q -x -F "$branch" "$info/local-branches" && exit 0
if [ -s "$info/private-words" ] && printf '%s\n' "$files" | xargs grep -n -I -i -E -f "$info/private-words" 2>/dev/null; then
    echo "privacy: words listed in $info/private-words are in the tree" >&2
    exit 1
fi
