# Shader state patterns

GLSL recipes for motion driven by Animator uniforms.
Every snippet compiles in WebGL2 with `GLSL.common` prepended (checked in headless Chrome), and uses three.js `ShaderMaterial` built-ins (`position`, `uv`, `projectionMatrix`, `modelViewMatrix`, `instanceMatrix` on an `InstancedMesh`).

```ts
import { ShaderMaterial } from 'three';
import { GLSL } from '@atelier/stage/effects';

const material = new ShaderMaterial( {
	uniforms: { uState: director.uniformsOf( 'glass' ).state, uTime: stage.time },
	vertexShader: GLSL.common + vertexSource,
	fragmentShader: fragmentSource,
} );
```

## 1. Section state: symmetric enter and exit

`uState` is 0 (ready), 1 (viewing) or 2 (passed), tweened for 1 s with `easeOutCubic` by the director.
A single expression that is linear in `uState` gives a matched pair: the object arrives from one side and leaves to the other, and scrolling back reverses it naturally.
The reference used exactly these two for its section 2 title (`rotate( ( 1.0 - uSectionViewing ) * 5.0 )`) and flexible panels.

```glsl
uniform float uState; // director.uniformsOf( name ).state: 0 ready, 1 viewing, 2 passed
varying vec2 vUv;
void main() {
	vec3 p = position;
	// One linear expression gives a symmetric pair: spin in from one side, keep spinning out the other.
	p.yz = atRotate( ( 1.0 - uState ) * 5.0 ) * p.yz;
	// Slide in from the left while arriving, out to the right while passing.
	p.xy -= ( uState - 1.0 ) * vec2( 3.0, 0.6 );
	// Different motion per phase: split the state.
	float enter = clamp( uState, 0.0, 1.0 );
	float exit = clamp( uState - 1.0, 0.0, 1.0 );
	p *= atEaseOutCubic( enter ) * ( 1.0 - exit * exit );
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
}
```

Use `enter` and `exit` separately when the exit should look different from a reversed entrance (scale in, dissolve out).
Use the linear forms when the move should read as travel through the set.

## 2. Never play backwards: the `mod( v, 2 )` counter

The reference's section 1 lines grow when shown and retract from the other end when hidden, and never run an animation in reverse, even when the user flicks back and forth mid-transition.
The trick is a counter that only increases: odd values mean shown, even mean hidden, and the shader reads `mod( v, 2.0 )`.

```ts
/** Next counter value: odd = shown, even = hidden. Always ahead of the current value. */
export function nextPhase( current: number, show: boolean ): number {

	const f = Math.ceil( current );
	return show ? ( f % 2 === 1 ? f : f + 1 ) : ( f % 2 === 0 ? f : f + 1 );

}

const phase = stage.animator.add( 'lines.phase', 0 );
const setLines = ( visible: boolean ) => void stage.animator.animate( 'lines.phase', nextPhase( phase.value, visible ), 1 );
// SectionDef: enter() { setLines( true ); }, leave() { setLines( false ); }
```

```glsl
uniform float uPhase; // counter: 0 -> 1 grows, 1 -> 2 retracts, 2 -> 3 grows again ...
uniform float uLength; // line length along +y, pivot at the foot
void main() {
	vec3 p = position;
	float v = mod( uPhase, 2.0 );
	if ( v <= 1.0 ) {
		p.y *= v; // grow from the foot
	} else {
		p.y -= uLength;
		p.y *= 2.0 - v; // retract toward the tip
		p.y += uLength;
	}
	gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
}
```

Behaviour worth knowing:
- Hiding while still growing (phase 0.4, target 2) finishes the growth and then retracts in the same tween, so motion stays continuous.
- `stage.reset()` returns the counter to 0; a counter that has reached a few hundred is still exact in float32.
- Set `uLength` per mesh from its bounding box, as the reference did (`Box3().setFromObject( mesh ).getSize()` with rotation zeroed).

## 3. Re-armed 0 to 1 to 2 reveal

Simpler than the counter when the entrance may restart from nothing: tween to 1 on enter and to 2 on leave, and snap back to 0 before entering again.

```ts
enter() {

	if ( reveal.value >= 1.5 ) a.set( 'intro.title', 0 );
	void a.animate( 'intro.title', 1, 1.6, { delay: 0.2 } );

},
leave() {

	void a.animate( 'intro.title', 2, 0.9 );

},
```

`BitmapText` and the section template in `scroll-stage` use this form.
Its weak spot: entering while the exit is still running jumps to 0; use the counter when that matters.

## 4. Staggered pop-in with overshoot

One uniform drives any number of instances; `aIndex` is a per-instance attribute (0..count-1).

