"""Tests for the executor module."""

try:
    import pytest
except ImportError:
    pytest = None

from rdit.executor import (
    ExecutionResult,
    OutputItem,
    PythonExecutor,
    get_executor,
    reset_executor,
)


class TestPythonExecutor:
    """Tests for PythonExecutor class."""

    def setup_method(self):
        """Create a fresh executor for each test."""
        self.executor = PythonExecutor()

    def test_basic_expression(self):
        """Test executing a simple expression."""
        results = list(self.executor.execute_script("2 + 2"))

        assert len(results) == 1
        assert results[0].line_start == 1
        assert results[0].line_end == 1
        assert len(results[0].output) == 1
        assert results[0].output[0].type == "stdout"
        assert results[0].output[0].text.strip() == "4"
        assert results[0].is_invisible is False

    def test_basic_statement(self):
        """Test executing a simple statement."""
        results = list(self.executor.execute_script("x = 10"))

        assert len(results) == 1
        assert results[0].is_invisible is True
        assert len(results[0].output) == 0

    def test_namespace_persistence(self):
        """Test that variables persist across executions."""
        # Set a variable
        list(self.executor.execute_script("x = 10"))

        # Use it in next execution
        results = list(self.executor.execute_script("x + 5"))

        assert results[0].output[0].text.strip() == "15"

    def test_multiple_statements(self):
        """Test executing multiple statements."""
        script = """
x = 10
y = 20
x + y
"""
        results = list(self.executor.execute_script(script))

        assert len(results) == 3
        assert results[0].is_invisible is True  # x = 10
        assert results[1].is_invisible is True  # y = 20
        assert results[2].is_invisible is False  # x + y
        assert results[2].output[0].text.strip() == "30"

    def test_print_statement(self):
        """Test that print() output is captured."""
        results = list(self.executor.execute_script('print("Hello, World!")'))

        assert len(results[0].output) == 1
        assert results[0].output[0].type == "stdout"
        assert results[0].output[0].text.strip() == "Hello, World!"

    def test_error_handling(self):
        """Test that errors are captured properly."""
        results = list(self.executor.execute_script("1 / 0"))

        assert len(results[0].output) == 1
        assert results[0].output[0].type == "error"
        assert "ZeroDivisionError" in results[0].output[0].text

    def test_undefined_variable_error(self):
        """Test error when using undefined variable."""
        results = list(self.executor.execute_script("undefined_var"))

        assert results[0].output[0].type == "error"
        assert "NameError" in results[0].output[0].text

    def test_syntax_error(self):
        """Test that syntax errors are captured in results."""
        results = list(self.executor.execute_script("def invalid syntax"))

        # Should return one result with error
        assert len(results) == 1
        assert results[0].output[0].type == "error"
        assert "SyntaxError" in results[0].output[0].text
        assert results[0].is_invisible is False

    def test_reset_clears_namespace(self):
        """Test that reset() clears all variables."""
        # Set a variable
        list(self.executor.execute_script("x = 42"))

        # Reset
        self.executor.reset()

        # Try to use the variable
        results = list(self.executor.execute_script("try:\n    x\nexcept NameError:\n    print('cleared')"))

        assert "cleared" in results[0].output[0].text

    def test_line_range_single_line(self):
        """Test filtering by line range - single line."""
        script = "a = 1\nb = 2\nc = 3"
        results = list(self.executor.execute_script(script, line_range=(2, 2)))

        assert len(results) == 1
        assert results[0].line_start == 2
        assert results[0].line_end == 2

    def test_line_range_multiple_lines(self):
        """Test filtering by line range - multiple lines."""
        script = "a = 1\nb = 2\nc = 3\nd = 4"
        results = list(self.executor.execute_script(script, line_range=(2, 3)))

        assert len(results) == 2
        assert results[0].line_start == 2
        assert results[1].line_start == 3

    def test_line_range_outside_script(self):
        """Test line range that doesn't match any statements."""
        script = "a = 1\nb = 2"
        results = list(self.executor.execute_script(script, line_range=(10, 20)))

        assert len(results) == 0

    def test_expression_returns_none(self):
        """Test that expressions returning None don't produce output."""
        results = list(self.executor.execute_script("None"))

        assert results[0].is_invisible is True

    def test_multiline_statement(self):
        """Test executing multiline statements."""
        script = """
def add(a, b):
    return a + b

add(5, 3)
"""
        results = list(self.executor.execute_script(script))

        assert len(results) == 2
        assert results[0].line_start == 2
        assert results[0].line_end == 3
        assert results[1].output[0].text.strip() == "8"

    def test_import_statement(self):
        """Test importing standard library modules."""
        results = list(self.executor.execute_script("import math\nmath.pi"))

        assert len(results) == 2
        assert "3.14" in results[1].output[0].text

    def test_list_comprehension(self):
        """Test list comprehension execution."""
        results = list(self.executor.execute_script("[x * 2 for x in range(5)]"))

        assert results[0].output[0].text.strip() == "[0, 2, 4, 6, 8]"

    def test_stderr_capture(self):
        """Test that stderr output is captured."""
        script = """
import sys
print("error", file=sys.stderr)
"""
        results = list(self.executor.execute_script(script))

        # Find stderr output
        stderr_outputs = [o for o in results[-1].output if o.type == "stderr"]
        assert len(stderr_outputs) == 1
        assert "error" in stderr_outputs[0].text

    def test_both_stdout_and_stderr(self):
        """Test capturing both stdout and stderr in same statement."""
        script = """
import sys
sys.stdout.write("out\\n"); sys.stderr.write("err\\n")
"""
        results = list(self.executor.execute_script(script))

        # Last statement should have both stdout and stderr
        assert len(results[-1].output) == 2
        types = {o.type for o in results[-1].output}
        assert "stdout" in types
        assert "stderr" in types


