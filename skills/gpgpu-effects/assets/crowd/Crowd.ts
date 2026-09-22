import {
	DataTexture, DoubleSide, FloatType, HalfFloatType, InstancedBufferAttribute, InstancedBufferGeometry, Mesh,
	Plane, PlaneGeometry, Raycaster, ShaderMaterial, Vector2, Vector3, type Camera, type Texture,
} from 'three';
import { GPUComputationRenderer, type Variable } from 'three/addons/misc/GPUComputationRenderer.js';
import type { Stage, StageSystem, Tween } from '@atelier/stage';
import { GLSL } from '@atelier/stage/effects';
import velocityGlsl from './crowd-velocity.glsl?raw';
import positionGlsl from './crowd-position.glsl?raw';
import { createWalkAtlas } from './walk-atlas';

/** An ellipse agents walk around, in the crowd's local XZ plane. */
export interface CrowdAvoid {
	x: number;
	z: number;
	/** Radius scale on X and Z (the push starts inside 0.5 of it, like the reference). */
	sx: number;
	sz: number;
}

export interface CrowdOptions {
	stage: Stage;
	/** 0..1 staggered appear / disappear. */
	visibility: Tween<number>;
	/** Agents per side at effectScale 1. The reference: 26 (676 agents). */
	side?: number;
	/** Spawn disc radius in local units (reference 18). */
	radius?: number;
	avoid?: CrowdAvoid[];
	/** 16 x 2 walk-cycle atlas; defaults to createWalkAtlas(). */
	atlas?: Texture;
	/** Sprite height in local units (reference 1.3). */
	size?: number;
	/** 'auto' picks float when the GPU can render to it, else half float (older iOS). */
	precision?: 'auto' | 'half' | 'float';
	/** One-hot shirt style weights (plain, dots, stripes, checks); pass an animator value to tween jump cuts. */
	style?: Tween<number[]>;
	/** 0 -> 1 sends a shock ring outward (the reference text-switch wave); pass an animator value. */
	pulse?: Tween<number>;
}

const _ray = new Raycaster();
const _ground = new Plane();
const _hit = new Vector3();
const _ndc = new Vector2();

/**
 * The reference section-4 crowd, rebuilt on three's GPUComputationRenderer: ping-pong position and
 * velocity textures (one texel per agent) advanced on the stage clock, drawn as instanced sprites
 * with a 16-frame walk cycle. Count scales with sqrt(profile.effectScale) per side.
 *
 * Deterministic: the start state comes from stage.rng once, `reset()` re-uploads it, and every
 * compute step runs inside `update(dt)`, so `seek(t)` replays the same steps.
 * Not in @atelier/stage yet; promote it when a second project needs it.
 */
export class Crowd implements StageSystem {

	readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
	readonly count: number;
	readonly side: number;
	/** Live tuning. `cursor` is local XZ (use setPointer); `center` is where the crowd drifts back to. */
	readonly uniforms: {
		cursor: Tween<Vector3>;
		center: Tween<Vector2>;
		pulse: Tween<number>;
		/** World units per 60 Hz step (reference 0.02). */
		speed: Tween<number>;
		style: Tween<number[]>;
	};

	readonly precision: 'half' | 'float';
	private gpu: GPUComputationRenderer;
	private posVar: Variable;
	private velVar: Variable;
	private initPos: DataTexture;
	private initVel: DataTexture;
	private delta = { value: 1 / 60 };

