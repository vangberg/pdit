import { getPyodide } from './pyodide-instance';

export interface ParsedStatement {
  nodeIndex: number;
  lineStart: number;
  lineEnd: number;
}

/**
 * Parse Python code into logical statements with line numbers.
 * Uses Python's AST to get accurate statement boundaries.
 * Stores compiled AST nodes in Python for efficient execution.
 */
export async function parseStatements(script: string): Promise<ParsedStatement[]> {
  const pyodide = getPyodide();

  try {
    // Clear any previous compiled nodes first
    await pyodide.runPythonAsync(`
global _rdit_compiled_nodes
_rdit_compiled_nodes = []
`);

    // Use Python's AST to parse and compile statement nodes
    const result = await pyodide.runPythonAsync(`
import ast
import json

script = ${JSON.stringify(script)}

def parse_statements():
    try:
        tree = ast.parse(script)
        statements = []

        # Store compiled nodes globally for later execution
        global _rdit_compiled_nodes
        _rdit_compiled_nodes = []

        for i, node in enumerate(tree.body):
            # Get the line range for this statement
            line_start = node.lineno
            line_end = node.end_lineno if hasattr(node, 'end_lineno') and node.end_lineno else node.lineno

            # Compile the AST node directly
            # Check if it's an expression that can be eval'd
            is_expr = isinstance(node, ast.Expr)
            if is_expr:
                # For expression statements, compile as eval
                compiled = compile(ast.Expression(body=node.value), '<string>', 'eval')
            else:
                # For other statements, compile as exec
                # Wrap single node in Module for compilation
                compiled = compile(ast.Module(body=[node], type_ignores=[]), '<string>', 'exec')

            _rdit_compiled_nodes.append({
                'compiled': compiled,
                'is_expr': is_expr
            })

            statements.append({
                'nodeIndex': i,
                'lineStart': line_start,
                'lineEnd': line_end
            })

        return json.dumps(statements)
    except SyntaxError as e:
        # If there's a syntax error, don't store any compiled nodes
        # Execution will handle the error
        return json.dumps([{
            'nodeIndex': 0,
            'lineStart': 1,
            'lineEnd': len(script.split('\\n'))
        }])

parse_statements()
`);

    return JSON.parse(result as string);
  } catch (error) {
    // Fallback: return single statement metadata
    // The actual compilation/execution error will be caught during execution
    const lines = script.split('\n');
    return [{
      nodeIndex: 0,
      lineStart: 1,
      lineEnd: lines.length,
    }];
  }
}
