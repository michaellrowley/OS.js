/*
 * OS.js - JavaScript Cloud/Web Desktop Platform
 *
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * @author  Michael Rowley <michaellrowley@protonmail.com>
 * @licence Simplified BSD License
 */

import {createWasmWindow, createWasmImports, readStringFromMemory} from '../wasm-window';

/**
 * WasmServiceProvider
 *
 * Registers the `osjs/wasm` service which provides utilities for loading
 * and running WebAssembly modules inside OS.js windows.
 *
 * @example
 *   // In an application:
 *   const wasm = core.make('osjs/wasm');
 *   const {window, instance, canvas} = await wasm.createWindow(proc, {
 *     wasmUrl: proc.resource('/my-app.wasm'),
 *     windowOptions: {
 *       title: 'My WASM App',
 *       dimension: {width: 800, height: 600}
 *     }
 *   });
 */
export class WasmServiceProvider {
  constructor(core) {
    this.core = core;

    /**
     * Cache of compiled WebAssembly modules keyed by URL.
     * @type {Map<string, WebAssembly.Module>}
     */
    this.moduleCache = new Map();
  }

  /**
   * List of services provided
   * @return {string[]}
   */
  provides() {
    return ['osjs/wasm'];
  }

  /**
   * Initializes the provider
   * @return {Promise<void>}
   */
  async init() {
    this.core.singleton('osjs/wasm', () => ({
      /**
       * Fetch, compile, and cache a WASM module.
       *
       * @param {string} url URL to the .wasm binary
       * @param {boolean} [useCache=true] Whether to use the module cache
       * @return {Promise<WebAssembly.Module>}
       */
      load: (url, useCache = true) => this.load(url, useCache),

      /**
       * Create an OS.js window powered by a WASM module.
       *
       * @param {Application} proc The application instance
       * @param {WasmWindowOptions} options WASM window options
       * @return {Promise<{window: Window, instance: WebAssembly.Instance, canvas: HTMLCanvasElement}>}
       */
      createWindow: (proc, options) => createWasmWindow(proc, options),

      /**
       * Build the standard WASM import object for a canvas and memory.
       *
       * @param {HTMLCanvasElement} canvas Target canvas element
       * @param {WebAssembly.Memory} memory WASM memory
       * @param {Object} [extra={}] Additional imports
       * @return {Object} Import object for WebAssembly.instantiate
       */
      createImports: (canvas, memory, extra) => createWasmImports(canvas, memory, extra),

      /**
       * Read a UTF-8 string from WASM linear memory.
       *
       * @param {WebAssembly.Memory} memory WASM memory
       * @param {number} ptr Byte offset
       * @param {number} len Byte length
       * @return {string}
       */
      readString: (memory, ptr, len) => readStringFromMemory(memory, ptr, len),

      /**
       * Check if WebAssembly is supported in the current environment.
       *
       * @return {boolean}
       */
      isSupported: () => typeof WebAssembly !== 'undefined'
        && typeof WebAssembly.instantiate === 'function',

      /**
       * Clear the compiled module cache.
       */
      clearCache: () => this.moduleCache.clear()
    }));
  }

  /**
   * Starts the provider
   * @return {Promise<void>}
   */
  async start() {
    // No startup work needed
  }

  /**
   * Destroys the provider
   */
  destroy() {
    this.moduleCache.clear();
  }

  /**
   * Fetches and compiles a WASM module, with optional caching.
   *
   * @param {string} url URL to the .wasm binary
   * @param {boolean} useCache Whether to use the cache
   * @return {Promise<WebAssembly.Module>}
   */
  async load(url, useCache = true) {
    if (useCache && this.moduleCache.has(url)) {
      return this.moduleCache.get(url);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM module: ${response.status} ${response.statusText}`);
    }

    const bytes = await response.arrayBuffer();
    const module = await WebAssembly.compile(bytes);

    if (useCache) {
      this.moduleCache.set(url, module);
    }

    return module;
  }
}
