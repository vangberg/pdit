# Set Line Group Top

## Line Group Heights

1. OutputPane: computes height of output line groups. Communicates heights to App.
2. Editor: receives line group heights from App. Sets line group heights to max(output line group height, editor line group height). This ensures that the editor line groups are always at least as tall as the output line groups.

## Line Group Tops

1. To keep editor and output line groups aligned, we need to set the top of each line group in the output pane to match the top of the corresponding line group in the editor.
2. Editor: computes top positions of line groups. Communicates tops to App.
3. OutputPane: receives line group tops from App. Sets line group tops accordingly.
4. This ensures that both editor and output line groups are aligned vertically, even if their heights differ.
