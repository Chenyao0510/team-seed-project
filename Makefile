.PHONY: init lint check-types test build verify-all dev-frontend dev-backend clean help

PYTHON       ?= python3
PNPM         ?= pnpm
BACKEND_VENV ?= backend/.venv
BACKEND_PY   := $(BACKEND_VENV)/bin/python
BACKEND_PIP  := $(BACKEND_VENV)/bin/pip

help:
	@echo "Targets:"
	@echo "  init          create backend venv, install frontend + backend deps"
	@echo "  lint          static analysis (frontend + backend)"
	@echo "  check-types   tsc -b --noEmit"
	@echo "  test          pytest + (vitest if configured)"
	@echo "  build         vite build"
	@echo "  verify-all    lint + check-types + test + build"
	@echo "  dev-frontend  vite dev server on :5173"
	@echo "  dev-backend   uvicorn on :8000"
	@echo "  clean         remove build/cache artifacts"

$(BACKEND_VENV):
	$(PYTHON) -m venv $(BACKEND_VENV)
	$(BACKEND_PIP) install --upgrade pip

init: $(BACKEND_VENV)
	@echo "==> Installing frontend deps"
	cd frontend && $(PNPM) install
	@echo "==> Installing backend deps"
	$(BACKEND_PIP) install -r backend/requirements.txt

lint:
	@echo "==> Lint frontend"
	cd frontend && $(PNPM) lint
	@echo "==> Lint backend (ruff)"
	@if [ -x $(BACKEND_PY) ]; then \
	  cd backend && ../$(BACKEND_VENV)/bin/python -m ruff check .; \
	else \
	  echo "(backend venv missing; run 'make init')"; exit 1; \
	fi

check-types:
	@echo "==> Type-check frontend"
	cd frontend && $(PNPM) exec tsc -b --noEmit

test:
	@echo "==> Test backend"
	@if [ -x $(BACKEND_PY) ]; then \
	  cd backend && ../$(BACKEND_VENV)/bin/python -m pytest -q; \
	else \
	  echo "(backend venv missing; run 'make init')"; exit 1; \
	fi
	@echo "==> Test frontend"
	@if [ -f frontend/vitest.config.ts ] || [ -f frontend/vitest.config.js ]; then \
	  cd frontend && $(PNPM) test; \
	else \
	  echo "(no vitest yet; skip)"; \
	fi

build:
	@echo "==> Build frontend"
	cd frontend && $(PNPM) build

dev-frontend:
	cd frontend && $(PNPM) dev

dev-backend:
	@if [ -x $(BACKEND_PY) ]; then \
	  cd backend && ../$(BACKEND_VENV)/bin/python -m uvicorn main:app --reload --port 8000; \
	else \
	  echo "(backend venv missing; run 'make init')"; exit 1; \
	fi

verify-all: lint check-types test build
	@echo "==> verify-all OK"

clean:
	rm -rf frontend/dist frontend/node_modules/.vite
	rm -rf backend/.pytest_cache backend/.ruff_cache
	find backend -type d -name __pycache__ -exec rm -rf {} +
