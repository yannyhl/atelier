# The GPGPU crowd

Status: recipe level with a tested asset ([../assets/crowd/Crowd.ts](../assets/crowd/Crowd.ts)); not part of `@atelier/stage`.
Tested in a browser harness at tier 3 (676 agents, float and forced half precision) and tier 1 (225 agents): agents wander, part around an avoid circle, switch shirt style on a tweened one-hot and fly on a pulse, with a scripted pointer driving the cursor uniform.

## The reference

JUNNI section 4 (`Peoples`, MIT): a telephoto shot (FOV 11.6) over a ground plane with 26 x 26 people.
- ore-three `GPUComputationController`: ping-pong RGBA textures, one texel per agent, `HalfFloatType` on iOS by user-agent sniffing, float elsewhere.
- Velocity kernel: 4D simplex flow, avoidance circles read from empties under an `Avoids` node in the section GLB, a weak pull to the center, constant speed 0.02 per frame, a shock wave on each text switch, gravity, cursor repulsion within 2 units from a ground raycast.
- Position kernel: `pos += vel`, clamp y at 0.
- Draw: an instanced plane per agent, 16 x 2 sprite atlas, row chosen by walking sideways, mirrored for left; staggered appear by column; four shirt styles switched on the character's jump.

## What the asset changes

| Reference | atelier |
|---|---|
| ore-three controller | three r186 `GPUComputationRenderer` (`three/addons/misc/GPUComputationRenderer.js`: `setDataType`, `addVariable`, `setVariableDependencies`, `init`, `compute`, `getCurrentRenderTarget`, `renderTexture`) |
| iOS user-agent check | `EXT_color_buffer_float` capability check, `precision: 'half'` to force the fallback |
| 4D simplex | 3D `atSnoise` with time in the third axis |
| `Math.random()` spawn | `stage.rng`, captured once, re-uploaded by `reset()` |
| per-frame steps | per-60 Hz-step velocities scaled by `uDelta * 60`, so other clock rates keep the speed |
| drift hack `- vec2( 1.2, 4.0 )` | `uniforms.center` |
| text-switch wave | `pulse` tween 0 to 1 |
| hand-drawn atlas | `createWalkAtlas()`: procedural 16 x 2 figures, red shirt mask |
| fixed plane facing +Z | cylindrical billboard toward the camera, row and mirror from the sideways component of velocity relative to the camera |

Compute order differs slightly: `GPUComputationRenderer` computes every variable from the previous step's textures, so position uses last step's velocity (the reference used the fresh one); the difference is one step of lag, invisible at walking speed.

## Setup from a Blender set

1. In the section GLB add an empty `Avoids` with one child empty per obstacle; scale each child to the obstacle's footprint (X and Z).
2. After loading, read them in the crowd's local space:

```ts
const avoids = root.getObjectByName( 'Avoids' )!;
const avoid = avoids.children.map( ( e ) => ( { x: e.position.x, z: e.position.z, sx: e.scale.x, sz: e.scale.z } ) );
avoids.visible = false;
```

3. Construct the crowd with `avoid`, parent `crowd.mesh` where the crowd stands (its local XZ plane is the ground), and pass pointer moves to `crowd.setPointer( x, y, camera )`, which raycasts onto that plane.
Keep `gltf-transform` from pruning the empties (see [blender-gltf-stage](../../blender-gltf-stage/SKILL.md)).

## Tuning

| Knob | Default | Effect |
|---|---|---|
| `side` | 26 | agents per side at effectScale 1 (count = side^2) |
| `radius` | 18 | spawn disc radius |
| `size` | 1.3 | sprite height; width is half |
| `uniforms.speed.value` | 0.02 | units per 60 Hz step (1.2 units per second) |
| `uniforms.center.value` | (0, 0) | where the crowd drifts back to |
| `avoid[i].sx`, `sz` | per obstacle | push starts inside half the scale |
| `style` | [1, 0, 0, 0] | one-hot shirt pattern weights; tween for a 0.2 s jump cut |
| `pulse` | 0 | tween 0 to 1 over about 3 s to send a ring outward |

Shader constants worth knowing: flow noise scale `0.7 + sin( time ) * 0.1`, cursor radius 2 with strength 0.1, avoid falloff `smoothstep( 0.5, 0.4, d )`, gravity 1/60 unit per step squared while airborne (60 units per second squared, so jumps are short hops).

## Cost

- Compute: two full-screen passes of `side x side` texels per step (676 fragments each), plus the ping-pong swap; negligible.
- Draw: one instanced call of `side^2` quads; the vertex shader reads the position and velocity textures (vertex texture fetch, available on all WebGL2 devices).
- Memory: four `side x side` RGBA float targets (about 43 KB at 26 x 26).
- Seeking replays every step from 0 while the crowd is visible: `seek( 10 )` runs 600 steps.
  The first seek also compiles both kernels; warm up with `renderer.compileAsync` and one `seek` before capture.
- Skip it entirely below tier 1 (static page) and consider a smaller `side` for sections where the crowd is small on screen.

## Determinism checklist

- Spawn from `stage.rng` in the constructor, in a fixed construction order.
- All motion inputs (`time`, `pulse`, `style`, `visibility`, cursor) come from the stage clock, the animator or scripted pointer.
- `reset()` writes the initial textures into both ping-pong targets, so it does not matter which one is current.
- Compute runs only inside `update( dt )`, never in the render callback.
- Float and half precision produce slightly different paths; capture with the precision the audience sees, or pin `precision`.

## Promoting it to the engine

When a second project needs it: move `Crowd.ts`, the two GLSL files and `walk-atlas.ts` to `packages/stage/src/effects/`, export from `effects/index.ts`, replace the `?raw` imports with the engine's chunk pattern, add a `setProfile` that rebuilds on large tier changes, and list the adaptation in `THIRD_PARTY_NOTICES.md`.
