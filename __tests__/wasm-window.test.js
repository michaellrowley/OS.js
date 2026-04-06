/**
 * Tests for wasm-window.js — WasmWindow helper utilities
 */

// Mock DOM APIs needed by the WASM window module
const mockCtx = {
  clearRect: jest.fn(),
  fillRect: jest.fn(),
  strokeRect: jest.fn(),
  fillText: jest.fn(),
  beginPath: jest.fn(),
  closePath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  fill: jest.fn(),
  stroke: jest.fn(),
  fillStyle: '',
  strokeStyle: '',
  font: ''
};

Object.defineProperty(mockCtx, 'fillStyle', {
  set: jest.fn(),
  get: () => ''
});
Object.defineProperty(mockCtx, 'strokeStyle', {
  set: jest.fn(),
  get: () => ''
});
Object.defineProperty(mockCtx, 'font', {
  set: jest.fn(),
  get: () => ''
});

const mockCanvas = {
  getContext: jest.fn(() => mockCtx),
  width: 640,
  height: 480
};

// Provide TextDecoder for the Node.js test environment
const {TextDecoder: TD} = require('util');
global.TextDecoder = TD;

const {readStringFromMemory, createWasmImports} = require('../src/client/wasm-window');

describe('readStringFromMemory', () => {
  let memory;

  beforeEach(() => {
    memory = new WebAssembly.Memory({initial: 1});
    const bytes = new Uint8Array(memory.buffer);
    // Write "Hello" at offset 0
    bytes[0] = 72;  // H
    bytes[1] = 101; // e
    bytes[2] = 108; // l
    bytes[3] = 108; // l
    bytes[4] = 111; // o
  });

  test('reads a string from WASM memory at offset 0', () => {
    expect(readStringFromMemory(memory, 0, 5)).toBe('Hello');
  });

  test('reads a partial string', () => {
    expect(readStringFromMemory(memory, 0, 3)).toBe('Hel');
  });

  test('reads from a non-zero offset', () => {
    expect(readStringFromMemory(memory, 2, 3)).toBe('llo');
  });

  test('returns empty string for zero length', () => {
    expect(readStringFromMemory(memory, 0, 0)).toBe('');
  });
});

describe('createWasmImports', () => {
  let memory;
  let imports;

  beforeEach(() => {
    memory = new WebAssembly.Memory({initial: 1});
    jest.clearAllMocks();
    imports = createWasmImports(mockCanvas, memory);
  });

  test('returns an object with env namespace', () => {
    expect(imports).toHaveProperty('env');
    expect(typeof imports.env).toBe('object');
  });

  test('env.memory is the provided memory', () => {
    expect(imports.env.memory).toBe(memory);
  });

  test('canvas_width returns canvas width', () => {
    expect(imports.env.canvas_width()).toBe(640);
  });

  test('canvas_height returns canvas height', () => {
    expect(imports.env.canvas_height()).toBe(480);
  });

  test('canvas_clear calls clearRect on the context', () => {
    imports.env.canvas_clear(0, 0, 0, 0);
    expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
  });

  test('canvas_clear with non-zero alpha also fills', () => {
    imports.env.canvas_clear(255, 0, 0, 255);
    expect(mockCtx.clearRect).toHaveBeenCalled();
    expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 640, 480);
  });

  test('canvas_fill_rect calls fillRect with correct args', () => {
    imports.env.canvas_fill_rect(10, 20, 100, 50, 255, 128, 0, 255);
    expect(mockCtx.fillRect).toHaveBeenCalledWith(10, 20, 100, 50);
  });

  test('canvas_stroke_rect calls strokeRect with correct args', () => {
    imports.env.canvas_stroke_rect(5, 5, 50, 50, 0, 255, 0, 128);
    expect(mockCtx.strokeRect).toHaveBeenCalledWith(5, 5, 50, 50);
  });

  test('canvas_fill_text reads string and calls fillText', () => {
    const bytes = new Uint8Array(memory.buffer);
    // Write "Hi" at offset 0
    bytes[0] = 72; // H
    bytes[1] = 105; // i
    imports.env.canvas_fill_text(0, 2, 100, 200);
    expect(mockCtx.fillText).toHaveBeenCalledWith('Hi', 100, 200);
  });

  test('canvas_draw_line calls beginPath, moveTo, lineTo, stroke', () => {
    imports.env.canvas_draw_line(0, 0, 100, 100);
    expect(mockCtx.beginPath).toHaveBeenCalled();
    expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(mockCtx.lineTo).toHaveBeenCalledWith(100, 100);
    expect(mockCtx.stroke).toHaveBeenCalled();
  });

  test('canvas path operations delegate to context', () => {
    imports.env.canvas_begin_path();
    expect(mockCtx.beginPath).toHaveBeenCalled();

    imports.env.canvas_move_to(10, 20);
    expect(mockCtx.moveTo).toHaveBeenCalledWith(10, 20);

    imports.env.canvas_line_to(30, 40);
    expect(mockCtx.lineTo).toHaveBeenCalledWith(30, 40);

    imports.env.canvas_fill();
    expect(mockCtx.fill).toHaveBeenCalled();

    imports.env.canvas_close_path();
    expect(mockCtx.closePath).toHaveBeenCalled();

    imports.env.canvas_stroke();
    expect(mockCtx.stroke).toHaveBeenCalled();
  });

  test('console_log calls console.log with decoded string', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    const bytes = new Uint8Array(memory.buffer);
    bytes[0] = 79; // O
    bytes[1] = 75; // K
    imports.env.console_log(0, 2);
    expect(spy).toHaveBeenCalledWith('[WASM]', 'OK');
    spy.mockRestore();
  });

  test('console_error calls console.error with decoded string', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation();
    const bytes = new Uint8Array(memory.buffer);
    bytes[0] = 69; // E
    imports.env.console_error(0, 1);
    expect(spy).toHaveBeenCalledWith('[WASM]', 'E');
    spy.mockRestore();
  });

  test('performance_now returns a number', () => {
    const result = imports.env.performance_now();
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
  });

  test('random returns a number between 0 and 1', () => {
    const result = imports.env.random();
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(1);
  });

  test('extra imports are merged into env', () => {
    const extra = {my_func: jest.fn(() => 42)};
    const customImports = createWasmImports(mockCanvas, memory, extra);
    expect(customImports.env.my_func).toBe(extra.my_func);
    expect(customImports.env.my_func()).toBe(42);
    expect(customImports.env.canvas_width).toBeDefined();
  });
});
