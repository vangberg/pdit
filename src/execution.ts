import { getWebR, startImageCollection, stopImageCollection } from './webr-instance';

export interface OutputItem {
  type: 'stdout' | 'stderr' | 'error' | 'warning' | 'message';
  text: string;
}

export interface Expression {
  id: number;
  lineStart: number;
  lineEnd: number;
  result?: ExpressionResult;
}

export interface ExpressionResult {
  output: OutputItem[];
  images?: ImageBitmap[];
  isInvisible?: boolean;
}

let globalIdCounter = 1;

/**
 * Execute R code using webR.
 * Parses the code into expressions and executes them one at a time,
 * capturing output and line numbers for each expression.
 * Yields each result as it completes for streaming execution.
 *
 * @param script - The R code to execute
 * @param options.lineRange - Optional line range to filter which expressions to execute (1-based, inclusive)
 */
export async function* executeScript(
  script: string,
  options?: {
    lineRange?: { from: number; to: number };
  }
): AsyncGenerator<Expression, void, unknown> {
  const webR = getWebR();

  try {
    // Store the code in R and parse with source information
    await webR.evalRVoid(`
      .rdit_code <- ${JSON.stringify(script)}
      .rdit_parsed <- parse(text = .rdit_code, keep.source = TRUE)
      .rdit_parse_data <- getParseData(.rdit_parsed)
    `);

    // Get the number of expressions
    const numExpressions = await webR.evalRNumber('length(.rdit_parsed)');

    // Execute each expression
    const shelter = await new webR.Shelter();
    try {
      for (let i = 1; i <= numExpressions; i++) {
        // Get line numbers from parse data
        // Filter for top-level expression tokens only (excluding semicolons, etc.)
        const startLine = await webR.evalRNumber(`
          {
            # Get top-level expressions (parent == 0) that are actual expressions (token == "expr")
            top_level_exprs <- .rdit_parse_data[.rdit_parse_data$parent == 0 & .rdit_parse_data$token == "expr", ]
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
            top_level_exprs <- .rdit_parse_data[.rdit_parse_data$parent == 0 & .rdit_parse_data$token == "expr", ]
            # Get the i-th expression's line
            if (nrow(top_level_exprs) >= ${i}) {
              top_level_exprs$line2[${i}]
            } else {
              1
            }
          }
        `);

        // Filter expressions by line range if specified
        if (options?.lineRange) {
          const { from, to } = options.lineRange;
          // Skip expressions that don't overlap with the requested range
          // An expression overlaps if: endLine >= from AND startLine <= to
          if (endLine < from || startLine > to) {
            continue;
          }
        }

        // Start collecting canvas images
        startImageCollection();

        // Execute this expression and capture output (no captureGraphics - using persistent device)
        const result = await shelter.captureR(`
          {
            .tmp <- withVisible(eval(.rdit_parsed[[${i}]]))
            # Ensure plot is flushed if there's an active device
            if (length(dev.list()) > 0) {
              dev.flush()
            }
            # Preserve invisibility flag
            if (.tmp$visible) .tmp$value else invisible(.tmp$value)
          }
        `, {
          withAutoprint: true,
          captureStreams: true,
          captureConditions: false,
          captureGraphics: false,
        });

        // Flush all pending messages from the output queue
        await webR.flush();

        // Stop collecting and get images
        const images = stopImageCollection();

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

        // Always create result, mark as invisible if no output or images
        const hasVisibleOutput = output.length > 0 || images.length > 0;
        yield {
          id: globalIdCounter++,
          lineStart: startLine,
          lineEnd: endLine,
          result: {
            output: output,
            images: images.length > 0 ? images : undefined,
            isInvisible: !hasVisibleOutput,
          },
        };
      }
    } finally {
      // Clean up R objects
      shelter.purge();
    }
  } catch (error) {
    console.error('Error in executeScript:', error);
    throw error;
  }
}
