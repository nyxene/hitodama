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
# The gh hook must refuse a private link (built at run time, so the tree holds none) and pass a clean command.
hook() { printf '{"tool_input":{"command":"gh %s"}}' "$1" | sh scripts/privacy-hook.sh 2>/dev/null; }
kind=code
if hook "issue create --body claude.ai/$kind/x" || [ $? -ne 2 ]; then
    echo "gates: privacy-hook.sh let a private link through" >&2
    exit 1
fi
hook 'pr view 9' || { echo "gates: privacy-hook.sh refused a clean gh command" >&2; exit 1; }
