# Underwriting Radar container.
#
# Built on the official Playwright Python image, which already ships Chromium
# + every system library Chromium needs. Building from python:slim and
# `playwright install --with-deps` works too but adds ~3 minutes per build.
#
# Local build:
#     docker build -t underwriting-radar .
#
# Local run (mount config + states + outputs as volumes so they survive runs):
#     docker run --rm \
#       -v $(pwd)/config.yaml:/app/config.yaml:ro \
#       -v $(pwd)/states:/app/states:ro \
#       -v $(pwd)/db:/app/db \
#       -v $(pwd)/staging_pdfs:/app/staging_pdfs \
#       -e RADAR_WEBHOOK_URL=https://hooks.example.com/abc \
#       underwriting-radar
#
# Cloud Run Job (one-shot, scheduled by Cloud Scheduler):
#     gcloud run jobs deploy underwriting-radar \
#         --image=gcr.io/PROJECT/underwriting-radar \
#         --set-env-vars=RADAR_WEBHOOK_URL=... \
#         --task-timeout=900
#
# DigitalOcean droplet: cron a `docker run ...` line; mount /opt/radar/* as
# above so the SQLite DB and staging directory persist between runs.

FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

WORKDIR /app

# Install Python deps first so Docker can cache this layer when only source
# files change.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the radar itself. config.yaml is intentionally NOT baked in — mount
# it (and the states/ dir) at runtime so secrets stay out of the image.
COPY radar.py setup_auth.py ./

# Pre-create the writable directories so the radar doesn't have to mkdir
# under restrictive container filesystems.
RUN mkdir -p /app/staging_pdfs /app/states /app/db

ENV PYTHONUNBUFFERED=1

CMD ["python", "radar.py", "--config", "config.yaml"]
