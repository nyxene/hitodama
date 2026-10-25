#!/bin/sh
# Refuses what must never reach the public tree: links to private Claude sessions and pages, and anything the
# maintainer lists locally in .git/info (outside the repository, never pushed):
#   private-words   one grep -E pattern per line, refused in tracked files
#   local-branches  one branch name per line; such branches skip these local lists and pre-push refuses them
# git grep reads tracked and new files by name, so spaces or quotes in a file name cannot split it.
# `privacy.sh text` checks text about to be posted (a commit message, a pull request, an issue) from stdin instead.
cd "$(dirname "$0")/.."
info="$(git rev-parse --git-common-dir)/info"
links='claude\.ai/(code|artifact|chat|share|project)|Claude-Session:'
# grep exits 1 for no match; anything above that is a broken search, never clean text.
checked() {
    [ "$1" -gt 1 ] && { echo "privacy: the search itself failed ($1)" >&2; exit 2; }
    return "$1"
}
if [ "$1" = text ]; then
    text=$(cat)
    # Posted text goes public from any branch, so local-branches skips nothing here.
    printf '%s\n' "$text" | grep -q -E "$links"
    if checked $?; then
        echo "privacy: the text holds a private Claude link" >&2
        exit 1
    fi
    [ -s "$info/private-words" ] || exit 0
    printf '%s\n' "$text" | grep -q -i -E -f "$info/private-words"
    if checked $?; then
        echo "privacy: the text holds words listed in $info/private-words" >&2
        exit 1
    fi
    exit 0
fi
search() {
    git grep --untracked -n -I "$@" -- . ':!scripts/privacy.sh' ':!scripts/pr-check.sh' ':!.githooks/commit-msg'
    checked $?
}
if search -E "$links"; then
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
