# Choreography for teasers

Patterns for scripting cues, camera moves and the cursor for a 20 to 30 s teaser, rendered with `scripts/render-video.mjs`.
Everything here runs on the stage clock, so the live page, the video and every still agree.

## Frame math first

Pick the duration and fps before writing cues, and put every beat on a whole frame.

| Duration | fps | Frames | Note |
|---|---|---|---|
| 24.7 s | 30 | 741 | Length of the $LOAN launch clip on X. |
| 24 s | 30 | 720 | 48 beats at 120 BPM (0.5 s per beat, 15 frames). |
| 16 s | 30 | 480 | The starter's capture choreography. |

The stage steps at 60 Hz, so a 30 fps frame is exactly two steps; cue times on a 1/30 s grid land exactly on a frame.
If the piece has music, choose the BPM first and express cue times in beats (`at: beat( 12 )` with `const beat = ( n ) => n * 60 / bpm`).

## Beat sheet: a 24.7 s launch teaser

Modeled on the structure of the $LOAN launch post (a capture of the site's own scenes), mapped onto the four beats every atelier teaser has.
The starter has three sections (intro, glass, outro); a project with more sections gives each extra one a flythrough slot of about 3 s.

| Time | Beat | Picture | Mechanics |
|---|---|---|---|
| 0.0 to 3.5 | Logo reveal | Canvas fades in from black (1 s), wordmark spins in, props pop, snow drifts | `splash` cue at 0 (capture hides the loader); bitmap title reveal and props are section tweens; pointer rests near center |
| 3.5 to 6.0 | Hold and breathe | Slow push-in on the wordmark, cursor trail sweeps once | Camera rig push-in; pointer path sweeps left to right |
| 6.0 to 7.4 | Flythrough | Camera travels between sets, sky crossfades | `scroller.move( 1, 1.4 )` |
| 7.4 to 14.0 | Section beat(s) | Each section's signature, one idea each | One `move` per section, about 1.2 s travel and 2 s or more hold |
| 14.0 to 19.0 | Hero glass moment | Glass object fills the frame, rainbow dispersion, trail drawn through the refraction | Rig push-in plus slow orbit, pointer circles the object, bloom lift |
| 19.0 to 20.4 | Flythrough | Into the finale set | `scroller.move( last, 1.4 )` |
| 20.4 to 24.7 | Finale CTA | Rainbow payoff, CTA reveal, hold at least 1.5 s | Section enter tweens, bloom 1.6, pointer settles, optional fade at the end |

House rules of thumb: one idea per beat, travel shorter than holds, and the finale holds long enough to read the CTA twice.

## Cue list

```ts
const beat = ( n: number ) => ( n * 60 ) / 120; // 120 BPM
const cues: Cue[] = [
	{ at: 0, label: 'logo', run: () => splash() },
	{ at: 3.5, label: 'push-in', run: () => rig.to( 0.8, 0, 2.5 ) },
	{ at: 6.0, label: 'fly-glass', run: () => { rig.to( 0, 0, 1.4 ); void scroller.move( 1, 1.4 ); } },
	{ at: 14.0, label: 'glass-hero', run: ( s ) => { rig.to( 1.4, 0.35, 4.5 ); post.apply( s.animator, { bloom: 0.6 }, 1.2 ); } },
	{ at: beat( 38 ), label: 'fly-finale', run: () => { rig.to( 0, 0, 1.4 ); void scroller.move( 2, 1.4 ); } },
	{ at: 20.4, label: 'cta', run: () => html.classList.add( 'is-cta' ) },
	{ at: 24.2, label: 'fade', run: ( s ) => post.apply( s.animator, { exposure: 0 }, 0.5 ) },
	{ at: 24.7, label: 'end', run: () => undefined },
];
stage.add( new Choreography( cues, pointerPath, setPointer ) );
```

- Label every cue; `window.__atelier.cues()` lists them, and `render-still.mjs --cue glass-hero --after 1.5` renders a poster from one.
- A cue runs once per timeline; after `stage.reset()` it runs again, so cues must not accumulate state outside systems that reset.
- `SectionDirector` applies each section's `post` look over 1 s when the section changes; a post push in a cue must fire after that change or the director overwrites it.
- DOM beats are class changes in cues plus CSS transitions; `lockDocumentAnimations` puts them on the stage clock.
  Never start a JS animation library from a cue.
- End the list with a labelled no-op at the duration so `Choreography.duration` equals the video length.

## Camera rig on top of the section track

`SectionTrack` owns the camera each step (position, look-at, FOV, parallax, shake).
For teaser moves (push-in, orbit, crane), add a rig system after the track that applies offsets as pure functions of time since its cue:

```ts
import { Easings, type StageSystem } from '@atelier/stage';
import { type PerspectiveCamera, Vector3 } from 'three';

/** Additive camera offsets (dolly along the view, orbit around the up axis) eased between targets. */
function createRig( camera: PerspectiveCamera, pivot = new Vector3() ) {

	const from = { depth: 0, orbit: 0 }, to = { depth: 0, orbit: 0 }, now = { depth: 0, orbit: 0 };
	let start = 0, duration = 1, t = 0;
	const fwd = new Vector3();
	const system: StageSystem & { to( depth: number, orbit: number, seconds: number ): void } = {
		to( depth, orbit, seconds ) {

			Object.assign( from, now ); // continue from wherever the last move is, so nothing pops
			Object.assign( to, { depth, orbit } );
			start = t;
			duration = Math.max( seconds, 1e-3 );

		},
		update( dt ) {

			t += dt;
			const k = Easings.easeInOutCubic( Math.min( 1, ( t - start ) / duration ) );
			now.depth = from.depth + ( to.depth - from.depth ) * k;
			now.orbit = from.orbit + ( to.orbit - from.orbit ) * k;
			if ( now.orbit ) camera.position.sub( pivot ).applyAxisAngle( camera.up, now.orbit ).add( pivot );
			if ( now.orbit ) camera.lookAt( pivot );
			camera.getWorldDirection( fwd );
			camera.position.addScaledVector( fwd, now.depth );

		},
		reset() {

			Object.assign( from, { depth: 0, orbit: 0 } );
			Object.assign( to, from );
			Object.assign( now, from );
			start = 0;
			t = 0;

		},
	};
	return system;

}

const rig = createRig( camera, GLASS_ORIGIN );
stage.add( track );
stage.add( rig ); // after the track: systems update in the order they were added
```

- Keep the rig additive: it never stores the camera pose, so the track stays authoritative and seeking back to 0 is exact.
- Return the rig to zero (`rig.to( 0, 0, travel )`) in the same cue that starts a flythrough, so offsets never leak into the next set.
- The orbit pivot is the hero's world position (the starter's glass section sits at `( 0, -24, 0 )`).
- Use `track.shake( amount, duration )` for impacts (it is skipped for reduced motion live, and deterministic in capture).
- Change FOV in the rig only for deliberate zooms; `SectionTrack` already widens FOV by `portraitWeight` for vertical cuts.
- For a portrait-only adjustment, scale rig offsets by `stage.viewport.portraitWeight`.

