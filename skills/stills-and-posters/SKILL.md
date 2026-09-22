---
name: stills-and-posters
description: Render stills from @atelier/stage scenes with a deterministic script and record each file in asset-manifest.json. Covers OG and social cards (1200x630), X headers (1500x500), square and portrait posts, posters and key art at any resolution through capture mode (w, h, dpr), choosing the frame by time or Choreography cue, what transparent PNG output would need, and the manifest entry per file (width, height, mode, transparency, bytes, sha256, tool, source url and time). Use when someone asks for an OG image, social preview, link card, X or Twitter header or banner, poster, key art, wallpaper, thumbnail or print still of a scene, or wants a frame from the teaser as an image.
---

# Stills and posters

A still is one frame of the same deterministic timeline the video uses: load the page in capture mode, walk the stage clock forward on the video's frame grid, screenshot, and write a manifest entry.
A still at time t is byte-for-byte the frame at t in `scripts/render-video.mjs` output at the same size (verified on the starter at 6, 9, 12 and 15 s), so posters and the teaser always agree.

## Render a still

Serve a production build of the page (for the starter: `npx vite build && npx vite preview --port 4173 --strictPort`), then:

```bash
node skills/stills-and-posters/scripts/render-still.mjs --url http://localhost:4173/ \
  --out work/NNN-slug/stills/og.png --preset og --t 9
```

| Option | Meaning |
|---|---|
| `--t <s>` | Stage time; snapped to the `--fps` grid (default 30, same as the video). |
| `--cue <label>` / `--after <s>` | Use a labelled cue's time (from `window.__atelier.cues()`) plus an offset instead of `--t`. |
| `--preset <name>` | Size shorthand (table below). |
| `--w --h` | Output size in pixels, the same convention as `render-video.mjs`. Overrides the preset. |
| `--dpr` | Device pixel ratio; the page is laid out at `w/dpr` x `h/dpr` CSS pixels (both must be whole). |
| `--format png\|jpeg`, `--quality` | PNG by default; JPEG for size-capped cards (quality 92 default). |
| `--manifest <file>` | Manifest to update; default `asset-manifest.json` next to the output. |
| `--force` | Replace an existing file (otherwise it refuses, like the video renderer). |

It prints the manifest entry as JSON and exits 1 on console errors, a size mismatch, a missing stage or a frame larger than the GPU allows.
Rendering takes 1 to 5 s for social sizes and about 20 s for 7680 x 4320.

## Sizes

| Preset | Pixels | DPR (CSS layout) | Use |
|---|---|---|---|
| `og` | 1200 x 630 | 1 (1200 x 630) | `og:image` and `twitter:image` (summary_large_image). Keep under 5 MB. |
| `x-header` | 1500 x 500 | 1 (1500 x 500) | X profile header. |
| `x-post` | 1600 x 900 | 1 (1600 x 900) | 16:9 image post. |
| `square` | 1080 x 1080 | 1 (1080 x 1080) | Square post, avatar source. |
| `portrait` | 1080 x 1350 | 1 (1080 x 1350) | 4:5 feed post. |
| `story` | 1080 x 1920 | 3 (360 x 640, a real phone layout) | Vertical; matches a vertical cut rendered with `--dpr 3`. |
| `4k` | 3840 x 2160 | 2 (1920 x 1080) | Key art and wallpapers with the 1080p video's composition. |
| `poster-a` | 2480 x 3508 | 2 (1240 x 1754) | A4 portrait at 300 dpi. |

The aspect decides the 3D composition, the CSS layout size (`w/dpr` x `h/dpr`) decides the DOM layout, and `w` x `h` is the file.
The camera follows the aspect (`portraitWeight` widens the FOV and moves props toward portrait positions), and DOM type, breakpoints and the footer follow the CSS size.
To match a video frame, use the same `--w`, `--h` and `--dpr` as the render; to go bigger with the same framing, raise `--w`, `--h` and `--dpr` together (1920 x 1080 at 1 becomes 3840 x 2160 at 2).
Raising only `--w` and `--h` makes DOM text relatively smaller.
The script refuses sizes whose CSS layout would not be whole pixels, so the file always matches the placement exactly.
Capture mode ignores the tier DPR cap and always renders tier 3, and capture pages hide the loader (`html.is-capture`).

## Choose the frame

1. Render the video with `--review 1` and pick moments from its `<name>-review.jpg` contact sheet; the PNGs in `artifacts/renders/<name>-frames/` are named by time.
   Avoid the first second: capture pages fade the canvas in from black over 1 s.
2. Prefer holds, not travel: a frame mid-flythrough has sky crossfades and motion that read as mistakes in a still.
3. Wait for reveals: a section move takes about 1.4 s and the per-character DOM reveal then runs 2 to 3 s (60 ms stagger plus a 2 s color fade).
   On the 001 example the paper lede is complete 4 s after the `paper` cue, and by 5 s the 3D title is already leaving, so scan a one-second contact sheet around the candidate.
