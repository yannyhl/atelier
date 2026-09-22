import { CanvasTexture, SRGBColorSpace } from 'three';

/**
 * Procedural matcap: a lit sphere painted with a radial gradient, a soft key highlight and a rim.
 * Good enough for the reference's matcap props without shipping a texture. Colors are CSS strings.
 */
export function createMatcap( base: string, shadow: string, highlight = '#ffffff', rim = base, size = 256 ) {

	const c = document.createElement( 'canvas' );
	c.width = c.height = size;
	const g = c.getContext( '2d' )!;
	const r = size / 2;

	const body = g.createRadialGradient( r * 0.7, r * 0.6, r * 0.1, r, r, r );
	body.addColorStop( 0, base );
	body.addColorStop( 1, shadow );
	g.fillStyle = body;
	g.beginPath();
	g.arc( r, r, r, 0, Math.PI * 2 );
	g.fill();

	const rimG = g.createRadialGradient( r, r, r * 0.75, r, r, r );
	rimG.addColorStop( 0, 'rgba(0,0,0,0)' );
	rimG.addColorStop( 1, rim );
	g.globalAlpha = 0.55;
	g.fillStyle = rimG;
	g.fill();

	const spec = g.createRadialGradient( r * 0.62, r * 0.5, 0, r * 0.62, r * 0.5, r * 0.35 );
	spec.addColorStop( 0, highlight );
	spec.addColorStop( 1, 'rgba(255,255,255,0)' );
	g.globalAlpha = 0.9;
	g.fillStyle = spec;
	g.fill();

	const tex = new CanvasTexture( c );
	tex.colorSpace = SRGBColorSpace;
	return tex;

}
