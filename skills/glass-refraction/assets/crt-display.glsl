// CRT display content for glass-fronted screens (the reference section-3 "Displays").
//
// Adapted from next.junni.co.jp src/ts/MainScene/World/Sections/Section3/Displays/shaders/display.fs
// Copyright 2022 Junni Co., ltd. Released under the MIT License (see THIRD_PARTY_NOTICES.md).
//
// Changes from the original: the noise texture is replaced by atHash / value noise, the random
// `uRaymarchEffect` tween is a pure function of time (deterministic for capture), the per-panel
// flicker moved from the vertex shader to `atCrtState`, and everything is namespaced `atCrt*`.
// Requires GLSL.common first (atHash, atRotate, AT_PI). Outputs LINEAR color.

#ifndef AT_CRT
#define AT_CRT

float atCrtNoise1( float x ) {

	float i = floor( x );
	float f = fract( x );
	return mix( atHash( vec2( i, 0.37 ) ), atHash( vec2( i + 1.0, 0.37 ) ), f * f * ( 3.0 - 2.0 * f ) );

}

// Eased random steps: a new target every `period` seconds (reference: Math.random() every 0.8..1.8 s,
// cubicBezier(0, .85, .25, 1.01)). Pure function of time, so seek(t) reproduces it.
float atCrtEffect( float time, float seed, float period ) {

	float k = floor( time / period + seed );
	float f = fract( time / period + seed );
	float e = 1.0 - pow( 1.0 - f, 4.0 );
	return mix( atHash( vec2( k, seed ) ), atHash( vec2( k + 1.0, seed ) ), e );

}

// Per-panel signal state: x = noise burst brightness (0..0.9), y = inverted (0 or 1), z = glitch fade.
vec3 atCrtState( float time, float seed ) {

	float low = atCrtNoise1( time * 1.5 + seed * 17.0 );
	float high = atHash( vec2( floor( time * 60.0 ), seed ) );
	float low2 = atCrtNoise1( time * 0.9 + seed * 5.3 + 40.0 );
	// Reference thresholds were 0.55..0.65 on a texture noise; value noise is flatter, so bursts start later.
	float brightness = smoothstep( 0.64, 0.74, low + high * 0.08 ) * 0.9;
	float invert = step( 0.5, low2 + high * 0.08 );
	float fade = sin( brightness * AT_PI ) + sin( invert * AT_PI );
	return vec3( brightness, invert, fade );

}

float atCrtBox( vec3 p, vec3 b ) {

	vec3 q = abs( p ) - b;
	return length( max( q, 0.0 ) ) + min( max( q.x, max( q.y, q.z ) ), 0.0 );

}

float atCrtSmin( float a, float b, float k ) {

	float h = clamp( 0.5 + 0.5 * ( b - a ) / k, 0.0, 1.0 );
	return mix( b, a, h ) - k * h * ( 1.0 - h );

}

// Scene 1: an endless tunnel of spinning boxes.
float atCrtTunnelSdf( vec3 p, float time, float effect ) {

	p.xy *= atRotate( p.z * 0.05 + effect * 5.0 );
	vec3 q = mod( p, 4.0 ) - 2.0;
	q.yz *= atRotate( effect * 10.0 + time );
	q.xz *= atRotate( effect * 10.0 );
	vec3 size = vec3( 0.3, 0.3 + effect * 3.0, 0.3 ) * ( 1.0 - effect * 0.5 );
	return atCrtBox( q, size );

}

// Scene 2: five metaballs merged with a smooth minimum.
float atCrtBlobsSdf( vec3 p, float time ) {

	float d = length( p + vec3( sin( time ) * 0.1, cos( time ) * 0.1, 0.0 ) ) - 0.5;
	d = atCrtSmin( length( p + vec3( sin( time * 1.4 ) * 0.4, cos( time ) * 0.5, 0.0 ) ) - 0.3, d, 0.3 );
	d = atCrtSmin( length( p + vec3( sin( time * 3.0 ) * 0.7, cos( time * 0.8 ) * 0.7, 0.0 ) ) - 0.2, d, 0.3 );
	d = atCrtSmin( length( p + vec3( sin( time ), cos( time * 0.5 ), sin( time * 0.4 ) ) ) - 0.2, d, 0.3 );
	d = atCrtSmin( length( p + vec3( sin( time * 1.6 ), cos( time * 0.4 ), cos( time * 0.3 ) ) ) - 0.3, d, 0.3 );
	return d;

}

