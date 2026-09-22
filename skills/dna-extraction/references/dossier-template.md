# Dossier template

Copy the block below to `dna/<slug>/DOSSIER.md` and fill every section.
The worked example is `dna/junni-loanmeme/DOSSIER.md`; match its depth.
Delete a section only if it truly does not apply (for example "Launch video" when there is none), and say so in one line instead.
One sentence per line; cite a command, file and line, or URL for every number.

````markdown
# DNA dossier: <Studio> / <site or video>

Studied YYYY-MM-DD.
Reference: <URL> and its launch post <URL>.
Status: research complete | in progress; techniques encoded in <paths> | not yet encoded.

## Provenance

Who built it, who owns it, and how you know (credits, commented links, leftover names, write-ups).
Public source and its license, if any.
What carries no license and is therefore off limits (character, logo, copy).

## Stack

| Layer | Reference | atelier |
|---|---|---|
| Renderer | three.js rNNN `WebGLRenderer` | three.js r186 `WebGLRenderer`, WebGL2 |
| Framework | ... | `@atelier/stage` |
| Physics, input, UI libraries | name version (license) | keep, replace or drop, and why |
| Build | ... | Vite |
| Hosting | ... | static output |

## Architecture

Numbered facts about how a frame is produced: loop, update order, scene authoring, how sections are defined.

### Section model

What each section declares (camera, anchor, post params, material mode) and how transitions trigger.
Table of sections with FOV and look.

### Scroll or timeline model

The input model with its constants as a short code block (the actual math, in our words or from licensed source).

### Animation model

How values are tweened, default easing and duration, how staggers are scheduled.

### Responsive model

How layout and camera adapt (breakpoints, aspect weights).

## Rendering

### Post chain

Numbered passes with their parameters.
Known artifacts you reproduced and how atelier avoids them.

### Signature shading

One bullet per signature material or effect, with the parameters that make it look right.

### Motion systems

Trails, particles, crowds, character animation: counts, sizes, update method.

### Typography

Faces, atlases, reveal timings, staggers.

## Tokens

See `STYLE-SPEC.md` for the approved token table.

## Performance of the reference

| Measure | <reference> | atelier target |
|---|---|---|
| Total transfer | from evidence/payload.json | budgets.json `totalTransferKB` |
| JS | raw and compressed, cache headers | `jsTransferKB` |
| Mesh and texture compression | none, draco, meshopt; PNG, WebP, KTX2 | meshopt + KTX2 |
| First render blocked on | the largest must-load file | nothing (static document first) |
| Resolution strategy | fixed DPR, adaptive | tier DPR cap with runtime adaptation |
| Hidden tab | keeps rendering or pauses | paused |
| Reduced motion | honored or ignored | honored |
| No WebGL | what happens | full static page |
| Fonts | families loaded, unused ones | self-hosted subsets |

## Launch video

Resolution, duration, frame rate, bitrate, cut times, and whether it is a site capture.

## What atelier deliberately changes

Numbered list; every weakness found above gets an alternative that `@atelier/stage` or a skill implements.

## Sources

- Bundle and CSS dissected from <URL> (not redistributed).
- Public repositories with licenses.
- Write-ups, award pages, post data URLs.
````

## Evidence files

`evidence/payload.json` comes from `scripts/measure-payload.mjs --out`; add a `glb` object with the per-file facts from `glb-info.mjs --json` (generator, extensions, meshes, triangles, joints, clips) and a `compression` summary, as in `dna/junni-loanmeme/evidence/payload.json`.
`evidence/class-map.md` is a table `| Minified | Source name | Role |` with a one-line header naming the bundle and the source it was cross-checked against.
