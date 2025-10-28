import {
  EditorView,
  Panel,
  showPanel,
} from "@codemirror/view";
import {
  StateField,
  StateEffect,
  Extension,
} from "@codemirror/state";
import { lineGroupsField } from "./result-grouping-plugin";
import { spacersField, lineGroupTargetHeightsField } from "./line-group-layout";

// State effect to toggle the debug panel
const toggleDebugPanel = StateEffect.define<boolean>();

// State field to track whether the debug panel is visible
const debugPanelState = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (let effect of tr.effects) {
      if (effect.is(toggleDebugPanel)) {
        return effect.value;
      }
    }
    return value;
  },
  provide: (f) =>
    showPanel.from(f, (on) => (on ? createDebugPanel : null)),
});

function createDebugPanel(view: EditorView): Panel {
  let dom = document.createElement("div");
  dom.className = "cm-debug-panel";

  // Create tabs container
  let tabsContainer = document.createElement("div");
  tabsContainer.className = "cm-debug-tabs";

  let lineGroupsTab = document.createElement("button");
  lineGroupsTab.textContent = "Line Groups";
  lineGroupsTab.className = "cm-debug-tab active";

  let layoutTab = document.createElement("button");
  layoutTab.textContent = "Layout";
  layoutTab.className = "cm-debug-tab";

  tabsContainer.appendChild(lineGroupsTab);
  tabsContainer.appendChild(layoutTab);

  // Create content container
  let contentContainer = document.createElement("div");
  contentContainer.className = "cm-debug-content";

  dom.appendChild(tabsContainer);
  dom.appendChild(contentContainer);

  let currentTab: "lineGroups" | "layout" = "lineGroups";

  function updateContent() {
    contentContainer.innerHTML = "";

    if (currentTab === "lineGroups") {
      contentContainer.appendChild(renderLineGroupsTab(view));
    } else {
      contentContainer.appendChild(renderLayoutTab(view));
    }
  }

  lineGroupsTab.onclick = () => {
    currentTab = "lineGroups";
    lineGroupsTab.classList.add("active");
    layoutTab.classList.remove("active");
    updateContent();
  };

  layoutTab.onclick = () => {
    currentTab = "layout";
    layoutTab.classList.add("active");
    lineGroupsTab.classList.remove("active");
    updateContent();
  };

  updateContent();

  return {
    dom,
    top: false,
    update(update) {
      // Re-render content when document or relevant state changes
      if (
        update.docChanged ||
        update.startState.field(lineGroupsField) !==
          update.state.field(lineGroupsField) ||
        update.startState.field(spacersField) !==
          update.state.field(spacersField) ||
        update.startState.field(lineGroupTargetHeightsField) !==
          update.state.field(lineGroupTargetHeightsField)
      ) {
        updateContent();
      }
    },
  };
}

