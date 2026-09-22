import { ShaderMaterial, type Texture, type Vector2 } from 'three';
import { REFRACT_LAYER, type Tween } from '@atelier/stage';
import { GLSL, type CursorTrail } from '@atelier/stage/effects';

export interface RefractiveTrailOptions {
	/** post.opaqueTexture */
	sceneTexture: { value: Texture | null };
	/** post.sceneSize */
	sceneSize: Vector2;
	time: Tween<number>;
	/** stage.profile.refractionTaps (update the define on tier change). */
	taps: number;
	/** Base offset along the normal in screen UV. The tube is thin, so push harder than a big glass object. */
	power?: number;
	spread?: number;
	/** 0..1 rainbow Fresnel rim, sharing the trail's own `uRainbow` tween when it has one. */
	rim?: number;
}

/**
 * Turns a CursorTrail into a glass tube that refracts the opaque scene (the reference trail in its
 * glass sections). Reuses the trail's chain texture and radius uniforms, so `trail.update()` keeps
 * driving it; only the material and layer change. Needs `post.refraction = true`.
 * Swap back by keeping the original material: `trail.mesh.material = original; trail.mesh.layers.set( 0 )`.
 */
export function makeTrailRefractive( trail: CursorTrail, o: RefractiveTrailOptions ) {

	const src = trail.mesh.material as ShaderMaterial;
	const material = new ShaderMaterial( {
		defines: { POINTS: src.defines.POINTS, REFRACT_TAPS: Math.max( 1, o.taps ) },
		uniforms: {
			uChain: src.uniforms.uChain,
			uRadius: src.uniforms.uRadius,
			uRainbow: src.uniforms.uRainbow,
			uTime: o.time,
			uSceneTex: o.sceneTexture,
			uResolution: { value: o.sceneSize },
			uPower: { value: o.power ?? 0.06 },
			uSpread: { value: o.spread ?? 0.04 },
			uRim: { value: o.rim ?? 0.8 },
		},
		vertexShader: GLSL.common + /* glsl */`
			uniform sampler2D uChain;
			uniform float uRadius;
			varying float vT;
			varying vec3 vViewNormal;
			varying vec3 vViewPos;
			vec3 chain( float i ) {
				return texture2D( uChain, vec2( ( clamp( i, 0.0, float( POINTS - 1 ) ) + 0.5 ) / float( POINTS ), 0.5 ) ).xyz;
			}
			void main() {
				float t = 1.0 - uv.y;
				float fi = t * float( POINTS - 1 );
				vec3 p = chain( fi );
				vec3 dir = chain( fi + 1.0 ) - chain( fi - 1.0 );
				float speed = length( dir );
				dir = speed > 1e-5 ? dir / speed : vec3( 0.0, 1.0, 0.0 );
				vec3 up = abs( dir.y ) < 0.99 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
				vec3 side = normalize( cross( dir, up ) );
				vec3 bi = cross( side, dir );
				vec2 ring = normalize( position.xz );
				vec3 nWorld = side * ring.x + bi * ring.y;
				p += nWorld * sin( t * AT_PI ) * uRadius * clamp( speed * 12.0, 0.0, 1.0 );
				vec4 mv = viewMatrix * vec4( p, 1.0 );
				vT = t;
				vViewPos = mv.xyz;
				vViewNormal = normalize( ( viewMatrix * vec4( nWorld, 0.0 ) ).xyz );
				gl_Position = projectionMatrix * mv;
			}
		`,
		fragmentShader: GLSL.common + GLSL.refraction + /* glsl */`
			uniform sampler2D uSceneTex;
			uniform vec2 uResolution;
			uniform float uTime;
			uniform float uRainbow;
			uniform float uPower;
			uniform float uSpread;
			uniform float uRim;
			varying float vT;
			varying vec3 vViewNormal;
			varying vec3 vViewPos;
			void main() {
				vec3 n = normalize( vViewNormal ) * ( gl_FrontFacing ? 1.0 : - 1.0 );
				vec3 v = normalize( - vViewPos );
				vec2 suv = gl_FragCoord.xy / uResolution;
				vec3 col = atRefract( uSceneTex, suv, n, uPower, uSpread, 1.0 );
				float F = atFresnel( clamp( dot( n, v ), 0.0, 1.0 ), 0.04 );
				vec3 rainbow = atHsv2rgb( vec3( fract( vT * 0.8 - uTime * 0.3 ), 0.75, 1.0 ) );
				col += mix( vec3( 1.0 ), rainbow, uRainbow ) * F * uRim;
				gl_FragColor = vec4( col, 1.0 );
			}
		`,
	} );

	trail.mesh.material = material;
	trail.mesh.layers.set( REFRACT_LAYER );
	return material;

}
