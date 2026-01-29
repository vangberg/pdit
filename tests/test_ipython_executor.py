"""Tests for IPythonExecutor."""

import pytest
from pdit.ipython_executor import IPythonExecutor


async def collect_results(async_gen):
    """Helper to collect all results from an async generator."""
    results = []
    async for item in async_gen:
        results.append(item)
    return results


# Module-scoped executor - starts kernel once for all tests in this file
@pytest.fixture(scope="module")
def executor():
    """Create executor instance shared across all tests in module."""
    exec_instance = IPythonExecutor()
    yield exec_instance
    # Note: shutdown is async but we can't await in sync fixture teardown
    # The kernel will be cleaned up when the process exits


# Fixture that resets kernel before test (for tests needing clean state)
@pytest.fixture
async def clean_executor(executor):
    """Reset executor before test for clean state."""
    await executor.reset()
    return executor


class TestStatementParsing:
    """Tests for script parsing into statements."""

    def test_parse_simple_expression(self, executor):
        """Test parsing a simple expression."""
        script = "2 + 2"
        statements = executor._parse_script(script)

        assert len(statements) == 1
        assert statements[0]["lineStart"] == 1
        assert statements[0]["lineEnd"] == 1
        assert statements[0]["source"] == "2 + 2"

    def test_parse_assignment(self, executor):
        """Test parsing an assignment statement."""
        script = "x = 10"
        statements = executor._parse_script(script)

        assert len(statements) == 1
        assert statements[0]["source"] == "x = 10"

    def test_parse_multiple_statements(self, executor):
        """Test parsing multiple statements."""
        script = "x = 1\ny = 2\nx + y"
        statements = executor._parse_script(script)

        assert len(statements) == 3
        assert statements[0]["lineStart"] == 1
        assert statements[1]["lineStart"] == 2
        assert statements[2]["lineStart"] == 3

    def test_parse_multiline_function(self, executor):
        """Test parsing a multi-line function definition."""
        script = """def greet(name):
    return f"Hello, {name}!"

greet("World")"""
        statements = executor._parse_script(script)

        assert len(statements) == 2
        assert statements[0]["lineStart"] == 1
        assert statements[0]["lineEnd"] == 2
        assert statements[1]["lineStart"] == 4
        assert statements[1]["lineEnd"] == 4

    def test_parse_class_definition(self, executor):
        """Test parsing a class definition."""
        script = """class Counter:
    def __init__(self):
        self.count = 0

    def increment(self):
        self.count += 1

c = Counter()
c.increment()
c.count"""
        statements = executor._parse_script(script)

        assert len(statements) == 4
        # Class definition spans multiple lines
        assert statements[0]["lineStart"] == 1
        assert statements[0]["lineEnd"] == 6

    def test_parse_markdown_cell(self, executor):
        """Test parsing markdown string literals."""
        script = '"# This is markdown"'
        statements = executor._parse_script(script)

        assert len(statements) == 1
        assert statements[0]["isMarkdownCell"] is True

    def test_parse_triple_quoted_string(self, executor):
        """Test parsing triple-quoted strings as markdown."""
        script = '"""This is a markdown cell"""'
        statements = executor._parse_script(script)

        assert len(statements) == 1
        assert statements[0]["isMarkdownCell"] is True


