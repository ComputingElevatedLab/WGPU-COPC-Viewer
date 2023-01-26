/// <reference types="emscripten" />
import createLazPerf from './laz-perf.js';
export { createLazPerf };
export declare const create: EmscriptenModuleFactory<import("./laz-perf.js").LazPerf>;
export declare type LazPerf = Awaited<ReturnType<typeof createLazPerf>>;
export declare const LazPerf: {
    create: EmscriptenModuleFactory<import("./laz-perf.js").LazPerf>;
};
