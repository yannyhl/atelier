---
name: gpgpu-effects
description: Build the moving-crowd, trail and particle layer of the JUNNI / loanmeme DNA on @atelier/stage - the CursorTrail (CPU chain plus float DataTexture, fine-pointer desktop only, head unprojected at NDC depth 0.97, shift with the camera, ink per section), time-pure particles (snow, sparks) scaled by effectScale, SkyDome looks mixed by the director's one-hot weights, instanced matcap props with staggered easeOutBack pop-ins (CPU or a gl_InstanceID shader asset), and the 676-agent GPGPU crowd on three's GPUComputationRenderer (simplex flow, avoidance, cursor repulsion, walk-cycle sprites, half float fallback; tested asset, not in the engine). Use when someone says "cursor trail", "mouse trail", "snow", "sparks", "particles", "sky gradient per section", "props pop in", "stagger", "crowd", "people walking", "flocking", "GPGPU", "GPU simulation", or asks how many particles a phone can take.
---

# GPU-driven effects: trail, particles, sky, pop-ins and crowd

The reference fills its sets with motion that never touches the DOM: a rainbow cursor trail, snow and sparks, a per-section sky, props that pop in with an overshoot, and a crowd of 676 walking people.
atelier keeps every one of them deterministic, so `seek( t )` renders the same frame live and in video.
Four are engine features or engine patterns; the crowd is a tested recipe in this skill's assets.

## Pick the technique

| Effect | Where | Runs on | Deterministic because | Tier rule |
|---|---|---|---|---|
| Cursor trail | `CursorTrail` (`@atelier/stage/effects`) | CPU chain of 128 points, uploaded as a float `DataTexture` | advances only in `update( dt )` | fine pointer and tier 2+, always in capture |
| Snow, sparks | `createParticles` | vertex shader, pure function of time and seeds | positions are `f( stage.time, seed )` | count times `effectScale` |
| Sky looks | `createSkyDome` | fragment shader | weights are animator values | all tiers |
| Prop pop-ins | CPU matrices, or [assets/popin-instances.ts](assets/popin-instances.ts) | CPU or vertex shader | driven by one animator value | all tiers |
| Crowd | [assets/crowd/Crowd.ts](assets/crowd/Crowd.ts) | `GPUComputationRenderer` ping-pong textures | seeded start, compute only in `update( dt )`, `reset()` re-uploads | agents scale with `effectScale` |

Rule of thumb: if a system has fewer than a few hundred elements or depends on the previous frame in a simple way, keep it on the CPU (the trail); if it is a pure function of time, put it in a vertex shader (particles, pop-ins); only true feedback simulations at hundreds of agents earn GPGPU (the crowd).

## Cursor trail

```ts
import { Vector3, type PerspectiveCamera, type Scene } from 'three';
import { trackPointer, type Stage } from '@atelier/stage';
import { CursorTrail } from '@atelier/stage/effects';

export function addTrail( stage: Stage, scene: Scene, camera: PerspectiveCamera, capture: boolean ) {

	const finePointer = matchMedia( '(hover: hover) and (pointer: fine)' ).matches;
	if ( ! ( finePointer || capture ) || stage.profile.tier < 2 ) return null;
	const trail = new CursorTrail( { time: stage.time, ink: stage.animator.add( 'trail.ink', 0 ) } );
	scene.add( trail.mesh );
	stage.add( trail );

	// Keep the trail in view space while the camera travels between sets.
	const last = new Vector3();
	const delta = new Vector3();
	stage.add( {
		update: () => {

			if ( last.lengthSq() > 0 ) trail.shift( delta.subVectors( camera.position, last ) );
			last.copy( camera.position );

		},
		reset: () => last.set( 0, 0, 0 ),
	} );

	const at = new Vector3();
	trackPointer( ( x, y ) => trail.head.copy( at.set( x, y, 0.97 ).unproject( camera ) ) );
	return trail;

}
```