class TestSingletonFunctions:
    """Tests for get_executor and reset_executor functions."""

    def test_get_executor_returns_same_instance(self):
        """Test that get_executor returns the same instance."""
        executor1 = get_executor()
        executor2 = get_executor()

        assert executor1 is executor2

    def test_reset_executor_clears_state(self):
        """Test that reset_executor clears the global executor state."""
        executor = get_executor()
        list(executor.execute_script("global_var = 100"))

        reset_executor()

        results = list(executor.execute_script("try:\n    global_var\nexcept NameError:\n    print('cleared')"))
        assert "cleared" in results[0].output[0].text

    def test_namespace_persists_across_calls(self):
        """Test that namespace persists when using singleton."""
        executor1 = get_executor()
        list(executor1.execute_script("persistent = 42"))

        executor2 = get_executor()
        results = list(executor2.execute_script("persistent"))

        assert results[0].output[0].text.strip() == "42"


class TestDataClasses:
    """Tests for data classes."""

    def test_output_item_creation(self):
        """Test OutputItem dataclass."""
        item = OutputItem(type="stdout", text="hello")

        assert item.type == "stdout"
        assert item.text == "hello"

    def test_execution_result_creation(self):
        """Test ExecutionResult dataclass."""
        result = ExecutionResult(
            node_index=0,
            line_start=1,
            line_end=1,
            output=[OutputItem(type="stdout", text="test")],
            is_invisible=False
        )

        assert result.node_index == 0
        assert result.line_start == 1
        assert len(result.output) == 1
        assert result.is_invisible is False


