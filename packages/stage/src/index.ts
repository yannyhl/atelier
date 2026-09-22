export { Stage, type StageOptions, type StageSystem, type StageEvents } from './core/Stage';
export { Clock } from './core/Clock';
export { Emitter } from './core/Emitter';
export { createRng, type Rng } from './core/random';
export { createViewport, portraitWeightOf, type Viewport } from './core/Viewport';
export { warmUp } from './core/warmUp';

export { Animator, oneHot, type Tween, type AnimateOptions } from './motion/Animator';
export { Easings, HouseCurves, type Easing } from './motion/Easings';
export { Scheduler } from './motion/Scheduler';
export { Spring, Spring2 } from './motion/Spring';
export { lerp, clamp, smoothstep, damp } from './motion/lerp';

export { SectionScroller } from './scroll/SectionScroller';
export { bindScrollInput, type InputOptions } from './scroll/bindInput';
export { SectionTrack, shotFromScene, visibleSizeAt, type Shot } from './scroll/SectionTrack';
export { SectionDirector, type SectionDef, type SectionState, type SectionUniforms } from './scroll/SectionDirector';
export { trackPointer } from './scroll/pointer';

export { PostFX, REFRACT_LAYER, type PostParams } from './post/PostFX';

export { PROFILES, probeTier, type Tier, type QualityProfile, type ProbeResult, type AntiAlias } from './quality/tiers';
export { FrameMonitor } from './quality/FrameMonitor';

export { AssetLoader, type AssetEntry } from './assets/AssetLoader';

export { Choreography, readCaptureParams, type Cue } from './capture/Choreography';
