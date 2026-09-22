// Upsample the coarser level with a 9-tap tent and add this level, weighted by its index so
// wide halos dominate (reference DNA weights mip i by i / count).
uniform sampler2D uCoarse;
uniform sampler2D uFine;
uniform vec2 uCoarseTexel;
uniform float uRadius;
uniform float uFineWeight;
varying vec2 vUv;

void main() {

	vec2 d = uCoarseTexel * uRadius;
	vec3 s = texture2D( uCoarse, vUv ).rgb * 4.0;
	s += ( texture2D( uCoarse, vUv + vec2( - d.x, 0.0 ) ).rgb + texture2D( uCoarse, vUv + vec2( d.x, 0.0 ) ).rgb
		+ texture2D( uCoarse, vUv + vec2( 0.0, - d.y ) ).rgb + texture2D( uCoarse, vUv + vec2( 0.0, d.y ) ).rgb ) * 2.0;
	s += texture2D( uCoarse, vUv + vec2( - d.x, - d.y ) ).rgb + texture2D( uCoarse, vUv + vec2( d.x, - d.y ) ).rgb
		+ texture2D( uCoarse, vUv + vec2( - d.x, d.y ) ).rgb + texture2D( uCoarse, vUv + vec2( d.x, d.y ) ).rgb;
	vec3 coarse = s / 16.0;
	gl_FragColor = vec4( coarse + texture2D( uFine, vUv ).rgb * uFineWeight, 1.0 );

}
