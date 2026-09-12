# Shapely ships manylinux wheels with GEOS bundled, so no apt-get libgeos step is needed --
# the usual Dockerfile for this stack installs it and pays a minute of build time for nothing.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY solum_massing/ ./solum_massing/
COPY service/ ./service/
COPY fixtures/ ./fixtures/
COPY viewer.html .

# The city base. Until now this was never copied in, which is the real reason the city map could
# not be containerised -- not a missing compose entry, a missing COPY. `twin/db` holds the schema
# and the tile cutter the service imports at startup; `twin/web/study.py` is the live appraisal.
# `twin/raw` and `twin/out` are deliberately NOT copied: they are a 300 MB dated acquisition and
# its derivatives, mounted at load time, not baked into an image.
COPY twin/ ./twin/

EXPOSE 8000

# One worker: every endpoint is CPU-light (a full study is single-digit milliseconds) and the
# only blocking call is the DDA fetch. Scale with replicas, not threads.
CMD ["uvicorn", "service.main:app", "--host", "0.0.0.0", "--port", "8000"]
