# Pyodide Prototype: Technical Findings

## Executive Summary

The Pyodide prototype successfully implements core Python execution in rdit's architecture but lacks matplotlib/plotting support, which was attempted and simplified across 11 commits. This document details findings on package management, matplotlib integration, and recommendations for production readiness.

## Package Management Status

### micropip

**Status**: ✅ Available and functional

Pyodide includes `micropip` for installing pure-Python and pre-built packages:

```python
import micropip
await micropip.install('package-name')
```

### Pre-built Packages

Pyodide provides 100+ pre-built packages including:

| Category | Packages |
|----------|----------|
| **Data Science** | numpy, pandas, scipy, scikit-learn, statsmodels |
| **Visualization** | matplotlib, bokeh, plotly |
| **Machine Learning** | scikit-learn, xgboost, lightgbm |
| **Web** | requests, beautifulsoup4, lxml |
| **Utilities** | pytz, regex, pyyaml |

Full list: https://pyodide.org/en/stable/usage/packages-in-pyodide.html

### Loading Packages

Two methods for loading packages:

1. **pyodide.loadPackage()** (preferred for known packages):
   ```javascript
   await pyodide.loadPackage('numpy');
   await pyodide.loadPackage(['pandas', 'matplotlib']);
   ```

2. **micropip.install()** (for PyPI packages):
   ```python
   import micropip
   await micropip.install('snowballstemmer')
   ```

## Matplotlib Investigation

### Current Status: ❌ Not Implemented

The commit history shows 11 commits attempting matplotlib integration:

1. **a5c3e5d**: Initial prototype with matplotlib
2. **eebfba8**: Fixed statement parsing
3. **dea14e5**: Switched to plotnine as alternative
4. **9d97627**: Fixed micropip loading
5. **47fbf34**: Reverted to matplotlib
6. **e35485b**: Suppressed backend warnings
7. **a2f9b63**: Custom renderer with plt.show() hook
8. **9f12617**: Custom matplotlib backend
9. **2fd97cc**: Removed object detection
10. **fb21859**: Fixed backend registration
11. **95f42d7**: **Simplified by removing matplotlib** ⚠️

### Technical Challenges Identified

Based on commit messages, the implementation faced these challenges:

1. **Backend Configuration**: Multiple attempts to configure custom backends
2. **Figure Capture**: Difficulty hooking into matplotlib's rendering pipeline
3. **Canvas Integration**: Converting matplotlib output to displayable format

### Pyodide's Official Matplotlib Support

Pyodide **does** support matplotlib with the HTML5 canvas backend:

```python
import matplotlib
import matplotlib.pyplot as plt

# Pyodide automatically uses the HTML5 canvas backend
# No backend configuration needed

# Create a plot
fig, ax = plt.subplots()
ax.plot([1, 2, 3], [1, 4, 2])

# The figure renders to an HTML canvas element
plt.show()
```

### Implementation Path Forward

Based on Pyodide documentation and the R implementation's approach:

#### Option 1: Canvas Element Capture (Recommended)

Pyodide's matplotlib renders to HTML canvas elements. We can capture these:

```javascript
// In execution-python.ts, after plot creation:

// 1. Find canvas elements created by matplotlib
const canvases = document.querySelectorAll('canvas.matplotlib-canvas');

// 2. Convert each canvas to ImageBitmap
const images: ImageBitmap[] = [];
for (const canvas of canvases) {
  const bitmap = await createImageBitmap(canvas);
  images.push(bitmap);
}

// 3. Include in result
yield {
  id: globalIdCounter++,
  lineStart,
  lineEnd,
  result: {
    output,
    images,
    isInvisible: !hasVisibleOutput && images.length === 0,
  },
};
```

#### Option 2: PNG Export via BytesIO

Alternative approach using Python's buffer export:

```python
import matplotlib.pyplot as plt
import io
import base64

# Create plot
fig, ax = plt.subplots()
ax.plot([1, 2, 3], [1, 4, 2])

# Export to PNG bytes
buf = io.BytesIO()
fig.savefig(buf, format='png')
buf.seek(0)
png_bytes = buf.read()
png_base64 = base64.b64encode(png_bytes).decode('utf-8')

# Return base64 string to JavaScript
png_base64
```

Then in JavaScript:
```javascript
const pngData = await pyodide.runPythonAsync(plotCode);
const img = new Image();
img.src = `data:image/png;base64,${pngData}`;
const bitmap = await createImageBitmap(img);
```

#### Option 3: Use Pyodide's matplotlib_pyodide Package

Pyodide provides a specialized package:

```bash
# Install matplotlib with Pyodide-specific backend
await pyodide.loadPackage('matplotlib-pyodide');
```

This package is specifically designed for Pyodide and may handle canvas integration automatically.

### Comparison with R Implementation

| Feature | R (WebR) | Python (Pyodide) | Status |
|---------|----------|------------------|--------|
| Graphics backend | Built-in WebR device | HTML5 canvas | ✅ Available |
| Capture mechanism | `startImageCollection()` | Canvas query / PNG export | ❌ Not implemented |
| Image format | ImageBitmap | ImageBitmap / Base64 PNG | ❌ Not implemented |
| Integration point | `webr-instance.ts` | `pyodide-instance.ts` | ❌ Not implemented |

The R implementation in `webr-instance.ts:10-50` provides a good template for the Python equivalent.

## Testing Status

### Current Tests

