#!/bin/sh
# Copies main's hooks into .git/hooks rather than pointing core.hooksPath at .githooks: with a path into the tree,
# checking out someone else's branch would run whatever hooks that branch carries. Taken from main, never from the
# branch checked out now. Rerun after .githooks changes on main.
set -e
cd "$(git rev-parse --show-toplevel)"
git config --unset core.hooksPath || true
hooks="$(git rev-parse --git-common-dir)/hooks"
mkdir -p "$hooks"
# A clone without a local main still has origin/main.
main=main
git rev-parse --verify -q main >/dev/null || main=origin/main
for path in $(git ls-tree --name-only "$main" .githooks/); do
    git show "$main:$path" > "$hooks/${path#.githooks/}"
    chmod +x "$hooks/${path#.githooks/}"
done
echo "hooks on from $main: $(git ls-tree --name-only "$main" .githooks/ | sed 's|.githooks/||' | tr '\n' ' ')"
