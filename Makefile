.PHONY: dev 

dev:
	@echo "Starting pdit backend and frontend dev servers..."
	@trap 'kill 0' EXIT; \
	uv run pdit --no-browser & \
	cd web && npm run dev