class TestMarkdownCells:
    """Tests for Jupytext-style markdown cell support."""

    def setup_method(self):
        """Create a fresh executor for each test."""
        self.executor = PythonExecutor()

    def test_basic_markdown_cell(self):
        """Test executing a basic markdown cell."""
        script = '''# %% [markdown]
"""
# Hello World

This is a markdown cell.
"""'''
        results = list(self.executor.execute_script(script))

        assert len(results) == 1
        assert len(results[0].output) == 1
        assert results[0].output[0].type == "markdown"
        assert "# Hello World" in results[0].output[0].text
        assert "This is a markdown cell." in results[0].output[0].text
        assert results[0].is_invisible is False

    def test_markdown_cell_one_line_before(self):
        """Test markdown marker exactly one line before the expression."""
        script = '''# %% [markdown]
"# Markdown content"'''
        results = list(self.executor.execute_script(script))

        assert len(results) == 1
        assert results[0].output[0].type == "markdown"
        assert results[0].output[0].text == "# Markdown content"

    def test_markdown_cell_two_lines_before(self):
        """Test markdown marker two lines before the expression."""
        script = '''# %% [markdown]

"# Markdown content"'''
        results = list(self.executor.execute_script(script))

        assert len(results) == 1
        assert results[0].output[0].type == "markdown"
        assert results[0].output[0].text == "# Markdown content"

    def test_markdown_cell_three_lines_before(self):
        """Test markdown marker three lines before the expression."""
        script = '''# %% [markdown]


"# Markdown content"'''
        results = list(self.executor.execute_script(script))

        assert len(results) == 1
        assert results[0].output[0].type == "markdown"
        assert results[0].output[0].text == "# Markdown content"

    def test_markdown_marker_too_far_before(self):
        """Test that marker more than 3 lines before is NOT detected."""
        script = '''# %% [markdown]




"# This should be regular code"'''
        results = list(self.executor.execute_script(script))

        # Should be treated as regular expression, not markdown
        assert len(results) == 1
        assert results[0].output[0].type == "stdout"
        # Regular expression should output repr() with quotes
        assert "'# This should be regular code'" in results[0].output[0].text

    def test_no_markdown_marker(self):
        """Test string expression without markdown marker."""
        script = '"Just a regular string"'
        results = list(self.executor.execute_script(script))

        assert len(results) == 1
        assert results[0].output[0].type == "stdout"
        # Should be repr() output with quotes
        assert "'Just a regular string'" in results[0].output[0].text

    def test_markdown_marker_case_insensitive(self):
        """Test that markdown marker is case-insensitive."""
        script = '''# %% [MARKDOWN]
"# Uppercase works too"'''
        results = list(self.executor.execute_script(script))

        assert len(results) == 1
        assert results[0].output[0].type == "markdown"
        assert results[0].output[0].text == "# Uppercase works too"

    def test_markdown_marker_with_extra_whitespace(self):
        """Test markdown marker with various whitespace."""
        script = '''#  %%  [markdown]
"# Extra spaces work"'''
        results = list(self.executor.execute_script(script))

        assert len(results) == 1
        assert results[0].output[0].type == "markdown"
        assert results[0].output[0].text == "# Extra spaces work"

    def test_markdown_cell_strips_whitespace(self):
        """Test that markdown output strips surrounding whitespace."""
        script = '''# %% [markdown]
"""

  # Title with spaces

"""'''
        results = list(self.executor.execute_script(script))

        assert len(results) == 1
        assert results[0].output[0].type == "markdown"
        # Should be stripped
        assert results[0].output[0].text == "# Title with spaces"

    def test_multiple_markdown_cells(self):
        """Test multiple markdown cells in one script."""
        script = '''# %% [markdown]
"# First markdown cell"

# %% [markdown]
"# Second markdown cell"

# %% [markdown]
"# Third markdown cell"'''
        results = list(self.executor.execute_script(script))

        assert len(results) == 3
        assert all(r.output[0].type == "markdown" for r in results)
        assert results[0].output[0].text == "# First markdown cell"
        assert results[1].output[0].text == "# Second markdown cell"
        assert results[2].output[0].text == "# Third markdown cell"

    def test_mixed_markdown_and_code_cells(self):
        """Test mixing markdown cells with regular code."""
        script = '''# %% [markdown]
"# Introduction"

x = 42

# %% [markdown]
"The answer is shown below:"

x'''
        results = list(self.executor.execute_script(script))

        assert len(results) == 4
        assert results[0].output[0].type == "markdown"
        assert results[0].output[0].text == "# Introduction"
        assert results[1].is_invisible is True  # x = 42
        assert results[2].output[0].type == "markdown"
        assert results[2].output[0].text == "The answer is shown below:"
        assert results[3].output[0].type == "stdout"
        assert "42" in results[3].output[0].text

    def test_markdown_cell_with_code_blocks(self):
        """Test markdown cell containing code blocks."""
        script = '''# %% [markdown]
"""
# Example

```python
x = 1 + 2
```
"""'''
        results = list(self.executor.execute_script(script))

        assert len(results) == 1
        assert results[0].output[0].type == "markdown"
        assert "```python" in results[0].output[0].text
        assert "x = 1 + 2" in results[0].output[0].text

    def test_markdown_cell_multiline_string(self):
        """Test markdown cell with triple-quoted string."""
        script = '''# %% [markdown]
"""
# This is a title

This is a paragraph with
multiple lines.

- Item 1
- Item 2
"""'''
        results = list(self.executor.execute_script(script))

        assert len(results) == 1
        assert results[0].output[0].type == "markdown"
        text = results[0].output[0].text
        assert "# This is a title" in text
        assert "This is a paragraph with" in text
        assert "multiple lines." in text
        assert "- Item 1" in text
        assert "- Item 2" in text

    def test_markdown_cell_empty_string(self):
        """Test markdown cell with empty string."""
        script = '''# %% [markdown]
""'''
        results = list(self.executor.execute_script(script))

        assert len(results) == 1
        assert results[0].output[0].type == "markdown"
        assert results[0].output[0].text == ""

    def test_markdown_cell_single_quoted_string(self):
        """Test markdown cell with single-quoted string."""
        script = """# %% [markdown]
'# Single quoted markdown'"""
        results = list(self.executor.execute_script(script))

        assert len(results) == 1
        assert results[0].output[0].type == "markdown"
        assert results[0].output[0].text == "# Single quoted markdown"

    def test_non_string_expression_not_markdown(self):
        """Test that non-string expressions after marker are not markdown."""
        script = '''# %% [markdown]
42'''
        results = list(self.executor.execute_script(script))

        # Should be regular expression output, not markdown
        assert len(results) == 1
        assert results[0].output[0].type == "stdout"
        assert "42" in results[0].output[0].text

    def test_markdown_cell_line_range(self):
        """Test markdown cell with line range filtering."""
        script = '''# %% [markdown]
"# First cell"

# %% [markdown]
"# Second cell"

# %% [markdown]
"# Third cell"'''
        results = list(self.executor.execute_script(script, line_range=(4, 5)))

        # Should only get the second markdown cell
        assert len(results) == 1
        assert results[0].output[0].type == "markdown"
        assert results[0].output[0].text == "# Second cell"

    def test_markdown_marker_with_comment_before(self):
        """Test markdown marker preceded by other comments."""
        script = '''# Regular comment
# Another comment
# %% [markdown]
"# This is markdown"'''
        results = list(self.executor.execute_script(script))

        assert len(results) == 1
        assert results[0].output[0].type == "markdown"
        assert results[0].output[0].text == "# This is markdown"

    def test_markdown_cell_with_f_string(self):
        """Test that f-strings are NOT detected as markdown (they're JoinedStr, not Constant)."""
        script = '''x = 42
# %% [markdown]
f"# The value is {x}"'''
        results = list(self.executor.execute_script(script))

        assert len(results) == 2
        # F-strings are ast.JoinedStr, not ast.Constant, so they're not detected as markdown
        assert results[1].output[0].type == "stdout"
        assert "'# The value is 42'" in results[1].output[0].text


