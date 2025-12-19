"""
Command-line interface for pdit.

Provides the `pdit` command to start the server and open the web interface.
"""

import contextlib
import secrets
import signal
import socket
import sys
import time
import threading
import webbrowser
from pathlib import Path
from typing import Optional

import typer
from typing_extensions import Annotated
import uvicorn


# Flag for graceful shutdown on SIGTERM
_shutdown_requested = False

app = typer.Typer(add_completion=False)


def find_available_port(start_port=8888, max_tries=100):
    """Find an available port starting from start_port.

    Args:
        start_port: Port to start searching from
        max_tries: Maximum number of ports to try

    Returns:
        Available port number

    Raises:
        RuntimeError: If no available port found within max_tries
    """
    for port in range(start_port, start_port + max_tries):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                # Allow reuse of ports in TIME_WAIT state
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    raise RuntimeError(f"Could not find available port in range {start_port}-{start_port + max_tries}")


class Server(uvicorn.Server):
    """Custom Server class that can run in a background thread."""

    def install_signal_handlers(self):
        """Disable signal handlers for threading compatibility."""
        pass

    @contextlib.contextmanager
    def run_in_thread(self):
        """Run server in background thread, wait for startup."""
        thread = threading.Thread(target=self.run, daemon=True)
        thread.start()
        try:
            # Wait for server to be ready
            while not self.started:
                time.sleep(1e-3)
            yield
        finally:
            # Signal SSE connections to close before shutting down server
            from .server import signal_shutdown
            signal_shutdown()

            # Give SSE connections a moment to close
            time.sleep(0.2)

            # Clean shutdown
            self.should_exit = True
            thread.join(timeout=3.0)
            if thread.is_alive():
                # Force exit if shutdown takes too long
                import sys
                sys.exit(1)


def start(
    script: Optional[Path] = None,
    port: Optional[int] = None,
    host: str = "127.0.0.1",
    no_browser: bool = False,
):
    """Start the pdit server with optional script."""

    # Check if frontend is built
    static_dir = Path(__file__).parent / "_static"
    if not static_dir.exists() or not (static_dir / "index.html").exists():
        typer.echo("Warning: Frontend build not found at pdit/_static/", err=True)
        typer.echo("The server will start but the web interface won't be available.", err=True)
        typer.echo("Run './scripts/build-frontend.sh' to build and copy the frontend.", err=True)
        typer.echo()

    # Use script path as-is (relative to current directory)
    script_path = None
    if script:
        script_path = str(script)

    # Determine port to use
    if port is None:
        # No port specified: find available port starting from 8888
        actual_port = find_available_port(start_port=8888)
        if actual_port != 8888:
            typer.echo(f"Port 8888 is already in use, using port {actual_port} instead")
    else:
        # Port explicitly specified: use it or fail
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                # Allow reuse of ports in TIME_WAIT state
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind((host, port))
                actual_port = port
        except OSError:
            typer.echo(f"Error: Port {port} is already in use", err=True)
            sys.exit(1)

    # Generate secure token for this server instance
    auth_token = secrets.token_urlsafe(32)

    # Build URL with token
    url = f"http://{host}:{actual_port}?token={auth_token}"
    if script_path:
        url += f"&script={script_path}"

    typer.echo(f"Starting pdit server on {host}:{actual_port}")
    typer.echo(f"Access URL: {url}")

    # Pass port and token to server via environment variables
    import os
    os.environ["PDIT_PORT"] = str(actual_port)
    os.environ["PDIT_AUTH_TOKEN"] = auth_token

    # Configure and create server
    config = uvicorn.Config(
        "pdit.server:app",
        host=host,
        port=actual_port,
        log_level="info"
    )
    server = Server(config=config)

    # Run server in thread, open browser when ready
    with server.run_in_thread():
        # Server is guaranteed to be ready here
        if not no_browser:
            webbrowser.open(url)
            typer.echo(f"Opening browser to {url}")

        # Set up SIGTERM handler for graceful shutdown
        def handle_sigterm(signum, frame):
            global _shutdown_requested
            _shutdown_requested = True

        signal.signal(signal.SIGTERM, handle_sigterm)

        # Keep server running
        try:
            while not _shutdown_requested:
                time.sleep(0.1)  # Check more frequently for shutdown
            typer.echo("\nShutting down...")
        except KeyboardInterrupt:
            typer.echo("\nShutting down...")


@app.command()
def main_command(
    script: Annotated[
        Optional[Path],
        typer.Argument(help="Python script file to open", exists=True, dir_okay=False)
    ] = None,
    export: Annotated[
        bool,
        typer.Option("--export", "-e", help="Export script to self-contained HTML file")
    ] = False,
    output: Annotated[
        Optional[Path],
        typer.Option("-o", "--output", help="Output file for export (default: script.html)")
    ] = None,
    stdout: Annotated[
        bool,
        typer.Option("--stdout", help="Write export to stdout instead of file")
    ] = False,
    port: Annotated[
        Optional[int],
        typer.Option(help="Port to run server on (default: 8888, or next available)")
    ] = None,
    host: Annotated[
        str,
        typer.Option(help="Host to bind to")
    ] = "127.0.0.1",
    no_browser: Annotated[
        bool,
        typer.Option("--no-browser", help="Don't open browser automatically")
    ] = False,
):
    """Start the pdit server, or export a script to HTML with --export."""
    if export:
        if not script:
            typer.echo("Error: script is required for --export", err=True)
            raise typer.Exit(1)

        from .exporter import export_script

        try:
            html_output = export_script(script)
        except FileNotFoundError as e:
            typer.echo(f"Error: {e}", err=True)
            raise typer.Exit(1)

        if stdout:
            typer.echo(html_output)
        else:
            output_path = output if output else script.with_suffix('.html')
            output_path.write_text(html_output)
            typer.echo(f"Exported to {output_path}")
    else:
        start(script, port, host, no_browser)


def main():
    """Entry point for the CLI."""
    app()


if __name__ == "__main__":
    app()
