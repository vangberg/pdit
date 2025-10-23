# CodeMirror Tab Handling Example

## Overview
This documentation page explains CodeMirror's intentional approach to Tab key handling and provides guidance for developers who want to customize this behavior.

## Key Points

**Default Behavior:**
By default, CodeMirror does not handle the Tab key. According to the page, this decision was made deliberately "to make the default configuration pass the ['no keyboard trap' criterion](https://www.w3.org/TR/WCAG21/#no-keyboard-trap) of the W3C Web Content Accessibility Guidelines."

**Rationale:**
The tool prioritizes accessibility for users without pointing devices, recognizing that trapping focus is unfriendly to such users.

**Built-in Escape Hatches:**
- Press Escape, then Tab to bypass the editor and move focus elsewhere
- Use Ctrl-M (or Shift-Alt-M on macOS) to toggle tab focus mode via the `toggleTabFocusMode` command

**Implementation for Developers:**
If you need Tab functionality for indentation, the documentation recommends:
1. Document the escape hatches for users
2. Add custom key bindings using the `indentWithTab` command from the commands package

## Code Example
The page provides a complete JavaScript example showing how to set up CodeMirror with Tab indentation support using `basicSetup`, `keymap`, and the `indentWithTab` function.