class TestEdgeCases:
    """Tests for edge cases and corner scenarios."""

    def setup_method(self):
        """Create a fresh executor for each test."""
        self.executor = PythonExecutor()

    def test_empty_script(self):
        """Test executing an empty script."""
        results = list(self.executor.execute_script(""))

        assert len(results) == 0

    def test_whitespace_only_script(self):
        """Test executing script with only whitespace."""
        results = list(self.executor.execute_script("   \n\n   "))

        assert len(results) == 0

    def test_comment_only_script(self):
        """Test executing script with only comments."""
        results = list(self.executor.execute_script("# This is a comment"))

        assert len(results) == 0

    def test_long_output(self):
        """Test that long output is captured completely."""
        script = "print('x' * 10000)"
        results = list(self.executor.execute_script(script))

        assert len(results[0].output[0].text) > 10000

    def test_recursive_function(self):
        """Test executing recursive functions."""
        script = """
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

factorial(5)
"""
        results = list(self.executor.execute_script(script))

        assert results[-1].output[0].text.strip() == "120"

    def test_exception_in_middle(self):
        """Test that execution stops on exception."""
        script = """
a = 1
1 / 0
b = 2
"""
        results = list(self.executor.execute_script(script))

        # First statement succeeds
        assert results[0].is_invisible is True
        # Second statement fails
        assert results[1].output[0].type == "error"
        # Third statement still executes (error doesn't stop execution)
        assert len(results) == 3

    def test_builtin_functions_available(self):
        """Test that builtin functions are available."""
        results = list(self.executor.execute_script("len([1, 2, 3])"))

        assert results[0].output[0].text.strip() == "3"

    def test_lambda_expression(self):
        """Test lambda expressions."""
        results = list(self.executor.execute_script("(lambda x: x * 2)(5)"))

        assert results[0].output[0].text.strip() == "10"

    def test_multiple_print_statements(self):
        """Test multiple print statements in one line."""
        script = "print('a'); print('b'); print('c')"
        results = list(self.executor.execute_script(script))

        # Should be treated as multiple statements
        assert len(results) == 3


