# Backdrops that make glass read

Glass is a lens on whatever is behind it on screen.
Design the backdrop first and the glass second.

## Before and after: the starter glass section

Before: the torus knot sat alone in front of the section sky (`SkyLook` style 2, near-black with a thin blue horizon band).
The refraction had nothing to bend except a dark gradient, so the knot read as a gray, smoky shape defined only by its highlights and rim.
Bloom could not help: nothing behind the glass crossed the 0.5 threshold.

After: a curved wall of 22 thin panels in a hue ramp stands 3.6 units behind the knot, spanning about 150 degrees, turning slightly with time.
Now every part of the knot shows a displaced, color-split slice of the wall, the channel offsets separate at each panel edge, and the silhouette carries bright color into the bloom.
A capture of the same camera with and without the wall is the quickest way to judge any new glass section.

Recipe (from `templates/experience-starter/src/sections/glass.ts`):

```ts
const count = 22;
const panels = new InstancedMesh(
	new BoxGeometry( 0.5, 1.25, 0.02 ),
	new MeshMatcapMaterial( { matcap: createMatcap( '#ffffff', '#a9b3c4', '#ffffff', '#ffffff' ) } ),
	count,
);
const color = new Color();
for ( let i = 0; i < count; i ++ ) panels.setColorAt( i, color.setHSL( 0.95 - ( i / count ) * 0.8, 0.85, 0.6 ) );
// Each frame: place panel i on an arc, angle -1.3 + 2.6 * i / ( count - 1 ) radians, radius 3.6, facing the center,
// bobbing with sin( t * 0.7 + i * 0.9 ) * 0.22, and scale it in with a staggered easeOutBack.
```

Notes:
- `setHSL` without a color space treats the numbers as linear, which makes these panels light pastels on screen; that brightness is what the glass needs.
- The white-to-gray matcap gives each panel a vertical sheen, so even a single panel has an edge for the dispersion to split.
- For a time-pure version with no per-frame matrix work, set the matrices once and use the GPU pop-in from [gpgpu-effects](../../gpgpu-effects/SKILL.md).

## The reference: a ring of text slides

JUNNI section 2 put the glass props and the glass character in front of a ring of slides carrying large text, drawn alpha-tested in near white (0.9).
Text is ideal behind glass: thin, high-contrast strokes in every direction, so dispersion shows everywhere and the words stay half legible through the distortion.
To build it on the stage, use `BitmapText` or canvas textures on planes arranged on a ring on layer 0, and rotate the ring slowly (see [kinetic-type](../../kinetic-type/SKILL.md)).

## Checklist

- [ ] Something bright and saturated sits behind every glass object in every camera shot, including the portrait layout.
- [ ] The backdrop has edges (stripes, text, panel borders), not only smooth gradients.
- [ ] The backdrop moves slowly, or the camera parallax moves across it.
- [ ] The backdrop is on layer 0 (the opaque capture), not on `REFRACT_LAYER`.
- [ ] The glass silhouette stays clear of the frame edges.
- [ ] Bloom for the section is at least 0.35 so rims and bright refracted stripes glint.
