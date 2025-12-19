.PHONY: dev

dev:
	@echo "Building frontend and starting pdit..."
	cd web && npm run build
	uv run pdit --port 8888