4. Check what overlaps: the glass object, the cursor trail and DOM copy share the frame; move t until the title is clear of the hero and the trail.
5. Address frames by cue label (`--cue paper --after 4` on the 001 example, whose cues are arrival, glass, paper, night, finale and end) so a retimed choreography keeps its posters.
6. OG images are seen at about 500 px wide in feeds: check the file at that size and keep the key shape in the central 80 percent (X and some apps crop the edges).
7. X headers are covered by the avatar at the lower left on desktop and cropped top and bottom on phones; keep the subject in the center-right and away from the bottom 150 px.

For compositions that exist only as stills (a title over a specific angle), add a labelled cue in the capture choreography rather than a separate code path, so the video and the still stay one source.

## Grain, color and format

- The starter sets `post.grainScale = 0.25` in capture mode; stills inherit it.
  For a print poster, consider a `?grain=` query read by the experience; do not edit the frame after rendering.
- The composite adds a 1/255 dither before output: gradients do not band in PNG, but JPEG at quality below 90 can band dark skies.
- Output is sRGB.
  Chromium screenshots are 8-bit RGB PNG (no alpha channel).
- Use PNG for masters and anything with text; use JPEG only when a platform caps file size.

## Transparency

Stills are opaque today, and the manifest says so (`mode: "RGB"`, `transparency: false`).
The renderer is created with `alpha: false`, the sky dome fills the background, the composite writes alpha 1 and the DOM body is black.
A real transparent render would need all of the following; never fake it with a painted checkerboard or a color key over bloom:

1. An engine option for `new WebGLRenderer( { alpha: true, premultipliedAlpha: true } )` and `renderer.setClearColor( color, 0 )` in capture.
2. The sky dome hidden and the scene target cleared to zero alpha.
3. `composite.frag` writing scene alpha, with bloom added as light (alpha raised by bloom luminance), and grain and dither applied only where alpha is above zero.
4. The AA pass preserving alpha (FXAA and SMAA in three.js compute on color; verify edges).
5. A transparent page: capture CSS that removes body and section backgrounds, `Emulation.setDefaultBackgroundColorOverride` with alpha 0, and a screenshot that omits the background.
6. Accepting that refraction samples the opaque scene, so glass over a transparent background refracts nothing.

Until that exists, deliver an opaque render plus a separately rendered subject on a flat background and let the designer mask it, and record that in the manifest `notes`.

## Manifest entry

`render-still.mjs` appends or replaces the entry for the file in `asset-manifest.json` (a JSON array, the lurk convention):

```json
{
  "file": "og.png", "width": 1200, "height": 630, "mode": "RGB", "transparency": false,
  "transparentPixels": 0, "partialAlphaPixels": 0, "opaquePixels": 756000,
  "bytes": 724763, "sha256": "ee0ad3f4...", "format": "png",
  "tool": "atelier skills/stills-and-posters/scripts/render-still.mjs (Playwright Chromium, CDP screenshot)",
  "source": { "url": "http://localhost:4173/?capture=1&w=1200&h=630&dpr=1", "t": 6, "frame": 180, "fps": 30 },
  "capture": { "cssWidth": 1200, "cssHeight": 630, "dpr": 1, "tier": 3, "renderer": "ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro...)" },
  "renderedAt": "2026-09-22T19:52:46.438Z", "consoleErrors": []
}
```

- `mode` and the pixel counts come from decoding the file, not from the request, so a fake transparency cannot pass.
- `source.url` plus `t` (or the cue) and the commit reproduce the file exactly on the same GPU and driver (`capture.renderer`); record the commit in the work folder README.
- Add `notes` by hand for anything a future user must know (crop-safe areas, "subject masked by hand"); re-rendering the same file keeps them.
- Keep the manifest next to the files it describes, inside `work/NNN-slug/`.

## Key art beyond the GPU limit

Direct renders work up to the GPU's maximum render size (the script reads `MAX_TEXTURE_SIZE`, `MAX_RENDERBUFFER_SIZE` and `MAX_VIEWPORT_DIMS`; 7680 x 4320 rendered directly on an M3 Pro).
Above that, tiling is optional and needs engine work; see [references/key-art.md](references/key-art.md).

## Checklist

- [ ] Rendered from a production build with zero console errors.
- [ ] Output dimensions match the placement exactly; OG under 5 MB.
- [ ] Viewed at full size and at feed size (about 500 px wide); text clear of the hero, trail and crop zones.
- [ ] Frame chosen at a hold and addressed by cue label where possible.
- [ ] `asset-manifest.json` entry present with sha256, source url and time; transparency stated truthfully.
- [ ] For the site: `og:image`, `og:image:width`, `og:image:height` and `twitter:image` point at the exported file with an absolute URL.

## Files

- [scripts/render-still.mjs](scripts/render-still.mjs): deterministic still plus manifest entry (needs the atelier checkout for Playwright).
- [references/key-art.md](references/key-art.md): resolution limits, tiling design, print notes.
- Video from the same timeline: [../deterministic-render/SKILL.md](../deterministic-render/SKILL.md).
