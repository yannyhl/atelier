# atelier

Studied visual DNA, turned into agent skills, a small WebGL engine and a catalog of everything we make.
Works with Claude Code and OpenAI Codex (open Agent Skills format), and with humans.

The first DNA is the JUNNI / loanmeme.io style: a scroll-driven WebGL stage of Blender-authored sets, a toy-like hero, glass refraction, bloom with lens dirt, kinetic type and a camera that travels between sets.
atelier keeps that look and fixes what the reference gets wrong: it ships about 0.4 MB instead of 11.6 MB, paints static HTML first with zero layout shift, adapts quality per device, honors reduced motion, and renders frame-exact videos from the same code.

## What is here

| Path | What |
|---|---|
| [`dna/`](dna/) | Dossiers and style specs of studied references. Start with [junni-loanmeme](dna/junni-loanmeme/DOSSIER.md). |
| [`skills/`](skills/) | Agent skills. Entry point: [`atelier-director`](skills/atelier-director/SKILL.md). |
| [`packages/stage/`](packages/stage/) | `@atelier/stage`: vanilla TypeScript + three.js r186 engine (fixed-step clock with `seek(t)`, uniform animator, section scroller, post chain, quality tiers, effects). |
| [`templates/experience-starter/`](templates/experience-starter/) | Copyable three-section starter. |
| [`examples/001-atelier-study/`](examples/001-atelier-study/) | Flagship study: five sets and an original mascot, Pip. |
| [`work/`](work/CATALOG.md) | The catalog of everything we make, with captures, performance reports and renders. |
| [`agents-src/`](agents-src/) | Subagents (dna-analyst, shader-artist, perf-auditor, motion-director, reviewer), generated for both harnesses. |
| [`scripts/`](scripts/) | Validation, capture matrix and contact sheets, performance audit, deterministic video render, font subsetting, skill install. |

## Quick start

```sh
npm install
npm run check                       # skills, agents, catalog, typecheck, build
npm run install-skills              # link skills into ~/.claude/skills and ~/.agents/skills
cd examples/001-atelier-study && npx vite
```

Then, from any project, ask your agent: "Use $atelier-director to plan a scroll site for ..." (Codex) or "use the atelier-director skill ..." (Claude Code).

## Using the skills

| Skill | Use it for |
|---|---|
| `atelier-director` | Turning a brief into a storyboard, a build plan and verification gates; routes to the others. |
| `dna-extraction` | Reverse-engineering any reference into a new DNA dossier. |
| `scroll-stage` | Section-snapping scroll stages: scroller, director, camera travel, static-first page. |
| `uniform-animator` | Animator uniforms, easings, deterministic staggers, one-hot looks, portrait layout. |
| `blender-gltf-stage` | Authoring sets and characters in Blender, export, meshopt and KTX2 compression. |
| `postfx-bloom-dirt` | The post chain: bloom, lens dirt, vignette, grain, AA, color pipeline. |
| `glass-refraction` | Screen-space glass with RGB dispersion and what to put behind it. |
| `character-studio-shading` | Hero characters: studio rig, looks, clip choreography. |
| `gpgpu-effects` | Cursor trail, particles, sky, instanced props, crowds. |
| `kinetic-type` | Bitmap-font type, DOM reveals, scramble text, CJK columns, rainbow CTAs. |
| `perf-tiering` | Quality tiers, budgets, audits, fallbacks. |
| `deterministic-render` | `seek(t)` capture to MP4, vertical cuts, delivery for X. |
| `stills-and-posters` | OG images, posters and key art rendered from scenes. |

Install for both harnesses with `npm run install-skills` (symlinks; never overwrites a skill that is not ours), or per project: this repo already exposes them at `.claude/skills` and `.agents/skills`.

## Measured

| | loanmeme.io | experience starter | 001 study |
|---|---|---|---|
| Total transfer | about 11.6 MB | 222 KB | 393 KB |
| JavaScript transfer | 292 KB, served no-cache | 190 KB | 250 KB |
| Layout shift | n/a (blank until loaded) | 0 | 0 |
| First contentful paint (laptop, 4x CPU) | after a 3.3 MB GLB | 104 ms | 112 ms |
| Longest task, phone at 6x CPU | not measured | under 200 ms | 159 ms |
| Frame p95, phone at 6x CPU | not measured | 16.7 ms | 16.7 ms |
| Draw calls per frame | not measured | 17 to 22 | 28 to 33 |
| Deterministic video | no | yes | yes (30 s, 1080p and 1080 x 1920) |

Numbers from `scripts/audit-perf.mjs` on an Apple M3 Pro; CPU throttling does not slow the GPU, so confirm on real low-end phones.

## Rules

`AGENTS.md` is the policy for every contributor, human or agent.
Third-party code we adapted is listed in `THIRD_PARTY_NOTICES.md`; no third-party assets are included.
