# Full height editor

I want the editor to take full height, even if there is not enough content to fill the screen.

At the same time, the following MUST be ensured:

1. The editor half and the output half should scroll together when the content overflows vertically.
2. The editor half and the output half should be independently scrollable when the content overflows horizontally. This was implemented in f27deb10d8e7361c61b7d4f9897c61fb79cf2580.

My attempt at implementing this results in editor line groups and output line groups not
having the same height when they are beyond the viewport height.