- Desktop only, like the reference (`window.isSP` skipped it): `trackPointer` ignores touch, and phones save the draw and the upload.
- The head sits at NDC depth 0.97, the reference value; NDC depth is non-linear, so with near 0.1 and far 220 that is about 6.5 units in front of the camera (`d = 2nf / ( ( f + n ) - z ( f - n ) )`); recompute if you change near or far.
- In capture mode, drive the head from `Choreography`'s scripted pointer instead of `trackPointer`.
- Each point eases toward its predecessor with `k = 1 - ( 1 - follow )^( dt * 60 )` (follow 0.55), and thickness is `sin( t * PI ) * radius` scaled by speed, so a still cursor draws nothing.
- `ink` 0 glows (rainbow at 1.6 linear, blooms on dark sets); `ink` 1 draws a near-black line for light or paper sets; tween it per section.
- Why not GPGPU (the reference used a 128 x 1 float texture pass): 128 points cost nothing on the CPU, need no float render targets, and stay exact under `seek`.
- Glass sets: swap in the refractive tube from [glass-refraction](../glass-refraction/SKILL.md).

## Particles

```ts
const snow = createParticles( {
	count: Math.round( 900 * Math.max( stage.profile.effectScale, 0.2 ) ),
	rng: stage.rng, time: stage.time, visibility,
	size: [ 14, 9, 8 ], speed: - 0.3, pointSize: 22,
} );
```

- `mode: 'snow'` falls at `speed` (negative is down), sways sideways and wraps inside the `size` box; `mode: 'sparks'` streams along +Z toward the camera (positive speed).
- Seeds come from `stage.rng` at construction: build systems in the same order on every boot or the seeds shift.
- They fade at the box edges and by the `visibility` tween; output is white, additive, linear.
- `pointSize` is in drawing-buffer pixels divided by view depth, so points look smaller on high-DPR screens; scale it by `stage.viewport.dpr` on resize if size matters.
- Counts: starter 900 snow and 1400 sparks at `effectScale` 1, floored at 0.2.

Details and more modes in [references/particles-and-sky.md](references/particles-and-sky.md).

## Sky dome

```ts
const sky = createSkyDome( bundles.map( ( b ) => b.sky ), director.looks, stage.time );
scene.add( sky );
stage.add( { update: () => sky.position.copy( camera.position ) } );
```

- One `SkyLook` per section: `top`, `bottom`, `accent` as sRGB hex, `style` 0 (vertical gradient), 1 (animated brand ice and lime gradient), 2 (horizon glow band).
- `director.looks` is a one-hot array tweened for 1 s on each snap, and the shader blends every look by its weight, so skies cross-fade on the GPU; `SectionDef.look` lets two sections share a look.
- Drawn at the far plane (`gl_Position.xyww`), back faces, no depth write, dithered against banding.
- Check a captured pixel against the token: a sky darker and more saturated than its hex means the color was converted twice (rules in [postfx-bloom-dirt](../postfx-bloom-dirt/SKILL.md)).

## Instanced props that pop in

The reference pops matcap props in with `easeOutBack`, staggered 0.15 s, and every appearance has an exit.
Two ways:

1. CPU, like the starter: each step compute `k = clamp( v * 1.5 - i * 0.15, 0, 1 )` per instance and write `easeOutBack( 1.6 )( k )` into its matrix scale; fine up to about a hundred instances.
2. GPU, time-pure: set the matrices once and let the vertex shader scale each instance.

```ts
import { InstancedMesh, MeshMatcapMaterial, SphereGeometry } from 'three';
import { Easings, type Stage } from '@atelier/stage';
import { createMatcap } from '@atelier/stage/effects';
import { addPopIn } from './popin-instances';

export function popProps( stage: Stage, count: number ) {

	const reveal = stage.animator.add( 'props.reveal', 0, Easings.linear );
	const material = addPopIn( new MeshMatcapMaterial( { matcap: createMatcap( '#d9ff6a', '#3f7d12' ) } ), { reveal, count, spread: 1.5 } );
	const props = new InstancedMesh( new SphereGeometry( 0.3, 32, 16 ), material, count );
	// setMatrixAt( i, ... ) once here; enter(): animate( 'props.reveal', 1, 2 ); leave(): animate( 'props.reveal', 0, 0.8 ).
	return props;

}
```

With `count` N, `spread` s and a reveal of D seconds, instance i starts at `i / N * s / ( 1 + s ) * D` and each pop lasts `D / ( 1 + s )`; for the reference 0.15 s step with 8 props and spread 1.5, use D = 2 s.
Tested in the harness: a 22-panel wall pops in left to right with the overshoot, zero CPU per frame.

