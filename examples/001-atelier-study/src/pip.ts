import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, CanvasTexture, type Object3D } from 'three';
import type { AssetLoader, PostFX, Stage } from '@atelier/stage';
import { Character } from '@atelier/stage/effects';

/** Loads Pip, wraps him in a rig the section track can place, and adds a soft contact shadow. */
export function createPip( stage: Stage, assets: AssetLoader, post: PostFX ) {

	const gltf = assets.gltf( 'pip' );
	const rig = new Group();
	rig.name = 'PipRig';
	rig.add( gltf.scene );

	const pip = new Character( {
		root: gltf.scene,
		clips: gltf.animations,
		stage,
		sceneTexture: post.opaqueTexture,
		sceneSize: post.sceneSize,
		lineWidth: 0.025,
	} );

	const shadow = contactShadow();
	shadow.position.y = - 0.98;
	rig.add( shadow );

	return { pip, rig, shadow };

}

/** Radial falloff quad under the character: grounds it for the cost of one tiny draw. */
function contactShadow(): Object3D {

	const c = document.createElement( 'canvas' );
	c.width = c.height = 128;
	const g = c.getContext( '2d' )!;
	const grad = g.createRadialGradient( 64, 64, 0, 64, 64, 64 );
	grad.addColorStop( 0, 'rgba(0,0,0,0.55)' );
	grad.addColorStop( 1, 'rgba(0,0,0,0)' );
	g.fillStyle = grad;
	g.fillRect( 0, 0, 128, 128 );

	const mesh = new Mesh(
		new PlaneGeometry( 2.4, 2.4 ),
		new MeshBasicMaterial( { map: new CanvasTexture( c ), transparent: true, depthWrite: false } ),
	);
	mesh.rotation.x = - Math.PI / 2;
	mesh.renderOrder = - 1;
	return mesh;

}
