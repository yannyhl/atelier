// Crowd velocity kernel for three's GPUComputationRenderer (see Crowd.ts).
//
// Adapted from next.junni.co.jp src/ts/MainScene/World/Sections/Section4/Peoples/shaders/computeVelocity.glsl
// Copyright 2022 Junni Co., ltd. Released under the MIT License (see THIRD_PARTY_NOTICES.md).
// Changes: 4D simplex flow replaced by the 3D atSnoise from GLSL.common (time in the third axis),
// avoid circles packed into vec4 uniforms, the hard-coded drift correction became `uCenter`,
// the text-switch shock wave became `uPulse`, and the step is scaled by uDelta for other clock rates.
// GPUComputationRenderer injects `resolution`, `texturePosition` and `textureVelocity`.
// Velocity is in world units per 60 Hz step, like the reference (0.02 = 1.2 units per second).

#define linearstep( a, b, x ) clamp( ( ( x ) - ( a ) ) / ( ( b ) - ( a ) ), 0.0, 1.0 )

uniform float uTime;
uniform float uDelta;
uniform float uSpeed;
uniform float uPulse;
uniform vec2 uCenter;
uniform vec3 uCursor;
#if AVOID_COUNT > 0
uniform vec4 uAvoid[ AVOID_COUNT ];
#endif

void main() {

	vec2 uv = gl_FragCoord.xy / resolution.xy;
	vec3 pos = texture2D( texturePosition, uv ).xyz;
	vec3 vel = texture2D( textureVelocity, uv ).xyz;

	// Wander: a slowly breathing simplex flow field, offset per row so neighbours disagree a little.
	float scale = 0.7 + sin( uTime ) * 0.1;
	vec3 p = scale * pos;
	p.z += uv.y * 100.0;
	vel.xz += vec2(
		atSnoise( vec3( p.xz, 7.225 + uTime * 0.5 ) ),
		atSnoise( vec3( p.xz + 31.7, 3.553 + uTime * 0.5 ) )
	) * uDelta * 2.0;

	// Avoid circles (props, the hero): push out along the offset, ellipse-scaled.
	#if AVOID_COUNT > 0
	for ( int i = 0; i < AVOID_COUNT; i ++ ) {

		vec2 d = ( pos.xz - uAvoid[ i ].xy ) / uAvoid[ i ].zw;
		vel.xz += smoothstep( 0.5, 0.4, length( d ) + uv.y * 0.05 ) * d;

	}
	#endif

	// Weak pull toward the center so the crowd does not wander off stage.
	vec2 g = uCenter - pos.xz;
	vel.xz += g * length( g ) * 0.00003;

	// Constant walking speed; only the heading changes.
	vel.xz = normalize( vel.xz + vec2( 1e-6, 0.0 ) ) * uSpeed;

	// Pulse: a ring that travels outward as uPulse goes 0 -> 1, knocking agents up and out.
	float wave = smoothstep( 0.9, 1.0, sin( linearstep( 0.0, 1.0, - length( pos.xz ) * 0.1 + uPulse * 3.0 ) * AT_PI - uv.x ) );
	wave *= 0.8 + max( 0.0, 1.0 - length( pos.xz ) * 0.1 ) * 0.5;
	vel += normalize( pos + vec3( 0.0, 1e-4, 0.0 ) ) * 0.08 * wave;

	// Gravity while airborne.
	if ( pos.y <= 0.0 ) vel.y = 0.0;
	else vel.y -= uDelta;
	vel.y += wave * 0.05;

	// Cursor repulsion within 2 units.
	vec2 dc = pos.xz - uCursor.xz;
	vel.xz += smoothstep( 2.0, 0.0, length( dc ) ) * dc * 0.1;

	gl_FragColor = vec4( vel, 1.0 );

}
