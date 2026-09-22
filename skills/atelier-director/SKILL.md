---
name: atelier-director
description: Entry point for every atelier creative job - turns a brief (brand, audience, sections, deliverables such as a scroll-driven WebGL site, a teaser video or stills) into a section storyboard (set, camera shot, hero motion, post look, DOM copy, exit per section), picks the DNA and tokens, routes to the other atelier skills in order, plans the build from templates/experience-starter, runs the verification gates (npm run check, 4-viewport capture matrix with static and reduced-motion review, production perf audit against budgets, deterministic video render with --verify) and records the work in work/catalog.json. Use when the user says "new project", "make a site like loanmeme / JUNNI", "we need a launch site and teaser", "storyboard this", "plan the sections", "what should we build", "start a new atelier piece", or asks how to take a brief to a verified, cataloged result.
---

# Atelier director

The director turns a brief into a storyboard, a routed build and verified, cataloged output.
It owns the plan and the gates; the technique skills own the implementation.
Start every creative job here, even small ones, so the work lands in `work/` with evidence instead of in a chat log.
Repo policy lives in `AGENTS.md`; this skill applies it step by step.

## Workflow

1. **Intake** the brief and fill the gaps with explicit defaults.
2. **Choose the DNA and tokens.**
3. **Storyboard** every section on one page.
4. **Route** each storyboard need to a skill, in order.
5. **Build** from `templates/experience-starter`.
6. **Verify** with the gates below; fix what they find, including unrelated visual defects.
7. **Record** the work in `work/catalog.json` and `work/NNN-slug/`, and report with evidence.

Get user approval at two points only: after the storyboard (decision state Accepted) and before anything is published.

## 1. Intake

Collect, in this order, and write them at the top of the work README:

| Field | Ask for | Default when missing |
|---|---|---|
| Brand | name, voice, colors, logo files the user owns, fonts with licenses | house tokens from the DNA, text wordmark in the display face |
| Audience and goal | who, on what devices, the one action they should take | mobile-first, one CTA |
| Sections | the story beats in order, with the copy the user has | 3 to 5 sections: arrival, idea, proof, payoff |
| Deliverables | site, teaser video (sizes, duration), stills (sizes) | site plus a 1920 x 1080 teaser of 16 to 25 s |
| Constraints | deadline, hosting, analytics, languages, legal lines | static hosting, no trackers, English |
| Assets | models, characters, textures the user owns or commissions | procedural or authored in Blender for this project |

Never invent brand facts, prices or claims; leave a visible `TODO(copy)` in the DOM copy instead.
If the brief points at a reference site the repo has no dossier for, run [dna-extraction](../dna-extraction/SKILL.md) before storyboarding.

## 2. DNA and tokens

List `dna/` and pick one dossier (today: `junni-loanmeme`).
Read its `STYLE-SPEC.md`; that is the default for color, type, motion, post and chrome.
Map the brand onto the tokens instead of inventing new ones:

- Brand colors replace `--at-frost`, `--at-ice`, `--at-ice-deep`, `--at-lime*` by role (sky, sky contrast, CTA face and shades); keep `--at-black`, `--at-white`, `--at-dim`.
- Brand faces replace `--at-font-display` and `--at-font-ui` only with licensed, self-hosted files (the starter uses `@fontsource` packages).
- Motion tokens (`--at-ease-*`, `HouseCurves`, `sigmoid(6)` default) stay unless the brief asks for a different temperament.
- Post looks start from the spec's table (arrival bloom 0.25 and vignette 0.7, glass bloom 0.35 and vignette 1.4, finale bloom 1.6).

Techniques come from the DNA; the reference's assets, copy, mascot and branding never do.
Record the token mapping as a decision.

## 3. Storyboard

Write `work/NNN-slug/storyboard.md` from [references/storyboard-template.md](references/storyboard-template.md).
Each section gets exactly one of each:

| Field | Means | Lands in code as |
|---|---|---|
| Set | what stands in the world, where (world offset) | `root` group or a Blender GLB (`SectionDef.root`) |
| Camera shot | position, target, FOV, parallax | `SectionDef.shot` (`Shot`) or `shotFromScene` |
| Portrait framing | extra FOV and camera shift on phones, props fitted to the visible width | `Shot.portraitFov`, `Shot.portraitOffset` (blended by `portraitWeight`), `visibleSizeAt( camera, point )` |
| Hero motion | the one thing that moves with intent on enter | `enter()` tweens and `update( dt, stage, visibility )` |
| Post look | bloom, vignette, grain, dirt, exposure | `SectionDef.post` (`PostParams`) |
| Sky look | top, bottom, accent, style 0 to 2 | `SkyLook` for `createSkyDome` |
| DOM copy | heading, lede, CTA, alt text | `<section data-section="name">` in `index.html` |
| Exit | how it leaves (state 2), how long | `leave()` tweens |

