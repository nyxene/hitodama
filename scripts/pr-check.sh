#!/bin/sh
# PR_TITLE/PR_BODY arrive via the workflow's env block, never ${{ }} inside run:
# pull request text is attacker-controlled.
# Titles are conventional subjects only: no Merge, fixup! or Revert "..." forms the commit hook lets through.
regex='^(feat|fix|docs|chore|refactor|perf|test|build|ci|revert)(\([a-zA-Z0-9._/-]+\))?!?: .+$'
status=0
# release-please's pull request is named by its title, not by an issue.
release='^chore\(main\): release [0-9]+\.[0-9]+\.[0-9]+$'
if ! printf '%s\n' "$PR_TITLE" | grep -Eq "$release" && ! printf '%s\n%s\n' "$PR_TITLE" "$PR_BODY" | grep -Eqi '(close[sd]?|fix(e[sd])?|resolve[sd]?) #[0-9]+'; then
    echo "pull request names no issue: put 'Closes #N' in the body" >&2
    status=1
fi
if ! printf '%s\n' "$PR_TITLE" | grep -Eq "$regex"; then
    echo "pull request title is not a conventional subject (type(scope): text): '$PR_TITLE'" >&2
    status=1
fi
# Squash merge writes the body into main's history: a private Claude link points at what nobody else can open.
if printf '%s\n%s\n' "$PR_TITLE" "$PR_BODY" | grep -q -E 'claude\.ai/(code|artifact|chat|share|project)'; then
    echo "pull request holds a private Claude link: remove it from the title and body" >&2
    status=1
fi
exit $status
