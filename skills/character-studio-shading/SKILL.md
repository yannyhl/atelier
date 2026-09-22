---
name: character-studio-shading
description: Take a hero character or mascot from Blender to a studio-lit, section-choreographed star of an @atelier/stage scroll experience - scripted authoring with rigid-part skinning via vertex groups and one clip per beat (the Pip mascot.py worked example), glTF export and meshopt compression that keeps per-part roughness, AssetLoader, the Character class (studio shader, normal / glass / line / dark looks via setLook, clip crossfades and timeScale reuse via play, spin, outline width), placement with SectionTrack.anchorAt, the camera-relative key / fill / bounce rig math, and an optional tier-3 studio shadow plus crease AO pass (tested asset). Use when someone says "add the mascot", "rig the character", "make the character glass / line art / dark", "play a different animation per section", "the character looks flat / has no highlights", "character shadow", or "export the character from Blender".
---

# Character studio shading

The reference carries its story on one skinned character ("Baku", reskinned for Loan Meme): one clip per section, four material looks, a slow spin and a camera-relative studio light rig that keeps the plush readable on every set.
`Character` in `@atelier/stage/effects` rebuilds that system; this skill is the workflow around it.
The worked example is Pip, the atelier study mascot, authored as code in `examples/001-atelier-study/blender/mascot.py`.

## Workflow

1. Author the character in Blender from a script: parts, one armature, one action per beat.
2. Export glTF and compress with meshopt, keeping per-part materials.
3. Load with `AssetLoader` as a `must` asset if the first section shows the character.
4. Wrap it in `Character`, enable `post.refraction`, add it to the stage.
5. Direct it per section: clip and time scale, look, spin, anchor placement.
6. Optionally add the tier-3 studio shadow and AO.
7. Verify every section at four viewports and by scrubbing.

## 1. Author in Blender

Pip is built with primitives and rigid-part skinning, which suits toy-like mascots and keeps the file tiny:

- Every part (body, belly, eyes, cheeks, arms, feet, sprout) gets one vertex group named after its bone, weighted 1.0; the parts are joined into one mesh with an Armature modifier.
- Bones: `Root` (placement and hops), `Body`, `ArmL`, `ArmR`, `FootL`, `FootR`, `Sprout`; local Y runs along each bone, rotation mode XYZ.
- Materials by role, colors typed as sRGB hex and converted to linear in the script; roughness per material (eyes 0.06 with coat for glints, body 0.75 with sheen for plush).
- One action per beat with `use_fake_user`, exported with `export_animation_mode="ACTIONS"`: Pip has `idle` (2 s), `wave` (2 s), `hop` (1 s), `run` (0.7 s), `float` (3 s) at 30 fps.
- Loops return to the first pose on the last frame so `LoopRepeat` does not pop.
- Blender is Z-up; the exporter writes +Y up, and -Y in Blender becomes the character's front (+Z in three).

Name clips by motion (`wave`, `float`) rather than by section, so sections can reuse them at other speeds.
Budget: Pip is 13k triangles, 7 joints, 5 clips and about 104 KB after meshopt; the reference character was 11.3k triangles, 13 joints and 1.9 MB uncompressed.
The script walkthrough and the rules for sheen, coat and eyes are in [references/blender-authoring.md](references/blender-authoring.md).

## 2. Export and compress

```sh
blender -b --python examples/001-atelier-study/blender/mascot.py -- /tmp/pip.glb
npx gltf-transform optimize /tmp/pip.glb public/models/mascot.glb --compress meshopt --texture-compress false --palette false
node skills/dna-extraction/scripts/glb-info.mjs public/models/mascot.glb
```

`--palette false` matters for Character: the palette step merges materials and moves per-part roughness into a texture, and Character reads only the roughness factor, so every part becomes roughness 1 and the eye glints disappear.
Tested on Pip: with the palette the GLB has 3 palette materials and flat eyes; without it, 5 materials, working glints and the same 104 KB.
Check the `glb-info` output for the clip names, the joint count and `EXT_meshopt_compression`.
For named set nodes and the rest of the compression flags, follow [blender-gltf-stage](../blender-gltf-stage/SKILL.md).

## 3 and 4. Load and wrap