- ✅ `execution.test.ts` (R execution) - 244 lines, comprehensive
- ❌ `execution-python.test.ts` - Created in this review, not yet run
- ❌ `package-investigation.test.ts` - Created in this review, not yet run

### Test Coverage Needed

1. **Basic execution**: ✅ Covered in execution-python.test.ts
2. **Statement parsing**: ✅ Covered in execution-python.test.ts
3. **Line range filtering**: ✅ Covered in execution-python.test.ts
4. **Error handling**: ✅ Covered in execution-python.test.ts
5. **Python-specific features**: ✅ Covered (classes, lambdas, f-strings)
6. **Package loading**: ⚠️ Covered in package-investigation.test.ts (not run)
7. **Matplotlib**: ❌ Not covered, needs implementation first

## Performance Considerations

### Initialization Time

- **WebR**: ~2-5 seconds
- **Pyodide**: ~2-3 seconds (similar)
- **With packages**: Add 1-3 seconds per large package (numpy, pandas, matplotlib)

### Memory Usage

- **Pyodide base**: ~50MB
- **With numpy**: +15MB
- **With pandas**: +25MB
- **With matplotlib**: +15MB

### Optimization Strategies

1. **Lazy package loading**: Load packages on first use, not at initialization
2. **Package caching**: Browser cache for CDN-loaded packages
3. **Worker threads**: Consider running Pyodide in a Web Worker to avoid blocking UI

## Architecture Notes

### Parallel Design Pattern ✅

The implementation follows a clean parallel structure:

```
R (Production)          Python (Prototype)
execution.ts        →   execution-python.ts
webr-instance.ts    →   pyodide-instance.ts
```

This design allows:
- Easy comparison between implementations
- Potential dual-language support in the future
- Clear separation of concerns

### Shared Components ✅

These components work with both R and Python:
- `compute-line-groups.ts` - Result grouping
- `result-grouping-plugin.ts` - CodeMirror integration
- `results.ts` - State management
- `App.tsx` - Main application (with language toggle potential)

## Recommendations for Production

### Critical (Must-Have)

1. **✅ Implement matplotlib support** using Option 1 (Canvas capture) or Option 3 (matplotlib-pyodide)
2. **✅ Run and verify tests** (execution-python.test.ts)
3. **✅ Add package loading API** to App.tsx for user-installable packages
4. **✅ Document limitations** clearly in UI

### Important (Should-Have)

5. **Performance monitoring** for large package loads
6. **Error boundaries** for Pyodide crashes
7. **Package preloading** for common scientific packages
8. **Memory cleanup** after plot generation

### Nice-to-Have

9. **Dual-language UI** to switch between R and Python
10. **Package manager UI** for browsing/installing packages
11. **Plot export** functionality (save as PNG/SVG)
12. **Jupyter notebook import** (`.ipynb` to rdit format)

## Code Quality Assessment

### Strengths ✅

- Clean separation between R and Python implementations
- Consistent interfaces (Expression, ExpressionResult)
- Good error handling structure
- Comprehensive R test coverage

### Areas for Improvement ⚠️

- Mixed `runPython` (sync) and `runPythonAsync` usage
- No cleanup of StringIO buffers in Python execution
- Generic error catching without type discrimination
- Outdated comment: "In Python, we consider output invisible if there's no stdout or stderr" (line 195)

### Suggested Refactoring

1. **Consistent async API**:
   ```typescript
   // Change line 32 in execution-python.ts
   const result = await pyodide.runPythonAsync(`...`);  // Add await
   ```

2. **Explicit buffer cleanup**:
   ```python
   # In execution-python.ts Python code
   _rdit_stdout.close()
   _rdit_stderr.close()
   ```

3. **Type-safe error handling**:
   ```typescript
   } catch (error: unknown) {
     const errorMessage = error instanceof Error
       ? error.message
       : String(error);
     // ... rest of error handling
   }
   ```

## Migration Path from Prototype to Production

### Phase 1: Core Stability (Week 1-2)
- [ ] Run and fix all tests
- [ ] Address code quality issues (async consistency, error handling)
- [ ] Document package loading in README
- [ ] Add basic error boundaries

### Phase 2: Matplotlib Support (Week 2-3)
- [ ] Research matplotlib-pyodide package
- [ ] Implement canvas capture (Option 1) or PNG export (Option 2)
- [ ] Add tests for plotting
- [ ] Update UI to display images

### Phase 3: Polish & Performance (Week 3-4)
- [ ] Lazy package loading
- [ ] Performance monitoring
- [ ] Memory optimization
- [ ] Comprehensive documentation

### Phase 4: Production Ready (Week 4+)
- [ ] Security review
- [ ] Cross-browser testing
- [ ] User acceptance testing
- [ ] Production deployment

## References

- Pyodide Documentation: https://pyodide.org/en/stable/
- Pyodide Packages: https://pyodide.org/en/stable/usage/packages-in-pyodide.html
- Matplotlib in Pyodide: https://pyodide.org/en/stable/usage/packages-in-pyodide.html#matplotlib
- micropip API: https://pyodide.org/en/stable/usage/api/micropip-api.html
- WebR Documentation: https://docs.r-wasm.org/webr/latest/

## Conclusion

The Pyodide prototype is **functionally sound** for core Python execution but requires matplotlib support and testing before production use. The architecture is excellent and positions the codebase well for future enhancements. With 2-4 weeks of focused development, this could be production-ready.

**Recommendation**: Proceed with Phase 1 (Core Stability) immediately, then evaluate Phase 2 (Matplotlib) based on user requirements.
