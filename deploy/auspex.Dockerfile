# Auspex daemon — market-data sweep every 15 min (SERVER.md §3).
# Build context is the repo root: docker compose handles this via
# build.context = ".." in docker-compose.yml.
FROM python:3.12-slim

WORKDIR /app
COPY deploy/auspex.requirements.txt .
RUN pip install --no-cache-dir -r auspex.requirements.txt

COPY auspex_daemon.py .

# Credentials come from the environment (compose .env) — never baked in.
CMD ["python", "-u", "auspex_daemon.py"]
