# CodeMirror Document Change Example

## Overview
The page demonstrates how to initiate editor state changes in CodeMirror by "dispatching a transaction."

## Key Concepts

**Basic Insertion:**
The simplest change involves using a dispatch with a changes object. For example, "Insert text at the start of the document" using `{from: 0, insert: "#!/usr/bin/env node\n"}`.

**Change Structure:**
Changes use objects containing `from`, `to`, and `insert` properties. The documentation notes that "for insertions, `to` can be omitted, and for deletions, `insert` can be omitted."

**Multiple Changes:**
When passing an array of changes, position references in each change "refer to positions in the start document, not to the document created by previously listed changes." This is demonstrated with a tab-replacement example.

## Selection-Based Operations

**replaceSelection Method:**
This utility replaces each selected range with a string and "moves the selection ranges to the end of that string."

**changeByRange Helper:**
For more complex operations across multiple ranges, this method handles the "potentially complicated interactions between those ranges and the changes." It accepts a callback that returns an object with both the changes and the updated range position.

## Resource Links
The page references CodeMirror's documentation, discussion forum, and GitHub repository for additional information.
