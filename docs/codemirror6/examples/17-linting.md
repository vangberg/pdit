# CodeMirror Lint Example: Overview

## Purpose
The `@codemirror/lint` package enables displaying errors and warnings in code editors by accepting a source function that produces an array of problems.

## Key Points

**How it works:** The library requires developers to provide their own lint sources. As noted, "The library does _not_ come with a collection of lint sources." Some language packages offer integrations, but setup typically falls to the developer.

**Two approaches exist:**
1. Run a linter in the browser and translate output to the expected diagnostic format
2. Create a custom linter leveraging the editor's syntax tree

## Code Example Breakdown

The documentation demonstrates a custom linter that flags regular expressions in JavaScript code:

```javascript
import {syntaxTree} from "@codemirror/language"
import {linter, Diagnostic} from "@codemirror/lint"

const regexpLinter = linter(view => {
  let diagnostics: Diagnostic[] = []
  syntaxTree(view.state).cursor().iterate(node => {
    if (node.name == "RegExp") diagnostics.push({
      from: node.from,
      to: node.to,
      severity: "warning",
      message: "Regular expressions are FORBIDDEN",
      actions: [{
        name: "Remove",
        apply(view, from, to) { view.dispatch({changes: {from, to}}) }
      }]
    })
  })
  return diagnostics
})
```

## Diagnostic Requirements

Diagnostic objects must include position properties (`from`, `to`), severity level, and a message. The optional `actions` field enables clickable buttons that can automatically fix issues or provide additional information.
