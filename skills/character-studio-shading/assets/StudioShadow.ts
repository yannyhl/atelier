import {
	Color, DepthTexture, Matrix4, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Quaternion, ShaderMaterial,
	Sphere, Vector2, Vector3, WebGLRenderTarget, type PerspectiveCamera, type Scene,
} from 'three';
import type { QualityProfile, Stage, StageSystem } from '@atelier/stage';
import { GLSL, type Character } from '@atelier/stage/effects';
import studioGlsl from './studio-shadow.glsl?raw';

/** Extra layer the shadow and AO depth passes render. Character meshes get it in addition to REFRACT_LAYER. */
export const STUDIO_CASTER_LAYER = 5;

export interface StudioShadowOptions {
	stage: Stage;
	character: Character;
	camera: PerspectiveCamera;
	/** post.sceneSize: the AO depth pass renders at half this size. */
	sceneSize: Vector2;
	/** Key light direction in view space. Default matches the Character key (-0.5, 0.65, 0.6). */
	keyDirection?: Vector3;
	/** Frustum half-size of the shadow camera as a multiple of the character's bounding radius. */
	frame?: number;
	/** Crease AO sampling radius in world units. */
	aoRadius?: number;
	aoStrength?: number;
	shadowStrength?: number;
	/** Blur of the shadow edge in shadow-map texels. */
	softness?: number;
	/** Minimum tier. The reference ran this always; the house default is tier 3 only. */
	minTier?: number;
	/** Shadow map size in pixels. Default: profile.shadowMapSize capped at 1024 (the reference size). */
	mapSize?: number;
}

const BIAS = new Matrix4().set( 0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1 );
const _center = new Vector3();
const _key = new Vector3();
const _q = new Quaternion();

/**
 * Optional tier-3 studio shadow and self AO for a Character, the two passes the engine omits by default.
 *
 * Each frame (call `render( scene )` right before `post.render`):
 * 1. depth of the character from an orthographic camera placed along the camera-relative key light,
 * 2. depth of the character from the main camera at half resolution, for 12-tap crease AO.
 * The Character's lit look is multiplied by the result; `createCatcher()` makes a floor plane that
 * receives the same shadow. Cost: two small depth renders of the character, plus 12 + 12 taps per pixel.
 *
 * It patches the Character's fragment shader source (see references/studio-shadow-ao.md); if the
 * engine shader changes and the patch point is gone, the constructor throws instead of rendering wrong.
 */
export class StudioShadow implements StageSystem {

	readonly uniforms = {
		uStudioEnabled: { value: 0 },
		uShadowMap: { value: null as DepthTexture | null },
		uShadowTexel: { value: new Vector2() },
		uShadowSoftness: { value: 2.5 },
		uShadowBias: { value: 0.004 },
		uShadowStrength: { value: 0.75 },
		uShadowFromView: { value: new Matrix4() },
		uShadowNormalBias: { value: 0.01 },
		uShadowFromWorld: { value: new Matrix4() },
		uAoDepth: { value: null as DepthTexture | null },
		uAoProjection: { value: new Matrix4() },
		uAoNear: { value: 0.1 },
		uAoFar: { value: 100 },
		uAoRadius: { value: 0.12 },
		uAoStrength: { value: 1.6 },
	};

	enabled = false;
	private shadowRT: WebGLRenderTarget;
	private aoRT: WebGLRenderTarget;
	private shadowCamera = new OrthographicCamera( - 1, 1, 1, - 1, 0.01, 10 );
	private depthOnly = new MeshBasicMaterial( { colorWrite: false } );
	private bounds = new Sphere();
	private key: Vector3;
	private frame: number;
	private minTier: number;
	private catchers: Mesh[] = [];