Rules that make a storyboard buildable:
1. Three to six sections; the first is light, cheap and loads nothing heavy.
2. Neighbors contrast in post and sky so the travel reads (light arrival, dark glass, bright finale).
3. Every entrance has an exit; nothing just vanishes.
4. Sets live apart in one world (the starter uses offsets `(0, 0, 0)`, `(0, -24, 0)`, `(0, -48, 0)`) so the camera travels instead of cutting.
5. Every section reads at phone portrait: write its portrait framing (`portraitFov`, a `portraitOffset` when the hero must move to the center, and anything sized with `visibleSizeAt`) instead of adding breakpoints.
6. The static page tells the same story with the same copy, top to bottom.
7. Video beats reuse the same sections: write the cue times (for example `move(1)` at 4.5 s, `move(2)` at 10 s) in the storyboard.

Show the storyboard to the user and move its decision to Accepted before building.
A filled-in example (brief, five-set storyboard table, decisions, gate evidence) is [work/001-atelier-study/README.md](../../work/001-atelier-study/README.md).

## 4. Skill routing

Use only the skills the storyboard needs, in this order.
[references/skill-routing.md](references/skill-routing.md) lists what to hand each one and what it returns.

| Order | Skill | When |
|---|---|---|
| 0 | [dna-extraction](../dna-extraction/SKILL.md) | The style has no dossier yet. |
| 1 | [scroll-stage](../scroll-stage/SKILL.md) | Always for a site: page contract, scroller, director, camera track, chrome. |
| 2 | [uniform-animator](../uniform-animator/SKILL.md) | Always: enter and exit tweens, one-hot looks, staggers on the stage clock. |
| 3 | [blender-gltf-stage](../blender-gltf-stage/SKILL.md) | Any authored set, character or camera from Blender. |
| 4 | [postfx-bloom-dirt](../postfx-bloom-dirt/SKILL.md) | Always: per-section bloom, dirt, vignette, grain. |
| 5 | [glass-refraction](../glass-refraction/SKILL.md) | A section with glass or a refractive hero. |
| 5 | [character-studio-shading](../character-studio-shading/SKILL.md) | A character or mascot. |
| 5 | [gpgpu-effects](../gpgpu-effects/SKILL.md) | Crowds, trails, particle fields. |
| 5 | [kinetic-type](../kinetic-type/SKILL.md) | 3D bitmap type, scramble subtitles, DOM reveals, CJK columns. |
| 6 | [perf-tiering](../perf-tiering/SKILL.md) | Always, before the audit: tier budgets, degrade order, frame monitor. |
| 7 | [deterministic-render](../deterministic-render/SKILL.md) | Any video deliverable. |
| 8 | [stills-and-posters](../stills-and-posters/SKILL.md) | OG image, posters, social stills. |

If the harness has atelier subagents (`.claude/agents`, `.codex/agents`, built from `agents-src/`), delegate: `dna-analyst` for extraction, `motion-director` for storyboard and video, `shader-artist` for materials, `perf-auditor` for the audit, and `reviewer` before any decision reaches Verified locally.

## 5. Build plan

Work inside the repo so the build is a workspace that `npm run check` typechecks and builds:

```sh
cp -R templates/experience-starter examples/NNN-slug
rm -rf examples/NNN-slug/dist
# edit examples/NNN-slug/package.json: "name": "<slug>" and a free preview port (starter 4173, 001 uses 4174)
npm install
npm run dev -w examples/NNN-slug
```

Then map the storyboard onto the starter's structure:
1. `index.html`: one `<section class="section" data-section="name" aria-labelledby="...">` per storyboard row with the real DOM copy; title, description and Open Graph tags from the brief.
2. `src/sections/<name>.ts`: one module per section returning a `SectionBundle` (`def`, `sky`, `root`, optional `setProfile`), exactly like `intro.ts`, `glass.ts` and `outro.ts`.
3. `src/experience.ts`: list the bundles in storyboard order; keep the boot sequence (fallback on tier 0, `compileAsync`, `director.reset()`, `stage.reset()`, `stage.seek( 0 )`, `markReady()`).
4. Capture cues: turn the storyboard's video beats into `Cue[]` for `Choreography` in the `if ( capture )` branch.
5. `src/style.css`: token overrides from step 2, static-mode backgrounds that match each section's sky.
6. Assets: Blender sets through `blender-gltf-stage`, loaded with `AssetLoader` (`must` for section 1 only).

