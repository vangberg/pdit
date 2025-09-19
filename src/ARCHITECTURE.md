# Rokko Architecture

## API

### POST /api/execute

#### Input

Takes the script as request body.

#### Output

Returns the execution result of the script.

```ts
interface ApiExecuteResponse {
  results: ApiExecuteResult[];
}
```

```ts
interface ApiExecuteResult {
  id: number;
  from: number;
  to: number;
}
```

`from` and `to` are the character positions in the script.

## Editor/Preview Mapping

Results are stored in a CodeMirror [`RangeSet`](https://codemirror.net/docs/ref/#state.RangeSet). This is updated whenever the editor state changes, keeping
the mapping between editor and preview in sync.
