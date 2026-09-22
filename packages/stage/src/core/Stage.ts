import { WebGLRenderer } from 'three';
import { Animator, type Tween } from '../motion/Animator';
import { Scheduler } from '../motion/Scheduler';
import { FrameMonitor } from '../quality/FrameMonitor';
import { PROFILES, probeTier, type ProbeResult, type QualityProfile, type Tier } from '../quality/tiers';
import { Clock } from './Clock';
import { Emitter } from './Emitter';
import { createRng, type Rng } from './random';
import { createViewport, type Viewport } from './Viewport';

/** Anything that lives on the stage. All hooks are optional. */
export interface StageSystem {
	/** Fixed-step update. `dt` is always `stage.clock.step`. */
	update?( dt: number, stage: Stage ): void;
	resize?( viewport: Viewport, stage: Stage ): void;
	/** Restore the initial state. Required for exact seek(t) back to 0. */
	reset?( stage: Stage ): void;
	setProfile?( profile: QualityProfile, stage: Stage ): void;
}

export interface StageOptions {
	canvas: HTMLCanvasElement;
	/** Fixed simulation rate. */
	hz?: number;
	/** Deterministic capture mode: no rAF loop, frames only via seek(t); preserves the drawing buffer. */
	capture?: { width: number; height: number; dpr?: number };
	/** Pin a tier (otherwise probed, then adapted at runtime). */
	tier?: Tier;
	/** Adjust the tier from measured frame times. Default true (always false in capture). */
	adaptive?: boolean;
	/** Seed for `stage.rng`. */
	seed?: number;
	clearColor?: number;
}

export interface StageEvents extends Record<string, unknown> {
	resize: Viewport;
	tier: QualityProfile;
	/** WebGL is unavailable, the tier probe said 0, or the context was lost. Keep the static page. */
	fallback: string;
	frame: number;
}

declare global {
	interface Window {
		__atelier?: {
			stage: Stage;
			ready: Promise<void>;
			seek( t: number ): void;
			stats(): Record<string, unknown>;
		};
	}
}

/**
 * The stage: renderer, fixed-step clock, animator, scheduler, quality tier and frame loop.
 *
 * Contract for determinism: every system advances only in `update(dt)`, reads time from
 * `stage.time` or the clock, uses `stage.rng` instead of Math.random, and schedules with
 * `stage.scheduler` instead of setTimeout. Then `seek(t)` renders exactly what live playback shows.
 */
export class Stage extends Emitter<StageEvents> {

	readonly renderer: WebGLRenderer;
	readonly clock: Clock;
	readonly animator = new Animator();
	readonly scheduler = new Scheduler();
	/** Simulation time as a uniform. Share it into every material that animates. */
	readonly time: Tween<number> = { value: 0 };
	readonly rng: Rng;
	readonly reducedMotion: boolean;
	readonly capture: boolean;
	readonly probe: ProbeResult;

	viewport: Viewport;
	profile: QualityProfile;
	/** Called once per displayed frame after all steps. Assign your render function here. */
	render: ( stage: Stage ) => void = () => {};

	private systems: StageSystem[] = [];
	private monitor = new FrameMonitor();
	private raf = 0;
	private last: number | null = null;
	private running = false;
	private pageVisible = true;
	private onScreen = true;
	private readyResolve!: () => void;
	readonly ready: Promise<void>;
	private cleanup: Array<() => void> = [];
	private wanted = false;
	private adaptive: boolean;
	private captureSize?: { width: number; height: number; dpr: number };

	constructor( private options: StageOptions ) {

		super();

		this.clock = new Clock( options.hz ?? 60 );
		this.rng = createRng( options.seed ?? 1 );
		this.capture = !! options.capture;
		this.captureSize = options.capture ? { dpr: 1, ...options.capture } : undefined;
		this.adaptive = ! this.capture && ( options.adaptive ?? true ) && options.tier === undefined;
		this.reducedMotion = ! this.capture && matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
		this.ready = new Promise( ( r ) => ( this.readyResolve = r ) );

		this.renderer = new WebGLRenderer( {
			canvas: options.canvas,
			antialias: false,
			alpha: false,
			stencil: false,
			powerPreference: 'high-performance',
			preserveDrawingBuffer: this.capture,
		} );
		this.renderer.setClearColor( options.clearColor ?? 0x000000, 1 );
		this.renderer.info.autoReset = false;

		this.probe = probeTier( this.renderer.getContext() );
		const tier = options.tier ?? ( this.capture ? 3 : this.probe.tier );
		this.profile = PROFILES[ tier ];
		this.viewport = this.measure();
		this.applySize();

		const onLost = ( e: Event ) => {

			e.preventDefault();
			this.stop();
			this.emit( 'fallback', 'context lost' );

		};
		options.canvas.addEventListener( 'webglcontextlost', onLost );
		this.cleanup.push( () => options.canvas.removeEventListener( 'webglcontextlost', onLost ) );

		if ( ! this.capture ) this.watchEnvironment();

		window.__atelier = {
			stage: this,
			ready: this.ready,
			seek: ( t: number ) => this.seek( t ),
			stats: () => this.stats(),
		};

	}

