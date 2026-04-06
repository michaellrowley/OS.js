/*
 * OS.js - JavaScript Cloud/Web Desktop Platform
 *
 * Copyright (c) 2011-2020, Anders Evenrud <andersevenrud@gmail.com>
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
 * @author  Anders Evenrud <andersevenrud@gmail.com>
 * @licence Simplified BSD License
 */

/**
 * @typedef {Object} WasmWindowOptions
 * @property {string} wasmUrl URL to the .wasm binary
 * @property {Object} [windowOptions] Options passed to Application#createWindow
 * @property {Object} [imports] Additional WASM import object entries (merged with defaults)
 * @property {number} [memoryPages=256] Initial WebAssembly.Memory pages (64KiB each)
 * @property {boolean} [animationLoop=true] Whether to run an animation loop calling WASM update/render
 * @property {boolean} [forwardInput=true] Whether to forward keyboard/mouse events to WASM exports
 */

/**
 * Reads a UTF-8 string from WASM linear memory.
 *
 * @param {WebAssembly.Memory} memory The WASM memory instance
 * @param {number} ptr Pointer (byte offset) into memory
 * @param {number} len Byte length of the string
 * @return {string}
 */
export function readStringFromMemory(memory, ptr, len) {
  const bytes = new Uint8Array(memory.buffer, ptr, len);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Builds the standard WASM import object providing canvas drawing
 * primitives and utility functions.
 *
 * @param {HTMLCanvasElement} canvas The target canvas element
 * @param {WebAssembly.Memory} memory Shared WASM memory
 * @param {Object} [extra={}] Additional imports merged into the env namespace
 * @return {Object} Import object suitable for WebAssembly.instantiate
 */
export function createWasmImports(canvas, memory, extra = {}) {
  const ctx = canvas.getContext('2d');

  const env = {
    memory,

    canvas_width: () => canvas.width,
    canvas_height: () => canvas.height,

    canvas_clear: (r, g, b, a) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (a > 0) {
        ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    },

    canvas_set_fill_style: (r, g, b, a) => {
      ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
    },

    canvas_set_stroke_style: (r, g, b, a) => {
      ctx.strokeStyle = `rgba(${r},${g},${b},${a / 255})`;
    },

    canvas_fill_rect: (x, y, w, h, r, g, b, a) => {
      ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
      ctx.fillRect(x, y, w, h);
    },

    canvas_stroke_rect: (x, y, w, h, r, g, b, a) => {
      ctx.strokeStyle = `rgba(${r},${g},${b},${a / 255})`;
      ctx.strokeRect(x, y, w, h);
    },

    canvas_fill_text: (ptr, len, x, y) => {
      const text = readStringFromMemory(memory, ptr, len);
      ctx.fillText(text, x, y);
    },

    canvas_set_font: (ptr, len) => {
      ctx.font = readStringFromMemory(memory, ptr, len);
    },

    canvas_draw_line: (x1, y1, x2, y2) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    },

    canvas_begin_path: () => ctx.beginPath(),
    canvas_close_path: () => ctx.closePath(),
    canvas_move_to: (x, y) => ctx.moveTo(x, y),
    canvas_line_to: (x, y) => ctx.lineTo(x, y),
    canvas_fill: () => ctx.fill(),
    canvas_stroke: () => ctx.stroke(),

    console_log: (ptr, len) => {
      console.log('[WASM]', readStringFromMemory(memory, ptr, len));
    },

    console_error: (ptr, len) => {
      console.error('[WASM]', readStringFromMemory(memory, ptr, len));
    },

    performance_now: () => performance.now(),

    random: () => Math.random()
  };

  Object.assign(env, extra);

  return {env};
}

