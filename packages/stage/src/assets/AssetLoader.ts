import { LoadingManager, type Texture, TextureLoader, type WebGLRenderer } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Emitter } from '../core/Emitter';

export type AssetKind = 'gltf' | 'texture';

export interface AssetEntry {
	name: string;
	url: string;
	kind: AssetKind;
	/** `must` blocks first render. `sub` streams afterwards. Keep `must` to what the first section shows. */
	priority: 'must' | 'sub';
	onLoad?: ( asset: GLTF | Texture ) => void;
}

export interface AssetEvents extends Record<string, unknown> {
	progress: number;
	must: void;
	all: void;
	error: { name: string; error: unknown };
}

export interface AssetLoaderOptions {
	/**
	 * Override where basis_transcoder.js/.wasm are served from. Leave unset: since r17x three's
	 * KTX2Loader resolves them with import.meta.url, so Vite bundles them automatically.
	 */
	basisPath?: string;
}

/**
 * glTF and texture loading in two priorities, with meshopt and KTX2 decoders wired in.
 * Ship glTF through `gltf-transform optimize` (meshopt + KTX2); see skills/blender-gltf-stage.
 */
export class AssetLoader extends Emitter<AssetEvents> {

	private gltfs = new Map<string, GLTF>();
	private textures = new Map<string, Texture>();
	private gltfLoader: GLTFLoader;
	private textureLoader: TextureLoader;
	private ktx2: KTX2Loader;

	constructor( renderer: WebGLRenderer, options: AssetLoaderOptions = {} ) {

		super();
		const manager = new LoadingManager();
		this.ktx2 = new KTX2Loader( manager ).detectSupport( renderer );
		if ( options.basisPath ) this.ktx2.setTranscoderPath( options.basisPath );
		this.gltfLoader = new GLTFLoader( manager ).setKTX2Loader( this.ktx2 ).setMeshoptDecoder( MeshoptDecoder );
		this.textureLoader = new TextureLoader( manager );

	}

	gltf( name: string ): GLTF {

		const g = this.gltfs.get( name );
		if ( ! g ) throw new Error( `AssetLoader: glTF "${name}" not loaded` );
		return g;

	}

	texture( name: string ): Texture {

		const t = this.textures.get( name );
		if ( ! t ) throw new Error( `AssetLoader: texture "${name}" not loaded` );
		return t;

	}

	has( name: string ) {

		return this.gltfs.has( name ) || this.textures.has( name );

	}

	/**
	 * Loads `must` entries, emits 'must', then loads `sub` entries and emits 'all'.
	 * The promise resolves after everything; to start rendering as soon as the must group is in,
	 * listen for the 'must' event instead of awaiting.
	 */
	async load( entries: AssetEntry[] ) {

		const must = entries.filter( ( e ) => e.priority === 'must' );
		const sub = entries.filter( ( e ) => e.priority === 'sub' );
		let done = 0;
		const total = Math.max( 1, entries.length );

		const one = async ( e: AssetEntry ) => {

			try {

				const asset = e.kind === 'gltf' ? await this.gltfLoader.loadAsync( e.url ) : await this.loadTexture( e.url );
				if ( e.kind === 'gltf' ) this.gltfs.set( e.name, asset as GLTF );
				else this.textures.set( e.name, asset as Texture );
				e.onLoad?.( asset );

			} catch ( error ) {

				this.emit( 'error', { name: e.name, error } );

			}

			this.emit( 'progress', ++ done / total );

		};

		await Promise.all( must.map( one ) );
		this.emit( 'must', undefined );
		await Promise.all( sub.map( one ) );
		this.emit( 'all', undefined );

	}

	private loadTexture( url: string ): Promise<Texture> {

		return url.endsWith( '.ktx2' ) ? this.ktx2.loadAsync( url ) : this.textureLoader.loadAsync( url );

	}

	dispose() {

		this.ktx2.dispose();
		this.textures.forEach( ( t ) => t.dispose() );

	}

}
