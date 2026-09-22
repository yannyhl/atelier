// Studio shadow and self AO for @atelier/stage Character (tier-3 option; see StudioShadow.ts).
//
// The rotated spiral sample disk in atStudioShadowAt is adapted from next.junni.co.jp
// src/ts/MainScene/World/Baku/shaders/baku.fs (initPoissonDisk / shadowMapPCF)
// Copyright 2022 Junni Co., ltd. Released under the MIT License (see THIRD_PARTY_NOTICES.md).
// Changes: depth comes from a DepthTexture instead of RGBA-packed depth, the disk rotation is a
// screen-space hash without time (stable frames for capture), softness is in shadow-map texels.
// The AO term is original: 12 golden-angle taps against a view-depth pass of the character.
// Requires GLSL.common first (atHash, AT_TPI).

#ifndef AT_STUDIO_SHADOW
#define AT_STUDIO_SHADOW

#ifndef STUDIO_SHADOW_SAMPLES
#define STUDIO_SHADOW_SAMPLES 12
#endif

uniform float uStudioEnabled;
uniform sampler2D uShadowMap;
uniform vec2 uShadowTexel;
uniform float uShadowSoftness;
uniform float uShadowBias;
uniform float uShadowStrength;

// Shadow visibility (1 lit, 0 shadowed) for a point already in shadow texture space (xy uv, z depth).
float atStudioShadowAt( vec3 sc ) {

	if ( sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0 ) return 1.0;

	float r = 0.1;
	float rStep = ( 1.0 - r ) / float( STUDIO_SHADOW_SAMPLES );
	float ang = atHash( gl_FragCoord.xy * 0.01 ) * AT_TPI;
	float angStep = AT_TPI * 11.0 / float( STUDIO_SHADOW_SAMPLES );
	float lit = 0.0;

	for ( int i = 0; i < STUDIO_SHADOW_SAMPLES; i ++ ) {

		vec2 offset = vec2( sin( ang ), cos( ang ) ) * pow( r, 0.75 ) * uShadowTexel * uShadowSoftness;
		float d = texture2D( uShadowMap, sc.xy + offset ).r;
		lit += sc.z - uShadowBias <= d ? 1.0 : 0.0;
		r += rStep;
		ang += angStep;

	}

	return lit / float( STUDIO_SHADOW_SAMPLES );

}

#ifdef STUDIO_CHARACTER

uniform mat4 uShadowFromView;
uniform float uShadowNormalBias;
uniform sampler2D uAoDepth;
uniform mat4 uAoProjection;
uniform float uAoNear;
uniform float uAoFar;
uniform float uAoRadius;
uniform float uAoStrength;

vec3 atStudioViewPos( vec2 uv ) {

	float z = texture2D( uAoDepth, uv ).r * 2.0 - 1.0;
	float viewZ = - 2.0 * uAoNear * uAoFar / ( ( uAoFar + uAoNear ) - z * ( uAoFar - uAoNear ) );
	vec2 ndc = uv * 2.0 - 1.0;
	return vec3( ndc.x * - viewZ / uAoProjection[ 0 ][ 0 ], ndc.y * - viewZ / uAoProjection[ 1 ][ 1 ], viewZ );

}

// Screen-space crease occlusion of the character against itself (normal-aware, range-checked).
float atStudioAO( vec3 viewPos, vec3 viewNormal, vec2 screenUv ) {

	float z = max( - viewPos.z, 1e-3 );
	vec2 radiusUv = vec2( uAoProjection[ 0 ][ 0 ], uAoProjection[ 1 ][ 1 ] ) * uAoRadius / z * 0.5;
	float ang = atHash( gl_FragCoord.xy ) * AT_TPI;
	float occ = 0.0;

	for ( int i = 0; i < 12; i ++ ) {

		float t = ( float( i ) + 0.5 ) / 12.0;
		float a = ang + float( i ) * 2.39996323;
		vec3 q = atStudioViewPos( screenUv + vec2( cos( a ), sin( a ) ) * sqrt( t ) * radiusUv );
		vec3 d = q - viewPos;
		float len2 = dot( d, d );
		float range = 1.0 - smoothstep( uAoRadius * uAoRadius, uAoRadius * uAoRadius * 4.0, len2 );
		occ += max( dot( viewNormal, d ) * inversesqrt( len2 + 1e-6 ) - 0.15, 0.0 ) * range;

	}

	return clamp( 1.0 - occ / 12.0 * uAoStrength, 0.0, 1.0 );

}

// Multiplier for the lit (normal) look: shadow from the camera-relative key plus crease AO.
float atStudioOcclusion( vec3 viewPos, vec3 viewNormal, vec2 screenUv ) {

	if ( uStudioEnabled < 0.5 ) return 1.0;
	// Normal offset (in world units, about 1.5 shadow texels) removes acne on grazing surfaces.
	vec4 sc = uShadowFromView * vec4( viewPos + viewNormal * uShadowNormalBias, 1.0 );
	float shadow = mix( 1.0, atStudioShadowAt( sc.xyz / sc.w ), uShadowStrength );
	return shadow * atStudioAO( viewPos, viewNormal, screenUv );

}

#endif

#endif