```ts
import { Group, type Scene } from 'three';
import { AssetLoader, type PostFX, type Stage } from '@atelier/stage';
import { Character } from '@atelier/stage/effects';

export async function addHero( stage: Stage, post: PostFX, scene: Scene ) {

	const loader = new AssetLoader( stage.renderer );
	await loader.load( [ { name: 'hero', url: '/models/mascot.glb', kind: 'gltf', priority: 'must' } ] );
	const gltf = loader.gltf( 'hero' );

	post.refraction = true;
	const rig = new Group();
	rig.add( gltf.scene );
	scene.add( rig );
	const hero = stage.add( new Character( {
		root: gltf.scene, clips: gltf.animations, stage,
		sceneTexture: post.opaqueTexture, sceneSize: post.sceneSize, lineWidth: 0.025,
	} ) );
	return { hero, rig };

}
```

- Character replaces every material with its studio shader (keeping the base color map, color factor, roughness factor clamped to 0.08..1, and a sheen flag), adds a back-face outline mesh per mesh for the line look, disables frustum culling and moves everything to `REFRACT_LAYER`.
  Without `post.refraction = true` the character never draws.
- `spin` writes `root.rotation.y` every step, so place and turn the `rig` group, never `gltf.scene` itself.
- `stage.add( hero )` runs `update( dt )` on the fixed clock and `reset()` on seek; add it before the `SectionDirector` so a rewind resets the character before section 0 re-enters.
- `lineWidth` is the outline offset along the normal in object units; set it later with `hero.lineWidth = 0.03`.
- Tint and fade: `hero.uniforms.tint.value` (linear color), animator key `character.main.opacity`; pass `name` for a second character.

## 5. Direct it per section

```ts
hero.play( 'float', { timeScale: 0.4 } );  // crossfade over 1 s (fade option), loop by default
hero.setLook( 'glass' );                   // tween looks over 1 s
hero.spin = 0.35;                          // radians per second around Y
```

- `play` resets and starts a clip only when it changes; calling it again with the same clip just changes `timeScale` and keeps the phase.
- Every clip weight tweens toward 1 for the new clip and 0 for the others; faded-out actions stop themselves.
- Reuse clips at other speeds like the reference: loanmeme's section 2 reused the section-5 clip at 0.4x (the JUNNI original slowed its own section-2 clip to 0.2x).
- The reference fired a one-shot jump every 3.5 s while section 4 was visible (0.1 s fade in, 1 s fade back); drive such loops from `stage.scheduler`, never `setInterval`.
- One-shots return on the stage clock: `hero.play( 'hop', { loop: false, fade: 0.1 } ); stage.scheduler.after( 1.03, () => hero.play( 'idle' ) );` (the clip duration from `gltf.animations`, divided by the time scale).
- Put the per-section direction in data (clip, time scale, look, spin) and apply it in `director.onChange` or each section's `enter()`; `examples/001-atelier-study/src/experience.ts` does exactly that.

Placement: give each `Shot` an `anchor` (read by `shotFromScene` from an `Anchor` empty, or typed by hand) and copy the interpolated pose to the rig every step:

```ts
import { Quaternion, Vector3, type Object3D } from 'three';
import type { SectionScroller, SectionTrack, Stage } from '@atelier/stage';

export function followAnchors( stage: Stage, track: SectionTrack, scroller: SectionScroller, rig: Object3D ) {

	const pose = { position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3( 1, 1, 1 ) };
	stage.add( { update: () => {

		if ( ! track.anchorAt( scroller.value, pose ) ) return;
		rig.position.copy( pose.position );
		rig.quaternion.copy( pose.quaternion );
		rig.scale.copy( pose.scale );

	} } );

}
```

The character then travels with the camera between sets instead of popping.
The reference section table and Pip's mapping are in [references/choreography.md](references/choreography.md).

## Looks

| Look | Shader result | Use |
|---|---|---|
| `normal` | the studio rig below | arrival, finale, most sets |
| `glass` | `atRefract( scene, uv, n, 0.3, 0.1, 1 ) * mix( 0.8, albedo, 0.5 ) + F * 0.8`, 8 taps | a glass set with a colorful backdrop ([glass-refraction](../glass-refraction/SKILL.md)) |
| `line` | flat paper white `mix( 0.96, albedo, 0.08 )` plus the black inverted-hull outline | light, graphic, telephoto sets |
| `dark` | black body with a white Fresnel rim `F * 1.4` | night sets, silhouettes against bright backdrops |

