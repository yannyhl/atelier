// Composite: scene + bloom (+ bloom tinted by lens dirt), vignette, linear -> sRGB, grain, dither.
// Reference DNA values: vignette smoothstep( 2.0, 0.8, length( cuv ) ), dirt multiplies the bloom.
uniform sampler2D uSceneTex;
uniform sampler2D uBloomTex;
uniform sampler2D uDirtTex;
uniform vec2 uBloomSize;
uniform float uBloom;
uniform float uDirt;
uniform float uVignette;
uniform float uGrain;
uniform float uGrainScale;
uniform float uExposure;
uniform float uTime;
uniform bool uHasBloom;
uniform bool uHasDirt;
uniform vec2 uDirtScale;
varying vec2 vUv;

vec4 cubic( float v ) {

	vec4 n = vec4( 1.0, 2.0, 3.0, 4.0 ) - v;
	vec4 s = n * n * n;
	float x = s.x;
	float y = s.y - 4.0 * s.x;
	float z = s.z - 4.0 * s.y + 6.0 * s.x;
	float w = 6.0 - x - y - z;
	return vec4( x, y, z, w ) * ( 1.0 / 6.0 );

}

// Bicubic from 4 bilinear taps: smooth bloom upscaling without a blur pass.
vec3 textureBicubic( sampler2D t, vec2 uv, vec2 size ) {

	vec2 inv = 1.0 / size;
	uv = uv * size - 0.5;
	vec2 f = fract( uv );
	uv -= f;
	vec4 xc = cubic( f.x );
	vec4 yc = cubic( f.y );
	vec4 c = uv.xxyy + vec2( - 0.5, 1.5 ).xyxy;
	vec4 s = vec4( xc.xz + xc.yw, yc.xz + yc.yw );
	vec4 o = ( c + vec4( xc.yw, yc.yw ) / s ) * inv.xxyy;
	float sx = s.x / ( s.x + s.y );
	float sy = s.z / ( s.z + s.w );
	return mix( mix( texture2D( t, o.yw ).rgb, texture2D( t, o.xw ).rgb, sx ), mix( texture2D( t, o.yz ).rgb, texture2D( t, o.xz ).rgb, sx ), sy );

}

float hash( vec2 p ) {

	return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );

}

vec3 toSRGB( vec3 c ) {

	c = max( c, vec3( 0.0 ) );
	return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( vec3( 0.0031308 ), c ) );

}

void main() {

	vec2 cuv = vUv * 2.0 - 1.0;
	vec3 color = texture2D( uSceneTex, vUv ).rgb * uExposure;

	if ( uHasBloom ) {

		vec3 bloom = textureBicubic( uBloomTex, vUv, uBloomSize ) * uBloom;
		vec3 dirt = uHasDirt ? texture2D( uDirtTex, ( vUv - 0.5 ) * uDirtScale + 0.5 ).rgb * uDirt : vec3( 0.0 );
		color += bloom + bloom * dirt;

	}

	color *= mix( 1.0, smoothstep( 2.0, 0.8, length( cuv ) ), uVignette );

	vec3 outColor = toSRGB( color );
	outColor += ( hash( vUv * 1024.0 + fract( uTime ) * 17.0 ) - 0.5 ) * uGrain * uGrainScale;
	outColor += ( hash( gl_FragCoord.xy + fract( uTime * 7.0 ) ) - 0.5 ) / 255.0;

	gl_FragColor = vec4( outColor, 1.0 );

}
