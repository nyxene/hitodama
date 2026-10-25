#!/bin/sh
# The gates every commit and pull request passes: the manifest and module as Claude Code reads them, the tests,
# and nothing private in the tree (scripts/privacy.sh) or in gh commands (scripts/privacy-hook.sh, which needs jq).
# The type check runs only where Claude Code has laid its types (.claude-plugin/types appears once the mod has been
# loaded from this folder).
set -e
cd "$(git rev-parse --show-toplevel)"
claude plugin validate . --strict
claude plugin test .
if [ -f .claude-plugin/types/tsconfig.json ]; then npx -y -p typescript@5.9.3 tsc -p .; fi
sh scripts/privacy.sh
# The gh hook must refuse a private link (built at run time, so the tree holds none) in the text and in a posted
# file however it is named, and pass a clean command.
command -v jq >/dev/null || { echo "gates: jq is required, the privacy hook checks nothing without it" >&2; exit 1; }
hook() { jq -n -c --arg c "gh $1" '{tool_input: {command: $c}}' | sh scripts/privacy-hook.sh 2>/dev/null; }
kind=code
posted=$(mktemp)
trap 'rm -f "$posted"' EXIT
printf 'see claude.ai/%s/x\n' "$kind" > "$posted"
for c in "issue create --body claude.ai/$kind/x" "issue create --body-file $posted" \
    "issue create --body \"\$(cat \"$posted\")\"" "issue create --body-file - <\"$posted\""; do
    if hook "$c" || [ $? -ne 2 ]; then
        echo "gates: privacy-hook.sh let a private link through: gh $c" >&2
        exit 1
    fi
done
hook 'pr view 9' || { echo "gates: privacy-hook.sh refused a clean gh command" >&2; exit 1; }
# commit-msg must refuse the same link, in a heading line that -m keeps, and pass a clean message.
printf 'fix: x\n\n## Notes\n# see claude.ai/%s/x\n' "$kind" > "$posted"
if sh .githooks/commit-msg "$posted" 2>/dev/null; then echo "gates: commit-msg let a private link through" >&2; exit 1; fi
printf 'fix: x\n\n## Notes\n' > "$posted"
sh .githooks/commit-msg "$posted" || { echo "gates: commit-msg refused a clean message" >&2; exit 1; }
