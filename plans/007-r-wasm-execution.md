# R Code Execution

In the future there will be two modes of running rdit:

1. Locally, where you install rdit as an R package on your own machine, and start rdit from R with `rdit::start()`, which starts a web server. The frontend is served through the web server, and R code can be executed through an HTTP API.
2. WASM, where rdit is served as a static website, and R code is executed in the browser using WebAssembly.

For now we will focus on the WASM mode, but keep the architecture flexible enough to support both modes in the future.

## Requirements

- Parse R code from the editor (`parse(text=s, keep.source=FALSE)`)
- Execute one expression at a time, building up results including start/end line
- For now, just include the output text (stdout/stderr) in the results

## WASM R Execution

### Technology

Use [webR](https://docs.r-wasm.org/webr/latest/) - R compiled to WebAssembly.

Documentation: `docs/webr/`

### Splitting Parse and Execute

To update UI as each expression executes, we need to:
1. Parse all code into expressions using R's `parse()`
2. Get the length of the parse result
3. Loop through each expression and evaluate individually
4. Capture output for each expression

#### Example Approach

```typescript
// 1. Parse code
await webR.evalRVoid(`.rdit_code <- ${JSON.stringify(code)}`);
await webR.evalRVoid(`
  .rdit_parsed <- parse(text = .rdit_code, keep.source = TRUE)
`);

// 2. Get number of expressions
const n = await webR.evalRNumber('length(.rdit_parsed)');

// 3. Execute each expression
const shelter = await new webR.Shelter();
try {
  for (let i = 1; i <= n; i++) {
    // Get source location (line numbers)
    const srcref = await shelter.evalR(`attr(.rdit_parsed[[${i}]], 'srcref')[[1]]`);
    const startLine = await (await srcref.get(0)).toNumber();
    const endLine = await (await srcref.get(2)).toNumber();

    // Execute this expression and capture output
    const result = await shelter.captureR(`eval(.rdit_parsed[[${i}]])`);

    // result.output: array of {type, data}
    //   - {type: 'stdout', data: string}
    //   - {type: 'stderr', data: string}
    //   - {type: 'error'|'warning'|'message', data: RObject}
    // result.result: RObject (return value)
    // result.images: ImageBitmap[] (plots)

    // Update UI with result for lines [startLine, endLine]
    updateUI({ startLine, endLine, output: result.output });
  }
} finally {
  shelter.purge(); // Clean up all RObjects
}
```

### Key webR APIs

**Initialization:**
```typescript
import { WebR } from 'webr';
const webR = new WebR({ baseUrl: '/webr/' });
await webR.init();
```

**Execution methods:**
- `evalR(code)` → Promise\<RObject\> - Evaluate and return result
- `captureR(code)` → Promise\<{result, output, images}\> - Capture everything
- `evalRString(code)` → Promise\<string\> - Convenience for string results
- `evalRNumber(code)` → Promise\<number\> - Convenience for numeric results
- `evalRVoid(code)` → Promise\<void\> - Execute without return value

**Memory management:**
- Use `Shelter` to manage multiple RObjects
- Call `shelter.purge()` to destroy all at once
- Or use `webR.destroy(obj)` for individual objects

See `docs/webr/evaluating.qmd` and `docs/webr/objects.qmd` for details.
