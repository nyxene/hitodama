# Contributing to Hitodama

Hitodama is maintained by one person in their own time. These rules keep that sustainable.

## Before you start

- **Bugs:** open an issue with the bug report template. Include the Hitodama and Claude Code versions and your terminal.
- **Ideas:** open an issue with the feature request template. Expect many to be declined: Hitodama stays small, local and offline.
- **Translations:** corrections to any language are welcome as issues; quote the line and the fix.
- **Security problems:** do not open an issue. Follow [SECURITY.md](SECURITY.md).

There is no guaranteed response time.

## Pull requests

Pull requests are accepted **only for issues labelled `accepted`**. Comment on the issue before you start, so two people do not do the same work. Pull requests without an accepted issue are closed without review.

Out of scope, and closed:

- network code of any kind, and telemetry;
- reading prompts, replies, files or transcripts;
- characters that are not public-domain folklore or original designs: no characters, names or sprites from existing games, toys, anime or films;
- large refactors and reformatting unrelated to the issue.

## Development setup

Requires Claude Code 2.1.287 or newer, and [Bun](https://bun.sh) only to redraw the images (`bun scripts/art.ts` writes the icon and `assets/yokai.png` from the sprite code).

```sh
git clone https://github.com/nyxene/hitodama.git
cd hitodama
scripts/setup.sh
claude --plugin-dir .
```

`setup.sh` copies the git hooks from main into `.git/hooks`; rerun it when `.githooks` changes on main. A hook path into the tree would run whatever hooks a checked-out branch carries. The hooks still run the checked-out branch's `scripts/gates.sh` and tests, so read a contributor's changes to `scripts/`, `.githooks/` and `tests/` before committing on their branch. Before every commit the hooks run `scripts/gates.sh`: `claude plugin validate --strict`, `claude plugin test`, and `scripts/privacy.sh`, plus a type check once Claude Code has laid its types in `.claude-plugin/types`. Those types appear the first time a session loads the mod with `--plugin-dir .`; until then `tsconfig.json` points at a missing file and the editor says so. CI runs the same gates without the type check. A session started with `--plugin-dir .` reloads the mod whenever you save a file.

Pet data lives in `~/.claude/hitodama/`. Delete `pet.json` there to start over with a new egg.

## Commits and pull requests

- One pull request per issue, from a branch named `type/<issue>-slug`, for example `fix/12-sleep-call`.
- The pull request title is a [Conventional Commits](https://www.conventionalcommits.org/) subject (`feat:`, `fix:`, `docs:` and so on) that states the result, for example `fix: the pet no longer calls while asleep`. It is squash-merged, so the title becomes the commit and the changelog line.
- The body starts with `Closes #N`, then says what changed and how it was tested.
- No links to private AI sessions or pages in commits or pull requests.

## Releases

[release-please](https://github.com/googleapis/release-please) keeps a release pull request open. GitHub holds its `gates` run until the maintainer approves it. Merging it bumps the version in `.claude-plugin/plugin.json` and `version.txt`, updates `CHANGELOG.md`, tags `vX.Y.Z` and drafts the GitHub release.
