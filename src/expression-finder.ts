import { getWebR } from './webr-instance';

export interface ExpressionInfo {
  index: number;      // 1-based index for R
  lineStart: number;
  lineEnd: number;
}

/**
 * Find which R expression contains the given cursor line.
 * Returns the expression index (1-based) and its line range.
 */
export async function findExpressionAtLine(
  script: string,
  cursorLine: number
): Promise<ExpressionInfo | null> {
  const webR = getWebR();

  try {
    // Parse the code and get expression boundaries
    await webR.evalRVoid(`
      .rdit_code <- ${JSON.stringify(script)}
      .rdit_parsed <- parse(text = .rdit_code, keep.source = TRUE)
      .rdit_parse_data <- getParseData(.rdit_parsed)
    `);

    const numExpressions = await webR.evalRNumber('length(.rdit_parsed)');

    // Find the expression that contains the cursor line
    for (let i = 1; i <= numExpressions; i++) {
      const startLine = await webR.evalRNumber(`
        {
          top_level_exprs <- .rdit_parse_data[.rdit_parse_data$parent == 0 & .rdit_parse_data$token == "expr", ]
          if (nrow(top_level_exprs) >= ${i}) {
            top_level_exprs$line1[${i}]
          } else {
            NA
          }
        }
      `);

      const endLine = await webR.evalRNumber(`
        {
          top_level_exprs <- .rdit_parse_data[.rdit_parse_data$parent == 0 & .rdit_parse_data$token == "expr", ]
          if (nrow(top_level_exprs) >= ${i}) {
            top_level_exprs$line2[${i}]
          } else {
            NA
          }
        }
      `);

      // Check if cursor is within this expression's range
      if (cursorLine >= startLine && cursorLine <= endLine) {
        return {
          index: i,
          lineStart: startLine,
          lineEnd: endLine,
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding expression at line:', error);
    return null;
  }
}
