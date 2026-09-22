import type { Object3D, PerspectiveCamera, Scene } from 'three';
import type { PostFX, QualityProfile, SectionDef, Stage } from '@atelier/stage';
import type { Character, CharacterLook, SkyLook } from '@atelier/stage/effects';

export interface SectionContext {
	stage: Stage;
	scene: Scene;
	camera: PerspectiveCamera;
	post: PostFX;
	pip: Character;
}

/** How Pip behaves while a set is on screen. */
export interface PipDirection {
	clip: string;
	look: CharacterLook;
	/** Radians per second around Y. */
	spin?: number;
	timeScale?: number;
}

export interface SectionBundle {
	def: SectionDef;
	sky: SkyLook;
	root: Object3D;
	pip: PipDirection;
	setProfile?( profile: QualityProfile ): void;
}
