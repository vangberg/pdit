.PHONY: test

test:
	uv run pytest
	cd web && npm test -- --run
