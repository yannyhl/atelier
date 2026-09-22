import type { Material } from 'three';
import type { Tween } from '@atelier/stage';
import { GLSL } from '@atelier/stage/effects';

export interface PopInOptions {
	/** Group progress: 0 hidden, 1 shown. Tween it with the animator (linear easing; the overshoot is per instance). */
	reveal: Tween<number>;
	/** Number of instances in the InstancedMesh. */
	count: number;
	/** Stagger spread: 0 all at once, 1.5 roughly one after another (the reference 0.15 s steps). */
	spread?: number;
}

/**
 * Staggered easeOutBack pop-in for an InstancedMesh, computed in the vertex shader from
 * `gl_InstanceID` and one tweened uniform: zero CPU per frame and time-pure, so capture is exact.
 * Works on any built-in material (MeshMatcapMaterial for the reference props). Returns the material.
 * Set instance matrices once; the shader scales each instance about its own origin.
 */
export function addPopIn<T extends Material>( material: T, o: PopInOptions ): T {

	const previous = material.onBeforeCompile;
	material.onBeforeCompile = ( shader, renderer ) => {

		previous.call( material, shader, renderer );
		shader.uniforms.uPopReveal = o.reveal;
		shader.uniforms.uPopCount = { value: o.count };
		shader.uniforms.uPopSpread = { value: o.spread ?? 1.5 };
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\n' + GLSL.common + /* glsl */`
				uniform float uPopReveal;
				uniform float uPopCount;
				uniform float uPopSpread;
			` )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\n' + /* glsl */`
				#ifdef USE_INSTANCING
					float popT = atStagger( uPopReveal, float( gl_InstanceID ), uPopCount, uPopSpread );
					transformed *= max( atEaseOutBack( popT ), 1e-4 );
				#endif
			` );

	};

	const key = material.customProgramCacheKey.bind( material );
	material.customProgramCacheKey = () => key() + '|at-popin';
	return material;

}
