---
name: dna-extraction
description: Reverse-engineer any reference website, WebGL experience or launch video into an atelier DNA dossier - mirror and beautify the bundle, identify libraries and versions from license banners, inventory assets (including dynamically built paths), map minified classes to roles, list GLSL shaders, read GLB scene structure without downloading assets, measure the real payload, pull X/Twitter post data, find public source and check licenses, observe it live with Playwright, then write dna/slug/DOSSIER.md, STYLE-SPEC.md and evidence. Use when the user shares a site or video and says "how did they build this", "study this reference", "reverse engineer", "make a DNA for", "extract the style of", "what stack is this", "I want ours to feel like this site", or before starting work in a style atelier has no dossier for.
---

# DNA extraction

A DNA is a studied reference turned into evidence: how it works, exact parameters, what it costs, and what atelier will do differently.
This skill is the method used to write `dna/junni-loanmeme/`, generalized so the agent can repeat it for any site or video.
The output is documentation and measurements, never the reference's files.
When the dossier is accepted, hand it to [atelier-director](../atelier-director/SKILL.md), which turns it into a storyboard and a build.

## Rules before anything else

1. Take techniques, structure and measurements; never take assets, copy, logos, characters, fonts or brand names into the repo.
2. Never impersonate the reference: no cloned pages, no look-alike branding, no reuse of its domain, mascot or voice.
3. Code may be adapted only from source that carries a permissive license (MIT, BSD, Apache-2.0, ISC, zlib).
   Keep the notice and add the project to `THIRD_PARTY_NOTICES.md`.
4. A minified bundle without a license is all rights reserved: read it to learn, quote at most a few lines as evidence, write our own code.
5. Do not bypass logins, paywalls, bot protection or robots rules; fetch politely, one request at a time.
6. Screenshots, mirrors and downloaded bundles stay in a scratch folder outside the repo.
   Only `dna/<slug>/` (Markdown and JSON) is committed.

Details, gray areas and the notice format are in [references/ethics-and-licensing.md](references/ethics-and-licensing.md).

## Workspace

Pick a short kebab-case slug: `<studio>-<site>` (for example `junni-loanmeme`).
Work in a scratch folder, for example `$TMPDIR/dna-<slug>/` with `mirror/`, `observe/`, `source/` and `notes.md`.
Write findings into `notes.md` as you go, with the command that produced each one, so the dossier can cite evidence instead of memory.

## Method

Run the stages in order; each one narrows the next.
Stages 3 to 9 are bundle forensics; [references/bundle-forensics.md](references/bundle-forensics.md) has the exact grep recipes.

1. **Frame the study.**
   Watch the reference end to end at desktop and phone sizes and list its signature moments (a transition, a material, a type treatment, a camera move).
   Each one becomes a question the dossier must answer with a parameter.
2. **Observe it live** with the repo's GPU-enabled Chromium:
   ```sh
   node skills/dna-extraction/scripts/observe.mjs --url https://example.com/ --out $TMPDIR/dna-slug/observe --steps 6
   node skills/dna-extraction/scripts/observe.mjs --url https://example.com/ --out $TMPDIR/dna-slug/observe --viewport phone
   ```
   It records every response with its size, console errors, WebGL renderer, `window.__THREE__`, loaded fonts, quirks mode and whether the document really scrolls, then wheels through the page taking screenshots.
   Look at every screenshot; describe layout, palette and motion in `notes.md`.
3. **Mirror the shell.**
   Fetch `index.html`, the CSS and the JS with a browser user agent (`curl -sL -A "$UA" -o ...`).
   Try `script.js.map` and `script.js.LICENSE.txt`, but check the content type: single-page-app hosts answer missing files with `index.html` and status 200.
4. **Beautify** with `npx --yes prettier@3 --parser babel script.js > script.pretty.js` (use `--parser css` for CSS).
5. **Identify libraries and versions** from `/*!` banners, the `LICENSE.txt`, `__THREE__` or `REVISION` strings, embedded `package.json` objects (`name:"cannon",version:"0.6.2"`) and tool fingerprints (`#define GLSLIFY 1` means glslify).
6. **Separate app code from vendor code.**
   Vendor modules are large and recognizable; app code holds asset paths, DOM selectors and CSS class names.
   Start from an asset path and read outward.
7. **Inventory assets**, including dynamically built paths such as `"./assets/scene/" + t + ".glb"`: find the call sites to enumerate `t`.
8. **Map minified classes to roles** by constructor arguments, uniform names and three.js property names (those are never minified).
   Write `evidence/class-map.md` as a table: minified name, source name if known, role.
