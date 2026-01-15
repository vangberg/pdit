.PHONY: test build-frontend build-package publish release

test:
	uv run pytest
	cd fe && npm test -- --run

build-frontend:
	cd fe && npm install && npm run build

build-package:
	uv build

publish:
	uv publish

release: build-frontend build-package publish