	constructor( private o: StudioShadowOptions ) {

		this.key = ( o.keyDirection ?? new Vector3( - 0.5, 0.65, 0.6 ) ).clone().normalize();
		this.frame = o.frame ?? 1.6;
		this.minTier = o.minTier ?? 3;
		const u = this.uniforms;
		u.uAoRadius.value = o.aoRadius ?? u.uAoRadius.value;
		u.uAoStrength.value = o.aoStrength ?? u.uAoStrength.value;
		u.uShadowStrength.value = o.shadowStrength ?? u.uShadowStrength.value;
		u.uShadowSoftness.value = o.softness ?? u.uShadowSoftness.value;

		this.shadowRT = depthTarget( 1024 );
		this.aoRT = depthTarget( 1 );
		u.uShadowMap.value = this.shadowRT.depthTexture as DepthTexture;
		u.uAoDepth.value = this.aoRT.depthTexture as DepthTexture;
		this.shadowCamera.layers.set( STUDIO_CASTER_LAYER );

		o.character.root.updateMatrixWorld( true );
		let patched = 0;
		o.character.root.traverse( ( obj ) => {

			const mesh = obj as Mesh;
			const m = mesh.material as ShaderMaterial | undefined;
			if ( ! mesh.isMesh || ! m?.isShaderMaterial || ! m.uniforms.uGlass || m.defines?.IS_OUTLINE ) return;
			if ( ! m.fragmentShader.includes( 'vec3 c = lit;' ) || ! m.fragmentShader.includes( 'void main() {' ) ) {

				throw new Error( 'StudioShadow: Character shader changed; update the patch in StudioShadow.ts' );

			}

			mesh.layers.enable( STUDIO_CASTER_LAYER );
			Object.assign( m.uniforms, u );
			m.defines = { ...m.defines, STUDIO_CHARACTER: 1 };
			m.fragmentShader = m.fragmentShader
				.replace( 'void main() {', studioGlsl + '\nvoid main() {' )
				.replace( 'vec3 c = lit;', 'vec3 c = lit * atStudioOcclusion( vViewPos, n, gl_FragCoord.xy / uResolution );' );
			m.needsUpdate = true;
			patched ++;

			mesh.geometry.computeBoundingSphere();
			const s = mesh.geometry.boundingSphere!.clone().applyMatrix4( mesh.matrixWorld );
			if ( patched === 1 ) this.bounds.copy( s );
			else this.bounds.union( s );

		} );

		if ( patched === 0 ) throw new Error( 'StudioShadow: no Character materials found under character.root' );
		// Bounds relative to the character root, so they follow it around the stage.
		this.bounds.applyMatrix4( o.character.root.matrixWorld.clone().invert() );

	}

	/** A floor plane (default layer) that darkens where the character's studio shadow falls. */
	createCatcher( size = 4, color?: Color, opacity = 0.55 ) {

		const material = new ShaderMaterial( {
			uniforms: {
				...this.uniforms,
				uColor: { value: color ?? new Color( 0, 0, 0 ) },
				uOpacity: { value: opacity },
			},
			vertexShader: /* glsl */`
				varying vec3 vWorld;
				varying vec2 vUv;
				void main() {
					vUv = uv;
					vec4 w = modelMatrix * vec4( position, 1.0 );
					vWorld = w.xyz;
					gl_Position = projectionMatrix * viewMatrix * w;
				}
			`,
			fragmentShader: GLSL.common + studioGlsl + /* glsl */`
				uniform mat4 uShadowFromWorld;
				uniform vec3 uColor;
				uniform float uOpacity;
				varying vec3 vWorld;
				varying vec2 vUv;
				void main() {
					if ( uStudioEnabled < 0.5 ) discard;
					vec4 sc = uShadowFromWorld * vec4( vWorld, 1.0 );
					float shade = 1.0 - atStudioShadowAt( sc.xyz / sc.w );
					float edge = 1.0 - smoothstep( 0.55, 1.0, length( vUv * 2.0 - 1.0 ) );
					gl_FragColor = vec4( uColor, shade * edge * uOpacity );
				}
			`,
			transparent: true,
			depthWrite: false,
		} );

		const mesh = new Mesh( new PlaneGeometry( size, size ).rotateX( - Math.PI / 2 ), material );
		mesh.renderOrder = 1;
		this.catchers.push( mesh );
		return mesh;

	}

