import { diffLines, Change } from "diff";
import { LineGroup } from "./compute-line-groups";

export interface AdjustedLineGroupsResult {
  lineGroups: LineGroup[];
  changedLines: Set<number>;
}

/**
 * Build a mapping from old line numbers to new line numbers.
 * Returns -1 for lines that were deleted or modified.
 */
function buildLineMapping(changes: Change[]): Map<number, number> {
  const mapping = new Map<number, number>();
  let oldLine = 1;
  let newLine = 1;

  for (const change of changes) {
    const lineCount = change.count ?? 0;

    if (change.removed) {
      // These old lines map to nothing (deleted)
      for (let i = 0; i < lineCount; i++) {
        mapping.set(oldLine + i, -1);
      }
      oldLine += lineCount;
    } else if (change.added) {
      // New lines added, old line numbers don't change
      newLine += lineCount;
    } else {
      // Unchanged - old lines map to new lines
      for (let i = 0; i < lineCount; i++) {
        mapping.set(oldLine + i, newLine + i);
      }
      oldLine += lineCount;
      newLine += lineCount;
    }
  }

  return mapping;
}

/**
 * Get the line numbers that were added or modified in the new document.
 */
function getChangedLines(changes: Change[]): Set<number> {
  const changedLines = new Set<number>();
  let newLine = 1;

  for (const change of changes) {
    const lineCount = change.count ?? 0;

    if (change.added) {
      for (let i = 0; i < lineCount; i++) {
        changedLines.add(newLine + i);
      }
      newLine += lineCount;
    } else if (!change.removed) {
      // Unchanged lines
      newLine += lineCount;
    }
    // Removed lines don't affect new line numbering
  }

  return changedLines;
}

export function adjustLineGroupsForDiff(
  oldContent: string,
  newContent: string,
  lineGroups: LineGroup[]
): AdjustedLineGroupsResult {
  const changes = diffLines(oldContent, newContent);
  const lineMapping = buildLineMapping(changes);
  const changedLines = getChangedLines(changes);

  const adjusted: LineGroup[] = [];

  for (const group of lineGroups) {
    const newStart = lineMapping.get(group.lineStart);
    const newEnd = lineMapping.get(group.lineEnd);

    // Keep group only if all its lines map to valid new positions
    if (newStart !== undefined && newStart !== -1 &&
        newEnd !== undefined && newEnd !== -1) {
      // Verify continuity - all lines between start and end should also map
      let valid = true;
      for (let line = group.lineStart; line <= group.lineEnd; line++) {
        const mapped = lineMapping.get(line);
        if (mapped === undefined || mapped === -1) {
          valid = false;
          break;
        }
      }

      if (valid) {
        adjusted.push({
          ...group,
          lineStart: newStart,
          lineEnd: newEnd,
        });
      }
    }
  }

  return { lineGroups: adjusted, changedLines };
}
