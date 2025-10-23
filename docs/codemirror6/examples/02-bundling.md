# CodeMirror Bundling with Rollup: Complete Guide

## Overview

CodeMirror is distributed as modular components that require bundling for browser use. While modern browsers can load ES modules, their dependency resolution remains insufficient for NPM-distributed module collections.

## Why Bundling Matters

"Bundlers are tools that take a given main script...and produce a new, generally bigger, script that has all (or some) of the script's dependencies...included."

This approach solves the practical challenge of deploying modern JavaScript systems with complex dependency graphs to browsers.

## Implementation Steps

**1. Create Main Script (editor.mjs)**

```javascript
import {EditorView, basicSetup} from "codemirror"
import {javascript} from "@codemirror/lang-javascript"

let editor = new EditorView({
  extensions: [basicSetup, javascript()],
  parent: document.body
})
```

**2. Install Dependencies**

```bash
npm i codemirror @codemirror/lang-javascript
npm i rollup @rollup/plugin-node-resolve
```

**3. Bundle Using Rollup**

```bash
node_modules/.bin/rollup editor.mjs -f iife -o editor.bundle.js \
  -p @rollup/plugin-node-resolve
```

**4. Create Configuration File (rollup.config.mjs)**

```javascript
import {nodeResolve} from "@rollup/plugin-node-resolve"
export default {
  input: "./editor.mjs",
  output: {
    file: "./editor.bundle.js",
    format: "iife"
  },
  plugins: [nodeResolve()]
}
```

**5. Load in HTML**

```html
<!doctype html>
<meta charset=utf8>
<h1>CodeMirror!</h1>
<script src="editor.bundle.js"></script>
```

## Bundle Size Considerations

Standard bundles reach approximately 1 megabyte. Minification using Terser or Babel reduces this to roughly 400 kilobytes (135 KB gzipped). Using `minimalSetup` instead of `basicSetup` further reduces the bundle to 700 kilobytes uncompressed and 250 kilobytes minified (75 KB gzipped).

The framework supports tree-shaking, eliminating unused code automatically during the bundling process.
