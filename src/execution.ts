import { getWebR } from './webr-instance';

export interface OutputItem {
  type: 'stdout' | 'stderr' | 'error' | 'warning' | 'message';
  text: string;
}

export interface ExecutionOutput {
  id: number;
  lineStart: number;
  lineEnd: number;
  output: OutputItem[];
}

export interface ExecutionResult {
  results: ExecutionOutput[];
}

let globalIdCounter = 1;

/**
 * Execute R code using webR.
 * Parses the code into expressions and executes them one at a time,
 * capturing output and line numbers for each expression.
 */
export async function executeScript(script: string): Promise<ExecutionResult> {
  const webR = getWebR();
  const results: ExecutionOutput[] = [];

  try {
    // Store the code in R and parse with source information
    await webR.evalRVoid(`
      .rokko_code <- ${JSON.stringify(script)}
      .rokko_parsed <- parse(text = .rokko_code, keep.source = TRUE)
      .rokko_parse_data <- getParseData(.rokko_parsed)
    `);

    // Get the number of expressions
    const numExpressions = await webR.evalRNumber('length(.rokko_parsed)');

    // Execute each expression
    const shelter = await new webR.Shelter();
    try {
      for (let i = 1; i <= numExpressions; i++) {
        // Get line numbers from parse data
        // Filter for top-level expression tokens only (excluding semicolons, etc.)
        const startLine = await webR.evalRNumber(`
          {
            # Get top-level expressions (parent == 0) that are actual expressions (token == "expr")
            top_level_exprs <- .rokko_parse_data[.rokko_parse_data$parent == 0 & .rokko_parse_data$token == "expr", ]
            # Get the i-th expression's line
            if (nrow(top_level_exprs) >= ${i}) {
              top_level_exprs$line1[${i}]
            } else {
              1
            }
          }
        `);
        const endLine = await webR.evalRNumber(`
          {
            # Get top-level expressions (parent == 0) that are actual expressions (token == "expr")
            top_level_exprs <- .rokko_parse_data[.rokko_parse_data$parent == 0 & .rokko_parse_data$token == "expr", ]
            # Get the i-th expression's line
            if (nrow(top_level_exprs) >= ${i}) {
              top_level_exprs$line2[${i}]
            } else {
              1
            }
          }
        `);

        // Execute this expression and capture output
        // Enable autoprinting to match R REPL behavior for top-level expressions
        const result = await shelter.captureR(`eval(.rokko_parsed[[${i}]])`, {
          withAutoprint: true,
          captureStreams: true,
          captureConditions: false,
        });

        // Convert output to our format
        const output: OutputItem[] = [];
        for (const item of result.output) {
          if (item.type === 'stdout' || item.type === 'stderr') {
            output.push({
              type: item.type,
              text: item.data as string,
            });
          }
        }

        // Only add result if there's output
        if (output.length > 0) {
          results.push({
            id: globalIdCounter++,
            lineStart: startLine,
            lineEnd: endLine,
            output: output,
          });
        }
      }
    } finally {
      // Clean up R objects
      shelter.purge();
    }

    return { results };
  } catch (error) {
    console.error('Error in executeScript:', error);
    throw error;
  }
}