function renderLineGroupsTab(view: EditorView): HTMLElement {
  let container = document.createElement("div");
  container.className = "cm-debug-line-groups";

  let groups = view.state.field(lineGroupsField);
  let doc = view.state.doc;

  if (groups.length === 0) {
    let empty = document.createElement("div");
    empty.className = "cm-debug-empty";
    empty.textContent = "No line groups";
    container.appendChild(empty);
    return container;
  }

  let table = document.createElement("table");
  table.className = "cm-debug-table";

  // Header
  let thead = document.createElement("thead");
  let headerRow = document.createElement("tr");
  ["ID", "Lines", "From", "To", "Length", "Results"].forEach((text) => {
    let th = document.createElement("th");
    th.textContent = text;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  let tbody = document.createElement("tbody");
  groups.forEach((group) => {
    let row = document.createElement("tr");

    // ID
    let idCell = document.createElement("td");
    idCell.textContent = group.id;
    idCell.className = "cm-debug-cell-mono";
    row.appendChild(idCell);

    // Lines
    let linesCell = document.createElement("td");
    linesCell.textContent =
      group.lineStart === group.lineEnd
        ? `${group.lineStart}`
        : `${group.lineStart}-${group.lineEnd}`;
    linesCell.className = "cm-debug-cell-number";
    row.appendChild(linesCell);

    // From
    let from = doc.line(group.lineStart).from;
    let fromCell = document.createElement("td");
    fromCell.textContent = from.toString();
    fromCell.className = "cm-debug-cell-number";
    row.appendChild(fromCell);

    // To
    let to = doc.line(group.lineEnd).to;
    let toCell = document.createElement("td");
    toCell.textContent = to.toString();
    toCell.className = "cm-debug-cell-number";
    row.appendChild(toCell);

    // Length
    let lengthCell = document.createElement("td");
    lengthCell.textContent = (to - from).toString();
    lengthCell.className = "cm-debug-cell-number";
    row.appendChild(lengthCell);

    // Results
    let resultsCell = document.createElement("td");
    resultsCell.textContent = group.resultIds.join(", ");
    resultsCell.className = "cm-debug-cell-mono";
    row.appendChild(resultsCell);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);

  return container;
}

function renderLayoutTab(view: EditorView): HTMLElement {
  let container = document.createElement("div");
  container.className = "cm-debug-layout";

  let groups = view.state.field(lineGroupsField);
  let doc = view.state.doc;
  let spacers = view.state.field(spacersField);
  let targetHeights = view.state.field(lineGroupTargetHeightsField);

  if (groups.length === 0) {
    let empty = document.createElement("div");
    empty.className = "cm-debug-empty";
    empty.textContent = "No line groups to show layout for";
    container.appendChild(empty);
    return container;
  }

  // Summary section
  let summary = document.createElement("div");
  summary.className = "cm-debug-summary";
  summary.innerHTML = `
    <div><strong>Groups:</strong> ${groups.length}</div>
    <div><strong>Spacers:</strong> ${spacers.size}</div>
    <div><strong>Target Heights Set:</strong> ${targetHeights.size}</div>
  `;
  container.appendChild(summary);

  // Table
  let table = document.createElement("table");
  table.className = "cm-debug-table";

  // Header
  let thead = document.createElement("thead");
  let headerRow = document.createElement("tr");
  ["Group", "Lines", "Natural Height", "Target Height", "Spacer", "Top"].forEach(
    (text) => {
      let th = document.createElement("th");
      th.textContent = text;
      headerRow.appendChild(th);
    }
  );
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  let tbody = document.createElement("tbody");
  groups.forEach((group) => {
    let row = document.createElement("tr");

    // Group ID
    let idCell = document.createElement("td");
    idCell.textContent = group.id;
    idCell.className = "cm-debug-cell-mono";
    row.appendChild(idCell);

    // Lines
    let linesCell = document.createElement("td");
    linesCell.textContent =
      group.lineStart === group.lineEnd
        ? `${group.lineStart}`
        : `${group.lineStart}-${group.lineEnd}`;
    linesCell.className = "cm-debug-cell-number";
    row.appendChild(linesCell);

    // Natural Height (measure from DOM)
    let naturalHeight = 0;
    for (let lineNum = group.lineStart; lineNum <= group.lineEnd; lineNum++) {
      let line = doc.line(lineNum);
      let block = view.lineBlockAt(line.from);
      naturalHeight += block.height;
    }

    let naturalCell = document.createElement("td");
    naturalCell.textContent = naturalHeight.toFixed(1);
    naturalCell.className = "cm-debug-cell-number";
    row.appendChild(naturalCell);

    // Target Height
    let targetHeight = targetHeights.get(group.id);
    let targetCell = document.createElement("td");
    targetCell.textContent =
      targetHeight !== undefined ? targetHeight.toFixed(1) : "-";
    targetCell.className = "cm-debug-cell-number";
    row.appendChild(targetCell);

    // Spacer (check if there's a spacer at the end of this group)
    let endLine = doc.line(group.lineEnd);
    let spacerHeight = 0;
    spacers.between(endLine.to, endLine.to + 1, (_from, _to, value) => {
      if (value.spec.widget) {
        spacerHeight = (value.spec.widget as any).height || 0;
      }
    });

    let spacerCell = document.createElement("td");
    spacerCell.textContent = spacerHeight > 0 ? spacerHeight.toFixed(1) : "-";
    spacerCell.className = "cm-debug-cell-number";
    row.appendChild(spacerCell);

    // Top position
    let startLine = doc.line(group.lineStart);
    let block = view.lineBlockAt(startLine.from);
    let topCell = document.createElement("td");
    topCell.textContent = block.top.toFixed(1);
    topCell.className = "cm-debug-cell-number";
    row.appendChild(topCell);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);

  return container;
}

// Export the extension and toggle command
export function debugPanelExtension(): Extension {
  return [
    debugPanelState,
    EditorView.baseTheme({
      ".cm-debug-panel": {
        padding: "8px",
        backgroundColor: "#f5f5f5",
        borderTop: "1px solid #ddd",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "12px",
        maxHeight: "300px",
        overflow: "auto",
      },
      ".cm-debug-tabs": {
        display: "flex",
        gap: "4px",
        marginBottom: "8px",
        borderBottom: "1px solid #ddd",
        paddingBottom: "4px",
      },
      ".cm-debug-tab": {
        padding: "4px 12px",
        border: "none",
        backgroundColor: "transparent",
        cursor: "pointer",
        fontSize: "12px",
        fontWeight: "500",
        color: "#666",
        borderRadius: "4px 4px 0 0",
      },
      ".cm-debug-tab.active": {
        backgroundColor: "white",
        color: "#000",
        borderBottom: "2px solid #007bff",
      },
      ".cm-debug-tab:hover": {
        backgroundColor: "#e9ecef",
      },
      ".cm-debug-content": {
        backgroundColor: "white",
        padding: "8px",
        borderRadius: "4px",
      },
      ".cm-debug-table": {
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "11px",
      },
      ".cm-debug-table th": {
        textAlign: "left",
        padding: "4px 8px",
        backgroundColor: "#e9ecef",
        fontWeight: "600",
        borderBottom: "2px solid #ddd",
      },
      ".cm-debug-table td": {
        padding: "4px 8px",
        borderBottom: "1px solid #eee",
      },
      ".cm-debug-table tr:hover": {
        backgroundColor: "#f8f9fa",
      },
      ".cm-debug-cell-mono": {
        fontFamily: "monospace",
        fontSize: "10px",
      },
      ".cm-debug-cell-number": {
        fontFamily: "monospace",
        textAlign: "right",
      },
      ".cm-debug-empty": {
        padding: "16px",
        textAlign: "center",
        color: "#999",
        fontStyle: "italic",
      },
      ".cm-debug-summary": {
        display: "flex",
        gap: "16px",
        marginBottom: "12px",
        padding: "8px",
        backgroundColor: "#f8f9fa",
        borderRadius: "4px",
        fontSize: "11px",
      },
      ".cm-debug-summary strong": {
        fontWeight: "600",
        marginRight: "4px",
      },
    }),
  ];
}

export function toggleDebugPanelCommand(view: EditorView): boolean {
  let current = view.state.field(debugPanelState);
  view.dispatch({
    effects: toggleDebugPanel.of(!current),
  });
  return true;
}