9. **List the shaders**: every GLSL string, what it draws, its key uniforms, and third-party snippets with their license comments.
10. **Read the scenes** without downloading them: `glb-info.mjs` fetches only the GLB header and JSON chunk.
    ```sh
    node skills/dna-extraction/scripts/glb-info.mjs https://example.com/assets/scene/section_1.glb
    node skills/dna-extraction/scripts/glb-info.mjs https://example.com/assets/scene/hero.glb --json
    ```
    Note the generator (Blender exporter version), extensions, compression, node naming contract (`Camera`, `CameraTarget`, anchors), skins and clip names.
11. **Measure the payload** by streaming bytes (headers lie or are missing):
    ```sh
    node skills/dna-extraction/scripts/measure-payload.mjs --base https://example.com/ --list $TMPDIR/dna-slug/urls.txt --out dna/slug/evidence/payload.json
    ```
    It records decoded and transferred bytes, content type, cache headers and flags HTML fallbacks.
12. **Pull the launch post** if there is one: `curl -s https://api.fxtwitter.com/<user>/status/<id>` returns JSON with `tweet.text`, `tweet.created_at` and `tweet.media.videos[]` (`url`, `width`, `height`, `duration`, `format`).
    Record the numbers, not the video.
13. **Look for public source and provenance.**
    Commented-out links, leftover names (a mascot still called by its old name), credits, award pages and the author's write-ups often lead to an open repository.
    Search with `gh search repos` and `gh search code`; if a licensed repository exists, clone it to scratch and study that instead of the bundle.
14. **Check licenses** of everything you might adapt against the rules above, and note which parts are unlicensed.
15. **Write the dossier and style spec** from [references/dossier-template.md](references/dossier-template.md) and [references/style-spec-template.md](references/style-spec-template.md).
    Every number cites where it came from; every weakness of the reference gets an atelier alternative in "What atelier deliberately changes".
16. **Register it**: add a row to `dna/README.md`, then run `npm run check`.

## When the reference is a video

Keep the file in scratch and measure it; the dossier records the numbers and a beat sheet, not frames.

```sh
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate,duration,bit_rate -of json "$VIDEO"
mkdir -p $TMPDIR/dna-slug/cuts
ffmpeg -hide_banner -i "$VIDEO" -vf "select='gt(scene,0.3)',showinfo" -fps_mode vfr $TMPDIR/dna-slug/cuts/cut-%03d.png 2>&1 | grep -o 'pts_time:[0-9.]*'
```

The second command prints the time of every hard cut (on the loanmeme launch clip: 2.9, 6.17, 8.9, 11.83, 14.4 s, one scene every 2.7 to 3 s).
Write the beat sheet as a table: time, shot, camera move, what changes, transition type.
If the video is a capture of a site, study the site instead and use the video only for pacing.

## Outputs

```
dna/<slug>/
  DOSSIER.md        provenance, stack, architecture, rendering, motion, typography, performance, changes, sources
  STYLE-SPEC.md     tokens (color, type, motion, post, chrome) ready to map onto --at-* variables
  evidence/
    payload.json    from measure-payload.mjs (plus glb-info --json summaries)
    class-map.md    minified class to role
```

Evidence is text and numbers only.
Never put screenshots, GLBs, textures, fonts, bundle copies or video in `evidence/`.

## Done when

- Every signature moment from stage 1 is explained with parameters (durations, easings, colors, FOVs, counts).
- Stack table names each library with a version and license.
- Payload and first-render blockers are measured, and the dossier compares them with atelier's budgets in `scripts/budgets.json`.
- The style spec has tokens for color, type, motion, post and chrome, each with its use.
- "What atelier deliberately changes" lists at least the reference's performance, accessibility and determinism gaps.
- No third-party asset or long code excerpt is in the repo, and `npm run check` passes.

## Tools in this skill

| Script | Does |
|---|---|
| `scripts/observe.mjs` | Live Playwright observation: network sizes, renderer, three.js revision, fonts, screenshots per wheel step. |
| `scripts/glb-info.mjs` | GLB header and JSON only, from a file or URL: extensions, node tree, meshes, materials, images, skins, clips. |
| `scripts/measure-payload.mjs` | Streams URLs and counts decoded and transferred bytes; flags SPA HTML fallbacks. |

All three were run against loanmeme.io and the MIT JUNNI source while writing this skill; `measure-payload.mjs` reproduces the `script.js` sizes in `dna/junni-loanmeme/evidence/payload.json` byte for byte (1,210,876 decoded, 291,516 brotli).