```glsl
attribute float aIndex; // 0..count-1 per instance
uniform float uReveal; // 0 hidden, 1 shown, 2 dismissed (one Animator value, linear easing)
uniform float uCount;
uniform float uTime;
varying float vAlpha;

void main() {
	float inT = atStagger( clamp( uReveal, 0.0, 1.0 ), aIndex, uCount, 1.4 );
	float outT = atStagger( clamp( uReveal - 1.0, 0.0, 1.0 ), aIndex, uCount, 1.4 );
	float scale = atEaseOutBack( inT ) * ( 1.0 - atEaseOutCubic( outT ) );
	vec3 p = position * max( scale, 0.0 );
	p.y += sin( inT * AT_PI ) * 0.3 + sin( outT * AT_PI ) * 0.3; // hop on the way in and out
	p.xz = atRotate( ( 1.0 - inT + outT ) * AT_TPI ) * p.xz; // full turn in, another full turn out
	vAlpha = atEaseOutCubic( inT ) - atEaseOutCubic( outT );
	gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( p, 1.0 );
}
```

```ts
const count = 24;
const geometry = new BoxGeometry( 0.3, 0.3, 0.3 );
geometry.setAttribute( 'aIndex', new InstancedBufferAttribute( Float32Array.from( { length: count }, ( _, i ) => i ), 1 ) );
const reveal = stage.animator.add( 'props.reveal', 0, Easings.linear );
```

### Stagger math

`atStagger( v, index, count, spread ) = clamp( v * ( 1 + spread ) - index / count * spread, 0, 1 )`.
For a group tween of `D` seconds:

| Quantity | Formula |
|---|---|
| Each item's duration | `D / ( 1 + spread )` |
| Gap between item starts | `D * spread / ( count * ( 1 + spread ) )` |
| Spread for item duration `d` and gap `g` | `spread = g * count / d` |
| Group duration for `d` and `g` | `D = d + g * count` |

Example: 12 props, each popping for 0.5 s, 0.15 s apart (the DNA's prop timing): `spread = 0.15 * 12 / 0.5 = 3.6`, `D = 0.5 + 1.8 = 2.3` s.
`spread = 0` moves everything together; order by any attribute (distance from center, angle, random seed) instead of `aIndex` for other sweeps.

`atEaseOutBack` uses the standard 1.70158 overshoot (peak 1.10).
For a different overshoot, copy it with your own constant and keep the `x * x * x` form: GLSL `pow` is undefined for negative bases.

## 5. Mixing one-hot looks

`director.looks` (or any `oneHot` Animator value) is a `float[]` uniform; weights sum to 1 during a cross-fade.

```glsl
#define LOOKS 3
uniform float uLooks[ LOOKS ]; // director.looks
uniform float uTime;
varying vec2 vUv;

vec3 lookDay( vec2 uv ) { return atIceGradient( uTime * 0.25 + uv.x * 2.0, uv.y ); }
vec3 lookGlass( vec2 uv ) { return vec3( 0.02, 0.03, 0.05 ) + vec3( 0.2, 0.4, 0.8 ) * exp( - abs( uv.y - 0.5 ) * 9.0 ); }
vec3 lookFinale( vec2 uv ) { return atHsv2rgb( vec3( fract( uv.x - uTime * 0.15 ), 0.75, 1.0 ) ); }

void main() {
	vec3 c = vec3( 0.0 );
	if ( uLooks[ 0 ] > 0.001 ) c += lookDay( vUv ) * uLooks[ 0 ];
	if ( uLooks[ 1 ] > 0.001 ) c += lookGlass( vUv ) * uLooks[ 1 ];
	if ( uLooks[ 2 ] > 0.001 ) c += lookFinale( vUv ) * uLooks[ 2 ];
	gl_FragColor = vec4( c, 1.0 );
}
```

Pass the count as a define (`defines: { LOOKS: director.defs.length }`) so the array size matches the director.
The branch per look is uniform across the draw, so it costs nothing on the GPU and skips the looks at weight 0.
Colors here are treated as linear; convert hex design tokens with `atSrgbToLinear` or on the CPU with `new Color( hex )`.

## 6. Portrait-aware placement on the GPU

```glsl
attribute float aIndex;
uniform float uPortrait; // viewport.portraitWeight: 0 landscape 16:9, 1 portrait 1:2
uniform float uCount;
void main() {
	float angle = aIndex / uCount * AT_TPI;
	float radius = mix( 2.6, 1.4, uPortrait );
	vec2 squash = mix( vec2( 1.0, 0.6 ), vec2( 0.6, 1.2 ), uPortrait ); // wide ellipse -> tall ellipse
	vec3 p = position + vec3( sin( angle ) * radius * squash.x, cos( angle ) * radius * squash.y, 0.0 );
	gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
}
```

Update `uPortrait.value` from a system's `resize( viewport )` and set `frustumCulled = false` on meshes whose vertices the shader moves far from the geometry bounds.

## 7. Hops, spins and wobble

- Hop once per state leg: `sin( fract( v ) * AT_PI )` peaks mid-transition and is 0 at every rest state (0, 1, 2); the reference bitmap font used `mod( v, 1.0 )` the same way.
- Full spin per leg: `atRotate( v * AT_TPI )` ends every leg facing forward.
- Idle wobble that respects capture: `sin( uTime * speed + aIndex )` with `uTime` bound to `stage.time`, never a JS-side counter.
