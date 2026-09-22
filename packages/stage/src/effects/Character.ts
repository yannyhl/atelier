import {
	AnimationMixer, BackSide, Color, LoopOnce, LoopRepeat, Mesh, type AnimationAction, type AnimationClip,
	type MeshStandardMaterial, type Object3D, ShaderMaterial, SkinnedMesh, type Texture, type Vector2,
} from 'three';
import type { Stage, StageSystem } from '../core/Stage';
import type { Animator, Tween } from '../motion/Animator';
import { Easings } from '../motion/Easings';
import { REFRACT_LAYER } from '../post/PostFX';
import { GLSL } from './chunks';

/** The reference's four character looks. Tweened, so a section change morphs between them. */
export type CharacterLook = 'normal' | 'glass' | 'line' | 'dark';

export interface CharacterOptions {
	/** Root of the loaded glTF scene (or any subtree holding the character meshes). */
	root: Object3D;
	clips: AnimationClip[];
	stage: Stage;
	/** post.opaqueTexture and post.sceneSize, for the glass look. */
	sceneTexture: { value: Texture | null };
	sceneSize: Vector2;
	/** Animator key prefix, for more than one character. */
	name?: string;
	/** Outline width in object units for the line look. */
	lineWidth?: number;
}

const VERT = /* glsl */`
	#include <common>
	#include <skinning_pars_vertex>
	#include <morphtarget_pars_vertex>
	uniform float uOutline;
	varying vec2 vUv;
	varying vec3 vViewNormal;
	varying vec3 vViewPos;
	varying vec3 vWorldNormal;
	void main() {
		vUv = uv;
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <begin_vertex>
		#include <morphtarget_vertex>
		#include <skinning_vertex>
		#ifdef IS_OUTLINE
			transformed += normalize( objectNormal ) * uOutline;
		#endif
		vec4 mv = modelViewMatrix * vec4( transformed, 1.0 );
		vViewPos = mv.xyz;
		vViewNormal = normalize( normalMatrix * objectNormal );
		vWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );
		gl_Position = projectionMatrix * mv;
	}
`;

const FRAG = GLSL.common + GLSL.refraction + /* glsl */`
	uniform vec3 uColor;
	uniform sampler2D uMap;
	uniform bool uHasMap;
	uniform float uRoughness;
	uniform sampler2D uRoughMap;
	uniform bool uHasRoughMap;
	uniform float uSheen;
	uniform float uGlass;
	uniform float uLine;
	uniform float uDark;
	uniform float uOpacity;
	uniform vec3 uTint;
	uniform sampler2D uSceneTex;
	uniform vec2 uResolution;
	varying vec2 vUv;
	varying vec3 vViewNormal;
	varying vec3 vViewPos;
	varying vec3 vWorldNormal;

	// GGX specular + Lambert for one light, view space.
	vec3 shade( vec3 n, vec3 v, vec3 l, vec3 lightColor, vec3 albedo, float rough ) {
		vec3 h = normalize( v + l );
		float nl = max( dot( n, l ), 0.0 );
		// Wrapped diffuse softens the terminator on plush and fur.
		float wrap = max( ( dot( n, l ) + 0.25 * uSheen ) / ( 1.0 + 0.25 * uSheen ), 0.0 );
		float F = atFresnel( max( dot( h, v ), 0.0 ), 0.04 );
		float spec = atGGX( max( dot( n, h ), 0.0 ), rough ) * F * nl;
		return lightColor * ( albedo / AT_PI * wrap * ( 1.0 - F ) + spec * mix( 1.0, 0.35, uSheen ) );
	}

	void main() {
		#ifdef IS_OUTLINE
			if ( uLine < 0.01 ) discard;
			gl_FragColor = vec4( vec3( 0.0 ), uLine * uOpacity );
			return;
		#endif

		vec3 n = normalize( vViewNormal ) * ( gl_FrontFacing ? 1.0 : - 1.0 );
		vec3 v = normalize( - vViewPos );
		vec4 base = uHasMap ? texture2D( uMap, vUv ) : vec4( 1.0 );
		vec3 albedo = base.rgb * uColor * uTint;
		// glTF metallicRoughness: roughness lives in the green channel.
		float rough = clamp( uRoughness * ( uHasRoughMap ? texture2D( uRoughMap, vUv ).g : 1.0 ), 0.04, 1.0 );

		// Camera-relative studio rig: warm key upper left, cool fill right, blue floor bounce.
		vec3 lit = albedo * 0.08;
		lit += shade( n, v, normalize( vec3( - 0.5, 0.65, 0.6 ) ), vec3( 3.0, 2.94, 2.85 ), albedo, rough );
		lit += shade( n, v, normalize( vec3( 0.8, 0.2, 0.8 ) ), vec3( 0.55, 0.62, 0.72 ), albedo, rough );
		lit += shade( n, v, normalize( vec3( 0.0, - 1.0, 0.45 ) ), vec3( 0.2, 0.24, 0.3 ), albedo, rough );

		float dNV = clamp( dot( n, v ), 0.0, 1.0 );
		// Sheen rim for fabric, cheap underside occlusion instead of a screen-space AO pass.
		lit += albedo * pow( 1.0 - dNV, 3.0 ) * 0.35 * uSheen;
		lit *= mix( 0.55, 1.0, smoothstep( - 0.9, 0.3, vWorldNormal.y ) );

		// Eye-style softbox glints on glossy parts.
		vec3 r = reflect( - v, n );
		float glint = pow( max( dot( r, normalize( vec3( - 0.5, 0.65, 1.0 ) ) ), 0.0 ), 100.0 ) * 0.85
			+ pow( max( dot( r, normalize( vec3( 0.7, 0.25, 1.0 ) ) ), 0.0 ), 180.0 ) * 0.3;
		lit += glint * ( 1.0 - rough );

		float F = atFresnel( dNV, 0.04 );

		// Dark look: black body, thin white rim (pure grazing term, no Fresnel base fill).
		vec3 dark = vec3( pow( 1.0 - dNV, 5.0 ) * 2.2 );
		// Line look: flat paper white, the outline mesh draws the ink.
		vec3 line = mix( vec3( 0.96 ), albedo, 0.08 );
		// Glass look: refract whatever is behind, tinted by the albedo.
		vec3 glass = vec3( 0.0 );
		if ( uGlass > 0.001 ) {
			vec2 suv = gl_FragCoord.xy / uResolution;
			glass = atRefract( uSceneTex, suv, n, 0.3, 0.1, 1.0 ) * mix( vec3( 0.8 ), albedo, 0.5 ) + F * 0.8;
		}

		vec3 c = lit;
		c = mix( c, line, uLine );
		c = mix( c, dark, uDark );
		c = mix( c, glass, uGlass );
		gl_FragColor = vec4( c, base.a * uOpacity );
	}
`;