Keep the engine rules: every frame-affecting change runs in `update( dt )` or on `stage.time`, `stage.rng` and `stage.scheduler`; never `Math.random`, `setTimeout` or `performance.now()` in render paths.
If a pattern already exists in `@atelier/stage`, use it; extend the engine only when the same code is needed by a second project.
If the site must ship from another repository, copy the starter and `packages/stage` there and record the atelier commit in the work README.

## 6. Verification gates

All gates run on a production build served by `vite preview`, never the dev server:

```sh
npm run check
npm run build -w examples/NNN-slug && npm run preview -w examples/NNN-slug &   # serves the project's preview port
npm run capture -- --url http://localhost:4173/ --out artifacts/NNN-slug        # raw PNGs, gitignored
node scripts/contact-sheet.mjs --out work/NNN-slug/captures/phone.jpg --cols 5 artifacts/NNN-slug/phone-s[0-9]*.png   # one sheet per viewport
cp artifacts/NNN-slug/matrix.json work/NNN-slug/captures/
npm run audit -- --url http://localhost:4173/ --out work/NNN-slug/perf.json [--budgets work/NNN-slug/budgets.json]
npm run render -- --url http://localhost:4173/ --out work/NNN-slug/renders/teaser-v1.mp4 --duration 16 --verify --review 2
```

| Gate | Passes when |
|---|---|
| Check | `npm run check` exits 0 (skills, agents, catalog, typecheck, build). |
| Capture matrix | Phone 390 x 844, tablet 768 x 1024, laptop 1440 x 900 and desktop 2560 x 1440, each in WebGL, reduced-motion and `?static` runs; zero console errors or warnings in `matrix.json`; every raw PNG in `artifacts/NNN-slug/` opened and reviewed with the checklist in [references/verification.md](references/verification.md); one JPEG contact sheet per viewport plus `matrix.json` copied to `work/NNN-slug/captures/`. |
| Perf audit | `perf.json` has no failures against `scripts/budgets.json` (or the project's tighter file): FCP, CLS 0.02 or less, JS 260 KB or less, total 3,000 KB or less, no long task over 200 ms, frame p95 per profile, minimum tier. |
| Assets | `check-glb.mjs` from blender-gltf-stage passes when the project ships GLBs (`must` 600 KB or less). |
| Video | `render-video.mjs --verify` prints `determinism: PASS`; the `.json` beside the MP4 has no console errors; the `<name>-review.jpg` sheet beside the MP4 and the frames in `artifacts/renders/<name>-frames/` checked beat by beat. |
| Stills | The stills skill's outputs exist at the brief's sizes and were looked at. |

A gate that fails is fixed and rerun, not waived.
Visual defects found on the way (clipped text, banding, misaligned chrome) are fixed even when they predate this work.

## 7. Record the work

1. Pick the next free three-digit id in `work/catalog.json` and a kebab-case slug; the folder is `work/NNN-slug/`.
2. Add the entry at the top of `entries` from [assets/catalog-entry.json](assets/catalog-entry.json), then run `npm run catalog` (`npm run check` fails while `CATALOG.md` is stale).
3. Create the folder from the templates; [work/001-atelier-study/](../../work/001-atelier-study/README.md) shows the finished shape:

```
work/NNN-slug/
  README.md          from assets/work-readme.md: brief, links, gate results, what shipped
  storyboard.md      from references/storyboard-template.md
  decisions.md       from assets/work-decisions.md
  budgets.json       optional, tighter than scripts/budgets.json
  captures/          contact sheets (JPEG, under 500 KB each) and matrix.json; raw PNGs stay in artifacts/
  perf.json          audit report from the production build
  assets.json        check-glb report, when GLBs ship
  renders/           teaser-v1.mp4 with teaser-v1.json and teaser-v1-review.jpg
```

Decision states, in order: **Proposed** (written, not yet approved), **Accepted** (the user approved it), **Implemented locally** (built and passing `npm run check`), **Verified locally** (every relevant gate passed and its evidence file is in the folder), **Published** (live or posted, with the URL recorded).
The catalog entry's `status` is the state of the work as a whole: it is never ahead of its least advanced blocking decision.
Renders are never overwritten: `render-video.mjs` refuses an existing file, so bump `-v2`.

## Report

End with: what was built, the gate table with pass or fail and the evidence file for each, open decisions with their states, and anything that still needs the user (copy, licenses, publishing).
