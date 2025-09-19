export interface ApiExecuteResult {
  id: number;
  from: number;
  to: number;
}

export interface ApiExecuteResponse {
  results: ApiExecuteResult[];
}

let globalIdCounter = 1;

export async function executeScript(script: string): Promise<ApiExecuteResponse> {
  const lines = script.split('\n');
  const results: ApiExecuteResult[] = [];
  let position = 0;

  // Take lines 1, 2, and 4 (if they exist)
  const targetLines = [1, 2, 4];

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;

    if (targetLines.includes(lineNumber)) {
      const from = position;
      const to = position + lines[i].length;

      results.push({
        id: globalIdCounter++,
        from,
        to
      });
    }

    position += lines[i].length + 1; // +1 for newline character
  }

  return { results };
}