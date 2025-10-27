export interface ExecutionOutput {
  id: number;
  lineStart: number;
  lineEnd: number;
}

export interface ExecutionResult {
  results: ExecutionOutput[];
}

let globalIdCounter = 1;

export async function executeScript(script: string): Promise<ExecutionResult> {
  const lines = script.split("\n");
  const totalLines = lines.length;
  const results: ExecutionOutput[] = [];

  // Result on the first line if present
  if (totalLines >= 1) {
    results.push({
      id: globalIdCounter++,
      lineStart: 1,
      lineEnd: 1,
    });
  }

  // Result spanning lines 2-3 to demonstrate multi-line grouping
  if (totalLines >= 3) {
    results.push({
      id: globalIdCounter++,
      lineStart: 2,
      lineEnd: 3,
    });
  }

  // Two separate results sharing line 7 to demonstrate grouping
  if (totalLines >= 7) {
    results.push({
      id: globalIdCounter++,
      lineStart: 7,
      lineEnd: 7,
    });
    results.push({
      id: globalIdCounter++,
      lineStart: 7,
      lineEnd: 7,
    });
  }

  return { results };
}
