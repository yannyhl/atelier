# Verification

How to run each gate, what the scripts actually check, and what the agent must still check by eye.
Run everything against a production build (`npm run build -w examples/NNN-slug`, then `npm run preview -w examples/NNN-slug`).

## 1. `npm run check`

Runs, in order: `validate-skills.mjs` (skill format), `build-agents.mjs --check` (generated subagents current), `build-catalog.mjs --check` (`work/CATALOG.md` matches `work/catalog.json`), `typecheck` and `build` for every workspace, including `examples/*`.
A stale catalog fails it: run `npm run catalog` after every catalog edit.

## 2. Capture matrix

```sh
npm run capture -- --url http://localhost:4173/ --out artifacts/NNN-slug        # raw PNGs, gitignored
mkdir -p work/NNN-slug/captures && cp artifacts/NNN-slug/matrix.json work/NNN-slug/captures/
```

Options: `--viewports phone,laptop` to narrow a rerun, `--sections N` to override the count, `--settle 2600` milliseconds between moves.
For each of phone (390 x 844 at 3x, touch), tablet (768 x 1024 at 2x, touch), laptop (1440 x 900 at 2x) and desktop (2560 x 1440 at 1x) it makes three runs:
- `webgl`: waits for `window.__atelier.ready`, then one screenshot per section, advancing with ArrowDown (`<viewport>-sNN.png`).
- `reduced`: the same with `prefers-reduced-motion: reduce` (`<viewport>-reduced-sNN.png`).
- `static`: `?static=1`, one full-page screenshot (`<viewport>-static.png`); `matrix.json` records whether `is-webgl` was (wrongly) set.
It exits 1 on any console error or warning; `matrix.json` holds the errors, tier and draw calls per run.

The script cannot judge pictures.
Open every raw PNG in `artifacts/NNN-slug/` (not just the contact sheets) and check:

| Look for | In |
|---|---|
| Text clipped, overlapping chrome, or under the footer or ring button | every run |
| Heading and lede legible against the sky (contrast), CTA fully visible | every section |
| Hero framed as the storyboard's portrait framing says (`portraitFov`, `portraitOffset`); nothing fitted with `visibleSizeAt` running off screen | phone, tablet |
| Banding in skies and bloom halos, blocky bloom, aliasing on thin geometry | desktop 1x, laptop 2x |
| Post look matches the storyboard (arrival light, glass dark, finale bright) | webgl runs |
| Reduced-motion frames show a settled state, not mid-transition | reduced runs |
| Static page complete: every section's copy, backgrounds echoing the skies, no empty canvas area | static runs |
| Timeline dots and scroll ring in the right state for the section | webgl runs |

Fix every defect, including ones that predate this work, and rerun the affected viewports.
Note what was fixed in the work README.

Commit the evidence as JPEG contact sheets (each under 500 KB) plus `matrix.json`; the PNGs stay in `artifacts/`:

```sh
for v in phone tablet laptop desktop; do
  node scripts/contact-sheet.mjs --out work/NNN-slug/captures/$v.jpg --cols 5 artifacts/NNN-slug/$v-s[0-9]*.png
done
node scripts/contact-sheet.mjs --out work/NNN-slug/captures/static-and-reduced.jpg --cols 4 artifacts/NNN-slug/*-static.png artifacts/NNN-slug/*-reduced-s00.png
```

`--width` (default 2400) and `--cols` set the layout; tiles take the first image's aspect.
`work/000-experience-starter/captures/` and `work/001-atelier-study/captures/` show the expected result.

## 3. Performance audit

```sh
npm run audit -- --url http://localhost:4173/ --out work/NNN-slug/perf.json
npm run audit -- --url http://localhost:4173/ --out work/NNN-slug/perf.json --budgets work/NNN-slug/budgets.json
```

Profiles from `scripts/budgets.json`: `desktop` (laptop viewport, no throttle, frame p95 17.5 ms, tier 2 or better), `laptop-4x` (4x CPU throttle, 34 ms, tier 1 or better), `phone-6x` (phone viewport, 6x throttle, 34 ms, tier 1 or better).
Page budgets for every profile: FCP 1,500 ms (scaled by half the throttle factor), CLS 0.02, total transfer 3,000 KB, JS 260 KB, no long task over 200 ms, no console errors.
CPU throttling does not slow the GPU, so a pass on a fast Mac is optimistic: say so in the README and confirm on a real low-end phone before Published.
A project may tighten budgets with its own `budgets.json` (same shape); never loosen them without a decision.

## 4. Assets

When GLBs ship, run blender-gltf-stage's gate and keep its report:

```sh
node skills/blender-gltf-stage/scripts/check-glb.mjs --must <must files> --sub <sub files> --out work/NNN-slug/assets.json
```

## 5. Video

```sh
npm run render -- --url http://localhost:4173/ --out work/NNN-slug/renders/teaser-v1.mp4 --duration 16 --verify --review 2
npm run render -- --url http://localhost:4173/ --out work/NNN-slug/renders/teaser-vertical-v1.mp4 --duration 16 --w 1080 --h 1920 --verify --review 2
```

`--verify` renders four probe frames in two fresh page loads and fails unless every hash matches.
`--review 2` saves a PNG every 2 s into `artifacts/renders/teaser-v1-frames/` and a `teaser-v1-review.jpg` sheet beside the MP4; look at each for legibility, safe areas on the vertical cut, and dead air longer than a second.
Commit the review sheet; the frame PNGs stay in `artifacts/` (gitignored).
The `.json` next to the MP4 records size, fps, codec, CRF, sha256 and console errors; keep it with the video.
Existing MP4s are never overwritten; bump the version.

## 6. Evidence in the README

Every gate row in the README names its evidence file (`captures/matrix.json` and contact sheets, `perf.json`, `assets.json`, `renders/*.json` and `renders/*-review.jpg`) and the date it ran.
A decision moves to Verified locally only when all its rows pass.
