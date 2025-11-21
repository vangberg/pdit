/**
 * Parser for Python server backend.
 * Parses Python code into statements with their source code.
 */

export interface ParsedStatementWithCode {
  nodeIndex: number;
  lineStart: number;
  lineEnd: number;
  code: string;
  isExpr: boolean;
}

/**
 * Parse Python code into statements with source code.
 * This is a simple implementation that sends the code to be parsed server-side.
 * For now, we'll use a lightweight client-side approach.
 */
export function parseStatementsForServer(script: string): ParsedStatementWithCode[] {
  // Simple line-based parsing for now
  // In production, this should use a proper Python AST parser
  // or send to server for parsing

  const lines = script.split('\n');
  const statements: ParsedStatementWithCode[] = [];

  let currentStatement = '';
  let startLine = 1;
  let inBlock = false;
  let blockIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // Skip empty lines and comments at statement boundaries
    if (!inBlock && (trimmed === '' || trimmed.startsWith('#'))) {
      if (currentStatement) {
        // End previous statement
        statements.push({
          nodeIndex: statements.length,
          lineStart: startLine,
          lineEnd: i,
          code: currentStatement,
          isExpr: !isStatementKeyword(currentStatement),
        });
        currentStatement = '';
      }
      continue;
    }

    const indent = line.length - line.trimStart().length;

    if (!inBlock) {
      if (currentStatement === '') {
        startLine = lineNum;
        blockIndent = indent;
      }
      currentStatement += (currentStatement ? '\n' : '') + line;

      // Check if line starts a block
      if (trimmed.endsWith(':') && !trimmed.startsWith('#')) {
        inBlock = true;
      } else if (trimmed && !trimmed.startsWith('#')) {
        // Single line statement
        statements.push({
          nodeIndex: statements.length,
          lineStart: startLine,
          lineEnd: lineNum,
          code: currentStatement,
          isExpr: !isStatementKeyword(currentStatement),
        });
        currentStatement = '';
      }
    } else {
      currentStatement += '\n' + line;

      // Check if we're exiting the block
      if (trimmed && indent <= blockIndent) {
        // Previous statement is complete
        const lastNewline = currentStatement.lastIndexOf('\n');
        const prevStatement = currentStatement.substring(0, lastNewline);

        statements.push({
          nodeIndex: statements.length,
          lineStart: startLine,
          lineEnd: i,
          code: prevStatement,
          isExpr: false,
        });

        // Start new statement
        currentStatement = line;
        startLine = lineNum;
        inBlock = false;
        blockIndent = 0;
      }
    }
  }

  // Add final statement
  if (currentStatement.trim()) {
    statements.push({
      nodeIndex: statements.length,
      lineStart: startLine,
      lineEnd: lines.length,
      code: currentStatement,
      isExpr: !isStatementKeyword(currentStatement),
    });
  }

  return statements;
}

function isStatementKeyword(code: string): boolean {
  const trimmed = code.trim();
  const keywords = [
    'def ', 'class ', 'if ', 'for ', 'while ', 'try:', 'except', 'finally:',
    'with ', 'import ', 'from ', 'return', 'yield', 'raise', 'assert',
    'del ', 'pass', 'break', 'continue', 'global ', 'nonlocal ', 'lambda',
  ];

  // Check for assignments
  if (/^\w+\s*=/.test(trimmed)) {
    return true;
  }

  return keywords.some(kw => trimmed.startsWith(kw));
}
