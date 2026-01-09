"""Tests for MarkdownExecutor."""

import pytest
from pdit.markdown_executor import MarkdownExecutor


async def collect_results(async_gen):
    """Helper to collect all results from an async generator."""
    results = []
    async for item in async_gen:
        results.append(item)
    return results


@pytest.fixture
def executor():
    """Create a MarkdownExecutor instance."""
    return MarkdownExecutor()


class TestBasicRendering:
    """Tests for basic markdown rendering."""

    async def test_simple_markdown(self, executor):
        """Test rendering simple markdown."""
        script = "# Hello World"
        results = await collect_results(executor.execute_script(script))

        # First result is expressions event
        assert len(results) == 2
        expressions_event = results[0]
        assert expressions_event["type"] == "expressions"
        assert len(expressions_event["expressions"]) == 1
        assert expressions_event["expressions"][0]["lineStart"] == 1
        assert expressions_event["expressions"][0]["lineEnd"] == 1

        # Second result is the rendered HTML
        result = results[1]
        assert result["lineStart"] == 1
        assert result["lineEnd"] == 1
        assert result["isInvisible"] is False
        assert len(result["output"]) == 1
        assert result["output"][0]["type"] == "text/html"
        # Note: markdown library adds id attributes to headers
        assert "<h1" in result["output"][0]["content"]
        assert "Hello World" in result["output"][0]["content"]

    async def test_multiline_markdown(self, executor):
        """Test rendering multi-line markdown."""
        script = """# Title

This is a paragraph.

- Item 1
- Item 2
- Item 3"""
        results = await collect_results(executor.execute_script(script))

        expressions_event = results[0]
        assert expressions_event["expressions"][0]["lineStart"] == 1
        assert expressions_event["expressions"][0]["lineEnd"] == 7

        result = results[1]
        assert result["lineStart"] == 1
        assert result["lineEnd"] == 7
        html = result["output"][0]["content"]
        assert "<h1" in html
        assert "Title" in html
        assert "<p>" in html
        assert "This is a paragraph" in html
        assert "<li>" in html
        assert "Item 1" in html

    async def test_empty_markdown(self, executor):
        """Test rendering empty markdown."""
        script = ""
        results = await collect_results(executor.execute_script(script))

        assert len(results) == 2
        result = results[1]
        assert result["isInvisible"] is True
        assert len(result["output"]) == 0

    async def test_whitespace_only_markdown(self, executor):
        """Test rendering whitespace-only markdown."""
        script = "   \n\n   "
        results = await collect_results(executor.execute_script(script))

        assert len(results) == 2
        result = results[1]
        assert result["isInvisible"] is True


class TestMarkdownFeatures:
    """Tests for specific markdown features."""

    async def test_fenced_code_blocks(self, executor):
        """Test fenced code blocks are rendered."""
        script = """```python
def hello():
    print("Hello")
```"""
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        html = result["output"][0]["content"]
        # Note: fenced_code extension adds language class
        assert "<code" in html
        assert "def hello" in html

    async def test_tables(self, executor):
        """Test markdown tables are rendered."""
        script = """| Name | Age |
|------|-----|
| Alice | 30 |
| Bob | 25 |"""
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        html = result["output"][0]["content"]
        assert "<table>" in html
        assert "Alice" in html
        assert "Bob" in html

    async def test_inline_formatting(self, executor):
        """Test inline formatting (bold, italic, etc)."""
        script = "This is **bold** and *italic* and `code`."
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        html = result["output"][0]["content"]
        assert "<strong>" in html
        assert "bold" in html
        assert "<em>" in html
        assert "italic" in html
        assert "<code>" in html
        assert "code" in html

    async def test_links(self, executor):
        """Test links are rendered."""
        script = "[Click here](https://example.com)"
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        html = result["output"][0]["content"]
        assert '<a href="https://example.com">' in html
        assert "Click here" in html


class TestExecutorInterface:
    """Tests for the executor interface methods."""

    async def test_start_is_noop(self, executor):
        """Test that start() is a no-op."""
        executor.start()  # Should not raise

    async def test_wait_ready_is_noop(self, executor):
        """Test that wait_ready() is a no-op."""
        await executor.wait_ready()  # Should not raise

    async def test_reset_is_noop(self, executor):
        """Test that reset() is a no-op."""
        await executor.reset()  # Should not raise

    async def test_interrupt_is_noop(self, executor):
        """Test that interrupt() is a no-op."""
        await executor.interrupt()  # Should not raise

    async def test_shutdown_is_noop(self, executor):
        """Test that shutdown() is a no-op."""
        await executor.shutdown()  # Should not raise


class TestLineRangeIgnored:
    """Tests that line_range parameter is ignored (whole file always rendered)."""

    async def test_line_range_ignored(self, executor):
        """Test that line_range parameter is ignored."""
        script = """# Line 1
# Line 2
# Line 3"""
        # Even with line_range, the whole file should be rendered
        results = await collect_results(executor.execute_script(script, line_range=(2, 2)))

        # The expression should still cover all lines
        expressions_event = results[0]
        assert expressions_event["expressions"][0]["lineStart"] == 1
        assert expressions_event["expressions"][0]["lineEnd"] == 3


class TestHtmlWrapper:
    """Tests for HTML wrapper div."""

    async def test_output_wrapped_in_div(self, executor):
        """Test that output is wrapped in a div with markdown-body class."""
        script = "# Test"
        results = await collect_results(executor.execute_script(script))

        result = results[1]
        html = result["output"][0]["content"]
        assert html.startswith('<div class="markdown-body">')
        assert html.endswith('</div>')


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
