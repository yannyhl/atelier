---
name: deterministic-render
description: Turn any @atelier/stage scene into frame-exact, repeatable video. Covers the seek(t) contract (fixed-step clock, stage.rng, stage.scheduler, no Math.random, setTimeout or performance.now in render paths), capture mode via ?capture=1&w&h&dpr, Choreography cues and scripted pointer, lockDocumentAnimations and CDP freezing for DOM overlays, grainScale, scripts/render-video.mjs flags, X/Twitter delivery presets for 1920x1080, 1080x1920 and 1080x1080, audio muxing with ffmpeg and ffprobe verification. Use when someone asks for a teaser, launch video, trailer, screen-recording-free capture, vertical cut, MP4 for X or Twitter, a clip like the $LOAN launch post, or says frames differ between renders.
---

# Deterministic render

Video in atelier is rendered, never screen-recorded: the page runs in capture mode, a script calls `window.__atelier.seek( t )` for every frame, and ffmpeg encodes the screenshots.
Because every system advances on the fixed-step clock, two renders of the same commit produce identical frames, and a still at time t equals frame t of the video.

Measured on the starter (2026-09-22, Apple M3 Pro): 16 s at 1080p30 renders in about 57 s to about 8 MB with `post.grainScale = 0.25` (130 MB with full grain at crf 16), and `--verify` passes across two fresh page loads.

## The seek(t) contract

Everything that changes a rendered frame must be a function of the stage clock.

| Do | Never in a render path |
|---|---|
| Advance in `update( dt, stage )`; `dt` is always `stage.clock.step` (1/60 s by default) | Read `performance.now()`, `Date.now()` or the rAF timestamp |
| Read time from `stage.time.value` (share `stage.time` as a `uTime` uniform) | Keep your own wall-clock accumulator |
| Randomize with `stage.rng()`, `stage.rng.range()`, `stage.rng.pick()` | Call `Math.random()` |
| Delay with `stage.scheduler.after( s, fn )` or `animator.animate( ..., { delay } )` | Use `setTimeout`, `setInterval` or `await` on real time |
| Tween with `stage.animator` | Run a CSS or JS animation library on its own clock |
| Implement `reset()` on every system with state | Leave state that survives `stage.reset()` |