float atCrtSdf( vec3 p, float time, float effect, int scene ) {

	return scene == 1 ? atCrtTunnelSdf( p, time, effect ) : atCrtBlobsSdf( p, time );

}

// Raymarch one of the two scenes into a grayscale or normal-colored image (40 steps, like the reference).
vec3 atCrtRaymarch( vec2 uv, float time, float effect, int scene, vec2 jitter, float invert ) {

	vec2 pos = uv * 2.0 - 1.0;
	pos.x += jitter.y * 2.0;
	float fov = sin( 50.0 );
	vec3 ray = normalize( vec3( fov * pos.x, fov * pos.y, - 1.0 ) );
	vec3 cPos;

	if ( scene == 1 ) {

		cPos = vec3( cos( time * 0.5 ), sin( time ) * 1.2, - time * 10.0 - jitter.y * 3.0 );

	} else {

		cPos = vec3( 0.0, 0.0, 5.0 );
		mat2 rot = atRotate( time );
		cPos.xz *= rot;
		ray.xz *= rot;

	}

	float len = 0.0;
	vec3 p = cPos;
	for ( int i = 0; i < 40; i ++ ) {

		float d = atCrtSdf( p, time, effect, scene );
		len += d;
		p = cPos + ray * len;
		if ( abs( d ) <= 0.01 ) {

			const float e = 0.001;
			vec3 n = normalize( vec3(
				atCrtSdf( p + vec3( e, 0.0, 0.0 ), time, effect, scene ) - atCrtSdf( p - vec3( e, 0.0, 0.0 ), time, effect, scene ),
				atCrtSdf( p + vec3( 0.0, e, 0.0 ), time, effect, scene ) - atCrtSdf( p - vec3( 0.0, e, 0.0 ), time, effect, scene ),
				atCrtSdf( p + vec3( 0.0, 0.0, e ), time, effect, scene ) - atCrtSdf( p - vec3( 0.0, 0.0, e ), time, effect, scene ) ) );
			float diff = clamp( dot( vec3( 0.5 ), n ), 0.1, 1.0 );
			return mix( vec3( diff ), n * 0.5 + 0.5, invert * 0.9 );

		}

	}

	return vec3( invert );

}

// The CRT signal on top of any content: noise bursts, 80 Hz flicker, inversion, rolling scanlines, edge falloff.
vec3 atCrtSignal( vec3 color, vec2 uv, float time, vec3 state ) {

	vec3 noiseColor = vec3( atHash( uv * 997.0 + fract( time ) * 91.0 ) * 0.7 );
	noiseColor += step( 0.0, sin( time * 3.0 - uv.y ) * sin( time * 3.0 - uv.y * 8.0 ) ) * 0.1;
	float burst = smoothstep( 0.0, 0.01, - atCrtNoise1( uv.y * 40.0 + time * 300.0 ) + state.x * 1.2 );
	color = mix( color, noiseColor, burst );
	color *= step( 0.0, sin( uv.y * 5.0 - time * 80.0 ) ) * 0.05 + 0.95;
	color = mix( color, 1.0 - color, state.y );
	color *= 0.78 - sin( uv.y * 200.0 - time * 10.0 ) * 0.02;
	color *= smoothstep( 1.0, 0.3, length( uv - 0.5 ) );
	return color;

}

// Chromatic tear offset for image content: per-scanline jitter scaled by the glitch fade.
vec2 atCrtTear( vec2 uv, float time, float fade ) {

	vec2 n = vec2( atHash( vec2( floor( uv.y * 90.0 ), floor( time * 30.0 ) ) ), atHash( vec2( floor( uv.y * 45.0 ), floor( time * 30.0 ) + 7.0 ) ) ) - 0.5;
	return n * 0.5 * fade * 0.2;

}

#endif
