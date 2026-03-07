/**
 * esbuild plugin for Chrome Extension compatibility.
 *
 * Patches the underlying gaussian-splats-3d library to:
 * 1. Replace inline Blob workers with file-based workers (CSP-safe)
 * 2. Remove keyboard/mouse event handlers (for head-tracking-only setups)
 * 3. Rewrite the CDN import in splat-viewer.js to a bare specifier
 *
 * Usage:
 *   import { chromeExtensionPlugin } from '@bengrande/parallax-photo/esbuild-plugin';
 *
 *   esbuild.build({
 *     plugins: [chromeExtensionPlugin({ workerPath: 'lib/workers' })],
 *   });
 *
 * Options:
 *   workerPath - Directory where worker files are served from (default: 'lib/workers')
 *   patchKeyboardHandlers - Remove keyboard/mouse event handlers (default: true)
 */

import fs from 'fs';

export function chromeExtensionPlugin(options = {}) {
  const workerPath = options.workerPath || 'lib/workers';
  const patchKeyboard = options.patchKeyboardHandlers !== false;

  return {
    name: 'parallax-photo-chrome-extension',
    setup(build) {
      // Patch splat-viewer.js: replace CDN import with bare specifier
      build.onLoad(
        { filter: /parallax-photo[/\\]splat-viewer\.js$/ },
        async (args) => {
          let contents = await fs.promises.readFile(args.path, 'utf8');
          contents = contents.replace(
            /from\s+['"]https?:\/\/[^'"]+gaussian-splats-3d[^'"]*['"]/g,
            `from '@mkkellogg/gaussian-splats-3d'`
          );
          return { contents, loader: 'js' };
        }
      );

      // Patch gaussian-splats-3d: workers + keyboard handlers
      build.onLoad(
        { filter: /gaussian-splats-3d[/\\]build[/\\]gaussian-splats-3d\.module\.js$/ },
        async (args) => {
          let contents = await fs.promises.readFile(args.path, 'utf8');

          // Replace blob workers with file-based workers
          contents = contents.replace(
            /function checkAndCreateWorker\(\)\s*\{[\s\S]*?return splatTreeWorker;\s*\}/,
            `function checkAndCreateWorker() {
    const splatTreeWorker = new Worker(chrome.runtime.getURL('${workerPath}/splat-tree-worker.js'));
    return splatTreeWorker;
}`
          );

          contents = contents.replace(
            /const worker = new Worker\(\s*URL\.createObjectURL\(\s*new Blob\(\['\(',\s*sortWorker\.toString\(\),\s*'\)\(self\)'\],\s*\{[\s\S]*?\}\s*\),?\s*\),?\s*\);/,
            `const worker = new Worker(chrome.runtime.getURL('${workerPath}/sort-worker.js'));`
          );

          if (patchKeyboard) {
            // Remove Viewer keyboard/mouse event handlers
            contents = contents.replace(
              /setupEventHandlers\(\)\s*\{[\s\S]*?\n    \}/,
              `setupEventHandlers() {}`
            );

            // Remove OrbitControls keyboard listener
            contents = contents.replace(
              /this\.listenToKeyEvents\s*=\s*function\s*\(\s*domElement\s*\)\s*\{[^}]*\};/,
              `this.listenToKeyEvents = function(domElement) {};`
            );
          }

          return { contents, loader: 'js' };
        }
      );
    },
  };
}

export default chromeExtensionPlugin;