`seek( t )` resets when t is before the current time, then runs whole steps until t and draws once.
Boot code may yield with `setTimeout` (the starter's `yieldToMain`) because it runs before the first frame; grep the render code before every render:

```bash
grep -rnE "Math\.random|setTimeout|setInterval|performance\.now|Date\.now|requestAnimationFrame" src/
```

Every hit outside boot and live-input code is a determinism bug.

## Capture mode wiring

The same page serves live and video; `readCaptureParams()` reads `?capture=1&w=1920&h=1080&dpr=1`.

```ts
const capture = readCaptureParams();
const stage = new Stage( { canvas, capture, seed: 7 } ); // capture: no rAF loop, tier 3, preserveDrawingBuffer

if ( capture ) {
	html.classList.add( 'is-capture' );           // hides the loader: frame 0 starts on the first set
	post.grainScale = 0.25;                       // grain is incompressible noise for encoders
	const lock = lockDocumentAnimations( stage );  // DOM transitions follow the stage clock
	stage.add( new Choreography( cues, pointerPath, setPointer ) );
	stage.render = () => { lock.sync(); post.render( scene, camera ); };
} else {
	bindScrollInput( scroller, { reducedMotion: stage.reducedMotion } );
	trackPointer( setPointer );
	stage.render = () => post.render( scene, camera );
}
// ...after warmup: stage.reset(); stage.seek( 0 ); stage.markReady();  (never stage.start() in capture)
```

- `Choreography( cues, pointer, onPointer )`: cues are `{ at, run( stage ), label }` and fire exactly once when the clock passes `at`, including during a fast-forward seek.
  Give every cue a `label`: `window.__atelier.cues()` lists `{ at, label }` from every system with a `cues()` method, and stills address frames by label.
- `html.is-capture` hides the loader, so the first frames show the canvas fading in from black over its 1 s opacity transition; plan the first beat around that fade.
- `pointer( t )` must be a pure function of t returning NDC `[ x, y ]`; it replaces live cursor input (parallax, trail).
- Effects gated on live input need a capture path: the starter creates `CursorTrail` when `finePointer || capture`.
- `stage.reducedMotion` is always false in capture, so reduced-motion branches never leak into video.

Scripting camera moves and beats for a 20 to 30 s teaser is in [references/choreography.md](references/choreography.md).

## DOM overlays

Captured frames include the DOM (titles, reveals, CTA, chrome), so CSS must be frame-exact too:

1. The renderer freezes the document timeline over CDP (`Animation.enable`, then `Animation.setPlaybackRate` 0), so CSS never advances on wall-clock time.
2. `lockDocumentAnimations( stage ).sync()`, called in `stage.render`, flushes style, pauses each new animation and sets its `currentTime` from the stage clock since the frame it first appeared.
3. Consequence: an animation's start is quantized to the frame that first syncs it.
   Always walk forward frame by frame; a single `seek( 6 )` from 0 registers every transition at 6 s and shows them at their start (on the starter, a black frame, because the canvas fade-in only begins at 6 s).
4. Use CSS transitions and keyframes only; no JS animation libraries and no `transitionend` logic that changes what is drawn.

## Render

Serve a production build (`npx vite build && npx vite preview --port 4173 --strictPort`), then:

```bash
npm run render -- --url http://localhost:4173/ --out work/NNN-slug/teaser.mp4 --duration 24.7 --fps 30 --verify --review 2
```

| Flag | Default | Meaning |
|---|---|---|
| `--url` | `http://localhost:4173/` | Stage page; capture params are appended. |
| `--out` | required | `.mp4` path; refuses to overwrite, archive the old one first. Writes `<name>.json` metadata next to it. |
| `--duration` | 10 | Seconds; frames = round( duration x fps ). Pick durations that land on whole frames (24.7 x 30 = 741). |
| `--fps` | 30 | 30 for X; 60 only for very fast motion (doubles render time and size). |
| `--w` / `--h` | 1920 / 1080 | Output size in pixels. |
| `--dpr` | 1 | Device pixel ratio; the page is laid out at w/dpr x h/dpr CSS pixels. Use 3 for vertical cuts (360 x 640 CSS, the real phone layout). |
| `--crf` | 18 | x264 quality; 16 for a pristine master, 18 to 20 for direct upload. |
| `--review N` | off | Saves a PNG every N seconds to `artifacts/renders/<name>-frames/` (relative to the working directory; `npm run render` runs from the repo root) and writes `<name>-review.jpg` next to the MP4; look at every frame. |
| `--verify` | off | Renders four probe frames in two fresh page loads and fails on any hash difference. |

The encode is libx264 preset slow, yuv420p, BT.709 primaries, transfer and matrix (tagged with `setparams`, which ffmpeg 8 needs), limited range, `+faststart`, no audio.
`--verify` probes jump straight to their times, so they prove repeatability but are not the same pixels as the rendered frames (overlays start late there); for frame parity, compare a review PNG with a still from `skills/stills-and-posters` at the same time, `--w`, `--h` and `--dpr`: they match byte for byte.

## Deliver for X

Conservative presets that are safe for every account type (checked against docs.x.com media best practices, 2026-09-22):

| Preset | Size | Use |
|---|---|---|
| `x-landscape` | 1920 x 1080 | Default launch clip (the $LOAN post is 1920 x 1080, 24.7 s). |
| `x-vertical` | 1080 x 1920 | Mobile-first cut, fills the phone timeline. |
| `x-square` | 1080 x 1080 | Safe crop for quote posts and cross-posting. |

All: H.264 High, yuv420p, BT.709, progressive, square pixels, closed GOP (x264 default), 30 fps (60 max), moov atom first, 0.5 to 140 s, at most 512 MB, audio AAC-LC 128 kb/s or more, mono or stereo, 44.1 or 48 kHz.
X accepts longer and larger files for some accounts and via the web app, and the API lists a lower size cap (1280 x 1024) for API uploads; if posting through the API, render or scale to 1280 x 720.
X re-encodes every upload, so give it a clean master (crf 16 to 18) and keep grain low; heavy grain turns to mush after its encode.

Delivery steps:

```bash
# 1. Optional audio: trim to the video, fade out the last second, AAC-LC 192k 48 kHz
ffmpeg -i teaser.mp4 -i music.wav -map 0:v:0 -map 1:a:0 -c:v copy \
  -c:a aac -b:a 192k -ar 48000 -af "afade=t=in:d=0.05,afade=t=out:st=23.7:d=1" -t 24.7 -movflags +faststart teaser-x.mp4

# 2. Verify against the preset (prints JSON, exit 1 on any failed check)
node skills/deterministic-render/scripts/verify-video.mjs --file teaser-x.mp4 --preset x-landscape --duration 24.7 --fps 30 --audio aac
```

X autoplays muted and loops, so the picture must carry the story without sound; cut music to the beats in the cue list, not the other way round.
Only use music the project has a license for, and record its source and license in the work folder.

## Vertical and square cuts

The camera already adapts: `viewport.portraitWeight` goes from 0 at 16:9 to 1 at 1:2, `SectionTrack` adds `portraitFov` (default 30 degrees) by that weight, and sections blend props toward their portrait positions.
So a vertical cut is the same choreography rendered at a different size:

```bash
npm run render -- --url http://localhost:4173/ --out work/NNN-slug/teaser-vertical.mp4 --duration 24.7 --w 1080 --h 1920 --dpr 3 --review 2 --verify
```

With `--dpr 3` the page is laid out at 360 x 640 CSS pixels, so DOM type, the footer and breakpoints match a real phone while the output stays 1080 x 1920.
Review every frame sheet for the vertical cut separately: titles that fit 16:9 may wrap.
If a beat does not work in portrait, branch in the cue on `stage.viewport.portraitWeight` rather than keeping a second choreography file.

## Review before delivery

- [ ] `--verify` printed `determinism: PASS` and the render's `.json` lists zero console errors.
- [ ] The `<name>-review.jpg` contact sheet checked, and any doubtful frame opened at full size from `artifacts/renders/<name>-frames/`: no half-revealed text at a hold, no popping, no stretched trail, no banding in dark gradients.
- [ ] The opening fade from black reads as intentional, and the last beat holds at least 1.5 s before the loop.
- [ ] Commit the contact sheet, not the review PNGs (they stay in `artifacts/`).
- [ ] `verify-video.mjs` passes the delivery preset; file size and duration recorded.
- [ ] The MP4, its `.json`, the verify JSON and the cue list are in `work/NNN-slug/` with a catalog entry.

## Optional: titles and edits around the render

Only when a piece needs editorial titles, captions or cuts between several renders; the stage render stays the source of truth.

- HyperFrames (HeyGen, Apache-2.0, https://github.com/heygen-com/hyperframes): HTML compositions rendered to deterministic MP4.
  Place our MP4 as a `<video class="clip" data-start data-duration data-track-index>` and add titles as timed HTML clips, then `npx hyperframes render`.
  Fits our HTML-first habits and has no seat licensing.
- Remotion (https://www.remotion.dev): React compositions with `<OffthreadVideo>`.
  Free for individuals and companies of up to 3 employees; larger for-profit companies need a company license.

Either way, re-run `verify-video.mjs` on the final export, since these tools choose their own encoder settings.

## Files

- [scripts/verify-video.mjs](scripts/verify-video.mjs): ffprobe checks (codec, profile, pix_fmt, color tags, size, fps, duration, audio, faststart) with X presets; self-contained.
- [references/choreography.md](references/choreography.md): cue and camera patterns and a 24.7 s teaser beat sheet.
- Engine: `packages/stage/src/core/Stage.ts`, `core/Clock.ts`, `capture/Choreography.ts`, `dom/lockAnimations.ts`; renderer: `scripts/render-video.mjs`.
- Stills from the same timeline: [../stills-and-posters/SKILL.md](../stills-and-posters/SKILL.md).