/**
 * A glTF character on the stage (the reference "Baku" system, rebuilt).
 *
 * - Replaces each mesh material with a studio shader that keeps the original map, color and roughness.
 * - Four looks (normal, glass, line, dark) blend by tweened uniforms; `setLook` animates between them.
 * - Clips crossfade by animator weights; `play('section_2', { timeScale })` like the reference.
 * - Lives on REFRACT_LAYER so the glass look can refract the opaque scene (enable `post.refraction`).
 * - Advances only in `update(dt)`, so captures are deterministic.
 */
export class Character implements StageSystem {

	readonly root: Object3D;
	readonly mixer: AnimationMixer;
	readonly uniforms: { glass: Tween<number>; line: Tween<number>; dark: Tween<number>; opacity: Tween<number>; tint: { value: Color } };
	/**
	 * Radians per second around Y, per section (reference `rotateSpeed`).
	 * Setting 0 eases the character back to facing forward over 1 s instead of freezing mid-turn.
	 */
	set spin( speed: number ) {

		this.spinSpeed = speed;
		if ( speed !== 0 ) return;
		const wrapped = ( ( this.baseRotation % ( Math.PI * 2 ) ) + Math.PI * 3 ) % ( Math.PI * 2 ) - Math.PI;
		this.baseRotation = 0;
		this.animator.set( `${this.prefix}.turn`, wrapped );
		void this.animator.animate( `${this.prefix}.turn`, 0, 1 );

	}

	get spin() {

		return this.spinSpeed;

	}

	private spinSpeed = 0;
	private turn: Tween<number>;
	private actions = new Map<string, AnimationAction>();
	private weights = new Map<string, Tween<number>>();
	private current: string | null = null;
	private animator: Animator;
	private prefix: string;
	private materials: ShaderMaterial[] = [];
	private outlines: Mesh[] = [];
	private baseRotation = 0;

	constructor( o: CharacterOptions ) {

		this.root = o.root;
		this.animator = o.stage.animator;
		this.prefix = `character.${o.name ?? 'main'}`;
		const a = this.animator;
		const p = this.prefix;
		this.uniforms = {
			glass: a.add( `${p}.glass`, 0, Easings.easeOutCubic ),
			line: a.add( `${p}.line`, 0, Easings.easeOutCubic ),
			dark: a.add( `${p}.dark`, 0, Easings.easeOutCubic ),
			opacity: a.add( `${p}.opacity`, 1, Easings.easeOutCubic ),
			tint: { value: new Color( 1, 1, 1 ) },
		};
		this.turn = a.add( `${p}.turn`, 0, Easings.easeOutCubic );

		const meshes: Mesh[] = [];
		o.root.traverse( ( obj ) => {

			if ( ( obj as Mesh ).isMesh ) meshes.push( obj as Mesh );

		} );

		for ( const mesh of meshes ) {

			const src = ( Array.isArray( mesh.material ) ? mesh.material[ 0 ] : mesh.material ) as MeshStandardMaterial;
			const mat = this.createMaterial( src, o, false );
			mesh.material = mat;
			mesh.layers.set( REFRACT_LAYER );
			mesh.frustumCulled = false;
			this.materials.push( mat );
			src.dispose();

			const outlineMat = this.createMaterial( src, o, true );
			outlineMat.side = BackSide;
			outlineMat.transparent = true;
			outlineMat.depthWrite = false;
			// Skinned: a sibling bound to the same skeleton. Rigid: a child, so it follows node animation.
			const skinned = ( mesh as SkinnedMesh ).isSkinnedMesh;
			const outline = skinned ? bindSkinned( mesh as SkinnedMesh, outlineMat ) : new Mesh( mesh.geometry, outlineMat );
			outline.layers.set( REFRACT_LAYER );
			outline.frustumCulled = false;
			outline.renderOrder = mesh.renderOrder - 1;
			if ( skinned ) mesh.parent?.add( outline );
			else mesh.add( outline );
			this.outlines.push( outline );
			this.materials.push( outlineMat );

		}

		this.mixer = new AnimationMixer( o.root );
		for ( const clip of o.clips ) {

			const action = this.mixer.clipAction( clip );
			this.actions.set( clip.name, action );
			this.weights.set( clip.name, a.add( `${p}.weight.${clip.name}`, 0, Easings.easeOutCubic ) );

		}

	}

