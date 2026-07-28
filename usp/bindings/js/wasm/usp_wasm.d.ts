/* tslint:disable */
/* eslint-disable */

export class WasmHlc {
    free(): void;
    [Symbol.dispose](): void;
    static compare(a_str: string, b_str: string): number;
    static fromTimestamp(node_id: string, timestamp_ms: number, counter: number): WasmHlc;
    inc(current_time_ms: number): string;
    incNow(): string;
    constructor(node_id: string);
    pack(): string;
    receive(remote_hlc: string, current_time_ms?: number | null): void;
}

export class WasmLwwMap {
    free(): void;
    [Symbol.dispose](): void;
    applyMutation(mutation_json: string, default_node_id: string): boolean;
    computeDiff(channel: string | null | undefined, old_map: WasmLwwMap): any;
    constructor();
    toJson(): any;
}

export function get_storage_key(payload: string): string;

export function parse_mutation(payload: string): any;

export function process_sync_frame(payload: string): any;

export function should_broadcast(payload: string): boolean;

export function validate_security(key: string): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmhlc_free: (a: number, b: number) => void;
    readonly __wbg_wasmlwwmap_free: (a: number, b: number) => void;
    readonly get_storage_key: (a: number, b: number) => [number, number, number, number];
    readonly parse_mutation: (a: number, b: number) => [number, number, number];
    readonly process_sync_frame: (a: number, b: number) => [number, number, number];
    readonly should_broadcast: (a: number, b: number) => [number, number, number];
    readonly validate_security: (a: number, b: number) => number;
    readonly wasmhlc_compare: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmhlc_fromTimestamp: (a: number, b: number, c: number, d: number) => number;
    readonly wasmhlc_inc: (a: number, b: number) => [number, number];
    readonly wasmhlc_incNow: (a: number) => [number, number];
    readonly wasmhlc_new: (a: number, b: number) => number;
    readonly wasmhlc_pack: (a: number) => [number, number];
    readonly wasmhlc_receive: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmlwwmap_applyMutation: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly wasmlwwmap_computeDiff: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmlwwmap_new: () => number;
    readonly wasmlwwmap_toJson: (a: number) => [number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
