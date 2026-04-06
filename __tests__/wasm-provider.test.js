/**
 * Tests for providers/wasm.js — WasmServiceProvider
 */

const {WasmServiceProvider} = require('../src/client/providers/wasm');

// Mock core object matching the OS.js core API
function createMockCore() {
  const singletons = {};

  return {
    singleton: jest.fn((name, factory) => {
      singletons[name] = factory();
    }),
    make: jest.fn((name) => singletons[name]),
    _singletons: singletons
  };
}

describe('WasmServiceProvider', () => {
  let provider;
  let core;

  beforeEach(() => {
    core = createMockCore();
    provider = new WasmServiceProvider(core);
  });

  afterEach(() => {
    provider.destroy();
  });

  test('provides osjs/wasm', () => {
    expect(provider.provides()).toEqual(['osjs/wasm']);
  });

  test('init registers the osjs/wasm singleton', async () => {
    await provider.init();
    expect(core.singleton).toHaveBeenCalledWith('osjs/wasm', expect.any(Function));
  });

  test('registered service has expected API surface', async () => {
    await provider.init();
    const wasm = core.make('osjs/wasm');
    expect(typeof wasm.load).toBe('function');
    expect(typeof wasm.createWindow).toBe('function');
    expect(typeof wasm.createImports).toBe('function');
    expect(typeof wasm.readString).toBe('function');
    expect(typeof wasm.isSupported).toBe('function');
    expect(typeof wasm.clearCache).toBe('function');
  });

  test('isSupported returns true when WebAssembly is available', async () => {
    await provider.init();
    const wasm = core.make('osjs/wasm');
    expect(wasm.isSupported()).toBe(true);
  });

  test('start resolves without error', async () => {
    await provider.init();
    await expect(provider.start()).resolves.toBeUndefined();
  });

  test('destroy clears the module cache', async () => {
    await provider.init();
    // Manually put something in the cache
    provider.moduleCache.set('test.wasm', {});
    expect(provider.moduleCache.size).toBe(1);
    provider.destroy();
    expect(provider.moduleCache.size).toBe(0);
  });

  test('clearCache empties the module cache', async () => {
    await provider.init();
    provider.moduleCache.set('a.wasm', {});
    provider.moduleCache.set('b.wasm', {});
    const wasm = core.make('osjs/wasm');
    wasm.clearCache();
    expect(provider.moduleCache.size).toBe(0);
  });

  test('load fetches and compiles a WASM module', async () => {
    await provider.init();

    // Create a minimal valid WASM module (empty module: magic + version + empty type section)
    const wasmBytes = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, // magic: \0asm
      0x01, 0x00, 0x00, 0x00  // version: 1
    ]);

    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(wasmBytes.buffer)
    }));

    const module = await provider.load('http://example.com/test.wasm');
    expect(module).toBeInstanceOf(WebAssembly.Module);
    expect(global.fetch).toHaveBeenCalledWith('http://example.com/test.wasm');

    delete global.fetch;
  });

  test('load uses cache on second call', async () => {
    await provider.init();

    const wasmBytes = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d,
      0x01, 0x00, 0x00, 0x00
    ]);

    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(wasmBytes.buffer)
    }));

    const module1 = await provider.load('http://example.com/cached.wasm');
    const module2 = await provider.load('http://example.com/cached.wasm');

    expect(module1).toBe(module2);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    delete global.fetch;
  });

  test('load bypasses cache when useCache=false', async () => {
    await provider.init();

    const wasmBytes = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d,
      0x01, 0x00, 0x00, 0x00
    ]);

    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(wasmBytes.buffer)
    }));

    await provider.load('http://example.com/nocache.wasm', false);
    await provider.load('http://example.com/nocache.wasm', false);

    expect(global.fetch).toHaveBeenCalledTimes(2);

    delete global.fetch;
  });

  test('load throws on fetch failure', async () => {
    await provider.init();

    global.fetch = jest.fn(() => Promise.resolve({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    }));

    await expect(provider.load('http://example.com/missing.wasm'))
      .rejects.toThrow('Failed to fetch WASM module: 404 Not Found');

    delete global.fetch;
  });

  test('readString delegates to readStringFromMemory', async () => {
    await provider.init();
    const wasm = core.make('osjs/wasm');
    const memory = new WebAssembly.Memory({initial: 1});
    const bytes = new Uint8Array(memory.buffer);
    bytes[0] = 65; // A
    bytes[1] = 66; // B
    expect(wasm.readString(memory, 0, 2)).toBe('AB');
  });

  test('createImports returns an import object with env', async () => {
    await provider.init();
    const wasm = core.make('osjs/wasm');
    const mockCanvas = {
      getContext: () => ({
        clearRect: jest.fn(),
        fillRect: jest.fn(),
        strokeRect: jest.fn(),
        fillText: jest.fn(),
        beginPath: jest.fn(),
        closePath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        fill: jest.fn(),
        stroke: jest.fn()
      }),
      width: 100,
      height: 100
    };
    const memory = new WebAssembly.Memory({initial: 1});
    const result = wasm.createImports(mockCanvas, memory);
    expect(result).toHaveProperty('env');
    expect(result.env.canvas_width()).toBe(100);
  });
});