if __name__ == "__main__":
    """Run tests without pytest for development."""
    import sys

    if pytest is not None:
        # Use pytest if available
        sys.exit(pytest.main([__file__, "-v"]))
    else:
        # Simple manual test runner
        print("Running tests without pytest...\n")

        test_classes = [
            TestPythonExecutor,
            TestSingletonFunctions,
            TestDataClasses,
            TestMarkdownCells,
            TestEdgeCases,
        ]

        total = 0
        passed = 0
        failed = []

        for test_class in test_classes:
            print(f"\n{test_class.__name__}:")
            test_instance = test_class()

            # Get all test methods
            test_methods = [
                m for m in dir(test_instance)
                if m.startswith("test_") and callable(getattr(test_instance, m))
            ]

            for method_name in test_methods:
                total += 1
                try:
                    # Run setup if it exists
                    if hasattr(test_instance, "setup_method"):
                        test_instance.setup_method()

                    # Run test
                    method = getattr(test_instance, method_name)
                    method()

                    print(f"  ✅ {method_name}")
                    passed += 1
                except AssertionError as e:
                    print(f"  ❌ {method_name}: {e}")
                    failed.append(f"{test_class.__name__}.{method_name}")
                except Exception as e:
                    print(f"  ❌ {method_name}: {type(e).__name__}: {e}")
                    failed.append(f"{test_class.__name__}.{method_name}")

        print(f"\n{'=' * 60}")
        print(f"Results: {passed}/{total} tests passed")

        if failed:
            print(f"\nFailed tests:")
            for test in failed:
                print(f"  - {test}")
            sys.exit(1)
        else:
            print("\n✅ All tests passed!")
            sys.exit(0)
