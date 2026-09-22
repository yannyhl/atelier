# Section module template

One file per section under `src/sections/`, returning the starter's `SectionBundle` from `src/sections/types.ts`:

```ts
export interface SectionContext { stage: Stage; scene: Scene; camera: PerspectiveCamera; post: PostFX }
export interface SectionBundle { def: SectionDef; sky: SkyLook; root: Object3D; setProfile?( profile: QualityProfile ): void }
```

The section owns its objects, tweens and shot; `experience.ts` owns the order, the director and the camera.
The template below typechecks against `@atelier/stage` and was rendered in the starter.

## Checklist for a new section

1. Pick a `NAME`; use it for `def.name`, the HTML `data-section` and `id`, and every animator key (`<name>.reveal`).
2. Pick an `ORIGIN` far from other sets (the starter steps 24 units on y) and off the straight line between neighbouring shots.
3. Add the real content to `index.html` in reading order, with a heading and `aria-labelledby`.
4. Add the bundle to the `bundles` array in `experience.ts` in the same order as the HTML.
5. Give it a `sky` look, `post` params from the section look table in `dna/junni-loanmeme/STYLE-SPEC.md`, and a `shot`.
6. Make everything that appears also leave: tween to 2 in `leave()`, never just hide.
7. Scale counts by `profile.effectScale` in `setProfile`.

## Template: procedural set

```ts
import { BoxGeometry, Color, Group, InstancedBufferAttribute, InstancedMesh, ShaderMaterial, Vector2, Vector3 } from 'three';
import { Easings, type Tween } from '@atelier/stage';
import { GLSL } from '@atelier/stage/effects';
import type { SectionBundle, SectionContext } from './types';

/** Also the DOM `data-section`, the section `id` and the deep-link hash. */
const NAME = 'bars';
/** Where this set lives in the shared world. Keep sets far apart (the starter steps 24 units on y). */
const ORIGIN = new Vector3( 0, - 72, 0 );
const MAX_BARS = 48;

/**
 * Bars: a ring of thin bars that grow in with a stagger, retract toward their tips on exit,
 * and lean with the section state (-1 ready, 0 viewing, +1 passed).
 */
export function createBars( { stage }: SectionContext ): SectionBundle {

	const root = new Group();
	root.position.copy( ORIGIN );
	const a = stage.animator;

	// The director's own lifecycle tween: Animator.add returns the existing track for a known name,
	// and SectionDirector names its tracks `section.<name>.state` (0 ready, 1 viewing, 2 passed).
	const state: Tween<number> = a.add( `section.${NAME}.state`, 0, Easings.easeOutCubic );
	// Section-local reveal: 0 hidden, 1 shown, 2 dismissed. Linear, because the shader eases per bar.
	const reveal = a.add( `${NAME}.reveal`, 0, Easings.linear );
	const portrait = { value: stage.viewport.portraitWeight };
	const count = { value: MAX_BARS };

	// Pivot at the foot so scaling y grows the bar upward.
	const geometry = new BoxGeometry( 0.05, 1, 0.05 ).translate( 0, 0.5, 0 );
	geometry.setAttribute( 'aIndex', new InstancedBufferAttribute( Float32Array.from( { length: MAX_BARS }, ( _, i ) => i ), 1 ) );

	const material = new ShaderMaterial( {
		uniforms: {
			uState: state,
			uReveal: reveal,
			uTime: stage.time,
			uPortrait: portrait,
			uCount: count,
			uColor: { value: new Color( '#b7f516' ) },
		},
		vertexShader: GLSL.common + /* glsl */`
			attribute float aIndex;
			uniform float uState;
			uniform float uReveal;
			uniform float uTime;
			uniform float uPortrait;
			uniform float uCount;
			varying float vShade;
			void main() {
				float inT = atStagger( clamp( uReveal, 0.0, 1.0 ), aIndex, uCount, 1.5 );
				float outT = atStagger( clamp( uReveal - 1.0, 0.0, 1.0 ), aIndex, uCount, 1.5 );
				vec3 p = position;
				p.y *= atEaseOutCubic( inT ) * ( 1.2 + 0.4 * sin( uTime * 1.3 + aIndex ) );
				p.y = mix( p.y, 1.6, atEaseOutCubic( outT ) ); // retract toward the tip, not back to the foot
				p.yz = atRotate( ( uState - 1.0 ) * 0.6 ) * p.yz; // lean in from below, out above
				float angle = aIndex / uCount * AT_TPI;
				float radius = mix( 2.6, 1.4, uPortrait ); // narrower ring on tall screens
				p += vec3( sin( angle ) * radius, - 0.8, cos( angle ) * radius );
				vShade = 0.55 + 0.45 * aIndex / uCount;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
			}
		`,
		fragmentShader: /* glsl */`
			uniform vec3 uColor;
			varying float vShade;
			void main() {
				gl_FragColor = vec4( uColor * vShade, 1.0 );
			}
		`,
	} );

	const bars = new InstancedMesh( geometry, material, MAX_BARS );
	bars.frustumCulled = false; // positions come from the shader, so the geometry bounds are wrong
	root.add( bars );

	return {
		root,
		sky: { top: '#0b1a12', bottom: '#010302', accent: '#b7f516', style: 2 },
		setProfile( profile ) {

			bars.count = Math.max( 12, Math.round( MAX_BARS * profile.effectScale ) );
			count.value = bars.count;

		},
		def: {
			name: NAME,
			label: 'Bars',
			root,
			post: { bloom: 0.5, vignette: 1.2, grain: 0.04 },
			shot: {
				position: ORIGIN.clone().add( new Vector3( 0, 1.2, 7 ) ),
				target: ORIGIN.clone(),
				fov: 40,
				portraitFov: 24,
				parallax: new Vector2( 0.15, 0.08 ),
			},
			enter() {

				if ( reveal.value >= 1.5 ) a.set( `${NAME}.reveal`, 0 );
				void a.animate( `${NAME}.reveal`, 1, 1.4, { delay: 0.2 } );

			},
			leave() {

				void a.animate( `${NAME}.reveal`, 2, 0.8 );

			},
			update( _dt, st ) {

				portrait.value = st.viewport.portraitWeight;
				bars.rotation.y = st.time.value * 0.1;

			},
		},
	};

}
```

