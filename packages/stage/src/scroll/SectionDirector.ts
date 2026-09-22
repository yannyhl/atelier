import type { Object3D } from 'three';
import type { Stage, StageSystem } from '../core/Stage';
import { oneHot, type Tween } from '../motion/Animator';
import { Easings } from '../motion/Easings';
import type { PostFX, PostParams } from '../post/PostFX';
import type { SectionScroller } from './SectionScroller';
import type { Shot } from './SectionTrack';

export type SectionState = 'ready' | 'viewing' | 'passed';

export interface SectionDef {
	name: string;
	/** Human label for the timeline dots and aria. */
	label: string;
	shot: Shot;
	post?: PostParams;
	/** Index of this section's look in a one-hot array (sky, trail, ground...). Defaults to its index. */
	look?: number;
	/** Hidden when the section has fully faded out, to skip its draw calls. */
	root?: Object3D;
	/** DOM overlay for this section; receives data-visible and data-state. */
	element?: HTMLElement | null;
	enter?( stage: Stage ): void;
	leave?( stage: Stage ): void;
	/** Fixed-step update while the section is at least partly visible. */
	update?( dt: number, stage: Stage, visibility: number ): void;
}

export interface SectionUniforms {
	/** 0 hidden .. 1 fully visible. */
	visibility: Tween<number>;
	/** 0 ready, 1 viewing, 2 passed. Lets shaders play different enter and exit motions. */
	state: Tween<number>;
}

/**
 * Section lifecycle driven by the scroller's snap target (the reference `changeSection`).
 * Every look change is a tween, so any number of systems can follow along through uniforms.
 */
export class SectionDirector implements StageSystem {

	readonly uniforms: SectionUniforms[];
	/** One-hot weights of the current look; share with SkyDome and friends. */
	readonly looks: Tween<number[]>;
	current = - 1;
	onChange?: ( index: number, def: SectionDef ) => void;

	constructor( private stage: Stage, private scroller: SectionScroller, readonly defs: SectionDef[], private post?: PostFX ) {

		const a = stage.animator;
		this.uniforms = defs.map( ( d ) => ( {
			visibility: a.add( `section.${d.name}.visibility`, 0, Easings.easeOutCubic ),
			state: a.add( `section.${d.name}.state`, 0, Easings.easeOutCubic ),
		} ) );
		this.looks = a.add( 'section.looks', oneHot( defs.length, 0 ), Easings.easeOutCubic );
		scroller.setCount( defs.length );
		scroller.on( 'target', ( i ) => this.go( i ) );
		this.go( 0, true );

	}

	uniformsOf( name: string ): SectionUniforms {

		const i = this.defs.findIndex( ( d ) => d.name === name );
		if ( i < 0 ) throw new Error( `SectionDirector: no section "${name}"` );
		return this.uniforms[ i ];

	}

	go( index: number, instant = false ) {

		if ( index === this.current ) return;
		const prev = this.current;
		this.current = index;
		const a = this.stage.animator;
		const d = instant ? 0 : 1;

		this.defs.forEach( ( def, i ) => {

			const state: SectionState = i < index ? 'passed' : i === index ? 'viewing' : 'ready';
			const u = this.uniforms[ i ];
			void a.animate( `section.${def.name}.state`, state === 'ready' ? 0 : state === 'viewing' ? 1 : 2, d );
			if ( i === index && def.root ) def.root.visible = true;
			void a.animate( `section.${def.name}.visibility`, i === index ? 1 : 0, d ).then( ( finished ) => {

				if ( finished && def.root && this.current !== i && u.visibility.value < 0.001 ) def.root.visible = false;

			} );

			if ( def.element ) {

				def.element.dataset.visible = String( i === index );
				def.element.dataset.state = state;
				def.element.inert = i !== index;

			}

		} );

		const def = this.defs[ index ];
		if ( this.post && def.post ) this.post.apply( a, def.post, d );
		void a.animate( 'section.looks', oneHot( this.defs.length, def.look ?? index ), d );

		if ( prev >= 0 ) this.defs[ prev ].leave?.( this.stage );
		def.enter?.( this.stage );
		document.documentElement.dataset.section = def.name;
		this.onChange?.( index, def );

	}

	update( dt: number, stage: Stage ) {

		this.defs.forEach( ( def, i ) => {

			const v = this.uniforms[ i ].visibility.value;
			if ( def.update && ( v > 0.001 || i === this.current ) ) def.update( dt, stage, v );

		} );

	}

	reset() {

		this.current = - 1;
		this.scroller.reset();
		this.defs.forEach( ( d ) => d.root && ( d.root.visible = false ) );
		this.go( 0, true );

	}

}
