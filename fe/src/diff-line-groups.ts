import { diffLines } from "diff";
import { LineGroup } from "./compute-line-groups";

/**
 * Adjusts line groups when file content changes externally.
 * Uses diff to map old line numbers to new line numbers and keeps
 * only groups whose lines still exist contiguously.
 */
export function adjustLineGroupsForDiff(
  oldContent: string,
  newContent: string,
  lineGroups: LineGroup[]
): LineGroup[] {
  if (lineGroups.length === 0) {
    return [];
  }

  // Build line mapping from old content to new content
  const lineMapping = buildLineMapping(oldContent, newContent);

  const adjustedGroups: LineGroup[] = [];

  for (const group of lineGroups) {
    // Map all lines in the group's range
    const mappedLines: number[] = [];
    let allValid = true;

    for (let line = group.lineStart; line <= group.lineEnd; line++) {
      const mappedLine = lineMapping.get(line);
      if (mappedLine === undefined || mappedLine === -1) {
        // Line was deleted
        allValid = false;
        break;
      }
      mappedLines.push(mappedLine);
    }

    if (!allValid) {
      continue;
    }

    // Check contiguity: each mapped line should be exactly +1 from previous
    let isContiguous = true;
    for (let i = 1; i < mappedLines.length; i++) {
      if (mappedLines[i] !== mappedLines[i - 1] + 1) {
        isContiguous = false;
        break;
      }
    }

    if (!isContiguous) {
      continue;
    }

    // Keep the group with adjusted line numbers
    adjustedGroups.push({
      ...group,
      lineStart: mappedLines[0],
      lineEnd: mappedLines[mappedLines.length - 1],
    });
  }

  return adjustedGroups;
}

/**
 * Builds a mapping from old line numbers to new line numbers.
 * Lines that were deleted map to -1.
 */
function buildLineMapping(
  oldContent: string,
  newContent: string
): Map<number, number> {
  const mapping = new Map<number, number>();
  const changes = diffLines(oldContent, newContent);

  let oldLine = 1;
  let newLine = 1;

  for (const change of changes) {
    // Count lines in this chunk (handle missing newline at end)
    const lines = change.value.split("\n");
    // If the value ends with newline, last element is empty string
    const lineCount = change.value.endsWith("\n")
      ? lines.length - 1
      : lines.length;

    if (change.removed) {
      // Lines deleted: map old lines to -1
      for (let i = 0; i < lineCount; i++) {
        mapping.set(oldLine + i, -1);
      }
      oldLine += lineCount;
    } else if (change.added) {
      // Lines added: only advance new line counter
      newLine += lineCount;
    } else {
      // Unchanged: map old lines to new lines
      for (let i = 0; i < lineCount; i++) {
        mapping.set(oldLine + i, newLine + i);
      }
      oldLine += lineCount;
      newLine += lineCount;
    }
  }

  return mapping;
}