## Scripted pointer

The pointer drives cursor parallax and the trail; in capture it is a pure function of time.
Compose it from eased keyframes so beats can place the cursor exactly:

```ts
type Key = [ t: number, x: number, y: number ];
const keys: Key[] = [ [ 0, 0, 0 ], [ 3.5, - 0.6, 0.2 ], [ 6, 0.7, - 0.1 ], [ 14, - 0.4, 0.4 ], [ 19, 0.5, - 0.3 ], [ 22, 0, 0.1 ] ];
const pointerPath = ( t: number ): [ number, number ] => {

	let i = 0;
	while ( i < keys.length - 2 && t > keys[ i + 1 ][ 0 ] ) i ++;
	const [ t0, x0, y0 ] = keys[ i ], [ t1, x1, y1 ] = keys[ i + 1 ];
	const k = Easings.easeInOutCubic( Math.min( 1, Math.max( 0, ( t - t0 ) / ( t1 - t0 ) ) ) );
	const wob = Math.sin( t * 1.3 ) * 0.04; // a little life between keys
	return [ x0 + ( x1 - x0 ) * k + wob, y0 + ( y1 - y0 ) * k + wob * 0.6 ];

};
```

- Stay within about 0.7 of NDC so the trail head never leaves the frame.
- For the hero glass beat, circle the object (`[ cx + r * cos( w * t ), cy + r * sin( w * t ) ]`) so the trail is refracted through it.
- The trail follows the pointer with lag; move the pointer about 0.3 s before the moment it should arrive.
- Keep the trail in view space during camera travel: add a system after the track that calls `trail.shift( delta )` with the camera's per-step movement, otherwise a flythrough stretches the trail across the frame (see `examples/001-atelier-study/src/experience.ts`).
- On light or paper sets, tween the trail's `ink` uniform to 1 (dark line instead of glow) in the section change, and back to 0 on dark sets.

## Review loop

1. Render with `--review 1` while blocking: one PNG per second in `artifacts/renders/<name>-frames/` and a `<name>-review.jpg` contact sheet beside the MP4.
2. Fix timing by moving cue times on the frame grid; re-render.
   Renders refuse to overwrite, so version the file names (`teaser-v02.mp4`).
3. For single frames, render stills at cue labels with `skills/stills-and-posters/scripts/render-still.mjs`; they are pixel-identical to the video frame at the same time, `--w`, `--h` and `--dpr`.
4. When the cut is locked, render the vertical and square versions from the same cue list and review them as separate films.
