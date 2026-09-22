// Crowd position kernel for three's GPUComputationRenderer (see Crowd.ts).
//
// Adapted from next.junni.co.jp src/ts/MainScene/World/Sections/Section4/Peoples/shaders/computePosition.glsl
// Copyright 2022 Junni Co., ltd. Released under the MIT License (see THIRD_PARTY_NOTICES.md).
// Changes: the step is scaled by uDelta * 60 so other clock rates move at the same speed;
// w keeps the per-agent seed instead of an unused phase counter.

uniform float uDelta;

void main() {

	vec2 uv = gl_FragCoord.xy / resolution.xy;
	vec4 pos = texture2D( texturePosition, uv );
	vec3 vel = texture2D( textureVelocity, uv ).xyz;
	pos.xyz += vel * uDelta * 60.0;
	pos.y = max( 0.0, pos.y );
	gl_FragColor = pos;

}
