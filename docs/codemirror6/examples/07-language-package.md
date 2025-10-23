# CodeMirror Language Package Implementation Guide

## Overview

CodeMirror language support is delivered through specialized packages that implement features for specific programming languages. These packages may include:

- A parser for the language
- Syntax-related metadata (highlighting, indentation, folding)
- Language-specific extensions and commands (autocompletion, keybindings)

## Parsing Approaches

The document describes three primary methods for implementing parsers:

**Lezer Grammar System** (recommended)
A parser generator that converts declarative grammar descriptions into efficient parsers. This approach is demonstrated in the example.

**CodeMirror 5-style Stream Parser**
Functions as a tokenizer for basic highlighting but doesn't produce structured syntax trees and struggles beyond simple tokenization.

**Custom Parser**
Necessary for complex languages like Markdown but requires substantial development effort.

### Parser Requirements

"The way the editor parses code needs to be incremental, so that it can quickly update its parse when the document changes, without re-parsing the entire text."

Parsers must also be error-tolerant and produce syntax trees compatible with CodeMirror's highlighter.

## Implementation Steps

### 1. Grammar File Creation

Grammar files (`.grammar` extension) are processed through `lezer-generator` to create JavaScript parser modules.

### 2. Parser Configuration with Metadata

The parser is enhanced with editor-specific information:

```javascript
import {parser} from "./parser.js"
import {foldNodeProp, foldInside, indentNodeProp} from "@codemirror/language"
import {styleTags, tags as t} from "@lezer/highlight"

let parserWithMetadata = parser.configure({
  props: [
    styleTags({
      Identifier: t.variableName,
      Boolean: t.bool,
      String: t.string,
      LineComment: t.lineComment,
      "( )": t.paren
    }),
    indentNodeProp.add({
      Application: context => context.column(context.node.from) + context.unit
    }),
    foldNodeProp.add({
      Application: foldInside
    })
  ]
})
```

**Key Components:**

- **styleTags**: Maps node types to highlighting tags describing syntactic roles
- **indentNodeProp**: Associates indentation functions with node types
- **foldNodeProp**: Enables code folding for specific node types

### 3. Language Instance Creation

```javascript
import {LRLanguage} from "@codemirror/language"

export const exampleLanguage = LRLanguage.define({
  parser: parserWithMetadata,
  languageData: {
    commentTokens: {line: ";"}
  }
})
```

This wraps the parser and enables language-specific facets for external extensions.

### 4. Adding Language Features

Autocompletion example:

```javascript
import {completeFromList} from "@codemirror/autocomplete"

export const exampleCompletion = exampleLanguage.data.of({
  autocomplete: completeFromList([
    {label: "defun", type: "keyword"},
    {label: "defvar", type: "keyword"},
    {label: "let", type: "keyword"},
    {label: "cons", type: "function"},
    {label: "car", type: "function"},
    {label: "cdr", type: "function"}
  ])
})
```

### 5. Main Export Function

Following convention, packages export a language-named function returning `LanguageSupport`:

```javascript
import {LanguageSupport} from "@codemirror/language"

export function example() {
  return new LanguageSupport(exampleLanguage, [exampleCompletion])
}
```

## Resources

The [codemirror/lang-example](https://github.com/codemirror/lang-example) repository provides a complete, buildable template for creating language packages with proper tool configuration.
