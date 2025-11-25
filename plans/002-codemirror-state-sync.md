# CodeMirror State Synchronization Plan

## Goals

- Keep a single `EditorView` instance alive for the lifetime of the editor component.
- Reflect CodeMirror’s canonical state (doc + group ranges) back into React for debugging and other UI.
- Allow React to push doc/range updates into CodeMirror without re-initializing the view.

## Approach

1. **Encapsulate View Access**

   - Expose a minimal ref-backed API (`EditorHandles`) with `applyExecutionUpdate` for write operations.
   - Guard dispatches so redundant updates (same doc string) don’t create extra transactions before firing the unified helper.
   - Relax the `setGroupRanges` effect mapper so it returns the incoming `RangeSet` unchanged—coordinates are authored against the soon-to-be doc, letting us bundle doc replacement + decoration in a single dispatch.

   ```tsx
   // src/Editor.tsx
   useImperativeHandle(
     ref,
     () => ({
       applyExecutionUpdate: ({
         doc,
         results,
       }: {
         doc: string;
         results: ApiExecuteResult[];
       }) => {
         const view = viewRef.current;
         if (!view) return;

         const text = Text.of(doc.split("\n"));
         const groups = computeLineGroups(results);
         const rangeSet = buildGroupRangeSet(text, groups);

         const transactions: any = {
           selection: { anchor: doc.length },
           effects: setGroupRanges.of(rangeSet),
         };

         if (doc !== view.state.doc.toString()) {
           transactions.changes = {
             from: 0,
             to: view.state.doc.length,
             insert: doc,
           };
         }

         view.dispatch(transactions);
       },
     }),
     []
   );
   ```

````

2. **Subscribe to Editor State**
 - Register a single `updateListener` regardless of which callbacks are provided so doc and range sync behave consistently.
 - Diff `groupRangesField` using `update.startState` vs `update.state` to detect changes produced either by explicit effects or by document edits.
 - On mount, immediately emit the current doc and RangeSet so React has an initial snapshot.

 ```tsx
 // src/Editor.tsx
 EditorView.updateListener.of((update: ViewUpdate) => {
   if (onDocumentChange && update.docChanged) {
     onDocumentChange(update.state.doc);
   }

   if (onGroupRangesChange) {


     const previous = update.startState.field(groupRangesField);
     const next = update.state.field(groupRangesField);

     if (previous !== next) {
       onGroupRangesChange(next as RangeSet<GroupValue>);
     }
   }
 });

 onDocumentChange?.(view.state.doc);
 onGroupRangesChange?.(view.state.field(groupRangesField) as RangeSet<GroupValue>);
````

3. **Drive Execution Flow**

   - When React receives execution results, pass the raw payload into `applyExecutionUpdate`; the imperative helper now owns doc replacement and range derivation.
   - Keep a shared `buildGroupRangeSet` helper alongside the editor implementation so both the imperative API and any future consumers produce identical `RangeSet` shapes.
   - Mirror the snapped RangeSet into React state for the debug panel and downstream consumers via the broadened listener.

   ```tsx
   // src/App.tsx
   const handleExecute = useCallback(async (script: string) => {
     const response = await executeScript(script);
     setExecuteResults(response);

     editorRef.current?.applyExecutionUpdate({
       doc: script,
       results: response.results,
     });
   }, []);
   ```

````

 ```ts
 // src/Editor.tsx
 const buildGroupRangeSet = (
   doc: Text,
   groups: ReturnType<typeof computeLineGroups>
 ): RangeSet<GroupValue> => {
   if (groups.length === 0) {
     return RangeSet.empty;
   }

   const ranges = groups.map((group, index) => {
     const fromLine = doc.line(group.lineStart);
     const toLine = doc.line(group.lineEnd);
     return {
       from: fromLine.from,
       to: toLine.to,
       value: new GroupValue(index, group.resultIds),
     };
   });

   return RangeSet.of(ranges, true);
 };
````

4. **Keep Debug Panel Simple**

   - Pass the mirrored doc string/RangeSet directly to the panel instead of re-deriving them.
   - Future consumers (e.g., output grouping) reuse the same mirrored state.

   ```tsx
   // src/App.tsx:24-105
   const [currentDoc, setCurrentDoc] = useState<Text | null>(null);
   const [currentGroupRanges, setCurrentGroupRanges] = useState<RangeSet<GroupValue>>(RangeSet.empty);

   const handleDocumentChange = useCallback((doc: Text) => {
     setCurrentDoc(doc);
   }, []);

   const handleGroupRangesChange = useCallback((ranges: RangeSet<GroupValue>) => {
     setCurrentGroupRanges(ranges);
   }, []);

    ...

   <Editor
     ref={editorRef}
     initialCode={initialCode}
     onHeightChange={handleEditorHeightChange}
     targetHeights={targetEditorHeights}
     onExecute={handleExecute}
     onDocumentChange={handleDocumentChange}
     onGroupRangesChange={handleGroupRangesChange}
   />

   <DebugPanel
     editorHeights={editorHeights}
     outputHeights={outputHeights}
     targetEditorHeights={targetEditorHeights}
     targetOutputHeights={targetOutputHeights}
     isSyncing={isSyncing.current}
     groupRanges={currentGroupRanges}
     currentDoc={currentDoc}
   />
   ```

5. **Testing / Validation**
   - `npm run build` to ensure TypeScript stays happy.
   - Manual smoke test: Execute twice, edit doc between runs, confirm debug panel shows updated doc and range data.
