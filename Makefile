.PHONY: test

test:
	uv run pytest
	cd fe && npm test -- --run
