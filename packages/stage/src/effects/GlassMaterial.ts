import { Color, ShaderMaterial, Vector2, Vector3, type Texture } from 'three';
import type { Tween } from '../motion/Animator';
import { GLSL } from './chunks';

export interface GlassOptions {
	sceneTexture: { value: Texture | null };
	time: Tween<number>;
	/** Drawing-buffer size of the texture being refracted (post.opaqueTexture). */
	resolution: Vector2;
	taps?: number;
	tint?: Color;
	/** 0..1 rainbow tint strength on reflections. */
	iridescence?: number;
	lightDirection?: Vector3;
}

/**
 * Screen-space glass. Put meshes using it on REFRACT_LAYER and enable `post.refraction`.
 * Look: dispersion refraction of whatever is behind, GGX highlight from a key light,
 * Fresnel rim that turns rainbow at grazing angles (the reference section-2 glass).
 */
export function createGlassMaterial( o: GlassOptions ) {

	return new ShaderMaterial( {
		defines: { REFRACT_TAPS: o.taps ?? 16 },
		uniforms: {
			uSceneTex: o.sceneTexture,
			uTime: o.time,
			uResolution: { value: o.resolution },
			uTint: { value: o.tint ?? new Color( 1, 1, 1 ) },
			uIridescence: { value: o.iridescence ?? 0.6 },
			uLightDir: { value: ( o.lightDirection ?? new Vector3( - 1, 2, 1 ) ).normalize() },
			uPower: { value: 0.12 },
			uSpread: { value: 0.03 },
			uAmount: { value: 1 },
			uOpacity: { value: 1 },
		},
		vertexShader: /* glsl */`
			varying vec3 vViewNormal;
			varying vec3 vViewPos;
			varying vec3 vWorldNormal;
			void main() {
				vec4 mv = modelViewMatrix * vec4( position, 1.0 );
				vViewPos = mv.xyz;
				vViewNormal = normalize( normalMatrix * normal );
				vWorldNormal = normalize( mat3( modelMatrix ) * normal );
				gl_Position = projectionMatrix * mv;
			}
		`,
		fragmentShader: GLSL.common + GLSL.refraction + /* glsl */`
			uniform sampler2D uSceneTex;
			uniform float uTime;
			uniform vec2 uResolution;
			uniform vec3 uTint;
			uniform float uIridescence;
			uniform vec3 uLightDir;
			uniform float uPower;
			uniform float uSpread;
			uniform float uAmount;
			uniform float uOpacity;
			varying vec3 vViewNormal;
			varying vec3 vViewPos;
			varying vec3 vWorldNormal;

			void main() {
				vec3 n = normalize( vViewNormal ) * ( gl_FrontFacing ? 1.0 : - 1.0 );
				vec3 v = normalize( - vViewPos );
				vec2 suv = gl_FragCoord.xy / uResolution;

				vec3 col = atRefract( uSceneTex, suv, n, uPower, uSpread, uAmount ) * uTint;

				float dNV = clamp( dot( n, v ), 0.0, 1.0 );
				float F = atFresnel( dNV, 0.04 );
				vec3 l = normalize( ( viewMatrix * vec4( uLightDir, 0.0 ) ).xyz );
				vec3 h = normalize( v + l );
				float spec = atGGX( clamp( dot( n, h ), 0.0, 1.0 ), 0.18 ) * clamp( dot( n, l ), 0.0, 1.0 );

				vec3 rim = mix( vec3( 1.0 ), atHsv2rgb( vec3( fract( dot( vWorldNormal, vec3( 0.3, 0.6, 0.2 ) ) + uTime * 0.05 ), 0.6, 1.0 ) ), uIridescence );
				col += rim * F * 0.9 + spec * 0.35;

				gl_FragColor = vec4( col, uOpacity );
			}
		`,
		transparent: false,
	} );

}
