---
name: perf-tiering
description: Make an @atelier/stage WebGL experience fast on every device and prove it. Covers quality tiers (PROFILES and what each knob costs), probeTier heuristics and the ?tier=N override, FrameMonitor hysteresis, DPR caps, pausing hidden or offscreen canvases, static-first pre-paint for zero CLS, the lazy experience chunk, must and sub asset budgets, effectScale, draw-call and triangle budgets, reduced motion and context-loss fallback, plus the audit workflow with scripts/audit-perf.mjs and per-project budgets.json. Use when someone says the site is slow, janky, drops frames, heats the phone, has layout shift, or asks to audit performance, set budgets, add a quality tier or check low-end Android and iPhone before shipping.
---

# Perf tiering

Performance is a feature of the house style: the reference site ships about 11.6 MB and blocks first render on a 3.3 MB glTF, the atelier starter ships 221 KB and paints static HTML first.
This skill keeps it that way: every visual decision has a tier, every tier has a cost, and nothing is called done until a production build meets its budgets on a throttled run and on real phones.

Numbers measured on the starter (`templates/experience-starter`, vite production build, 2026-09-22): 221 KB total transfer, 189 KB JS, CLS 0, FCP 92 to 204 ms, 13 to 26 draw calls, at most about 24k triangles, all budgets met at 1x, 4x and 6x CPU throttle.

## The tier table

`PROFILES` in `packages/stage/src/quality/tiers.ts` is the single source of truth; systems read `stage.profile` and react in `setProfile( profile )`.

| Knob | Tier 1 | Tier 2 | Tier 3 | What it costs |
|---|---|---|---|---|
| `dprCap` | 1 | 1.5 | 2 | Fill rate scales with pixels: DPR 2 is 4x the fragments of DPR 1. The biggest single lever. |
| `bloomMips` | 4 | 6 | 7 | One down and one up full-screen pass per level (each half the previous size). |
| `bloomScale` | 0.5 | 0.5 | 1 | Size of the first bloom level; 1 means the chain starts at half resolution instead of quarter. |
| `aa` | fxaa | fxaa | smaa | FXAA is one pass; SMAA is three (edges, weights, blend) plus lookup textures. |
| `halfFloat` | false | true | true | Half-float scene targets double bandwidth but remove bloom banding. |
| `shadows` / `shadowMapSize` | off / 512 | on / 1024 | on / 2048 | One extra depth render of every caster; a 2048 map is 16 MB of memory. |
| `effectScale` | 0.35 | 0.7 | 1 | Multiplier for particle, crowd and trail counts. |
| `refractionTaps` | 4 | 8 | 16 | Texture fetches per glass fragment; below tier 3 the opaque copy is also half resolution. |

Tier 0 is not a quality level: it means "keep the static page" and the stage emits `fallback`.
Capture mode always renders tier 3 unless `new Stage( { tier } )` pins another.

Degrade in this order when a scene is too heavy: DPR, bloom mips, AA, shadows and AO, effect counts, refraction taps.
Never degrade the art direction itself (palette, camera, composition); a tier-1 frame must still look like the same film.

## Wire every heavy system to the tier

```ts
const count = Math.round( 900 * Math.max( stage.profile.effectScale, 0.2 ) ); // floor so tier 1 is not empty
const snow = createParticles( { count, rng: stage.rng, time: stage.time, visibility, size: [ 14, 9, 8 ] } );

stage.add( {
	setProfile( p ) {
		glass.defines.REFRACT_TAPS = Math.max( 1, p.refractionTaps );
		glass.needsUpdate = true;
	},
} );
```

- Resize-dependent systems implement `resize( viewport )`; `stage.setTier` re-applies size and calls every `setProfile`.
- `PostFX.setProfile` rebuilds its targets on a tier change, so share `post.sceneSize` and `post.opaqueTexture` objects instead of copying values.
- Counts that are baked into geometry at construction (particles) do not change live; choose them from the probed tier at boot and accept that a later downgrade keeps them.
- Gate whole effects by tier where the cost is structural: the starter only creates `CursorTrail` at tier 2 or above and only for fine pointers.

## How the starting tier is chosen

`probeTier( gl )` runs once in the `Stage` constructor:

