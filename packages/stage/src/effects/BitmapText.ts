import {
	CanvasTexture, DoubleSide, InstancedBufferAttribute, InstancedMesh, LinearFilter, Matrix4, PlaneGeometry,
	ShaderMaterial, type Texture,
} from 'three';
import type { Tween } from '../motion/Animator';
import { GLSL } from './chunks';

export interface GlyphAtlas {
	texture: Texture;
	columns: number;
	rows: number;
	chars: string;
	/** Advance per glyph in em (0..1 of a tile). */
	advances: Map<string, number>;
}

/**
 * Renders a glyph atlas from any loaded web font with Canvas2D.
 * The reference shipped a hand-painted 8x8 atlas (a-z only); generating it keeps any font and charset.
 * Await `document.fonts.load(font)` before calling.
 */
export function createGlyphAtlas( chars: string, font = '700 96px sans-serif', tile = 128 ): GlyphAtlas {

	if ( typeof document !== 'undefined' && document.fonts && ! document.fonts.check( font ) ) {

		console.warn( `[atelier] createGlyphAtlas: "${font}" is not loaded yet; await document.fonts.load( font ) first or glyphs fall back to another face` );

	}

	const list = Array.from( new Set( Array.from( chars ) ) );
	const columns = Math.ceil( Math.sqrt( list.length ) );
	const rows = Math.ceil( list.length / columns );
	// Keep the atlas inside the 4096 px texture size every WebGL2 device supports.
	tile = Math.min( tile, Math.floor( 4096 / Math.max( columns, rows ) ) );
	const canvas = document.createElement( 'canvas' );
	canvas.width = columns * tile;
	canvas.height = rows * tile;
	const ctx = canvas.getContext( '2d' )!;
	ctx.fillStyle = '#fff';
	ctx.font = font;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	const advances = new Map<string, number>();
	list.forEach( ( ch, i ) => {

		const x = ( i % columns ) * tile + tile / 2;
		const y = Math.floor( i / columns ) * tile + tile / 2;
		ctx.fillText( ch, x, y + tile * 0.04 );
		advances.set( ch, Math.min( 1, ctx.measureText( ch ).width / tile + 0.06 ) );

	} );

	const texture = new CanvasTexture( canvas );
	texture.minFilter = LinearFilter;
	texture.generateMipmaps = false;
	return { texture, columns, rows, chars: list.join( '' ), advances };

}

export interface BitmapTextOptions {
	atlas: GlyphAtlas;
	/** 0 hidden, 1 shown, 2 dismissed. Tween it; characters stagger in and out. */
	reveal: Tween<number>;
	time: Tween<number>;
	size?: number;
	/** Max characters this mesh can show. */
	capacity?: number;
	color?: [ number, number, number ];
}

/**
 * Instanced glyph quads with the reference "spin-in hop": each character rotates a full turn
 * around Y and hops while revealing, staggered left to right. One draw call per text block.
 */
export class BitmapText extends InstancedMesh {

	private atlas: GlyphAtlas;
	private size: number;
	private capacity: number;
	private glyph: InstancedBufferAttribute;
	private order: InstancedBufferAttribute;
	width = 0;

	constructor( o: BitmapTextOptions ) {

		const capacity = o.capacity ?? 48;
		const geometry = new PlaneGeometry( 1, 1 );
		const glyph = new InstancedBufferAttribute( new Float32Array( capacity ), 1 );
		const order = new InstancedBufferAttribute( new Float32Array( capacity * 2 ), 2 );
		geometry.setAttribute( 'aGlyph', glyph );
		geometry.setAttribute( 'aOrder', order );

		const material = new ShaderMaterial( {
			uniforms: {
				uAtlas: { value: o.atlas.texture },
				uGrid: { value: [ o.atlas.columns, o.atlas.rows ] },
				uReveal: o.reveal,
				uTime: o.time,
				uColor: { value: o.color ?? [ 1, 1, 1 ] },
			},
			vertexShader: GLSL.common + /* glsl */`
				attribute float aGlyph;
				attribute vec2 aOrder;
				uniform vec2 uGrid;
				uniform float uReveal;
				varying vec2 vUv;
				varying float vAlpha;
				void main() {
					float index = aOrder.x, count = aOrder.y;
					float v = uReveal;
					float inT = atStagger( clamp( v, 0.0, 1.0 ), index, count, 1.2 );
					float outT = atStagger( clamp( v - 1.0, 0.0, 1.0 ), index, count, 1.2 );
					float k = atEaseOutCubic( inT ) - atEaseOutCubic( outT );
					vec3 p = position;
					p.xz = atRotate( ( 1.0 - inT + outT ) * AT_TPI ) * p.xz;
					p *= mix( 0.001, 1.0, clamp( k * 1.4, 0.0, 1.0 ) );
					p.y += sin( inT * AT_PI ) * 0.5 + sin( outT * AT_PI ) * 0.5;
					vec2 cell = vec2( mod( aGlyph, uGrid.x ), floor( aGlyph / uGrid.x ) );
					vUv = ( vec2( cell.x, uGrid.y - 1.0 - cell.y ) + uv ) / uGrid;
					vAlpha = k;
					gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( p, 1.0 );
				}
			`,
			fragmentShader: /* glsl */`
				uniform sampler2D uAtlas;
				uniform vec3 uColor;
				varying vec2 vUv;
				varying float vAlpha;
				void main() {
					float a = texture2D( uAtlas, vUv ).a * vAlpha;
					if ( a < 0.02 ) discard;
					gl_FragColor = vec4( uColor, a );
				}
			`,
			transparent: true,
			depthWrite: false,
			side: DoubleSide,
		} );

		super( geometry, material, capacity );
		this.atlas = o.atlas;
		this.size = o.size ?? 1;
		this.capacity = capacity;
		this.glyph = glyph;
		this.order = order;
		this.frustumCulled = false;
		this.count = 0;

	}

	/** Lay out a single line centered at the origin. Unknown characters become spaces. */
	setText( text: string, tracking = 0.08 ) {

		const chars = Array.from( text ).slice( 0, this.capacity );
		const m = new Matrix4();
		let x = 0;
		const positions: number[] = [];
		let n = 0;

		for ( const ch of chars ) {

			const adv = ( this.atlas.advances.get( ch ) ?? 0.4 ) + tracking;
			const gi = this.atlas.chars.indexOf( ch );
			if ( ch !== ' ' && gi >= 0 ) {

				positions.push( x + adv / 2 );
				this.glyph.setX( n, gi );
				n ++;

			}

			x += adv;

		}

		this.width = x * this.size;
		for ( let i = 0; i < n; i ++ ) {

			m.makeScale( this.size, this.size, this.size ).setPosition( ( positions[ i ] - x / 2 ) * this.size, 0, 0 );
			this.setMatrixAt( i, m );
			this.order.setXY( i, i, n );

		}

		this.count = n;
		this.instanceMatrix.needsUpdate = true;
		this.glyph.needsUpdate = true;
		this.order.needsUpdate = true;

	}

}
