# pdit: The Python Un-Notebook

pdit is an output-focused Python editor for plain `.py` files.

Run code statement by statement and see output inline beside the exact line that produced it.

It is notebook-like without notebook cells or notebook files: no cell model, no special file format, no conversion step.

The workflow is expression-first, so top-level expressions render by default and intermediate states stay visible.

Keep pdit open while Claude Code, Cursor, or similar tools edit your script on disk.

![pdit editor screenshot](www/public/screenshot.png)

## Quick Start

```bash
pip install "pdit[demo]"
pdit --demo
```

With [uv](https://docs.astral.sh/uv/):

```bash
uvx --with "pdit[demo]" pdit --demo
```


## Manual

See the [website](https://pdit.dev/manual/).

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for development setup and testing.
