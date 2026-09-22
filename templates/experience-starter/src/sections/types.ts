import type { Object3D, PerspectiveCamera, Scene } from 'three';
import type { PostFX, QualityProfile, SectionDef, Stage } from '@atelier/stage';
import type { SkyLook } from '@atelier/stage/effects';

export interface SectionContext {
	stage: Stage;
	scene: Scene;
	camera: PerspectiveCamera;
	post: PostFX;
}

/** What each section module returns. The section owns its objects; the experience wires them up. */
export interface SectionBundle {
	def: SectionDef;
	sky: SkyLook;
	root: Object3D;
	setProfile?( profile: QualityProfile ): void;
}
