# Budget rationale

Why each number in `scripts/budgets.json` is what it is, plus the house guidance for budgets the audit does not enforce yet.
Tighten numbers per project in `work/NNN-slug/budgets.json`; loosen them only with a written decision in that work folder.

## Profiles

The audit runs each profile in a fresh browser context, loads the page, walks every section with the keyboard and samples `requestAnimationFrame` intervals.

| Profile | Viewport | CPU throttle | frameP95Ms | tierMin |
|---|---|---|---|---|
| `desktop` | laptop 1440 x 900 at DPR 2 | 1x | 17.5 | 2 |
| `laptop-4x` | laptop | 4x | 34 | 1 |
| `phone-6x` | phone 390 x 844 at DPR 3, touch | 6x | 34 | 1 |

### frameP95Ms 17.5 (desktop)

One 60 Hz frame is 16.7 ms.
The extra 0.8 ms absorbs timer jitter in the rAF interval itself, so a page that never misses a vsync passes and a page that misses one frame in twenty fails.
p95 rather than p99 because a short audit run has a few hundred frames and p99 would be decided by two or three samples (garbage collection, shader warmup of a late section).

### frameP95Ms 34 (throttled)

34 ms is two vsyncs: the throttled profiles stand in for a mid-range phone and must hold at least 30 fps at p95.
It is deliberately looser than the runtime monitor, which steps down when an unsteady p90 exceeds 22.5 ms: the audit proves the floor, the monitor protects the experience above it.

### tierMin 2 (desktop), 1 (throttled)

A laptop that ends the run below tier 2 means the frame monitor stepped down on hardware that should carry the full look; that is a scene cost problem, not a device problem.
Throttled runs may settle on tier 1; tier 0 can only come from the boot probe (no usable WebGL), and a static page on a mid-range device is a failure, not graceful degradation.

### The throttling caveat

`Emulation.setCPUThrottlingRate` slows JavaScript and layout only.
The GPU runs at full speed, so fill-rate and shader costs (DPR, bloom, refraction taps) look free on a fast laptop.
That is why real-device checks are mandatory (see the sampler below).

## Page budgets

### fcpMs 1500

web.dev rates FCP under 1.8 s as good; static-first gives us the full document at first paint, so we aim well below it.
The audit scales it by `max( 1, throttle / 2 )`: 1.5 s at 1x, 3 s at 4x, 4.5 s at 6x.
The starter measures 92 to 204 ms locally; a real network adds latency the local preview does not have, which is the margin this budget keeps.

### cls 0.02

The house target is exactly 0: the pre-paint class switch means the WebGL upgrade moves nothing.
0.02 tolerates sub-pixel font-swap noise; anything above it is a real shift (usually a late `is-webgl` class, an image without dimensions or a font without `size-adjust`).
web.dev's "good" threshold is 0.1, so we sit five times inside it.

### totalTransferKB 3000

About a quarter of the reference's 11.6 MB.
3 MB is one optimized hero glTF (meshopt plus KTX2), a few section scenes, fonts and the JS chunk; on a typical 4G link of 10 to 20 Mb/s it streams in two to three seconds, most of it after first paint because only `must` assets block.
The starter uses 221 KB, so a project has about 2.8 MB for its own assets.

### jsTransferKB 260

three.js core is about 160 KB brotli; `@atelier/stage` and a project's own code add 30 to 60 KB.
The starter ships 189 KB, which leaves about 70 KB for project code and one or two addons.
The reference shipped 292 KB compressed (1.2 MB raw) served `no-cache`; we ship hashed, immutable chunks and stay under it.
If a project needs physics (cannon-es) or a heavy addon, load it lazily with the section that uses it instead of raising the budget.

### longTasksOver200ms 0

200 ms is the INP "good" threshold; a single task longer than that during boot means a tap in that window feels broken.
Boot yields to the main thread between phases and compiles shaders with `compileAsync`; keep it that way when adding sections.

## Budgets the audit does not enforce (use scene-stats)

| Measure | Tier 1 | Tier 3 | Why |
|---|---|---|---|
| Draw calls per frame | 40 | 60 | Each WebGL call costs tens of microseconds of CPU on low-end phones; 40 calls keeps submission under 2 ms there. The starter uses 13 to 26 including post. |
| Triangles per frame | 100k | 300k | Mali-G52 class GPUs sustain roughly 100k triangles at 60 fps alongside a full-screen post chain; desktop has headroom. |
| Shader programs | 30 | 30 | Every program is a compile stall the first time it draws; warm them with `compileAsync` and keep variants few. |
| Textures in memory | 24 | 40 | Mostly a memory bound on iOS, where the tab is killed around 1 to 1.5 GB of GPU memory. |

Pass the project's numbers to `scene-stats.mjs` with `--max-calls` and `--max-triangles`.

## Per-asset guidance

| Asset | Target | Reason |
|---|---|---|
| `must` group | under 1 MB | Blocks the first WebGL frame; the loader should not be visible for more than a moment. |
| Each section's `sub` group | under 1.5 MB | Streams while the visitor reads the first section. |
| Texture long side | 2048 (hero), 1024 (props, below the fold) | KTX2 ETC1S at 2048 is about 0.5 to 1 MB; GPU memory is what matters on phones. |
| Skinned character | under 15k triangles, under 30 joints | The reference character was 11.3k triangles and 13 joints. |
| Fonts | two families, Latin subsets, woff2 | The reference loaded eight families (two unused). |

## On-device frame sampler

Paste into the remote console (chrome://inspect for Android, Safari Web Inspector for iPhone) after the loader is gone, then scroll through the sections while it runs:

```js
( () => {
	const f = [];
	let last = performance.now();
	const tick = ( now ) => {
		f.push( now - last );
		last = now;
		if ( f.length < 600 ) return requestAnimationFrame( tick );
		f.sort( ( a, b ) => a - b );
		const s = window.__atelier?.stats();
		console.log( { p50: f[ 300 ].toFixed( 1 ), p95: f[ 570 ].toFixed( 1 ), tier: s?.tier, renderer: s?.probe.renderer, calls: s?.calls } );
	};
	requestAnimationFrame( tick );
} )();
```

This is a diagnostic in the console, not code for the page: render paths never read `performance.now()`.
Record the result for each device in the work folder's `perf.json` notes.
