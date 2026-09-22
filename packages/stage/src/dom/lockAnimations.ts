import type { Stage } from '../core/Stage';

/**
 * Capture mode only: freezes every CSS transition and animation in the document and drives its
 * currentTime from the stage clock, so DOM overlays in a video are frame-exact and repeatable.
 * Call `sync()` right before each frame is captured.
 */
export function lockDocumentAnimations( stage: Stage ) {

	const born = new WeakMap<Animation, number>();

	return {
		sync() {

			const now = stage.clock.time;
			// Flush pending style so transitions triggered this step exist before we pause them;
			// otherwise the screenshot's own style flush creates them and they run on wall-clock time.
			void document.documentElement.offsetHeight;
			void getComputedStyle( document.documentElement ).opacity;
			for ( const a of document.getAnimations() ) {

				if ( ! born.has( a ) ) {

					born.set( a, now );
					a.pause();

				}

				a.currentTime = ( now - ( born.get( a ) ?? now ) ) * 1000;

			}

		},
	};

}
