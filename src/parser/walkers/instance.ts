import '@total-typescript/ts-reset/array-includes';
import { type Visitors, walk } from 'zimmerframe';
import type { Root, SvelteNode } from 'svelte/compiler';

import pkg from '../../../package.json' with { type: 'json' };

import { ADDON_COMPONENT_NAME, type InstanceMeta } from '../types.js';

export function walkOnInstance(instance: Root['instance']): InstanceMeta {
  if (!instance) {
    throw new Error(
      "This stories file doesn't have any instance tag <script>...</script> with any logic."
    );
  }

  const state: InstanceMeta = {
    addonComponentName: ADDON_COMPONENT_NAME,
  };

  const visitors: Visitors<SvelteNode, typeof state> = {
    ImportDeclaration(node, { state, visit, stop }) {
      const { source, specifiers } = node;

      if (
        source.value === pkg.name ||
        // FIXME:
        // This should be for this package testing purpose only.
        // Need a condition to prevent it running outside this package
        (typeof source.value === 'string' && source.value.includes('src/index'))
      ) {
        for (const specifier of specifiers) {
          if (specifier.type === 'ImportSpecifier') {
            visit(specifier, state);
          }
        }
      }
      stop();
    },
    ImportSpecifier(node, { state, stop }) {
      if (ADDON_COMPONENT_NAME.includes(node.imported.name)) {
        const { imported, local } = node;

        state[imported.name] = local.name;
      }

      stop();
    },
  };

  walk(instance.content, state, visitors);

  return state;
}