class TestCodeExecution:
    """Tests for code execution."""

    async def test_execute_simple_expression(self, executor):
        """Test executing a simple expression."""
        script = "2 + 2"
        results = await collect_results(executor.execute_script(script))

        # First result is expressions event
        assert len(results) == 2
        expressions_event = results[0]
        assert expressions_event["type"] == "expressions"
        assert len(expressions_event["expressions"]) == 1

        # Second result is execution result
        result = results[1]
        assert result["lineStart"] == 1
        assert result["lineEnd"] == 1
        assert result["isInvisible"] is False
        assert len(result["output"]) == 1
        # IPython returns results as text/plain
        assert result["output"][0]["type"] == "text/plain"
        assert "4" in result["output"][0]["content"]

    async def test_execute_assignment(self, executor):
        """Test executing an assignment with no output."""
        script = "x = 42"
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        assert result["isInvisible"] is True
        assert len(result["output"]) == 0

    async def test_execute_print(self, executor):
        """Test capturing print output."""
        script = 'print("Hello, World!")'
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        # Should have exactly one stdout output (merged)
        assert len(result["output"]) == 1
        assert result["output"][0]["type"] == "stdout"
        assert "Hello, World!" in result["output"][0]["content"]

    async def test_stdout_merging(self, executor):
        """Test that consecutive stdout outputs are merged."""
        script = """for i in range(3):
    print(i)"""
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        # Should have exactly one stdout output containing all prints
        stdout_outputs = [o for o in result["output"] if o["type"] == "stdout"]
        assert len(stdout_outputs) == 1
        content = stdout_outputs[0]["content"]
        assert "0" in content
        assert "1" in content
        assert "2" in content

    async def test_execute_multiple_statements(self, executor):
        """Test executing multiple statements in sequence."""
        script = "a = 5\nb = 10\na + b"
        results = await collect_results(executor.execute_script(script))

        # First result is expressions event (3 expressions)
        expressions_event = results[0]
        assert len(expressions_event["expressions"]) == 3

        # Next 3 results are execution results
        assert len(results) == 4
        assert results[1]["isInvisible"] is True  # a = 5
        assert results[2]["isInvisible"] is True  # b = 10
        assert results[3]["isInvisible"] is False  # a + b
        assert "15" in results[3]["output"][0]["content"]

    async def test_state_persistence(self, clean_executor):
        """Test that state persists across executions."""
        # First execution
        script1 = "x = 100"
        await collect_results(clean_executor.execute_script(script1))

        # Second execution using variable from first
        script2 = "x * 2"
        results = await collect_results(clean_executor.execute_script(script2))

        result = results[1]
        assert "200" in result["output"][0]["content"]

    async def test_execute_import(self, executor):
        """Test importing modules."""
        script = "import math\nmath.pi"
        results = await collect_results(executor.execute_script(script))

        assert len(results) == 3
        assert results[1]["isInvisible"] is True  # import
        assert "3.14" in results[2]["output"][0]["content"]  # math.pi


class TestErrorHandling:
    """Tests for error handling."""

    async def test_runtime_error(self, executor):
        """Test capturing runtime errors."""
        script = "1 / 0"
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        assert len(result["output"]) == 1
        assert result["output"][0]["type"] == "error"
        assert "ZeroDivisionError" in result["output"][0]["content"]

    async def test_name_error(self, executor):
        """Test capturing name errors."""
        script = "undefined_variable"
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        assert result["output"][0]["type"] == "error"
        assert "NameError" in result["output"][0]["content"]

    async def test_syntax_error(self, executor):
        """Test handling syntax errors."""
        script = "if True\n  print('missing colon')"
        results = await collect_results(executor.execute_script(script))

        # Syntax errors return expressions event + error result
        assert len(results) == 2
        result = results[1]
        assert result["lineStart"] == 1
        assert len(result["output"]) == 1
        assert result["output"][0]["type"] == "error"
        assert "SyntaxError" in result["output"][0]["content"]

    async def test_type_error(self, executor):
        """Test capturing type errors."""
        script = "'string' + 42"
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        assert result["output"][0]["type"] == "error"
        assert "TypeError" in result["output"][0]["content"]

    async def test_execution_stops_after_error(self, executor):
        """Test that execution stops after an error."""
        script = "x = 5\ny = 1 / 0\nz = 10"
        results = await collect_results(executor.execute_script(script))

        # Should have 3 results: expressions event + 2 statements
        assert len(results) == 3
        assert results[1]["isInvisible"] is True  # x = 5 succeeds
        assert results[2]["output"][0]["type"] == "error"  # y = 1/0 errors


class TestLineRangeFiltering:
    """Tests for line range filtering."""

    async def test_filter_single_line(self, executor):
        """Test filtering to execute only a single line."""
        script = "a = 1\nb = 2\nc = 3"
        results = await collect_results(executor.execute_script(script, line_range=(2, 2)))

        # Should have expressions event + 1 result
        assert len(results) == 2
        expressions_event = results[0]
        assert len(expressions_event["expressions"]) == 1
        assert expressions_event["expressions"][0]["lineStart"] == 2

        result = results[1]
        assert result["lineStart"] == 2
        assert result["lineEnd"] == 2

    async def test_filter_range(self, executor):
        """Test filtering to execute a range of lines."""
        script = "a = 1\nb = 2\nc = 3\nd = 4"
        results = await collect_results(executor.execute_script(script, line_range=(2, 3)))

        expressions_event = results[0]
        assert len(expressions_event["expressions"]) == 2
        assert expressions_event["expressions"][0]["lineStart"] == 2
        assert expressions_event["expressions"][1]["lineStart"] == 3

    async def test_filter_excludes_before_and_after(self, clean_executor):
        """Test that lines outside the range are not executed."""
        script = "x = 1\ny = 2\nz = 3"

        # Execute only middle line
        results = await collect_results(clean_executor.execute_script(script, line_range=(2, 2)))

        # y should be defined, but x and z should not
        script2 = "y"
        results2 = await collect_results(clean_executor.execute_script(script2))
        result2 = results2[1]
        assert "2" in result2["output"][0]["content"]

        # x should not be defined
        script3 = "x"
        results3 = await collect_results(clean_executor.execute_script(script3))
        result3 = results3[1]
        assert result3["output"][0]["type"] == "error"
        assert "NameError" in result3["output"][0]["content"]


