"""
Command-line interface for rdit.

Provides the `rdit` command to start the server and open the web interface.
"""

import contextlib
import sys
import time
import threading
import webbrowser
from pathlib import Path
import click
import uvicorn


class Server(uvicorn.Server):
    """Custom Server class that can run in a background thread."""

    def install_signal_handlers(self):
        """Disable signal handlers for threading compatibility."""
        pass

    @contextlib.contextmanager
    def run_in_thread(self):
        """Run server in background thread, wait for startup."""
        thread = threading.Thread(target=self.run)
        thread.start()
        try:
            # Wait for server to be ready
            while not self.started:
                time.sleep(1e-3)
            yield
        finally:
            # Clean shutdown
            self.should_exit = True
            thread.join()


@click.command()
@click.argument("script", required=False, type=click.Path(exists=True))
@click.option("--port", default=8888, help="Port to run server on")
@click.option("--host", default="127.0.0.1", help="Host to bind to")
@click.option("--no-browser", is_flag=True, help="Don't open browser automatically")
def main(script, port, host, no_browser):
    """rdit - Interactive Python notebook.

    Starts a local Python execution server and opens the web interface.

    SCRIPT: Optional Python script file to open
    """
    # Check if frontend is built
    static_dir = Path(__file__).parent.parent / "web" / "dist"
    if not static_dir.exists() or not (static_dir / "index.html").exists():
        click.echo("Warning: Frontend build not found at web/dist/", err=True)
        click.echo("The server will start but the web interface won't be available.", err=True)
        click.echo("Run 'npm run build' in the web/ directory to build the frontend.", err=True)
        click.echo()

    # Convert script to absolute path if provided
    script_path = None
    if script:
        script_path = Path(script).resolve()

    # Build URL
    url = f"http://{host}:{port}"
    if script_path:
        url += f"?script={script_path}"

    click.echo(f"Starting rdit server on {host}:{port}")

    # Configure and create server
    config = uvicorn.Config(
        "rdit.server:app",
        host=host,
        port=port,
        log_level="info"
    )
    server = Server(config=config)

    # Run server in thread, open browser when ready
    with server.run_in_thread():
        # Server is guaranteed to be ready here
        if not no_browser:
            webbrowser.open(url)
            click.echo(f"Opening browser to {url}")

        # Keep server running
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            click.echo("\nShutting down...")


if __name__ == "__main__":
    main()
