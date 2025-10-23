# CodeMirror Configuration Guide

## Overview

CodeMirror's configuration system operates through an **EditorState** containing extensions that resolve into an effective configuration. As the documentation explains, "Extensions can be created by various library functions, and do things like adding an input for a facet or installing a state field."

## Key Concepts

### Extensions and Facets

Extensions are composable units that can be grouped in arrays. The history extension exemplifies this complexity—it bundles a state field for undo tracking, a facet for controlling behavior, and a view plugin for input events, yet users simply drop in the function's output without managing these internals.

### Precedence System

Extension ordering matters significantly. When configurations flatten nested arrays, the sequence determines evaluation order for handlers, filters, and keymaps. The system includes five precedence buckets: `highest`, `high`, `default`, `low`, and `lowest`. Higher-precedence extensions execute before lower ones, regardless of array position.

For example, given `[Prec.high(A), B, Prec.high([C, D])]`, the execution order becomes A, C, D, B—because high-precedence items precede default-precedence items.

## Dynamic Configuration

### Compartments

Rather than changing individual options, CodeMirror uses compartments to enable partial reconfiguration:

```javascript
import {basicSetup, EditorView} from "codemirror"
import {EditorState, Compartment} from "@codemirror/state"
import {python} from "@codemirror/lang-python"

let language = new Compartment, tabSize = new Compartment

let state = EditorState.create({
  extensions: [
    basicSetup,
    language.of(python()),
    tabSize.of(EditorState.tabSize.of(8))
  ]
})

let view = new EditorView({
  state,
  parent: document.body
})
```

Transactions can then update specific compartments:

```javascript
function setTabSize(view, size) {
  view.dispatch({
    effects: tabSize.reconfigure(EditorState.tabSize.of(size))
  })
}
```

### Private Compartments

Extensions can declare local compartments for conditional functionality. This toggles extensions dynamically:

```javascript
import {Extension, Compartment} from "@codemirror/state"
import {keymap, EditorView} from "@codemirror/view"

export function toggleWith(key: string, extension: Extension) {
  let myCompartment = new Compartment
  function toggle(view: EditorView) {
    let on = myCompartment.get(view.state) == extension
    view.dispatch({
      effects: myCompartment.reconfigure(on ? [] : extension)
    })
    return true
  }
  return [
    myCompartment.of([]),
    keymap.of([{key, run: toggle}])
  ]
}
```

### Top-Level Reconfiguration

Two mechanisms replace top-level extensions:

**Full replacement:**
```javascript
import {StateEffect} from "@codemirror/state"

view.dispatch({
  effects: StateEffect.reconfigure.of([])
})
```

**Appending extensions:**
```javascript
function injectExtension(view, extension) {
  view.dispatch({
    effects: StateEffect.appendConfig.of(extension)
  })
}
```

## Practical Example: Auto-Detecting Languages

This example demonstrates responsive configuration using transaction extenders to switch language support based on content:

```javascript
import {EditorState, Compartment} from "@codemirror/state"
import {htmlLanguage, html} from "@codemirror/lang-html"
import {language} from "@codemirror/language"
import {javascript} from "@codemirror/lang-javascript"

const languageConf = new Compartment

const autoLanguage = EditorState.transactionExtender.of(tr => {
  if (!tr.docChanged) return null
  let docIsHTML = /^\s*</.test(tr.newDoc.sliceString(0, 100))
  let stateIsHTML = tr.startState.facet(language) == htmlLanguage
  if (docIsHTML == stateIsHTML) return null
  return {
    effects: languageConf.reconfigure(docIsHTML ? html() : javascript())
  }
})

import {EditorView, basicSetup} from "codemirror"

new EditorView({
  doc: 'console.log("hello")',
  extensions: [
    basicSetup,
    languageConf.of(javascript()),
    autoLanguage
  ],
  parent: document.querySelector("#editor")
})
```

This editor automatically switches between HTML and JavaScript highlighting based on whether the content begins with `<`, demonstrating responsive configuration without manual intervention.