	setProfile( profile: QualityProfile ) {

		this.enabled = profile.tier >= this.minTier && profile.shadows;
		this.uniforms.uStudioEnabled.value = this.enabled ? 1 : 0;
		const size = this.o.mapSize ?? Math.min( profile.shadowMapSize, 1024 );
		if ( this.shadowRT.width !== size ) this.shadowRT.setSize( size, size );
		this.uniforms.uShadowTexel.value.set( 1 / size, 1 / size );
		this.catchers.forEach( ( c ) => ( c.visible = this.enabled ) );

	}

	/** Render both depth passes. Call after the stage updated the camera, right before post.render. */
	render( scene: Scene ) {

		if ( ! this.enabled ) return;
		const { camera, character, stage, sceneSize } = this.o;
		const r = stage.renderer;
		const u = this.uniforms;

		// The AO target follows post.sceneSize, which PostFX sets on resize and tier changes.
		const aw = Math.max( 1, Math.round( sceneSize.x / 2 ) ), ah = Math.max( 1, Math.round( sceneSize.y / 2 ) );
		if ( this.aoRT.width !== aw || this.aoRT.height !== ah ) this.aoRT.setSize( aw, ah );

		// Place the shadow camera along the camera-relative key, framing the character's bounds.
		character.root.updateMatrixWorld();
		camera.updateMatrixWorld();
		_center.copy( this.bounds.center ).applyMatrix4( character.root.matrixWorld );
		const radius = this.bounds.radius * character.root.matrixWorld.getMaxScaleOnAxis();
		_key.copy( this.key ).applyQuaternion( camera.getWorldQuaternion( _q ) );
		const sc = this.shadowCamera;
		const half = radius * this.frame;
		sc.left = - half;
		sc.right = half;
		sc.top = half;
		sc.bottom = - half;
		sc.near = 0.01;
		sc.far = radius * 8;
		sc.position.copy( _center ).addScaledVector( _key, radius * 4 );
		sc.lookAt( _center );
		sc.updateMatrixWorld();
		sc.updateProjectionMatrix();
		u.uShadowNormalBias.value = ( 2 * half / this.shadowRT.width ) * 1.5;

		u.uShadowFromWorld.value.multiplyMatrices( BIAS, sc.projectionMatrix ).multiply( sc.matrixWorldInverse );
		u.uShadowFromView.value.multiplyMatrices( u.uShadowFromWorld.value, camera.matrixWorld );
		u.uAoProjection.value.copy( camera.projectionMatrix );
		u.uAoNear.value = camera.near;
		u.uAoFar.value = camera.far;

		const prevTarget = r.getRenderTarget();
		const prevOverride = scene.overrideMaterial;
		const prevBackground = scene.background;
		const prevMask = camera.layers.mask;
		scene.overrideMaterial = this.depthOnly;
		scene.background = null;

		r.setRenderTarget( this.shadowRT );
		r.clear();
		r.render( scene, sc );

		camera.layers.set( STUDIO_CASTER_LAYER );
		r.setRenderTarget( this.aoRT );
		r.clear();
		r.render( scene, camera );

		camera.layers.mask = prevMask;
		scene.overrideMaterial = prevOverride;
		scene.background = prevBackground;
		r.setRenderTarget( prevTarget );

	}

	dispose() {

		this.shadowRT.dispose();
		this.aoRT.dispose();
		this.depthOnly.dispose();
		this.catchers.forEach( ( c ) => {

			c.geometry.dispose();
			( c.material as ShaderMaterial ).dispose();

		} );

	}

}

function depthTarget( size: number ) {

	return new WebGLRenderTarget( size, size, {
		depthBuffer: true,
		stencilBuffer: false,
		generateMipmaps: false,
		depthTexture: new DepthTexture( size, size ),
	} );

}
