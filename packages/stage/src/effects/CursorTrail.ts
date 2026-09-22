import {
	CylinderGeometry, DataTexture, FloatType, Mesh, NearestFilter, RGBAFormat, ShaderMaterial, Vector3,
} from 'three';
import type { Stage, StageSystem } from '../core/Stage';
import type { Tween } from '../motion/Animator';
import { GLSL } from './chunks';

export interface TrailOptions {
	time: Tween<number>;
	/** Chain length. The reference used 128. */
	points?: number;
	radius?: number;
	/** Per-step follow factor of each point toward the previous one. */
	follow?: number;
	/** 0 = white, 1 = rainbow. */
	rainbow?: Tween<number>;
	/**
	 * 0 = glowing color (for dark sets), 1 = dark ink (for light or paper sets, where a glow would
	 * saturate to a white smear). Tween it per section, like the reference's per-section trail looks.
	 */
	ink?: Tween<number>;
}

/**
 * The cursor trail: a chain of points where point 0 is the cursor and every other point eases
 * toward its predecessor, drawn as one tube whose thickness grows with speed.
 * CPU chain + float DataTexture (cheaper than GPGPU at this size, works everywhere, deterministic).
 * Normal alpha blending (not additive) so the `ink` look can draw dark lines on light sets.
 * Desktop only: do not add it on coarse-pointer devices.
 */
export class CursorTrail implements StageSystem {

	readonly mesh: Mesh;
	readonly head = new Vector3();
	private data: Float32Array;
	private texture: DataTexture;
	private count: number;
	private follow: number;

	constructor( o: TrailOptions ) {

		this.count = o.points ?? 128;
		this.follow = o.follow ?? 0.55;
		this.data = new Float32Array( this.count * 4 );
		this.texture = new DataTexture( this.data, this.count, 1, RGBAFormat, FloatType );
		this.texture.minFilter = this.texture.magFilter = NearestFilter;
		this.texture.needsUpdate = true;

		const radial = 9;
		const geo = new CylinderGeometry( 1, 1, 1, radial, this.count - 1, true );

		const material = new ShaderMaterial( {
			defines: { POINTS: this.count },
			uniforms: {
				uChain: { value: this.texture },
				uTime: o.time,
				uRadius: { value: o.radius ?? 0.05 },
				uRainbow: o.rainbow ?? { value: 1 },
				uInk: o.ink ?? { value: 0 },
			},
			vertexShader: GLSL.common + /* glsl */`
				uniform sampler2D uChain;
				uniform float uRadius;
				varying float vT;
				varying float vSpeed;
				vec3 chain( float i ) {
					return texture2D( uChain, vec2( ( clamp( i, 0.0, float( POINTS - 1 ) ) + 0.5 ) / float( POINTS ), 0.5 ) ).xyz;
				}
				void main() {
					float t = 1.0 - uv.y;
					float fi = t * float( POINTS - 1 );
					vec3 p = chain( fi );
					vec3 next = chain( fi + 1.0 );
					vec3 prev = chain( fi - 1.0 );
					vec3 dir = next - prev;
					float speed = length( dir );
					dir = speed > 1e-5 ? dir / speed : vec3( 0.0, 1.0, 0.0 );
					vec3 up = abs( dir.y ) < 0.99 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
					vec3 side = normalize( cross( dir, up ) );
					vec3 bi = cross( side, dir );
					float thick = sin( t * AT_PI ) * uRadius * clamp( speed * 12.0, 0.0, 1.0 );
					vec2 ring = normalize( position.xz );
					p += ( side * ring.x + bi * ring.y ) * thick;
					vT = t;
					vSpeed = speed;
					gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
				}
			`,
			fragmentShader: GLSL.common + /* glsl */`
				uniform float uTime;
				uniform float uRainbow;
				uniform float uInk;
				varying float vT;
				varying float vSpeed;
				void main() {
					vec3 rainbow = atHsv2rgb( vec3( fract( vT * 0.8 - uTime * 0.3 ), 0.75, 1.0 ) );
					// Over 1.0 so the bloom pass picks the glow up; ink is a near-black line.
					vec3 glow = mix( vec3( 1.0 ), rainbow, uRainbow ) * 1.6;
					vec3 c = mix( glow, vec3( 0.012 ), uInk );
					float a = smoothstep( 0.0, 0.05, vSpeed );
					if ( a < 0.01 ) discard;
					gl_FragColor = vec4( c, a );
				}
			`,
			transparent: true,
			depthWrite: false,
		} );

		this.mesh = new Mesh( geo, material );
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 10;

	}

	update( dt: number ) {

		const d = this.data;
		const k = 1 - Math.pow( 1 - this.follow, dt * 60 );
		d[ 0 ] = this.head.x;
		d[ 1 ] = this.head.y;
		d[ 2 ] = this.head.z;
		for ( let i = this.count - 1; i > 0; i -- ) {

			const o = i * 4, p = ( i - 1 ) * 4;
			d[ o ] += ( d[ p ] - d[ o ] ) * k;
			d[ o + 1 ] += ( d[ p + 1 ] - d[ o + 1 ] ) * k;
			d[ o + 2 ] += ( d[ p + 2 ] - d[ o + 2 ] ) * k;

		}

		this.texture.needsUpdate = true;

	}

	/**
	 * Move the whole chain (and head) by `delta`. Call it with the camera's per-step movement so the
	 * trail lives in view space: without it, camera travel between sets stretches it across the frame.
	 */
	shift( delta: Vector3 ) {

		if ( delta.lengthSq() === 0 ) return;
		for ( let i = 0; i < this.count; i ++ ) {

			this.data[ i * 4 ] += delta.x;
			this.data[ i * 4 + 1 ] += delta.y;
			this.data[ i * 4 + 2 ] += delta.z;

		}

		this.head.add( delta );
		this.texture.needsUpdate = true;

	}

	reset( _stage: Stage ) {

		this.head.set( 0, 0, 0 );
		for ( let i = 0; i < this.count; i ++ ) {

			this.data[ i * 4 ] = this.head.x;
			this.data[ i * 4 + 1 ] = this.head.y;
			this.data[ i * 4 + 2 ] = this.head.z;

		}

		this.texture.needsUpdate = true;

	}

	dispose() {

		this.texture.dispose();
		this.mesh.geometry.dispose();
		( this.mesh.material as ShaderMaterial ).dispose();

	}

}