/**
 * Creates and manages a WASM-powered OS.js window.
 *
 * Sets up a canvas inside the window content area, loads the WASM module,
 * instantiates it with canvas bridge imports, runs an optional animation loop,
 * and forwards input events to WASM exports.
 *
 * Expected WASM exports (all optional):
 * - `init(width, height)` — called once after instantiation
 * - `update(dt)` — called each animation frame with delta time in ms
 * - `render()` — called each animation frame after update
 * - `resize(width, height)` — called when the canvas is resized
 * - `on_mouse_move(x, y)` — mouse move inside canvas
 * - `on_mouse_down(x, y, button)` — mouse button pressed
 * - `on_mouse_up(x, y, button)` — mouse button released
 * - `on_key_down(keyCode)` — key pressed
 * - `on_key_up(keyCode)` — key released
 * - `destroy()` — called before the window is destroyed
 *
 * @param {Application} proc The OS.js application instance
 * @param {WasmWindowOptions} wasmOptions WASM window configuration
 * @return {Promise<{window: Window, instance: WebAssembly.Instance, canvas: HTMLCanvasElement}>}
 */
export function createWasmWindow(proc, wasmOptions) {
  const {
    wasmUrl,
    windowOptions = {},
    imports: extraImports = {},
    memoryPages = 256,
    animationLoop = true,
    forwardInput = true
  } = wasmOptions;

  const memory = new WebAssembly.Memory({initial: memoryPages});

  const win = proc.createWindow(Object.assign({
    id: 'WasmWindow',
    dimension: {width: 640, height: 480}
  }, windowOptions));

  return new Promise((resolve, reject) => {
    win.on('destroy', () => proc.destroy());

    win.render(($content) => {
      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      $content.appendChild(canvas);

      const resizeCanvas = () => {
        canvas.width = $content.offsetWidth;
        canvas.height = $content.offsetHeight;
      };
      resizeCanvas();

      const importObject = createWasmImports(canvas, memory, extraImports);

      fetch(wasmUrl)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to fetch WASM: ${response.status} ${response.statusText}`);
          }
          return response.arrayBuffer();
        })
        .then(bytes => WebAssembly.instantiate(bytes, importObject))
        .then(({instance}) => {
          const exports = instance.exports;

          // Initialize the WASM module
          if (typeof exports.init === 'function') {
            exports.init(canvas.width, canvas.height);
          }

          // Handle canvas resizing
          const resizeObserver = new ResizeObserver(() => {
            resizeCanvas();
            if (typeof exports.resize === 'function') {
              exports.resize(canvas.width, canvas.height);
            }
          });
          resizeObserver.observe($content);

          // Animation loop
          let animFrameId = null;
          let lastTime = performance.now();

          if (animationLoop) {
            const loop = (now) => {
              const dt = now - lastTime;
              lastTime = now;

              if (typeof exports.update === 'function') {
                exports.update(dt);
              }
              if (typeof exports.render === 'function') {
                exports.render();
              }

              animFrameId = requestAnimationFrame(loop);
            };
            animFrameId = requestAnimationFrame(loop);
          }

          // Input event forwarding
          if (forwardInput) {
            const getCanvasPos = (ev) => {
              const rect = canvas.getBoundingClientRect();
              return {
                x: ev.clientX - rect.left,
                y: ev.clientY - rect.top
              };
            };

            canvas.addEventListener('mousemove', (ev) => {
              if (typeof exports.on_mouse_move === 'function') {
                const {x, y} = getCanvasPos(ev);
                exports.on_mouse_move(x, y);
              }
            });

            canvas.addEventListener('mousedown', (ev) => {
              if (typeof exports.on_mouse_down === 'function') {
                const {x, y} = getCanvasPos(ev);
                exports.on_mouse_down(x, y, ev.button);
              }
            });

            canvas.addEventListener('mouseup', (ev) => {
              if (typeof exports.on_mouse_up === 'function') {
                const {x, y} = getCanvasPos(ev);
                exports.on_mouse_up(x, y, ev.button);
              }
            });

            win.on('keydown', (ev) => {
              if (typeof exports.on_key_down === 'function') {
                exports.on_key_down(ev.keyCode);
              }
            });

            win.on('keyup', (ev) => {
              if (typeof exports.on_key_up === 'function') {
                exports.on_key_up(ev.keyCode);
              }
            });
          }

          // Cleanup on destroy
          win.on('destroy', () => {
            if (animFrameId !== null) {
              cancelAnimationFrame(animFrameId);
            }
            resizeObserver.disconnect();

            if (typeof exports.destroy === 'function') {
              exports.destroy();
            }
          });

          resolve({window: win, instance, canvas});
        })
        .catch(reject);
    });
  });
}
