# Character choreography per section

## The reference

Per section the reference stored `bakuParam { materialType, rotateSpeed }`, the glTF anchor transform and a clip named after the section; `changeSection` then called `changeRotateSpeed`, `changeMaterial` and `changeSectionAction` together.
From the MIT JUNNI source and the loanmeme evidence:

| Section | Set | Look | Spin (rad/s) | Clip |
|---|---|---|---|---|
| 1 | shatter wall, daylight | normal | 0 | `section_1` |
| 2 | ring of text slides, glass props | glass | -0.09 | loanmeme: `section_5` at 0.4x (JUNNI: its own `section_2` at 0.2x) |
| 3 | CRT displays, neon | normal | 0 | `section_3` |
| 4 | telephoto, crowd, bitmap type | line | 0 | `section_4`, plus the one-shot `section_4_jump` every 3.5 s |
| 5 | manifesto, dark | dark | 0.18 | `section_5` |
| 6 | road, comrades, rainbow CTA | normal | 0 | `section_6` |

Patterns worth copying:
- Look, clip and spin change together on the snap target, so the character "becomes" the set.
- Clips are reused at other speeds instead of authoring a new one per section.
- When spin goes to 0, the reference tweened the accumulated angle back to the nearest front-facing angle instead of stopping mid-turn.
  With `Character`, get the same effect by setting `spin = 0` and tweening the rig's rotation, since `spin` owns `root.rotation.y`.
- The character lives in one place in the world and anchors move it, so it never pops between sets.

## Pip in the study example

`examples/001-atelier-study/src/sections/*.ts` give every set a direction object and `experience.ts` applies it in `director.onChange`:

| Set | Clip | Time scale | Look | Spin |
|---|---|---|---|---|
| arrival | `wave` | 1 | normal | 0 |
| glass | `float` | 0.6 | glass | -0.35 |
| night | `idle` | 0.7 | dark | 0.18 |
| paper | `hop` | 0.8 | line | 0 |
| finale | `run` | 1 | normal | 0 |

Keep this kind of table in the storyboard and in code as data, so a change of direction is a one-line edit.

## One-shots on the stage clock

```ts
const hop = gltf.animations.find( ( c ) => c.name === 'hop' )!;
let jumpTimer = 0;
function jumpLoop() {
	hero.play( 'hop', { loop: false, fade: 0.1 } );
	stage.scheduler.after( hop.duration, () => hero.play( 'idle', { fade: 1 } ) );
	jumpTimer = stage.scheduler.after( 3.5, jumpLoop );
}
// enter(): jumpLoop();   leave(): stage.scheduler.cancel( jumpTimer );
```

The scheduler is cleared on `stage.reset()`, so a rewind stops the loop; restart it from the section's `enter()`, which the director replays.

## Timing with the camera

- Start the new clip and look at the snap (`director.onChange`), not when the camera arrives: the 1 s crossfade overlaps the 1 s camera move.
- Glass needs its backdrop in frame; if the camera arrives later than the look, delay `setLook( 'glass' )` with `stage.scheduler.after( 0.4, ... )`.
- In capture choreography, put character beats on cues so video and live playback match.
