// Prefilter + first downsample. Threshold keeps color scaled by how far it exceeds the threshold
// (reference DNA: c * max(0, c - threshold)), with a soft knee so edges do not pop.
// 13-tap downsample (Jimenez 2014) so thin highlights do not alias into blocks.
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
varying vec2 vUv;

vec3 tap( vec2 o ) {

	return texture2D( uTex, vUv + o * uTexel ).rgb;

}

vec3 down13() {

	vec3 a = tap( vec2( - 2.0, 2.0 ) ), b = tap( vec2( 0.0, 2.0 ) ), c = tap( vec2( 2.0, 2.0 ) );
	vec3 d = tap( vec2( - 2.0, 0.0 ) ), e = tap( vec2( 0.0 ) ), f = tap( vec2( 2.0, 0.0 ) );
	vec3 g = tap( vec2( - 2.0, - 2.0 ) ), h = tap( vec2( 0.0, - 2.0 ) ), i = tap( vec2( 2.0, - 2.0 ) );
	vec3 j = tap( vec2( - 1.0, 1.0 ) ), k = tap( vec2( 1.0, 1.0 ) ), l = tap( vec2( - 1.0, - 1.0 ) ), m = tap( vec2( 1.0, - 1.0 ) );
	return e * 0.125 + ( a + c + g + i ) * 0.03125 + ( b + d + f + h ) * 0.0625 + ( j + k + l + m ) * 0.125;

}

void main() {

	vec3 c = down13();

	#ifdef PREFILTER
		float knee = uThreshold * 0.5 + 1e-4;
		vec3 soft = clamp( c - uThreshold + knee, 0.0, 2.0 * knee );
		soft = soft * soft / ( 4.0 * knee );
		c = min( c * max( soft, c - uThreshold ), vec3( 32.0 ) );
	#endif

	gl_FragColor = vec4( c, 1.0 );

}