class TestMarkdownCells:
    """Tests for markdown cell handling."""

    async def test_markdown_string_literal(self, executor):
        """Test that string literals are treated as markdown."""
        script = '"# This is a heading"'
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        assert len(result["output"]) == 1
        assert result["output"][0]["type"] == "text/markdown"
        assert "# This is a heading" in result["output"][0]["content"]

    async def test_markdown_triple_quoted(self, executor):
        """Test triple-quoted markdown strings."""
        script = '"""This is **markdown**"""'
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        assert result["output"][0]["type"] == "text/markdown"
        assert "This is **markdown**" in result["output"][0]["content"]

    async def test_markdown_multiline(self, executor):
        """Test multi-line markdown strings."""
        script = '''"""
# Title

This is a paragraph.
"""'''
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        assert result["output"][0]["type"] == "text/markdown"
        assert "# Title" in result["output"][0]["content"]
        assert "This is a paragraph." in result["output"][0]["content"]

    async def test_markdown_fstring(self, executor):
        """Test that f-strings are treated as markdown."""
        script = 'name = "World"\nf"# Hello {name}"'
        results = await collect_results(executor.execute_script(script))

        result = results[-1]
        assert result["output"][0]["type"] == "text/markdown"
        assert "# Hello World" in result["output"][0]["content"]

    async def test_markdown_fstring_multiline(self, executor):
        """Test multi-line f-string markdown."""
        script = '''items = ["one", "two"]
f"""
## List

- {items[0]}
- {items[1]}
"""'''
        results = await collect_results(executor.execute_script(script))

        result = results[-1]
        assert result["output"][0]["type"] == "text/markdown"
        assert "## List" in result["output"][0]["content"]
        assert "- one" in result["output"][0]["content"]
        assert "- two" in result["output"][0]["content"]


class TestMimeTypeProcessing:
    """Tests for MIME type output processing."""

    async def test_text_plain_output(self, executor):
        """Test text/plain MIME type output."""
        script = "42"
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        assert result["output"][0]["type"] == "text/plain"

    async def test_ipython_display_markdown(self, executor):
        """Test IPython.display.Markdown renders as text/markdown."""
        script = 'from IPython.display import Markdown\nMarkdown("# Hej")'
        results = await collect_results(executor.execute_script(script))

        result = results[-1]
        assert result["output"][0]["type"] == "text/markdown"
        assert "# Hej" in result["output"][0]["content"]

    async def test_none_result(self, executor):
        """Test that None results produce no output."""
        script = "None"
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        assert result["isInvisible"] is True
        assert len(result["output"]) == 0

    async def test_list_output(self, executor):
        """Test list representation."""
        script = "[1, 2, 3, 4, 5]"
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        assert "[1, 2, 3, 4, 5]" in result["output"][0]["content"]

    async def test_dict_output(self, executor):
        """Test dictionary representation."""
        script = "{'a': 1, 'b': 2}"
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        content = result["output"][0]["content"]
        assert "'a'" in content or '"a"' in content
        assert "1" in content


class TestKernelReset:
    """Tests for kernel reset functionality."""

    async def test_reset_clears_namespace(self, clean_executor):
        """Test that reset clears the namespace."""
        # Set a variable
        script1 = "reset_var = 999"
        await collect_results(clean_executor.execute_script(script1))

        # Verify it exists
        script2 = "reset_var"
        results2 = await collect_results(clean_executor.execute_script(script2))
        assert "999" in results2[1]["output"][0]["content"]

        # Reset the kernel
        await clean_executor.reset()

        # Variable should no longer exist
        script3 = "reset_var"
        results3 = await collect_results(clean_executor.execute_script(script3))
        result3 = results3[1]
        assert result3["output"][0]["type"] == "error"
        assert "NameError" in result3["output"][0]["content"]

    async def test_reset_preserves_executor_functionality(self, clean_executor):
        """Test that executor works correctly after reset."""
        # Execute before reset
        script1 = "x = 5"
        await collect_results(clean_executor.execute_script(script1))

        # Reset
        await clean_executor.reset()

        # Execute after reset
        script2 = "y = 10\ny"
        results = await collect_results(clean_executor.execute_script(script2))

        assert len(results) == 3
        assert results[2]["output"][0]["content"].strip() == "10"


