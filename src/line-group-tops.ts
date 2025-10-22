import { Facet } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { lineGroupsField } from "./result-grouping-plugin";

export type LineGroupTopChange = (tops: number[]) => void;

export const lineGroupTopChangeFacet = Facet.define<
  LineGroupTopChange | null,
  LineGroupTopChange | null
>({
  combine(values) {
    if (values.length === 0) {
      return null;
    }

    return values[values.length - 1];
  },
});

class LineGroupTopPlugin {
  private lastTops: number[] | null = null;
  private measurePending = false;

  constructor(private readonly view: EditorView) {
    if (this.view.state.facet(lineGroupTopChangeFacet)) {
      this.scheduleMeasure();
    }
  }

  update(update: ViewUpdate) {
    const callback = update.state.facet(lineGroupTopChangeFacet);

    if (!callback) {
      this.lastTops = null;
      return;
    }

    const callbackChanged =
      callback !== update.startState.facet(lineGroupTopChangeFacet);
    const groupsChanged =
      update.startState.field(lineGroupsField) !==
      update.state.field(lineGroupsField);

    if (
      callbackChanged ||
      groupsChanged ||
      update.docChanged ||
      update.geometryChanged ||
      update.viewportChanged
    ) {
      this.scheduleMeasure();
    }
  }

  destroy() {
    this.measurePending = false;
    this.lastTops = null;
  }

  private scheduleMeasure() {
    if (this.measurePending) {
      return;
    }

    if (!this.view.state.facet(lineGroupTopChangeFacet)) {
      return;
    }

    this.measurePending = true;
    this.view.requestMeasure({
      read: (innerView) => this.read(innerView),
      write: (tops) => this.write(tops),
    });
  }

  private read(view: EditorView): number[] | null {
    if (!view.state.facet(lineGroupTopChangeFacet)) {
      return null;
    }

    const groups = view.state.field(lineGroupsField);
    if (!groups.length) {
      return [];
    }

    return groups.map((group) => {
      const line = view.state.doc.line(group.lineStart);
      const block = view.lineBlockAt(line.from);
      return Math.max(0, block.top);
    });
  }

  private write(tops: number[] | null) {
    this.measurePending = false;

    const callback = this.view.state.facet(lineGroupTopChangeFacet);
    if (!callback || !tops) {
      return;
    }

    if (!this.didTopsChange(tops)) {
      return;
    }

    this.lastTops = tops;
    callback(tops);
  }

  private didTopsChange(next: number[]): boolean {
    const previous = this.lastTops;

    if (!previous) {
      return true;
    }

    if (previous.length !== next.length) {
      return true;
    }

    for (let index = 0; index < next.length; index++) {
      const prev = previous[index];
      const curr = next[index];
      if (prev === undefined || Math.abs(prev - curr) > 0.5) {
        return true;
      }
    }

    return false;
  }
}

export const lineGroupTopExtension = [
  lineGroupTopChangeFacet.of(null),
  ViewPlugin.fromClass(LineGroupTopPlugin),
];