	constructor( private o: CrowdOptions ) {

		const { stage } = o;
		const r = stage.renderer;
		this.uniforms = {
			cursor: { value: new Vector3( 999, 0, 999 ) },
			center: { value: new Vector2( 0, 0 ) },
			pulse: o.pulse ?? { value: 0 },
			speed: { value: 0.02 },
			style: o.style ?? { value: [ 1, 0, 0, 0 ] },
		};
		this.side = Math.max( 4, Math.round( ( o.side ?? 26 ) * Math.sqrt( Math.max( stage.profile.effectScale, 0.05 ) ) ) );
		this.count = this.side * this.side;

		const canFloat = r.extensions.has( 'EXT_color_buffer_float' );
		this.precision = o.precision === 'half' || ( o.precision !== 'float' && ! canFloat ) ? 'half' : 'float';

		this.gpu = new GPUComputationRenderer( this.side, this.side, r );
		this.gpu.setDataType( this.precision === 'half' ? HalfFloatType : FloatType );

		this.initPos = this.gpu.createTexture();
		this.initVel = this.gpu.createTexture();
		const radius = o.radius ?? 18;
		const p = this.initPos.image.data as Float32Array;
		for ( let i = 0; i < this.count; i ++ ) {

			const a = stage.rng() * Math.PI * 2;
			const d = stage.rng() * radius;
			p.set( [ Math.sin( a ) * d, 0, Math.cos( a ) * d, stage.rng() ], i * 4 );

		}

		const avoid = o.avoid ?? [];
		this.velVar = this.gpu.addVariable( 'textureVelocity', GLSL.common + velocityGlsl, this.initVel );
		this.posVar = this.gpu.addVariable( 'texturePosition', positionGlsl, this.initPos );
		this.gpu.setVariableDependencies( this.velVar, [ this.posVar, this.velVar ] );
		this.gpu.setVariableDependencies( this.posVar, [ this.posVar, this.velVar ] );

		const vu = this.velVar.material.uniforms;
		this.velVar.material.defines.AVOID_COUNT = avoid.length;
		vu.uTime = stage.time;
		vu.uDelta = this.delta;
		vu.uSpeed = this.uniforms.speed;
		vu.uPulse = this.uniforms.pulse;
		vu.uCenter = this.uniforms.center;
		vu.uCursor = this.uniforms.cursor;
		if ( avoid.length ) vu.uAvoid = { value: avoid.map( ( v ) => [ v.x, v.z, v.sx, v.sz ] ).flat() };
		this.posVar.material.uniforms.uDelta = this.delta;

		const error = this.gpu.init();
		if ( error ) throw new Error( `Crowd: ${error}` );

		this.mesh = this.createMesh( o.atlas ?? createWalkAtlas(), o.size ?? 1.3 );

	}

	/** Cursor repulsion from a pointer in NDC: raycast onto the crowd's ground plane (local y = 0). */
	setPointer( x: number, y: number, camera: Camera ) {

		this.mesh.updateMatrixWorld();
		_ground.setFromNormalAndCoplanarPoint( new Vector3( 0, 1, 0 ).transformDirection( this.mesh.matrixWorld ), this.mesh.getWorldPosition( _hit ) );
		_ray.setFromCamera( _ndc.set( x, y ), camera );
		if ( _ray.ray.intersectPlane( _ground, _hit ) ) this.uniforms.cursor.value.copy( this.mesh.worldToLocal( _hit ) );

	}

	update( dt: number ) {

		if ( this.o.visibility.value < 1e-3 ) return;
		this.delta.value = dt;
		this.gpu.compute();
		const u = this.mesh.material.uniforms;
		u.uPos.value = this.gpu.getCurrentRenderTarget( this.posVar ).texture;
		u.uVel.value = this.gpu.getCurrentRenderTarget( this.velVar ).texture;

	}

	reset() {

		for ( const [ v, init ] of [ [ this.posVar, this.initPos ], [ this.velVar, this.initVel ] ] as const ) {

			this.gpu.renderTexture( init, v.renderTargets[ 0 ] );
			this.gpu.renderTexture( init, v.renderTargets[ 1 ] );

		}

		this.uniforms.cursor.value.set( 999, 0, 999 );
		const u = this.mesh.material.uniforms;
		u.uPos.value = this.gpu.getCurrentRenderTarget( this.posVar ).texture;
		u.uVel.value = this.gpu.getCurrentRenderTarget( this.velVar ).texture;

	}

	dispose() {

		this.gpu.dispose();
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();

	}