## Crowd (recipe level, tested asset)

The reference section 4 fills a telephoto set with a 26 x 26 crowd simulated on the GPU: simplex flow wandering, avoidance circles around props, cursor repulsion, a shock ring on each text switch, and a 16 x 2 walk-cycle sprite atlas.
[assets/crowd/Crowd.ts](assets/crowd/Crowd.ts) rebuilds it on three's `GPUComputationRenderer` (present in three r186 at `three/addons/misc/GPUComputationRenderer.js`, with `setDataType`), with the compute shaders adapted from the MIT JUNNI source and a procedural walk atlas.
It is not in `@atelier/stage` yet; promote it when a second project needs it.

```ts
import { Easings, trackPointer, type Stage } from '@atelier/stage';
import type { PerspectiveCamera, Scene } from 'three';
import { Crowd } from './crowd/Crowd';

export function addCrowd( stage: Stage, scene: Scene, camera: PerspectiveCamera ) {

	const visibility = stage.animator.add( 'crowd.visibility', 0, Easings.linear );
	const style = stage.animator.add( 'crowd.style', [ 1, 0, 0, 0 ] );
	const pulse = stage.animator.add( 'crowd.pulse', 0, Easings.linear );
	const crowd = stage.add( new Crowd( { stage, visibility, style, pulse, avoid: [ { x: 0, z: 0, sx: 6, sz: 6 } ] } ) );
	scene.add( crowd.mesh );
	trackPointer( ( x, y ) => crowd.setPointer( x, y, camera ) );
	// enter(): animate( 'crowd.visibility', 1, 2 ); leave(): animate( 'crowd.visibility', 0, 1 ).
	return crowd;

}
```

- Agents: `side = round( 26 * sqrt( effectScale ) )`, so 676 at tier 3, 484 at tier 2 and 225 at tier 1; fixed at construction.
- Precision: float targets when `EXT_color_buffer_float` is available, half float otherwise (the reference forced half float on iOS by user agent; atelier checks the capability, never the user agent).
- Half float has 11 bits of mantissa: inside 16 units a 0.02 step rounds by at most 0.004, beyond 16 by up to 0.008, so keep crowds that must run on half float within about 16 units of their center (the reference spawn radius is 18).
- The simulation runs only while `visibility > 0`, two small passes per step; the draw is one instanced call.
- `style` switches shirt patterns (plain, dots, stripes, checks); `pulse` 0 to 1 sends a shock ring outward that knocks agents into the air.
- Seeking replays every compute step from 0; a 10 s seek is 600 steps of a 26 x 26 texture, which is fast, but the first seek also compiles the kernels.

Setup from a Blender set, tuning, cost and the shader walkthrough are in [references/crowd.md](references/crowd.md).

## Verify

1. `npm run capture`: trail absent on phone and tablet captures, present on laptop and desktop; particles, sky and props correct at all four sizes.
2. Scrub with `seek` forward and back: particles, pop-ins and the crowd must land on identical frames (compare two renders of the same time).
3. `?tier=1`: fewer particles and agents, still readable; no trail.
4. Check frame time with `npm run audit` on the crowd section at tier 2.

## References

- [references/cursor-trail.md](references/cursor-trail.md): chain math, depth 0.97, view-space shift, ink, capture.
- [references/particles-and-sky.md](references/particles-and-sky.md): particle shader, counts, sky styles and weights.
- [references/instanced-popins.md](references/instanced-popins.md): CPU and GPU pop-ins, exits, timing math.
- [references/crowd.md](references/crowd.md): the crowd recipe in depth.
- [assets/crowd/](assets/crowd/Crowd.ts): `Crowd.ts`, `crowd-velocity.glsl`, `crowd-position.glsl` (MIT, adapted), `walk-atlas.ts`.
- [assets/popin-instances.ts](assets/popin-instances.ts): the `gl_InstanceID` pop-in.
- Related: [perf-tiering](../perf-tiering/SKILL.md), [deterministic-render](../deterministic-render/SKILL.md), [uniform-animator](../uniform-animator/SKILL.md).
