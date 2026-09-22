# atelier agent policy

This file is the single source of truth for Codex, Claude and human contributors.
`CLAUDE.md` points here and must not duplicate it.

## What this repository is

atelier turns studied visual references ("DNAs") into reusable skills, a small WebGL engine and a catalog of everything we make.
The first DNA is the JUNNI / loanmeme.io scroll-driven WebGL style; more will be added the same way.

| Path | Holds |
|---|---|
| `dna/` | Dossiers and style specs of studied references (evidence, not templates). |
| `skills/` | Agent skills in the open Agent Skills format; the only copy (symlinked into `.claude/skills` and `.agents/skills`). |
| `packages/stage/` | `@atelier/stage`, the vanilla TypeScript + three.js engine the skills build on. |
| `templates/experience-starter/` | Copyable starting point: static-first page that upgrades to the stage. |
| `examples/` | Finished reference builds that exercise the skills. |
| `work/` | The catalog of everything we make (`catalog.json` is the source, `CATALOG.md` is generated). |
| `agents-src/` | Subagent sources; `scripts/build-agents.mjs` generates `.claude/agents/*.md` and `.codex/agents/*.toml`. |
| `scripts/` | Validation, capture, audit, render and install tooling. |

## Working rules

1. Start creative work with `skills/atelier-director`; it routes to the other skills.
2. Reuse `@atelier/stage` before writing new engine code; extend the engine when a pattern repeats in two projects.
3. Everything that changes a rendered frame must run on the stage clock: `update(dt)`, `stage.time`, `stage.rng`, `stage.scheduler`. Never `Math.random`, `setTimeout` or `performance.now()` in render paths.
4. Ship static-first: the page must be complete and readable without WebGL, and the upgrade must not shift layout.
5. Performance is a feature: run `npm run audit` against a production build and meet `scripts/budgets.json` (or the project's tighter file) before calling work done.
6. Look at the result: run `npm run capture` and inspect every screenshot at phone, tablet, laptop and desktop sizes; fix anything that looks off, even if unrelated.
7. Video comes from `scripts/render-video.mjs` with `--verify`; never screen-record by hand.
8. Never commit third-party assets (models, textures, logos, fonts without a license, copy). Record techniques and measurements in `dna/` instead.
9. Adapted code keeps its license notice; add new sources to `THIRD_PARTY_NOTICES.md`.

## Writing rules

- Never use the em dash character; use a plain dash or rewrite the sentence.
- In Markdown, put each full sentence on its own line.
- Skills use only `name` and `description` frontmatter, stay under 500 lines, and put depth in `references/`.
- Every skill has `agents/openai.yaml` for the Codex UI.
- Keep code in the style of the surrounding code: tabs, spaced parentheses, JSDoc on public API.

## Recording work

Every piece of work gets an entry in `work/catalog.json` and a folder `work/NNN-slug/` with a README, decisions, `perf.json`, curated capture contact sheets (JPEG, under 500 KB each) with `matrix.json`, and any videos with their `.json` metadata.
Raw captures and scratch renders go to `artifacts/` (gitignored); only curated outputs are committed.
Decision states: Proposed, Accepted, Implemented locally, Verified locally, Published.
Run `npm run catalog` after editing the catalog; `npm run check` fails if `CATALOG.md` is stale.

## Commands

| Command | Does |
|---|---|
| `npm install` | Installs the workspace (Node 22). |
| `npm run check` | Validates skills, agents and catalog, typechecks and builds everything (also runs in CI, `.github/workflows/check.yml`). |
| `npm run capture -- --url <url> --out <dir>` | Screenshot matrix incl. static and reduced-motion runs. |
| `npm run audit -- --url <url> --out <file>` | Performance audit against budgets (use a production build). |
| `npm run render -- --url <url> --out <file.mp4> --duration <s> --verify` | Deterministic video render. |
| `node scripts/contact-sheet.mjs --out <file.jpg> --cols N <png...>` | Tiles captures into one JPEG for the work folder. |
| `python3 scripts/subset-font.py --font <ttf> --html <index.html> --lang ja --out <woff2>` | Subsets a font (CJK especially) to the characters a page uses. |
| `npm run install-skills` | Symlinks skills into `~/.claude/skills` and `~/.agents/skills` without overwriting others. |

## Git

- Branch for anything beyond a typo; keep `main` releasable.
- Commit messages explain why; do not add agent co-author lines.