	add<T extends StageSystem>( system: T ): T {

		this.systems.push( system );
		system.setProfile?.( this.profile, this );
		system.resize?.( this.viewport, this );
		return system;

	}

	/** Mark assets loaded and shaders compiled. Capture and audit scripts wait on this. */
	markReady() {

		this.readyResolve();

	}

	start() {

		this.wanted = true;
		if ( this.capture || this.running || ! this.pageVisible || ! this.onScreen ) return;
		if ( this.profile.tier === 0 ) {

			this.emit( 'fallback', 'tier 0' );
			return;

		}

		this.running = true;
		this.last = null;
		this.loop();

	}

	stop() {

		this.wanted = false;
		this.pause();

	}

	private pause() {

		this.running = false;
		cancelAnimationFrame( this.raf );

	}

	/** Advance or rewind to simulation time `t` (seconds) and render that frame. */
	seek( t: number ) {

		if ( t < this.clock.time - 1e-9 ) this.reset();
		const steps = this.clock.stepsUntil( t );
		for ( let i = 0; i < steps; i ++ ) this.step();
		this.draw();

	}

	private draw() {

		this.renderer.info.reset();
		this.render( this );
		this.emit( 'frame', this.clock.tick );

	}

	reset() {

		this.clock.reset();
		this.time.value = 0;
		this.animator.reset();
		this.scheduler.reset();
		this.rng.reset();
		this.systems.forEach( ( s ) => s.reset?.( this ) );

	}

	setTier( tier: Tier ) {

		if ( tier === this.profile.tier ) return;
		this.profile = PROFILES[ tier ];
		if ( tier === 0 ) {

			this.stop();
			this.emit( 'fallback', 'tier 0 after runtime downgrade' );
			return;

		}

		this.applySize();
		this.systems.forEach( ( s ) => s.setProfile?.( this.profile, this ) );
		this.emit( 'tier', this.profile );

	}

	stats() {

		const info = this.renderer.info;
		return {
			tier: this.profile.tier,
			probe: this.probe,
			viewport: this.viewport,
			time: this.clock.time,
			calls: info.render.calls,
			triangles: info.render.triangles,
			geometries: info.memory.geometries,
			textures: info.memory.textures,
			programs: info.programs?.length ?? 0,
		};

	}

	dispose() {

		this.stop();
		this.cleanup.forEach( ( f ) => f() );
		this.renderer.dispose();
		if ( window.__atelier?.stage === this ) delete window.__atelier;

	}

	private step() {

		const dt = this.clock.step;
		this.clock.commitStep();
		this.time.value = this.clock.time;
		this.scheduler.update( dt );
		this.animator.update( dt );
		for ( const s of this.systems ) s.update?.( dt, this );

	}

	private loop = () => {

		if ( ! this.running ) return;
		this.raf = requestAnimationFrame( this.loop );

		const now = performance.now();
		const realDt = this.last === null ? this.clock.step : ( now - this.last ) / 1000;
		this.last = now;

		const steps = this.clock.advance( realDt );
		for ( let i = 0; i < steps; i ++ ) this.step();
		if ( steps > 0 ) this.draw();

		if ( this.adaptive ) {

			const verdict = this.monitor.sample( realDt * 1000 );
			if ( verdict !== 0 ) {

				const next = Math.max( 0, Math.min( 3, this.profile.tier + verdict ) ) as Tier;
				this.monitor.reset();
				this.setTier( next );

			}

		}

	};

	private measure(): Viewport {

		if ( this.captureSize ) return createViewport( this.captureSize.width, this.captureSize.height, this.captureSize.dpr );
		const c = this.options.canvas;
		const dpr = Math.min( window.devicePixelRatio || 1, this.profile.dprCap );
		return createViewport( c.clientWidth || window.innerWidth, c.clientHeight || window.innerHeight, dpr );

	}

	private applySize() {

		this.viewport = this.measure();
		const v = this.viewport;
		this.renderer.setPixelRatio( v.dpr );
		this.renderer.setSize( v.width, v.height, !! this.captureSize );
		this.systems.forEach( ( s ) => s.resize?.( v, this ) );
		this.emit( 'resize', v );

	}

	private watchEnvironment() {

		const canvas = this.options.canvas;

		const ro = new ResizeObserver( () => this.applySize() );
		ro.observe( canvas );
		this.cleanup.push( () => ro.disconnect() );

		const resume = () => {

			const shouldRun = this.wanted && this.pageVisible && this.onScreen;
			if ( shouldRun && ! this.running ) this.start();
			else if ( ! shouldRun && this.running ) this.pause();

		};

		const onVisibility = () => {

			this.pageVisible = document.visibilityState === 'visible';
			resume();

		};
		document.addEventListener( 'visibilitychange', onVisibility );
		this.cleanup.push( () => document.removeEventListener( 'visibilitychange', onVisibility ) );

		const io = new IntersectionObserver( ( entries ) => {

			this.onScreen = entries[ entries.length - 1 ].isIntersecting;
			resume();

		} );
		io.observe( canvas );
		this.cleanup.push( () => io.disconnect() );

	}

}