	get clipNames() {

		return [ ...this.actions.keys() ];

	}

	/** Crossfade to a clip over `fade` seconds (reference: 1 s). */
	play( name: string, options: { fade?: number; timeScale?: number; loop?: boolean } = {} ) {

		const action = this.actions.get( name );
		if ( ! action ) throw new Error( `Character: no clip "${name}" (have ${this.clipNames.join( ', ' )})` );
		action.timeScale = options.timeScale ?? 1;
		action.clampWhenFinished = options.loop === false;
		action.setLoop( options.loop === false ? LoopOnce : LoopRepeat, Infinity );
		if ( this.current !== name ) {

			action.reset();
			action.play();

		}

		this.current = name;
		const fade = options.fade ?? 1;
		for ( const [ clip ] of this.actions ) void this.animator.animate( `${this.prefix}.weight.${clip}`, clip === name ? 1 : 0, fade );

	}

	setLook( look: CharacterLook, duration = 1 ) {

		const p = this.prefix;
		void this.animator.animate( `${p}.glass`, look === 'glass' ? 1 : 0, duration );
		void this.animator.animate( `${p}.line`, look === 'line' ? 1 : 0, duration );
		void this.animator.animate( `${p}.dark`, look === 'dark' ? 1 : 0, duration );

	}

	update( dt: number ) {

		for ( const [ name, action ] of this.actions ) {

			const w = this.weights.get( name )!.value;
			action.setEffectiveWeight( w );
			if ( w < 1e-3 && name !== this.current && action.isRunning() ) action.stop();

		}

		this.mixer.update( dt );
		this.baseRotation += this.spinSpeed * dt;
		this.root.rotation.y = this.baseRotation + this.turn.value;

	}

	reset() {

		this.mixer.stopAllAction();
		this.mixer.setTime( 0 );
		this.current = null;
		this.baseRotation = 0;
		this.spinSpeed = 0;

	}

	/** Outline width in object units for the line look. */
	set lineWidth( v: number ) {

		for ( const m of this.materials ) m.uniforms.uOutline.value = v;

	}

	private createMaterial( src: MeshStandardMaterial, o: CharacterOptions, outline: boolean ) {

		const sheen = ( src as unknown as { sheen?: number } ).sheen ?? 0;
		return new ShaderMaterial( {
			defines: outline ? { IS_OUTLINE: 1, REFRACT_TAPS: 8 } : { REFRACT_TAPS: 8 },
			uniforms: {
				uColor: { value: ( src.color ?? new Color( 1, 1, 1 ) ).clone() },
				uMap: { value: src.map ?? null },
				uHasMap: { value: !! src.map },
				uRoughness: { value: Math.min( 1, Math.max( 0.04, src.roughness ?? 0.6 ) ) },
				uRoughMap: { value: src.roughnessMap ?? null },
				uHasRoughMap: { value: !! src.roughnessMap },
				uSheen: { value: sheen > 0 ? 1 : 0 },
				uGlass: this.uniforms.glass,
				uLine: this.uniforms.line,
				uDark: this.uniforms.dark,
				uOpacity: this.uniforms.opacity,
				uTint: this.uniforms.tint,
				uSceneTex: o.sceneTexture,
				uResolution: { value: o.sceneSize },
				uOutline: { value: o.lineWidth ?? 0.02 },
			},
			vertexShader: VERT,
			fragmentShader: FRAG,
		} );

	}

	dispose() {

		this.materials.forEach( ( m ) => m.dispose() );
		this.outlines.forEach( ( o ) => o.removeFromParent() );

	}

}

function bindSkinned( mesh: SkinnedMesh, material: ShaderMaterial ) {

	const s = new SkinnedMesh( mesh.geometry, material );
	s.bind( mesh.skeleton, mesh.bindMatrix );
	s.position.copy( mesh.position );
	s.quaternion.copy( mesh.quaternion );
	s.scale.copy( mesh.scale );
	return s;

}

