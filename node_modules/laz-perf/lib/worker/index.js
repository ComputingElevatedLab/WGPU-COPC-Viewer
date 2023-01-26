"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LazPerf = exports.create = exports.createLazPerf = void 0;
const laz_perf_js_1 = __importDefault(require("./laz-perf.js"));
exports.createLazPerf = laz_perf_js_1.default;
exports.create = laz_perf_js_1.default;
exports.LazPerf = { create: laz_perf_js_1.default };
