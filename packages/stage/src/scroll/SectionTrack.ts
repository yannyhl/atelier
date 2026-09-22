import { type Object3D, PerspectiveCamera, Quaternion, Vector2, Vector3 } from 'three';
import type { Stage, StageSystem } from '../core/Stage';
import type { Viewport } from '../core/Viewport';
import { Spring2 } from '../motion/Spring';
import type { SectionScroller } from './SectionScroller';

/** One section's camera and hero-anchor pose, usually read from that section's glTF. */
export interface Shot {
	position: Vector3;
	target: Vector3;
	fov: number;
	/** Degrees added to the FOV at full portraitWeight (reference default 30). */
	portraitFov?: number;
	/** Cursor parallax range in world units (reference default 0.1, 0.1). */
	parallax?: Vector2;
	/** Where the hero object stands in this section. */
	anchor?: { position: Vector3; quaternion: Quaternion; scale: Vector3 };
}

/**
 * Reads a Shot from a Blender-exported section scene.
 * Naming contract: `Camera` (camera or its parent empty), `CameraTarget` (empty), optional `Anchor` (empty).
 */
export function shotFromScene( root: Object3D, anchorName = 'Anchor' ): Shot {

	root.updateMatrixWorld( true );

	const node = root.getObjectByName( 'Camera' );
	const cam = ( ( node as PerspectiveCamera | undefined )?.isPerspectiveCamera
		? node
		: node?.getObjectByProperty( 'isPerspectiveCamera', true ) ) as PerspectiveCamera | undefined;

	const position = new Vector3( 0, 0, 5 );
	const target = new Vector3();
	( cam ?? node )?.getWorldPosition( position );
	root.getObjectByName( 'CameraTarget' )?.getWorldPosition( target );

	const anchorObj = root.getObjectByName( anchorName );
	const anchor = anchorObj ? {
		position: anchorObj.getWorldPosition( new Vector3() ),
		quaternion: anchorObj.getWorldQuaternion( new Quaternion() ),
		scale: anchorObj.getWorldScale( new Vector3() ),
	} : undefined;

	return { position, target, fov: cam?.fov ?? 40, anchor };

}

const _p = new Vector3();
const _t = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _fwd = new Vector3();

/**
 * Drives a camera through section shots by the scroller value.
 * Adds the reference touches: FOV widened by portraitWeight, spring cursor parallax whose range
 * changes per section, and a deterministic shake.
 */
export class SectionTrack implements StageSystem {

	shots: Shot[];
	readonly pointer = new Vector2();
	private spring = new Spring2( 0.9, 1 );
	private range = new Vector2( 0.1, 0.1 );
	private portraitWeight = 0;
	private shakeAmount = 0;
	private shakeTime = 0;
	private shakeDuration = 0;
	private shakeSpeed = 7;
	private time = 0;

	constructor( public camera: PerspectiveCamera, public scroller: SectionScroller, shots: Shot[] = [] ) {

		this.shots = shots;

	}

	/** Pointer in normalized device coordinates (-1..1). Leave at 0 on touch devices. */
	setPointer( x: number, y: number ) {

		this.pointer.set( x, y );

	}

	shake( amount: number, duration: number, speed = 7 ) {

		this.shakeAmount = amount;
		this.shakeDuration = duration;
		this.shakeTime = 0;
		this.shakeSpeed = speed;

	}

	/** Interpolated anchor pose at the current scroll value, for placing the hero object. */
	anchorAt( value: number, out: { position: Vector3; quaternion: Quaternion; scale: Vector3 } ) {

		const [ a, b, f ] = this.pair( value );
		if ( ! a.anchor || ! b.anchor ) return false;
		out.position.lerpVectors( a.anchor.position, b.anchor.position, f );
		out.quaternion.slerpQuaternions( a.anchor.quaternion, b.anchor.quaternion, f );
		out.scale.lerpVectors( a.anchor.scale, b.anchor.scale, f );
		return true;

	}

	resize( viewport: Viewport ) {

		this.portraitWeight = viewport.portraitWeight;
		this.camera.aspect = viewport.aspect;
		this.camera.updateProjectionMatrix();

	}

	reset() {

		this.spring.snap( 0, 0 );
		this.pointer.set( 0, 0 );
		this.shakeAmount = 0;
		this.time = 0;

	}

	update( dt: number, stage: Stage ) {

		if ( this.shots.length === 0 ) return;
		this.time += dt;

		const [ a, b, f ] = this.pair( this.scroller.value );
		_p.lerpVectors( a.position, b.position, f );
		_t.lerpVectors( a.target, b.target, f );

		const fovA = a.fov + ( a.portraitFov ?? 30 ) * this.portraitWeight;
		const fovB = b.fov + ( b.portraitFov ?? 30 ) * this.portraitWeight;
		const fov = fovA + ( fovB - fovA ) * f;

		const ra = a.parallax ?? this.range, rb = b.parallax ?? this.range;
		const rx = ra.x + ( rb.x - ra.x ) * f, ry = ra.y + ( rb.y - ra.y ) * f;

		const reduce = stage.reducedMotion ? 0 : 1;
		this.spring.setTarget( this.pointer.x * reduce, this.pointer.y * reduce );
		this.spring.update( dt );

		_fwd.subVectors( _t, _p ).normalize();
		_right.crossVectors( _fwd, this.camera.up ).normalize();
		_up.crossVectors( _right, _fwd ).normalize();
		_p.addScaledVector( _right, this.spring.x.value * rx ).addScaledVector( _up, this.spring.y.value * ry );

		this.camera.position.copy( _p );
		this.camera.lookAt( _t );

		if ( this.shakeAmount > 0 && reduce ) {

			this.shakeTime += dt;
			const k = Math.max( 0, 1 - this.shakeTime / this.shakeDuration );
			const s = this.shakeAmount * k;
			const T = this.time * this.shakeSpeed;
			this.camera.rotateX( Math.sin( T ) * Math.sin( T * 0.57 ) * 0.1 * s );
			this.camera.rotateY( Math.sin( T * 0.47 ) * Math.sin( T * 0.74 ) * 0.1 * s );
			if ( k === 0 ) this.shakeAmount = 0;

		}

		if ( Math.abs( this.camera.fov - fov ) > 1e-4 ) {

			this.camera.fov = fov;
			this.camera.updateProjectionMatrix();

		}

	}

	private pair( value: number ): [ Shot, Shot, number ] {

		const max = this.shots.length - 1;
		const v = Math.max( 0, Math.min( max, value ) );
		const i = Math.min( Math.floor( v ), Math.max( 0, max - 1 ) );
		const f = max === 0 ? 0 : v - i;
		return [ this.shots[ i ], this.shots[ Math.min( i + 1, max ) ], f ];

	}

}
