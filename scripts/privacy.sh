#!/bin/sh
# Refuses what must never reach the public tree: links to private Claude sessions and pages, and anything the
# maintainer lists locally in .git/info (outside the repository, never pushed):
#   private-words   one grep -E pattern per line, refused in tracked files
#   local-branches  one branch name per line; such branches skip these local lists and pre-push refuses them
# git grep reads tracked and new files by name, so spaces or quotes in a file name cannot split it.
cd "$(git rev-parse --show-toplevel)"
info="$(git rev-parse --git-common-dir)/info"
# git grep exits 1 for no match; anything above that is a broken search, never a clean tree.
search() {
    git grep --untracked -n -I "$@" -- . ':!scripts/privacy.sh' ':!scripts/pr-check.sh' ':!.githooks/commit-msg'
    rc=$?
    [ $rc -gt 1 ] && { echo "privacy: the search itself failed ($rc)" >&2; exit 2; }
    return $rc
}
if search -E 'claude\.ai/(code|artifact|chat|share|project)|Claude-Session:'; then
    echo "privacy: private Claude links in the tree" >&2
    exit 1
fi
branch=$(git symbolic-ref --short HEAD 2>/dev/null)
[ -n "$branch" ] && [ -s "$info/local-branches" ] && grep -q -x -F "$branch" "$info/local-branches" && exit 0
if [ -s "$info/private-words" ] && search -i -E -f "$info/private-words"; then
    echo "privacy: words listed in $info/private-words are in the tree" >&2
    exit 1
fi
exit 0
