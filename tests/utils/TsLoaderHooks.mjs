import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { transformAsync } from '@babel/core';
import presetTypescript from '@babel/preset-typescript';

/**
 * Node module customization hooks that let a worker thread load this repo's TypeScript
 * sources directly: relative `.js` specifiers are rewritten to their `.ts` sources when
 * only the `.ts` file exists (mirroring jest's moduleNameMapper), and `.ts` files are
 * transpiled with the same @babel/preset-typescript jest uses. Register from worker
 * code with `require('node:module').register(<this file's URL>)` before importing a
 * TypeScript entry.
 */

export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    specifier.endsWith('.js') &&
    context.parentURL?.startsWith('file:')
  ) {
    const jsPath = fileURLToPath(new URL(specifier, context.parentURL));
    const tsPath = `${jsPath.slice(0, -3)}.ts`;
    if (!existsSync(jsPath) && existsSync(tsPath)) {
      return { format: 'module', shortCircuit: true, url: pathToFileURL(tsPath).href };
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.ts')) {
    const filename = fileURLToPath(url);
    const result = await transformAsync(await readFile(filename, 'utf8'), {
      babelrc: false,
      configFile: false,
      filename,
      presets: [[presetTypescript, { onlyRemoveTypeImports: false }]],
      sourceMaps: 'inline',
      sourceType: 'module',
    });

    return { format: 'module', shortCircuit: true, source: result.code };
  }

  return nextLoad(url, context);
}
