// atelier shared GLSL helpers. Inline with `common + shader` (see effects/chunks.ts).
#ifndef AT_COMMON
#define AT_COMMON

#define AT_PI 3.14159265359
#define AT_TPI 6.28318530718

float atHash( vec2 p ) {

	return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );

}

vec3 atHsv2rgb( vec3 c ) {

	vec4 K = vec4( 1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0 );
	vec3 p = abs( fract( c.xxx + K.xyz ) * 6.0 - K.www );
	return c.z * mix( K.xxx, clamp( p - K.xxx, 0.0, 1.0 ), c.y );

}

mat2 atRotate( float a ) {

	float s = sin( a ), c = cos( a );
	return mat2( c, s, - s, c );

}

float atEaseOutBack( float t ) {

	float c1 = 1.70158;
	float c3 = c1 + 1.0;
	return 1.0 + c3 * pow( t - 1.0, 3.0 ) + c1 * pow( t - 1.0, 2.0 );

}

float atEaseOutCubic( float t ) {

	return 1.0 - pow( 1.0 - t, 3.0 );

}

// Staggered local progress for element `index` of `count` when the whole group is at `v` (0..1).
float atStagger( float v, float index, float count, float spread ) {

	return clamp( ( v * ( 1.0 + spread ) - index / max( count, 1.0 ) * spread ), 0.0, 1.0 );

}

// Ice / frost / lime brand gradient from the reference sky.
vec3 atIceGradient( float phase, float contrast ) {

	vec3 frost = vec3( 0.84, 0.93, 0.98 );
	vec3 ice = mix( vec3( 0.56, 0.79, 0.91 ), vec3( 0.40, 0.68, 0.84 ), contrast );
	vec3 lime = mix( vec3( 0.85, 0.93, 0.70 ), vec3( 0.76, 0.88, 0.53 ), contrast );
	vec3 blue = mix( frost, ice, 0.28 + 0.72 * smoothstep( 0.0, 1.0, 0.5 + 0.5 * sin( phase ) ) );
	return mix( blue, lime, smoothstep( 0.5, 1.0, cos( phase ) ) * 0.8 );

}

// sRGB authored color -> linear, for colors typed as hex in design tokens.
vec3 atSrgbToLinear( vec3 c ) {

	return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( vec3( 0.04045 ), c ) );

}

// Simplex 3D noise (Ashima Arts / Stefan Gustavson, MIT).
vec3 atMod289( vec3 x ) { return x - floor( x * ( 1.0 / 289.0 ) ) * 289.0; }
vec4 atMod289( vec4 x ) { return x - floor( x * ( 1.0 / 289.0 ) ) * 289.0; }
vec4 atPermute( vec4 x ) { return atMod289( ( ( x * 34.0 ) + 1.0 ) * x ); }
vec4 atTaylorInvSqrt( vec4 r ) { return 1.79284291400159 - 0.85373472095314 * r; }

float atSnoise( vec3 v ) {

	const vec2 C = vec2( 1.0 / 6.0, 1.0 / 3.0 );
	const vec4 D = vec4( 0.0, 0.5, 1.0, 2.0 );
	vec3 i = floor( v + dot( v, C.yyy ) );
	vec3 x0 = v - i + dot( i, C.xxx );
	vec3 g = step( x0.yzx, x0.xyz );
	vec3 l = 1.0 - g;
	vec3 i1 = min( g.xyz, l.zxy );
	vec3 i2 = max( g.xyz, l.zxy );
	vec3 x1 = x0 - i1 + C.xxx;
	vec3 x2 = x0 - i2 + C.yyy;
	vec3 x3 = x0 - D.yyy;
	i = atMod289( i );
	vec4 p = atPermute( atPermute( atPermute( i.z + vec4( 0.0, i1.z, i2.z, 1.0 ) ) + i.y + vec4( 0.0, i1.y, i2.y, 1.0 ) ) + i.x + vec4( 0.0, i1.x, i2.x, 1.0 ) );
	float n_ = 0.142857142857;
	vec3 ns = n_ * D.wyz - D.xzx;
	vec4 j = p - 49.0 * floor( p * ns.z * ns.z );
	vec4 x_ = floor( j * ns.z );
	vec4 y_ = floor( j - 7.0 * x_ );
	vec4 x = x_ * ns.x + ns.yyyy;
	vec4 y = y_ * ns.x + ns.yyyy;
	vec4 h = 1.0 - abs( x ) - abs( y );
	vec4 b0 = vec4( x.xy, y.xy );
	vec4 b1 = vec4( x.zw, y.zw );
	vec4 s0 = floor( b0 ) * 2.0 + 1.0;
	vec4 s1 = floor( b1 ) * 2.0 + 1.0;
	vec4 sh = - step( h, vec4( 0.0 ) );
	vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
	vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
	vec3 p0 = vec3( a0.xy, h.x );
	vec3 p1 = vec3( a0.zw, h.y );
	vec3 p2 = vec3( a1.xy, h.z );
	vec3 p3 = vec3( a1.zw, h.w );
	vec4 norm = atTaylorInvSqrt( vec4( dot( p0, p0 ), dot( p1, p1 ), dot( p2, p2 ), dot( p3, p3 ) ) );
	p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
	vec4 m = max( 0.6 - vec4( dot( x0, x0 ), dot( x1, x1 ), dot( x2, x2 ), dot( x3, x3 ) ), 0.0 );
	m = m * m;
	return 42.0 * dot( m * m, vec4( dot( p0, x0 ), dot( p1, x1 ), dot( p2, x2 ), dot( p3, x3 ) ) );

}

#endif
