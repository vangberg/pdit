# CodeMirror Collaborative Editing Example

## Overview

This page demonstrates real-time collaborative editing where multiple users can simultaneously edit the same document. Changes sync across the network and appear instantly in other participants' views.

## Core Principles

The `@codemirror/collab` package implements collaborative systems using operational transformation with a central authority:

- **Central Authority**: Maintains a history of all changes
- **Peers**: Track their synchronized version and local unconfirmed changes
- **Synchronization**: When remote changes arrive, they're applied to local state using operational transformation to handle conflicts
- **Push/Pull Model**: Peers send unconfirmed changes to the authority and receive new updates

Key quote: "If some of those changes are the peer's own changes, those changes are removed from the list of unconfirmed changes."

## Architecture Components

### The Authority
The central system maintains:
- An array of updates (each containing a change set and client ID)
- The current document state

It handles three message types:
- **pullUpdates**: Retrieves new changes since a given version
- **pushUpdates**: Receives and stores client updates, rebasing if necessary
- **getDocument**: Provides initial state to new peers

### The Peer
Each editor instance runs a view plugin that:
- Continuously pulls updates from the authority via an async loop
- Applies remote updates using `receiveUpdates()`
- Pushes local changes when the document changes
- Manages one running push request at a time with retry logic

## Implementation Details

The peer extension combines collaborative functionality with communication:

```
- Uses ViewPlugin for asynchronous operations
- Implements push() to send sendable updates
- Implements pull() to receive and apply remote updates
- Integrates collab extension with appropriate start version
```

## Advanced Features

**Dropping Old Updates**: Systems can optionally discard old updates to save space, though this prevents offline peers from full resynchronization.

**Shared Effects**: Beyond document changes, you can share other `StateEffect` instances across peers using the `sharedEffects` configuration option. Effects must include position-mapping functions to adjust coordinates when documents change.

Important consideration: "The kind of position mapping done in the effect's `map` function is not guaranteed to converge to the same positions when applied in different order by different peers."

## Related Resources

The documentation references [Yjs](https://github.com/yjs/y-codemirror.next) as an alternative collaborative algorithm that can integrate with CodeMirror.
