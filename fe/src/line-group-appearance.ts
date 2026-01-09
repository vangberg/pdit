import { LineGroup } from "./compute-line-groups";

export interface LineGroupVisualFlags {
  isRecent: boolean;
  isStale: boolean;
}

export function getLineGroupVisualFlags(
  group: LineGroup,
  lastExecutedIds: Set<number>,
  staleGroupIds: Set<string>
): LineGroupVisualFlags {
  return {
    isRecent: group.resultIds.some((id) => lastExecutedIds.has(id)),
    isStale: group.state === "done" && staleGroupIds.has(group.id),
  };
}

export function getLineGroupBackgroundClass(
  group: LineGroup,
  flags: LineGroupVisualFlags
): string | null {
  if (flags.isStale || group.state === "cancelled") {
    return null;
  }

  const hasError = group.hasError ?? false;
  const allInvisible = group.allInvisible ?? false;

  if (group.state === "pending") {
    return "cm-line-group-pending";
  }
  if (group.state === "executing") {
    return "cm-line-group-executing";
  }
  if (hasError) {
    return flags.isRecent
      ? "cm-line-group-error cm-line-group-error-recent"
      : "cm-line-group-error";
  }
  if (allInvisible) {
    return flags.isRecent
      ? "cm-line-group-invisible cm-line-group-recent"
      : "cm-line-group-invisible";
  }

  return flags.isRecent ? "cm-line-group-bg cm-line-group-recent" : "cm-line-group-bg";
}

export function shouldRenderLineGroupTopBorder(group: LineGroup): boolean {
  return group.state === "done" && !group.allInvisible;
}

export function getLineGroupSpacerClass(
  group: LineGroup,
  flags: LineGroupVisualFlags
): string {
  const hasError = group.hasError ?? false;

  if (group.state === "pending") {
    return "cm-preview-spacer cm-preview-spacer-pending";
  }
  if (group.state === "executing") {
    return "cm-preview-spacer cm-preview-spacer-executing";
  }
  if (flags.isStale) {
    return "cm-preview-spacer cm-preview-spacer-stale";
  }
  if (hasError) {
    return flags.isRecent
      ? "cm-preview-spacer cm-preview-spacer-error cm-preview-spacer-error-recent"
      : "cm-preview-spacer cm-preview-spacer-error";
  }

  return flags.isRecent ? "cm-preview-spacer cm-preview-spacer-recent" : "cm-preview-spacer";
}
