# atelier skills

Each folder is a self-contained skill in the open Agent Skills format: `SKILL.md` (name and description frontmatter only), optional `references/`, `scripts/` and `assets/`, and `agents/openai.yaml` for the Codex UI.
They build on `@atelier/stage` and the DNA dossiers in `dna/`; the reference's look is the default, never its assets.

| Skill | Use it for |
|---|---|
| [atelier-director](atelier-director/SKILL.md) | Start here: brief to storyboard, skill routing, build plan, verification gates, catalog entry. |
| [dna-extraction](dna-extraction/SKILL.md) | Reverse-engineer a reference site or clip into a new DNA dossier and style spec. |
| [scroll-stage](scroll-stage/SKILL.md) | Static-first page, section-snapping scroller, section lifecycle, camera travel, chrome, accessibility. |
| [uniform-animator](uniform-animator/SKILL.md) | Animator uniforms, easings and CSS twins, deterministic staggers, one-hot looks, portrait layout. |
| [blender-gltf-stage](blender-gltf-stage/SKILL.md) | Blender sets and characters, naming contract, export, meshopt and KTX2, budget gate. |
| [postfx-bloom-dirt](postfx-bloom-dirt/SKILL.md) | Bloom, lens dirt, vignette, grain, AA and the linear color pipeline. |
| [glass-refraction](glass-refraction/SKILL.md) | Screen-space glass with RGB dispersion, glass characters, CRT panels. |
| [character-studio-shading](character-studio-shading/SKILL.md) | Hero characters: studio rig, looks per section, clip choreography. |
| [gpgpu-effects](gpgpu-effects/SKILL.md) | Cursor trail, time-pure particles, sky looks, instanced props, crowds. |
| [kinetic-type](kinetic-type/SKILL.md) | Bitmap-font type, DOM reveals, scramble text, CJK columns, rainbow CTAs, font strategy. |
| [perf-tiering](perf-tiering/SKILL.md) | Quality tiers, budgets, audits, fallbacks, real-device checks. |
| [deterministic-render](deterministic-render/SKILL.md) | `seek(t)` capture to MP4, vertical cuts, X delivery, video verification. |
| [stills-and-posters](stills-and-posters/SKILL.md) | OG images, headers, posters and key art rendered from scenes, with manifests. |

## Install

From the repository root:

```sh
npm run install-skills            # symlinks into ~/.claude/skills and ~/.agents/skills
npm run install-skills -- --dry-run
npm run install-skills -- --uninstall
```

Claude Code reads `~/.claude/skills`; Codex reads `~/.agents/skills` (and older builds `~/.codex/skills`, add `--codex-legacy`).
Inside this repository both harnesses already see the skills through `.claude/skills` and `.agents/skills`, which are symlinks to this folder.
The installer never overwrites a same-named skill that is not ours.

## Example calls

- "Use $atelier-director to plan a four-section launch site and a 20 s teaser for a pet camera brand."
- "Use $dna-extraction on https://example.com and write the dossier."
- "Use $glass-refraction to make the hero bottle in section two refract the product wall behind it."
- "Use $deterministic-render to cut a 1080 x 1920 version of the teaser for X."

## Adding a skill

Copy the structure of an existing folder, keep the body under 500 lines, and run `npm run validate` (frontmatter, links, openai.yaml, no em dashes).
Add the row above, and point the skill at real engine APIs; never document an API that does not exist.
