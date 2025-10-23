# CodeMirror Internationalization Overview

## Purpose
CodeMirror provides basic internationalization support for UI text in code editor plugins. Rather than hard-coding language-specific strings, developers can use the `phrases` facet to supply translated versions.

## Key Mechanism
The system works through two main components:

1. **Phrases Facet**: Store translated strings in a configuration object
2. **Phrase Method**: "will return the translated form of the string you give it if one is available, or the original string otherwise"

## Implementation Guidelines
Developers should:
- Wrap human-language strings with calls to `state.phrase()`
- Match the pattern `/\bphrase\(/` for easy discovery during translation
- Structure translations as key-value objects

## German Translation Example
The documentation provides a complete German translation mapping 26+ phrases across five core modules (@codemirror/view, @codemirror/commands, @codemirror/language, @codemirror/search, @codemirror/autocomplete, and @codemirror/lint).

Sample entries include:
- "Control character" → "Steuerzeichen"
- "Find" → "Suchen"
- "Replace" → "Ersetzen"

## Integration
Activate translations by including `EditorState.phrases.of(germanPhrases)` in your editor configuration.
