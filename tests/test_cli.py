"""Tests for CLI-only behavior."""

from typer.testing import CliRunner

from pdit.cli import app, get_agent_guide_text


runner = CliRunner()


def test_get_agent_guide_text_loads_bundled_guide():
    """Bundled guide should be readable via package resources."""
    guide_text = get_agent_guide_text()
    assert guide_text.startswith("# pdit Agent Guide")
    assert "This guide helps coding agents" in guide_text


def test_agent_guide_option_prints_guide_and_exits():
    """--agent-guide prints the bundled guide without starting the server."""
    result = runner.invoke(app, ["--agent-guide"])
    assert result.exit_code == 0
    assert result.stdout == f"{get_agent_guide_text()}\n"


def test_agent_guide_option_rejects_script_argument():
    """--agent-guide cannot be combined with a script argument."""
    result = runner.invoke(app, ["script.py", "--agent-guide"])
    assert result.exit_code == 1
    assert "--agent-guide cannot be combined with a script argument" in result.output
