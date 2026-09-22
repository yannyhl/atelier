import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import type { Tween } from '../motion/Animator';
import { GLSL } from './chunks';

/** One section's sky look. Colors are sRGB hex like design tokens; conversion happens in the shader. */
export interface SkyLook {
	top: string;
	bottom: string;
	accent: string;
	/** 0 = plain vertical gradient, 1 = animated brand ice/lime gradient, 2 = horizon bands. */
	style: 0 | 1 | 2;
}

/**
 * Background sphere whose look per section is chosen by a one-hot weight array (`animator.add('sky', oneHot(n, 0))`).
 * Tween that array on section change and the sky cross-fades between looks on the GPU.
 * Dithered to avoid banding on 8-bit outputs.
 */
export function createSkyDome( looks: SkyLook[], weights: Tween<number[]>, time: Tween<number>, radius = 100 ) {

	const n = looks.length;
	const col = ( hex: string ) => new Color( hex );

	const material = new ShaderMaterial( {
		defines: { LOOKS: n },
		uniforms: {
			uWeights: weights,
			uTime: time,
			uTop: { value: looks.map( ( l ) => col( l.top ) ) },
			uBottom: { value: looks.map( ( l ) => col( l.bottom ) ) },
			uAccent: { value: looks.map( ( l ) => col( l.accent ) ) },
			uStyle: { value: looks.map( ( l ) => l.style ) },
		},
		vertexShader: /* glsl */`
			varying vec3 vDir;
			void main() {
				vDir = normalize( position );
				vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				gl_Position = p.xyww;
			}
		`,
		fragmentShader: GLSL.common + /* glsl */`
			uniform float uWeights[ LOOKS ];
			uniform float uTime;
			uniform vec3 uTop[ LOOKS ];
			uniform vec3 uBottom[ LOOKS ];
			uniform vec3 uAccent[ LOOKS ];
			uniform float uStyle[ LOOKS ];
			varying vec3 vDir;

			vec3 look( int i, vec3 d ) {
				float h = d.y * 0.5 + 0.5;
				vec3 top = uTop[ i ], bottom = uBottom[ i ], accent = uAccent[ i ];
				vec3 c = mix( bottom, top, smoothstep( 0.0, 1.0, h ) );
				if ( uStyle[ i ] > 0.5 && uStyle[ i ] < 1.5 ) {
					float phase = uTime * 0.25 + d.x * 1.5 + d.y * 2.0;
					c = mix( c, atIceGradient( phase, h ), 0.85 );
				} else if ( uStyle[ i ] > 1.5 ) {
					float band = exp( - abs( d.y ) * 9.0 );
					c += accent * band * ( 0.6 + 0.4 * sin( d.x * 20.0 + uTime ) );
				}
				return c;
			}

			void main() {
				vec3 d = normalize( vDir );
				vec3 c = vec3( 0.0 );
				float total = 0.0;
				for ( int i = 0; i < LOOKS; i ++ ) {
					if ( uWeights[ i ] > 0.001 ) c += look( i, d ) * uWeights[ i ];
					total += uWeights[ i ];
				}
				c /= max( total, 1e-4 );
				c += ( atHash( gl_FragCoord.xy + fract( uTime ) ) - 0.5 ) / 255.0;
				gl_FragColor = vec4( atSrgbToLinear( clamp( c, 0.0, 1.0 ) ), 1.0 );
			}
		`,
		side: BackSide,
		depthWrite: false,
	} );

	const mesh = new Mesh( new SphereGeometry( radius, 32, 16 ), material );
	mesh.renderOrder = - 100;
	mesh.frustumCulled = false;
	return mesh;

}
