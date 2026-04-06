/*
 * OS.js - JavaScript Cloud/Web Desktop Platform
 *
 * WASM Example Application
 *
 * Demonstrates how to use the osjs/wasm service to create
 * a window powered by a WebAssembly module.
 */
import osjs from 'osjs';
import {name as applicationName} from './metadata.json';
import './index.scss';

osjs.register(applicationName, (core, args, options, metadata) => {
  const title = core.make('osjs/locale')
    .translatableFlat(metadata.title);

  const proc = core.make('osjs/application', {
    args,
    options,
    metadata
  });

  const wasm = core.make('osjs/wasm');

  if (!wasm.isSupported()) {
    core.make('osjs/dialog', 'alert', {
      type: 'error',
      title: 'WASM Not Supported',
      message: 'Your browser does not support WebAssembly.'
    }, () => proc.destroy());
    return proc;
  }

  wasm.createWindow(proc, {
    wasmUrl: proc.resource('/data/demo.wasm'),
    windowOptions: {
      title,
      id: 'WasmExampleWindow',
      icon: proc.resource(metadata.icon),
      dimension: {width: 640, height: 480}
    }
  }).catch(err => {
    console.error('Failed to start WASM application:', err);
    core.make('osjs/dialog', 'alert', {
      type: 'error',
      title: 'WASM Error',
      message: `Failed to load WASM module: ${err.message}`
    }, () => proc.destroy());
  });

  return proc;
});