	private createMesh( atlas: Texture, size: number ) {

		const quad = new PlaneGeometry( size * 0.5, size ).translate( 0, size / 2, 0 );
		const geo = new InstancedBufferGeometry();
		geo.index = quad.index;
		geo.setAttribute( 'position', quad.getAttribute( 'position' ) );
		geo.setAttribute( 'uv', quad.getAttribute( 'uv' ) );
		const cuv = new Float32Array( this.count * 2 );
		for ( let i = 0; i < this.count; i ++ ) {

			cuv[ i * 2 ] = ( ( i % this.side ) + 0.5 ) / this.side;
			cuv[ i * 2 + 1 ] = ( Math.floor( i / this.side ) + 0.5 ) / this.side;

		}

		geo.setAttribute( 'aComputeUv', new InstancedBufferAttribute( cuv, 2 ) );
		geo.instanceCount = this.count;

		const material = new ShaderMaterial( {
			uniforms: {
				uPos: { value: this.gpu.getCurrentRenderTarget( this.posVar ).texture },
				uVel: { value: this.gpu.getCurrentRenderTarget( this.velVar ).texture },
				uAtlas: { value: atlas },
				uTime: this.o.stage.time,
				uVisibility: this.o.visibility,
				uStyle: this.uniforms.style,
			},
			vertexShader: GLSL.common + /* glsl */`
				#define linearstep( a, b, x ) clamp( ( ( x ) - ( a ) ) / ( ( b ) - ( a ) ), 0.0, 1.0 )
				attribute vec2 aComputeUv;
				uniform sampler2D uPos;
				uniform sampler2D uVel;
				uniform float uTime;
				uniform float uVisibility;
				varying vec2 vUv;
				varying vec2 vBaseUv;
				varying vec2 vComputeUv;

				float easeInOutQuad( float t ) {
					return t < 0.5 ? 2.0 * t * t : - 1.0 + ( 4.0 - 2.0 * t ) * t;
				}

				void main() {
					// Staggered pop by column, like the reference (scale to zero, never a hard cut).
					float alpha = 1.0 - easeInOutQuad( linearstep( 0.0, 1.0, - aComputeUv.x + ( 1.0 - uVisibility ) * 2.0 ) );
					vec4 agent = texture2D( uPos, aComputeUv );
					vec3 vel = texture2D( uVel, aComputeUv ).xyz;

					// Cylindrical billboard: camera right projected into the crowd's local XZ plane.
					vec3 camRight = transpose( mat3( modelMatrix ) ) * vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
					vec3 right = normalize( vec3( camRight.x, 0.0, camRight.z ) + vec3( 1e-5, 0.0, 0.0 ) );
					vec3 p = agent.xyz + right * position.x * alpha + vec3( 0.0, position.y * alpha, 0.0 );
					gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );

					// Walk cycle: 16 frames per second, offset per agent. Row 1 (profile) when walking across
					// the view, mirrored when walking left; row 0 (front) otherwise.
					float sideways = dot( vel.xz, right.xz );
					float row = abs( sideways ) > 0.005 ? 1.0 : 0.0;
					float frame = floor( fract( uTime + aComputeUv.x + agent.w ) * 16.0 );
					vec2 cell = uv;
					if ( row > 0.5 && sideways < 0.0 ) cell.x = 1.0 - cell.x;
					vUv = vec2( ( frame + cell.x ) / 16.0, ( 1.0 - row + cell.y ) / 2.0 );
					vBaseUv = uv * vec2( 1.0, 1.5 ) - vec2( 0.0, 0.42 );
					vComputeUv = aComputeUv;
				}
			`,
			fragmentShader: GLSL.common + /* glsl */`
				uniform sampler2D uAtlas;
				uniform float uStyle[ 4 ];
				varying vec2 vUv;
				varying vec2 vBaseUv;
				varying vec2 vComputeUv;

				void main() {
					vec4 sprite = texture2D( uAtlas, vUv );
					if ( sprite.a < 0.5 ) discard;

					// Shirt patterns (reference colors, authored as sRGB): plain, dots, stripes, checks.
					vec2 tile = floor( mod( vBaseUv * 8.0, vec2( 2.0 ) ) );
					vec2 dotUv = mod( atRotate( 0.5 ) * vBaseUv * 7.0, vec2( 1.0 ) ) - 0.5;
					vec3 dots = mix( vec3( 0.0, 0.7, 1.0 ), vec3( 1.0 ), step( 0.35, length( dotUv ) ) );
					vec3 stripes = mix( vec3( 0.8, 0.0, 0.0 ), vec3( 1.0 ), step( sin( vBaseUv.y * 80.0 ), 0.0 ) );
					vec3 checks = tile.x == tile.y ? vec3( 1.0 ) : vec3( 0.0, 0.5, 0.0 );
					vec3 style = vec3( 1.0 ) * uStyle[ 0 ] + dots * uStyle[ 1 ] + stripes * uStyle[ 2 ] + checks * uStyle[ 3 ];

					vec3 c = sprite.rgb;
					c = mix( c, atSrgbToLinear( style ), step( 0.5, c.r - c.g ) );
					c *= 1.0 - atHash( gl_FragCoord.xy * 0.001 + vComputeUv ) * 0.08;
					gl_FragColor = vec4( c, 1.0 );
				}
			`,
			side: DoubleSide,
		} );

		const mesh = new Mesh( geo, material );
		mesh.frustumCulled = false;
		return mesh;

	}

}
