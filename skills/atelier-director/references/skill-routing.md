# Skill routing

What the director hands each skill and what it expects back.
Hand over the storyboard rows that concern the skill, the chosen DNA, and the work folder path; ask for results in the listed form so the gates can check them.

| Skill | Hand it | Expect back |
|---|---|---|
| [dna-extraction](../../dna-extraction/SKILL.md) | reference URL or video, what the user likes about it | `dna/<slug>/DOSSIER.md`, `STYLE-SPEC.md`, `evidence/`; a row in `dna/README.md` |
| [scroll-stage](../../scroll-stage/SKILL.md) | section list (names, labels, offsets, shots with portrait framing), DOM copy, chrome needs | `index.html` sections, `src/experience.ts` wiring, working keyboard, touch, wheel, deep links and `?static` fallback |
| [uniform-animator](../../uniform-animator/SKILL.md) | hero motions and exits with durations and easings | named Animator tracks per section, one-hot looks, scheduler-driven staggers, no wall-clock timers |
| [blender-gltf-stage](../../blender-gltf-stage/SKILL.md) | sets, camera shots and hero clips that are authored in Blender | `.blend` sources, compressed GLBs, `assets.json` from `check-glb.mjs`, `AssetLoader` entries with must and sub priorities |
| [postfx-bloom-dirt](../../postfx-bloom-dirt/SKILL.md) | post look per section, lens dirt wish, capture grain | `PostParams` per `SectionDef`, dirt texture setup, grain scale for capture |
| [glass-refraction](../../glass-refraction/SKILL.md) | which objects refract, what sits behind them | materials on `REFRACT_LAYER`, `post.refraction = true`, tier-dependent taps |
| [character-studio-shading](../../character-studio-shading/SKILL.md) | character GLB, per-section material modes and poses | studio-lit character material, clip crossfades on the stage clock |
| [gpgpu-effects](../../gpgpu-effects/SKILL.md) | crowds, trails, particle fields with counts per tier | systems that scale by `profile.effectScale` and reset exactly on `seek( 0 )` |
| [kinetic-type](../../kinetic-type/SKILL.md) | titles, subtitles, CJK columns, CTA treatments | bitmap text, scramble text, DOM reveals, all readable in `?static` |
| [perf-tiering](../../perf-tiering/SKILL.md) | the built page and its budgets | tier profile choices, degrade order, `perf.json` meeting `scripts/budgets.json` |
| [deterministic-render](../../deterministic-render/SKILL.md) | video beats, sizes, duration | `Choreography` cues, MP4 plus `.json` metadata and `-review.jpg` sheet, `determinism: PASS` |
| [stills-and-posters](../../stills-and-posters/SKILL.md) | still list with sizes and moments | PNGs at the requested sizes, OG image wired in `index.html` |

## Order and why

1. Extraction first, because the storyboard quotes the dossier's parameters.
2. Scroll stage and animator next, because every other skill plugs into `SectionDef` and Animator tracks.
3. Blender sets before materials and effects, because shots and object names come from the files.
4. Post before per-section effects, because bloom thresholds decide how bright emissive and glass must be.
5. Perf tiering after effects exist and before the audit, because it tunes their counts.
6. Video and stills last, from the verified build, never from a dev server.

## Handoffs that go wrong

| Symptom | Usual cause | Owner |
|---|---|---|
| Camera aims at the origin in a section, `[atelier] shotFromScene` warning in the console | `CameraTarget` pruned by an unsafe `gltf-transform optimize` | blender-gltf-stage |
| Video frames differ between runs | `Math.random`, `setTimeout` or `performance.now()` in a render path, or a system without `reset` | deterministic-render, uniform-animator |
| Static page is blank or shifts on upgrade | stage layout not gated by the pre-paint `is-webgl` class | scroll-stage |
| Bloom blows out the arrival section | emissive above the 0.5 threshold or bloom set for the finale | postfx-bloom-dirt |
| Phone audit fails frame p95 | effect counts not scaled by `effectScale`, refraction taps fixed | perf-tiering |
