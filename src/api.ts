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

  // Calculate positions for each line
  const linePositions = [];
  for (let i = 0; i < lines.length; i++) {
    linePositions.push({
      start: position,
      end: position + lines[i].length
    });
    position += lines[i].length + 1; // +1 for newline character
  }

  // Add result for line 1
  if (lines.length >= 1) {
    results.push({
      id: globalIdCounter++,
      from: linePositions[0].start,
      to: linePositions[0].end
    });
  }

  // Add result for all of line 2 + first half of line 3
  if (lines.length >= 3) {
    const line2Start = linePositions[1].start;
    const line3HalfPoint = linePositions[2].start + Math.floor(lines[2].length / 2);

    results.push({
      id: globalIdCounter++,
      from: line2Start,
      to: line3HalfPoint
    });
  }

  // Add two results for line 7 (first half and second half)
  if (lines.length >= 7) {
    const line7Start = linePositions[6].start;
    const line7End = linePositions[6].end;
    const line7MidPoint = line7Start + Math.floor(lines[6].length / 2);

    // First half of line 7
    results.push({
      id: globalIdCounter++,
      from: line7Start,
      to: line7MidPoint
    });

    // Second half of line 7
    results.push({
      id: globalIdCounter++,
      from: line7MidPoint,
      to: line7End
    });
  }

  return { results };
}