1. `?tier=0..3` in the URL wins (audits and bug reports use it).
2. No WebGL context gives 0.
3. Start at 2; WebGL1 only, a software renderer (SwiftShader, llvmpipe) or a low-end GPU string (Mali-4xx/T, Mali-G31/51/52/57, Adreno 3xx to 53x, PowerVR, SGX) gives 1.
4. A high-end GPU string (Apple M, NVIDIA, Radeon RX/Pro, Arc, Adreno 7xx/8xx, Mali-G7xx, Immortalis) on a non-mobile device gives 3.
5. `navigator.deviceMemory <= 2` or Save-Data caps at 1; mobile (coarse pointer and short screen side under 820 px) caps at 2.

Read the result live with `window.__atelier.stats().probe` (`tier`, `renderer`, `reasons`, `mobile`).
The probe is only a starting point; the frame monitor corrects it.

## Runtime adaptation (FrameMonitor)

`FrameMonitor` samples real frame times in windows of 90 frames after a 2 s warmup (1 s after each change) and compares the window p90 with a 60 fps budget of 16.7 ms:

- p90 above 22.5 ms (1.35x) in two consecutive windows steps down one tier, unless the window is steady (p90 minus p50 under 1.5 ms).
- p90 below 12.5 ms (0.75x) in five consecutive windows steps up one tier, at most once per session.
- Anything in between resets both counters, so quality never oscillates.

The steady rule exists for refresh caps: iOS Low Power Mode and some Android battery savers run `requestAnimationFrame` at 30 Hz, a flat 33.3 ms that lowering quality cannot improve, so the monitor holds.
The flip side: a device that is overloaded yet locked to a flat half rate is held too, so the probe and the audit must catch it, not the monitor.
Runtime adaptation never goes below tier 1; tier 0 (the static page) is decided at boot only.
Adaptation is off in capture mode, when `new Stage( { tier } )` pins a tier, and when `?tier=N` forces one (`probe.forced`), so audits and bug reports see exactly the tier they asked for.

## Resolution and idle cost

- DPR is `min( devicePixelRatio, profile.dprCap )`; never read `devicePixelRatio` directly in a system, use `stage.viewport.dpr`.
- `PostFX` render targets follow `profile.renderScale` (1 on every tier today); lower it before touching DPR if a project is fill-rate bound on desktop.
- The stage pauses when `document.visibilityState` is hidden or an `IntersectionObserver` says the canvas is offscreen, and resumes with a fresh delta (no catch-up burst; `Clock.maxDelta` also caps any stall at 0.1 s).
- Call `stage.stop()` when an experience is closed and `stage.dispose()` when it leaves the page.

## Static first, zero layout shift

1. The HTML is a complete, readable document without JavaScript or WebGL.
2. An inline script in `<head>` adds `is-webgl` to `<html>` before first paint when WebGL2 exists and `?static` is absent; CSS switches to the stage layout from that class, so the upgrade shifts nothing.
3. `src/main.ts` dynamic-imports `./experience` only when `is-webgl` is set, so three.js and the engine never block first paint.
4. Boot yields to the main thread between phases and warms shaders with `renderer.compileAsync` before `is-ready`, so no task exceeds 200 ms.
5. Any failure (import error, `fallback` event for no WebGL, tier 0 at boot or context loss) removes `is-webgl`, `is-ready` and `is-splashed`, calls `clearSectionDom()` (clears `inert`, `data-visible` and `data-state` so every section is readable and reachable) and disposes the stage.
   Reveal styles only hide text under `.is-webgl`, so the fallback page shows all copy.

Copy the pattern from `templates/experience-starter/index.html` and `src/main.ts` rather than rewriting it.
Test the fallback three ways: `?static`, `?tier=0`, and a forced context loss in the console: `window.__atelier.stage.renderer.getContext().getExtension( 'WEBGL_lose_context' ).loseContext()`.

## Asset budgets

- `AssetLoader` has two priorities: `must` blocks the first frame, `sub` streams afterwards.
  Keep `must` to what the first section shows.
- Ship glTF through `gltf-transform optimize` (meshopt geometry, KTX2 textures: UASTC for normals, ETC1S for color).
- Per-project targets (see [references/budget-rationale.md](references/budget-rationale.md)): `must` under 1 MB, each section's `sub` under 1.5 MB, textures at most 2048 px on the long side (1024 for anything below the fold of the story), total transfer under the 3000 KB budget.
- Never embed large PNGs inside a glTF; the reference did (a 1 MB roughness map inside the blocking file).
- Self-host only the font subsets you use; the reference loaded eight families and used six.

