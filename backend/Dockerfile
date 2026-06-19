# ══════════════════════════════════════════════════════════════════════════════
# Stage 1 — Builder
# Installs Python dependencies into an isolated virtual environment.
# This stage includes pip and build tools which we do NOT want in production.
# ══════════════════════════════════════════════════════════════════════════════
FROM python:3.11-slim AS builder

WORKDIR /build

# Copy only requirements first so Docker can cache this layer.
# If requirements.txt hasn't changed, pip install is skipped on rebuild.
COPY requirements.txt .

# Create a virtual environment and install all dependencies into it.
# Using a venv makes it easy to copy just the installed packages to the next stage.
RUN python -m venv /venv && \
    /venv/bin/pip install --no-cache-dir --upgrade pip && \
    /venv/bin/pip install --no-cache-dir -r requirements.txt


# ══════════════════════════════════════════════════════════════════════════════
# Stage 2 — Runtime
# Lean production image — only the venv and app code, no pip or build tools.
# ══════════════════════════════════════════════════════════════════════════════
FROM python:3.11-slim AS runtime

WORKDIR /code

# Copy the pre-built virtual environment from the builder stage.
# The final image stays small because build tooling is left behind.
COPY --from=builder /venv /venv

# Copy application source code.
COPY . .

# Put the venv binaries first on PATH so `python` and `uvicorn` resolve to the venv.
ENV PATH="/venv/bin:$PATH"

# Document the port the app listens on (does not publish it — that's docker compose's job).
EXPOSE 8000

# Start the FastAPI app with Uvicorn.
# --host 0.0.0.0 makes it reachable from outside the container.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