Notes on the choices:
- `section.<name>.state` is read through `Animator.add` because section modules are built before the director exists.
  If you prefer not to rely on the director's key naming, leave `uState` as `{ value: 0 }` and after constructing the director assign `material.uniforms.uState = director.uniformsOf( NAME ).state`.
- The reveal re-arms with `a.set( ..., 0 )` when it sits at 2, so coming back to the section plays the entrance again instead of the exit backwards.
- The shader places instances itself, so `frustumCulled = false` is required; otherwise three culls against the tiny unit box.
- `portraitWeight` is copied into a uniform in `update`; it only changes on resize, and copying a number each step is free.
- For sets that need reframing on phones, add `portraitOffset: new Vector3( x, y, z )` to the shot: camera position and target shift together by it at full `portraitWeight`.
- Colors typed as hex go through `new Color( hex )`, which converts sRGB to the linear working space the post chain expects.

## Variant: a set authored in Blender

Load the section's glTF with `AssetLoader` (see `blender-gltf-stage`), then read the shot from its named empties:

```ts
import { Vector2, Vector3 } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { shotFromScene } from '@atelier/stage';
import type { SectionBundle, SectionContext } from './types';

const ORIGIN = new Vector3( 0, - 96, 0 );

export function createStudio( { stage }: SectionContext, gltf: GLTF ): SectionBundle {

	const root = gltf.scene;
	root.position.copy( ORIGIN ); // before shotFromScene: it reads world transforms
	const shot = { ...shotFromScene( root ), portraitFov: 20, parallax: new Vector2( 0.05, 0.05 ) };
	const a = stage.animator;
	a.add( 'studio.reveal', 0 );

	return {
		root,
		sky: { top: '#000000', bottom: '#000000', accent: '#ffffff', style: 0 },
		def: {
			name: 'studio',
			label: 'Studio',
			root,
			shot,
			post: { bloom: 1, vignette: 1 },
			enter: () => void a.animate( 'studio.reveal', 1, 1.2 ),
			leave: () => void a.animate( 'studio.reveal', 2, 0.6 ),
		},
	};

}
```

Blender naming contract: an object named `Camera` (the camera or its parent empty), an empty named `CameraTarget`, and optionally an empty named `Anchor` for the hero pose.
`shotFromScene` warns and falls back to a camera at `(0, 0, 5)` with FOV 40 when `Camera` is missing, and aims at the origin when `CameraTarget` is missing; both usually mean a renamed node or empties pruned by `gltf-transform` (keep them with `--no-prune` or by keeping nodes).

## Wiring the new section

```ts
const bundles = [ intro, createGlass( ctx ), createBars( ctx ), createOutro( ctx ) ];
```

```html
<section class="section section--bars" data-section="bars" id="bars" aria-labelledby="bars-title">
	<h2 class="section__title" id="bars-title">Bars</h2>
	<p class="section__lede" data-reveal><span data-reveal-line>Forty-eight lines that know when to leave.</span></p>
</section>
```

Give `.section--bars` a static-mode background in CSS that matches the sky look, so the fallback page reads as the same design.
