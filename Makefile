.PHONY: dev 

dev:
	@echo "Starting pdit backend and frontend dev servers..."
	@trap 'kill 0' EXIT; \
	uv run pdit --no-browser --port 8888 & \
	cd web && npm run dev
