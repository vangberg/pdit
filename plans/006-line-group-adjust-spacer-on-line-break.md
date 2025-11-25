# Line group adjust spacer on line break

Currently, when a line break occurs within a line group, the spacer above the line group does not adjust its height accordingly. This leads to visual misalignment between the editor and output pane.

- [x] line-group-heights.ts: store target heights in a state field.
- [x] line-group-heights.ts: on updates to doc, recompute target heights.