## Draw calls and triangles

`window.__atelier.stats()` reports the last frame's `calls`, `triangles`, `textures`, `geometries` and `programs`; calls include the post chain, so they rise with the tier.
Measure every section at every tier with the bundled script:

```bash
node skills/perf-tiering/scripts/scene-stats.mjs --url http://localhost:4173/ --tiers 1,2,3 --viewport phone \
  --max-calls 60 --max-triangles 300000 --out work/NNN-slug/scene-stats.json
```

It exits 1 when a limit is exceeded, the page falls back, the stage is not on the pinned tier or the console shows errors (including failed requests).
Starter baseline (laptop viewport): tier 1 13 to 17 calls, tier 2 18 to 22, tier 3 22 to 26; the glass section peaks at about 22k triangles (one 260 x 40 torus knot).
Merge static meshes, instance repeated props (`InstancedMesh`), share materials, and use one `Points` object per particle field to keep calls flat as scenes grow.

## Reduced motion

`stage.reducedMotion` is true when the visitor prefers reduced motion (never in capture):

- Pass it to `bindScrollInput( scroller, { reducedMotion } )`: wheel inertia becomes discrete steps and moves shorten to 0.35 s.
- `SectionTrack` removes cursor parallax and camera shake automatically.
- In your own systems, drop continuous camera drift, fast spins and flashes, and keep content reveals short; the page must still tell the whole story.

`npm run capture` includes a reduced-motion run; inspect its screenshots like the others.

## Audit workflow

1. Build and serve production: `cd templates/experience-starter && npx vite build && npx vite preview --port 4173 --strictPort` (or the project's equivalent).
   Never audit the dev server: unbundled modules and HMR inflate every number.
2. Run the audit: `npm run audit -- --url http://localhost:4173/ --out work/NNN-slug/perf.json`.
3. For project budgets, copy `scripts/budgets.json` to `work/NNN-slug/budgets.json`, tighten it, and pass `--budgets work/NNN-slug/budgets.json`.
   The file replaces the defaults entirely (no merge), so keep every key.
4. Run `scene-stats.mjs` for calls and triangles per tier, then `npm run capture -- --url http://localhost:4173/ --out work/NNN-slug/captures` and look at every image.
5. Confirm on real hardware.
   CPU throttling in Chromium does not throttle the GPU, so a fast laptop's GPU-bound numbers are optimistic.
   Android: enable USB debugging, open `chrome://inspect` on the desktop, inspect the tab, and record a Performance trace; iPhone: enable Web Inspector in Settings, Safari, Advanced, then use Safari's Develop menu on a Mac.
   On each device paste the frame sampler from [references/budget-rationale.md](references/budget-rationale.md) into the console and record p50, p95, tier and renderer in `perf.json` notes.
6. Record the result in the work folder; a failing budget is a bug, not a note.

## Checklist before calling it done

- [ ] Production build audited; `perf.json` saved and all budgets met (default or project file).
- [ ] `scene-stats.json` saved; calls and triangles within the project's limits on every tier.
- [ ] Tested on a real low-end Android (Mali-G52 class or older) and a real iPhone, including Low Power Mode (the tier must hold, not drop).
- [ ] `?static`, `?tier=0` and a forced context loss all leave a complete, readable page (every section's copy visible, nothing `inert`).
- [ ] Reduced-motion capture reviewed; no parallax, shake or long inertia.
- [ ] Hidden tab and scrolled-away canvas stop rendering (check the Performance panel shows idle).
- [ ] Every new heavy system reads `stage.profile` (`effectScale`, taps, shadows) and implements `setProfile` when it can change live.
- [ ] `must` assets only cover the first section; textures are KTX2, meshes meshopt.
- [ ] Zero console errors and failed requests at every tier and viewport (the scripts record HTTP 400 and above as errors).

## Files

- [scripts/scene-stats.mjs](scripts/scene-stats.mjs): per-tier, per-section draw calls, triangles, textures and programs with limits.
- [references/budget-rationale.md](references/budget-rationale.md): why each budget number is what it is, per-asset guidance and the on-device frame sampler.
- Engine: `packages/stage/src/quality/tiers.ts`, `quality/FrameMonitor.ts`, `core/Stage.ts`; audit: `scripts/audit-perf.mjs`, `scripts/budgets.json`.
