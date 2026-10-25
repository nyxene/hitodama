#!/bin/sh
# The gates every commit and pull request passes: the manifest and module as Claude Code reads them, the tests,
# and nothing private in the tree (scripts/privacy.sh). The type check runs only where Claude Code
# has laid its types (.claude-plugin/types appears once the mod has been loaded from this folder).
set -e
cd "$(git rev-parse --show-toplevel)"
claude plugin validate . --strict
claude plugin test .
if [ -f .claude-plugin/types/tsconfig.json ]; then npx -y -p typescript@5.9.3 tsc -p .; fi
sh scripts/privacy.sh
