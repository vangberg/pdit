#!/usr/bin/env python3
"""Test the simplified server."""

import asyncio
import uvicorn
from pdit.server_simple import app

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8889, log_level="info")