Looks are weights mixed in the order normal, line, dark, glass, so a mid-tween frame is a valid blend; `setLook( look, duration )` moves all weights at once.

## The studio rig

All lights are in view space, so they move with the camera and every set gets the same flattering light:

| Light | Direction (view space) | Color (linear) |
|---|---|---|
| ambient | none | albedo x 0.08 |
| key, warm, upper left | (-0.5, 0.65, 0.6) | (3.0, 2.94, 2.85) |
| fill, cool, right | (0.8, 0.2, 0.8) | (0.55, 0.62, 0.72) |
| bounce, blue floor | (0.0, -1.0, 0.45) | (0.2, 0.24, 0.3) |

Plush gets a wrapped diffuse (`wrap = 0.25 * sheen`), a sheen rim `albedo * ( 1 - n.v )^3 * 0.35` and softer specular; the underside darkens to 0.55 as the world normal turns down; glossy parts get two softbox glints (`pow( ., 100 ) * 0.85` and `pow( ., 180 ) * 0.3`) scaled by `1 - roughness`.
Every formula, the energy budget and how to retune it are in [references/lighting-rig.md](references/lighting-rig.md).

## Optional: tier-3 studio shadow and AO

The reference rendered two extra depth passes per frame for the character: a 1024 px studio shadow with 5 x 5 PCF and a 12-sample golden-angle AO against a view-depth pass.
The engine omits both by default and fakes the grounding with the underside term; add them back at tier 3 with [assets/StudioShadow.ts](assets/StudioShadow.ts):

```ts
import type { PerspectiveCamera, Scene } from 'three';
import type { PostFX, Stage } from '@atelier/stage';
import type { Character } from '@atelier/stage/effects';
import { StudioShadow } from './StudioShadow';

export function addStudioShadow( stage: Stage, post: PostFX, scene: Scene, camera: PerspectiveCamera, hero: Character, floorY: number ) {

	const studio = stage.add( new StudioShadow( { stage, character: hero, camera, sceneSize: post.sceneSize } ) );
	const catcher = studio.createCatcher( 3 );
	catcher.position.y = floorY;
	scene.add( catcher );
	stage.render = () => {

		studio.render( scene );
		post.render( scene, camera );

	};
	return studio;

}
```

It enables itself only when `profile.tier >= 3` and `profile.shadows`, renders the character's depth from an orthographic camera along the camera-relative key and from the main camera at half resolution, and multiplies the normal look by a 12-tap spiral PCF (adapted from the MIT JUNNI shader) times a 12-tap crease AO.
The catcher is a floor plane that receives the same shadow.
Design, costs, tuning and the one engine seam it patches are in [references/studio-shadow-ao.md](references/studio-shadow-ao.md).

## Verify

1. Capture every section at phone, tablet, laptop and desktop; the character must stay inside the safe area in portrait (tune anchors and `portraitFov`).
2. Look at the eyes: glints visible in the normal look (if not, re-run the optimize step with `--palette false`).
3. Scrub with `seek` back and forth across section changes: clip crossfades and look tweens must not pop, and a rewind to 0 must match a fresh load.
4. Check the line look at phone size: raise `lineWidth` if the outline breaks up.
5. With the studio pass, compare `?tier=2` (off) and `?tier=3` (on) and read the frame time in `npm run audit`.

## References

- [references/blender-authoring.md](references/blender-authoring.md): Pip's script step by step, rigid-part skinning, clip rules, export flags.
- [references/lighting-rig.md](references/lighting-rig.md): the full shader math of the rig and the looks.
- [references/choreography.md](references/choreography.md): reference section table, clip reuse, one-shots, Pip's mapping.
- [references/studio-shadow-ao.md](references/studio-shadow-ao.md): the tier-3 option in depth.
- [assets/StudioShadow.ts](assets/StudioShadow.ts) and [assets/studio-shadow.glsl](assets/studio-shadow.glsl): the tested tier-3 pass.
- Related: [blender-gltf-stage](../blender-gltf-stage/SKILL.md), [scroll-stage](../scroll-stage/SKILL.md), [uniform-animator](../uniform-animator/SKILL.md).
