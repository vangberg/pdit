# Save changes

## User experience

1. **User edits script** - as they type, the script content updates in the editor
2. **Unsaved indicator** - a visual marker (dot/asterisk) appears next to filename showing unsaved changes
3. **Save action** - user clicks "Save" button in top bar OR presses Cmd+S
4. **File written** - changes are persisted to disk via API
5. **Confirmation** - unsaved indicator disappears, button shows success state briefly
6. **Ready for next edit** - user can continue editing or run script

## Implementation requirements

- Top bar button to trigger save
- Keyboard shortcut: Cmd+S (Mac) / Ctrl+S (Windows/Linux)
- Backend API endpoint to write file to disk
- Track whether current content differs from last saved state
- Visual indicator (e.g., dot before filename) when unsaved
- Disable save button/shortcut if no changes
