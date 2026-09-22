import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three';

/**
 * Procedural 16 x 2 walk-cycle sprite atlas for the crowd (the reference used a hand-drawn 16 x 2 sheet).
 * Row 0: facing the camera (front walk). Row 1: side view walking right (mirrored in the shader for left).
 * Pure red marks the "shirt" region that the crowd shader recolors per style; alpha is the silhouette.
 * Original drawing code, no third-party art. `cell` is the frame height in pixels (width is half).
 */
export function createWalkAtlas( cell = 128 ) {

	const w = cell / 2, h = cell;
	const canvas = document.createElement( 'canvas' );
	canvas.width = w * 16;
	canvas.height = h * 2;
	const g = canvas.getContext( '2d' )!;
	g.lineCap = 'round';
	g.lineJoin = 'round';

	const skin = '#ffffff', shirt = '#ff0000', pants = '#2b303b', shoe = '#15171c';
	const s = h / 128;

	for ( let row = 0; row < 2; row ++ ) {

		for ( let f = 0; f < 16; f ++ ) {

			const phase = ( f / 16 ) * Math.PI * 2;
			const swing = Math.sin( phase );
			const bob = Math.abs( Math.cos( phase ) ) * 3 * s;
			g.save();
			g.translate( f * w + w / 2, row * h + h - 6 * s - bob );

			if ( row === 0 ) {

				// Front: legs lift alternately, arms swing up and down.
				for ( const side of [ - 1, 1 ] ) {

					const lift = Math.max( 0, swing * side ) * 10 * s;
					line( g, side * 7 * s, - 44 * s, side * 7 * s, - lift, 9 * s, pants );
					line( g, side * 7 * s, - lift, side * 8 * s, - lift, 10 * s, shoe );
					line( g, side * 16 * s, - 80 * s, side * 18 * s, - 54 * s - swing * side * 6 * s, 7 * s, skin );

				}

				roundRect( g, - 15 * s, - 86 * s, 30 * s, 46 * s, 10 * s, shirt );

			} else {

				// Side: legs and arms swing fore and aft in opposition.
				const leg = ( a: number, color: string ) => {

					const x = Math.sin( a ) * 22 * s;
					line( g, 0, - 44 * s, x, - Math.cos( a ) * 2 * s, 9 * s, color );
					line( g, x, 0, x + 7 * s, 0, 9 * s, shoe );

				};
				leg( swing * 0.55, '#232730' );
				line( g, 0, - 80 * s, - Math.sin( swing * 0.6 ) * 22 * s, - 56 * s, 7 * s, '#e6e6e6' );
				leg( - swing * 0.55, pants );
				roundRect( g, - 11 * s, - 86 * s, 22 * s, 46 * s, 10 * s, shirt );
				line( g, 0, - 80 * s, Math.sin( swing * 0.6 ) * 22 * s, - 56 * s, 7 * s, skin );

			}

			g.fillStyle = skin;
			g.beginPath();
			g.arc( row === 0 ? 0 : 2 * s, - 102 * s, 14 * s, 0, Math.PI * 2 );
			g.fill();
			g.restore();

		}

	}

	const tex = new CanvasTexture( canvas );
	tex.colorSpace = SRGBColorSpace;
	tex.magFilter = NearestFilter;
	tex.generateMipmaps = false;
	return tex;

}

function line( g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, width: number, color: string ) {

	g.strokeStyle = color;
	g.lineWidth = width;
	g.beginPath();
	g.moveTo( x0, y0 );
	g.lineTo( x1, y1 );
	g.stroke();

}

function roundRect( g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string ) {

	g.fillStyle = color;
	g.beginPath();
	g.roundRect( x, y, w, h, r );
	g.fill();

}