class TestComplexScenarios:
    """Tests for complex execution scenarios."""

    async def test_function_definition_and_call(self, executor):
        """Test defining and calling a function."""
        script = """def add(a, b):
    return a + b

result = add(3, 4)
result"""
        results = await collect_results(executor.execute_script(script))

        # Should have: expressions event, func def, assignment, result
        assert len(results) == 4
        assert results[1]["isInvisible"] is True  # function def
        assert results[2]["isInvisible"] is True  # assignment
        assert "7" in results[3]["output"][0]["content"]

    async def test_function_decorator_applied(self, executor):
        """Test that function decorators are applied."""
        script = """from functools import wraps

def add_one(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs) + 1
    return wrapper

@add_one
def add(a, b):
    return a + b

add(2, 3)"""
        results = await collect_results(executor.execute_script(script))

        final_result = results[-1]
        assert "6" in final_result["output"][0]["content"]

    async def test_list_comprehension(self, executor):
        """Test list comprehension execution."""
        script = "[x**2 for x in range(5)]"
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        assert "[0, 1, 4, 9, 16]" in result["output"][0]["content"]

    async def test_generator_expression(self, executor):
        """Test generator expression."""
        script = "list(x**2 for x in range(5))"
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        assert "[0, 1, 4, 9, 16]" in result["output"][0]["content"]

    async def test_with_statement(self, executor):
        """Test with statement execution."""
        script = """import io
s = io.StringIO("test")
with s:
    content = s.read()
content"""
        results = await collect_results(executor.execute_script(script))

        # Find the final result
        final_result = results[-1]
        assert "test" in final_result["output"][0]["content"]

    async def test_mixed_output_types(self, executor):
        """Test script with mixed stdout and expression results."""
        script = """print("Starting")
x = 5 + 3
print("Result:")
x"""
        results = await collect_results(executor.execute_script(script))

        # expressions event + 4 statements
        assert len(results) == 5
        assert "Starting" in results[1]["output"][0]["content"]
        assert results[2]["isInvisible"] is True
        assert "Result:" in results[3]["output"][0]["content"]
        assert "8" in results[4]["output"][0]["content"]

    async def test_exception_traceback(self, executor):
        """Test that exception tracebacks are captured."""
        script = """def failing_function():
    return 1 / 0

failing_function()"""
        results = await collect_results(executor.execute_script(script))

        # Last result should contain error with traceback
        error_result = results[-1]
        assert error_result["output"][0]["type"] == "error"
        error_content = error_result["output"][0]["content"]
        assert "ZeroDivisionError" in error_content
        assert "failing_function" in error_content

    async def test_closure(self, executor):
        """Test closures work correctly."""
        script = """def make_adder(n):
    def adder(x):
        return x + n
    return adder

add_five = make_adder(5)
add_five(10)"""
        results = await collect_results(executor.execute_script(script))

        # Find the final result expression
        final_result = results[-1]
        assert "15" in final_result["output"][0]["content"]

    async def test_lambda_expression(self, executor):
        """Test lambda expressions."""
        script = """add = lambda x, y: x + y
add(10, 20)"""
        results = await collect_results(executor.execute_script(script))

        assert "30" in results[-1]["output"][0]["content"]


class TestStripAnsi:
    """Tests for ANSI escape code stripping."""

    def test_strip_ansi_from_text(self, executor):
        """Test that ANSI codes are stripped from error messages."""
        # Create text with ANSI codes
        text_with_ansi = "\x1b[31mError\x1b[0m: something went wrong"
        stripped = executor._strip_ansi(text_with_ansi)

        assert "\x1b" not in stripped
        assert "Error: something went wrong" in stripped

    def test_strip_ansi_preserves_regular_text(self, executor):
        """Test that regular text is preserved."""
        regular_text = "This is normal text"
        stripped = executor._strip_ansi(regular_text)

        assert stripped == regular_text


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
