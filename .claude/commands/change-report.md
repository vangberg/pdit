Generate a standalone HTML file documenting the recent code changes.

## Instructions

1. Run `git diff HEAD` (or `git diff main` if on a feature branch) to get the changes
2. For any new files, read their full contents
3. Create an HTML file named after the feature (e.g., `feature-name-changes.html`) with:

## HTML Structure

- **Light theme** with syntax-highlighted diffs
- **Narrative format** explaining:
  - The problem being solved
  - The solution approach
  - Each file changed and why
- **Embedded diffs** showing the actual code changes:
  - Green background for additions
  - Red background for removals
  - Gray for context lines
- **Architecture overview** if the change is structural
- **Trade-offs or notes** if relevant

## Style Guidelines

- Use a clean light color scheme (white/light gray background, dark text)
- GitHub-style diff colors (green #e6ffec for adds, red #ffebe9 for removes)
- Monospace font for code/diffs
- Clear section headings
- File paths in styled code badges
- Flow diagrams using simple box → box → box layout if helpful

## Diff Formatting

Format diffs as:
```html
<div class="diff">
  <div class="diff-header">path/to/file.ext</div>
  <div class="diff-content">
    <div class="diff-line diff-add">+added line</div>
    <div class="diff-line diff-remove">-removed line</div>
    <div class="diff-line diff-context"> context line</div>
  </div>
</div>
```

For new files, use class `new-file` on the diff container and show full contents.

## Output

Save the HTML file to the project root directory.
