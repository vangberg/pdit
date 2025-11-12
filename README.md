# rdit

An interactive R code editor powered by WebR, running entirely in the browser.

## Features

- **Browser-based R execution** - Run R code without server-side infrastructure using WebAssembly
- **Interactive editor** - CodeMirror 6-based editor with R syntax highlighting
- **Inline results** - Execution results displayed inline next to code
- **Visualizations** - Support for R plots and graphics
- **Execute with Cmd+Enter** - Quick code execution

## Tech Stack

- React 19
- CodeMirror 6
- WebR 0.5.6 (R in WebAssembly)
- Vite 5
- TypeScript

## Getting Started

### Prerequisites

- Node.js (v20 or higher recommended)
- npm

### Installation

```bash
npm install
```

### Development

Start the development server:

```bash
npm run dev
```

The app will open automatically in your browser with hot module replacement enabled.

### Build

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Testing

The project uses Vitest with browser mode (Chromium) for testing.

### Running Tests

Run tests in watch mode (interactive):

```bash
npm test
```

Run tests once (CI mode):

```bash
npm test -- --run
```

### Browser Requirements

Tests run in a real Chromium browser environment using Playwright. The first time you run tests, Playwright will download the necessary browser binaries automatically. If you need to manually install browsers:

```bash
npx playwright install chromium
```

### Writing Tests

Tests are located alongside source files with the `.test.ts` or `.test.tsx` extension:

```
src/
  compute-line-groups.ts
  compute-line-groups.test.ts  # Test file
```

Test files are automatically discovered by the pattern `src/**/*.test.{ts,tsx}`.

## Project Structure

```
src/
  App.tsx              # Main application component
  Editor.tsx           # CodeMirror editor component
  execution.ts         # WebR execution logic
  compute-line-groups.ts  # Result grouping algorithm
  results.ts           # Result store management
  webr-instance.ts     # WebR initialization
```

## License

Private
