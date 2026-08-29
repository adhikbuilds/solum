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

EXPOSE 8000

# One worker: every endpoint is CPU-light (a full study is single-digit milliseconds) and the
# only blocking call is the DDA fetch. Scale with replicas, not threads.
CMD ["uvicorn", "service.main:app", "--host", "0.0.0.0", "--port", "8000"]
