"""CLI entry point for rdit."""

import argparse
import os
import sys
import webbrowser
from pathlib import Path
import uvicorn
from threading import Timer


def open_browser(url: str, delay: float = 1.5):
    """Open browser after a delay to ensure server is ready."""
    def _open():
        print(f"Opening {url} in browser...")
        webbrowser.open(url)
    Timer(delay, _open).start()


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="rdit - A modern, reactive notebook for Python"
    )
    parser.add_argument(
        "script",
        nargs="?",
        help="Python script to open in rdit",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8888,
        help="Port to run the server on (default: 8888)",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host to bind the server to (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Don't open browser automatically",
    )

    args = parser.parse_args()

    # Validate script path if provided
    script_path = None
    if args.script:
        script_path = Path(args.script).resolve()
        if not script_path.exists():
            print(f"Error: Script '{args.script}' not found", file=sys.stderr)
            sys.exit(1)

    # Prepare the URL
    url = f"http://{args.host}:{args.port}"
    if script_path:
        # Pass script path as query parameter
        url += f"?script={script_path}"

    print(f"Starting rdit server on {args.host}:{args.port}")
    if script_path:
        print(f"Opening script: {script_path}")

    # Open browser unless disabled
    if not args.no_browser:
        open_browser(url)

    # Start the server
    uvicorn.run(
        "rdit.server:app",
        host=args.host,
        port=args.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
