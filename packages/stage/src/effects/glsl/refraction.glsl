// Screen-space refraction with RGB dispersion (the reference glass / character / trail look).
// Samples the captured opaque scene with per-channel offsets along the view-space normal.
// REFRACT_TAPS is set per quality tier (16 at tier 3, 4 at tier 1).
#ifndef REFRACT_TAPS
#define REFRACT_TAPS 16
#endif

vec3 atRefract( sampler2D sceneTex, vec2 screenUv, vec3 viewNormal, float power, float spread, float amount ) {

	vec2 n = viewNormal.xy * ( 1.0 - viewNormal.z * 0.7 );
	vec3 col = vec3( 0.0 );
	float jitter = atHash( screenUv * 997.0 ) * 0.007;

	for ( int i = 0; i < REFRACT_TAPS; i ++ ) {

		float slide = float( i ) / float( REFRACT_TAPS ) * spread + jitter;
		col.r += texture2D( sceneTex, screenUv - n * ( power + slide * 1.0 ) * amount ).r;
		col.g += texture2D( sceneTex, screenUv - n * ( power + slide * 2.0 ) * amount ).g;
		col.b += texture2D( sceneTex, screenUv - n * ( power + slide * 3.0 ) * amount ).b;

	}

	return col / float( REFRACT_TAPS );

}

float atFresnel( float dNV, float f0 ) {

	return f0 + ( 1.0 - f0 ) * pow( 1.0 - dNV, 5.0 );

}

float atGGX( float dNH, float roughness ) {

	float a2 = pow( roughness, 4.0 );
	float d = dNH * dNH * ( a2 - 1.0 ) + 1.0;
	return a2 / ( AT_PI * d * d );

}
