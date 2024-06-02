/**
 * NOTE:
 *
 * 1. Why Svelte AST nodes had to be included?
 *    - During the compilation from Svelte to JS, HTML comments are removed.
 *    - Rollup' internal `this.parse()` excludes `leadingComments` from parsing.
 *      I couldn't find an option to override this behavior.
 *      I wanted to avoid adding another package for parsing _(getting AST)_ - e.g. `acorn`
 */

import fs from 'node:fs';

import MagicString from 'magic-string';
import { preprocess } from 'svelte/compiler';
import type { Plugin } from 'vite';

import { createAppendix } from './transform/create-appendix.js';
import { removeExportDefault } from './transform/remove-export-default.js';
import { insertDefineMetaJSDocCommentAsDescription } from './transform/define-meta/description.js';
import { destructureMetaFromDefineMeta } from './transform/define-meta/destructure-meta.js';
import { insertStoryHTMLCommentAsDescription } from './transform/Story/description.js';
import { moveSourceAttributeToParameters } from './transform/Story/source.js';
import { getSvelteAST } from '../parser/ast.js';
import { extractStoriesNodesFromExportDefaultFn } from '../parser/extract/compiled/stories.js';
import { extractCompiledASTNodes } from '../parser/extract/compiled/nodes.js';
import { extractSvelteASTNodes } from '../parser/extract/svelte/nodes.js';
import { getComponentName } from '../utils/get-component-name.js';

export async function plugin(): Promise<Plugin> {
  const [{ createFilter }, { loadSvelteConfig }] = await Promise.all([
    import('vite'),
    import('@sveltejs/vite-plugin-svelte'),
  ]);

  const svelteConfig = await loadSvelteConfig();
  const include = /\.stories\.svelte$/;
  const filter = createFilter(include);

  return {
    name: 'storybook:addon-svelte-csf-plugin-post',
    enforce: 'post',
    async transform(compiledCode, id) {
      if (!filter(id)) return undefined;

      const compiledAST = this.parse(compiledCode);
      let magicCompiledCode = new MagicString(compiledCode);

      const componentName = getComponentName(id);

      if (!componentName) {
        // TODO: make error message more user friendly
        // what happened, how to fix
        throw new Error(`Failed to extract component name from filename: ${id}`);
      }

      let rawCode = fs.readFileSync(id).toString();

      if (svelteConfig?.preprocess) {
        const processed = await preprocess(rawCode, svelteConfig.preprocess, { filename: id });
        rawCode = processed.code;
      }

      const svelteAST = getSvelteAST({ code: rawCode, filename: id });
      const svelteNodes = await extractSvelteASTNodes({
        ast: svelteAST,
        filename: id,
      });
      const compiledNodes = await extractCompiledASTNodes({
        ast: compiledAST,
        filename: id,
      });
      const extractedCompiledStoriesNodes = await extractStoriesNodesFromExportDefaultFn({
        nodes: compiledNodes,
        filename: id,
      });

      /*
       * * WARN:
       * * IMPORTANT! The plugins starts updating the compiled output code from the bottom.
       * * Why? Because once we start updating nodes in the stringified output from the top,
       * * then other nodes' `start` and `end` numbers will not be correct anymore.
       * * Hence the reason why reversing both arrays with stories _(svelte and compiled)_.
       */
      const svelteStories = [...svelteNodes.storyComponents].reverse();
      const compiledStories = [...extractedCompiledStoriesNodes].reverse();

      for (const [index, compiled] of Object.entries(compiledStories)) {
        insertStoryHTMLCommentAsDescription({
          code: magicCompiledCode,
          nodes: { svelte: svelteStories[index], compiled },
          filename: id,
        });
        moveSourceAttributeToParameters({
          code: magicCompiledCode,
          nodes: { svelte: svelteStories[index], compiled },
          filename: id,
        });
      }

      await destructureMetaFromDefineMeta({
        code: magicCompiledCode,
        nodes: compiledNodes,
        filename: id,
      });
      insertDefineMetaJSDocCommentAsDescription({
        code: magicCompiledCode,
        nodes: {
          compiled: compiledNodes,
          svelte: svelteNodes,
        },
        filename: id,
      });
      removeExportDefault({
        code: magicCompiledCode,
        nodes: compiledNodes,
        filename: id,
      });
      await createAppendix({
        componentName,
        code: magicCompiledCode,
        nodes: {
          compiled: compiledNodes,
          svelte: svelteNodes,
        },
        filename: id,
      });

      return {
        code: magicCompiledCode.toString(),
        map: magicCompiledCode.generateMap({ hires: true, source: id }),
      };
    },
  };
}
