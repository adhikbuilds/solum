# Shapely ships manylinux wheels with GEOS bundled, so no apt-get libgeos step is needed --
# the usual Dockerfile for this stack installs it and pays a minute of build time for nothing.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Third-party wheels first. They change far less often than our own code, so this layer survives
# nearly every rebuild; copying the source first would invalidate it on every edit.
COPY apps/api/requirements.txt ./apps/api/requirements.txt
RUN pip install --no-cache-dir -r apps/api/requirements.txt

# The context is the repo root, because this image is three projects: the appraisal engine, the
# city pipeline, and the service that exposes both.
COPY packages/engine/ ./packages/engine/
COPY packages/city/   ./packages/city/
COPY apps/api/        ./apps/api/

# Installed, not path-hacked. Ten `sys.path.insert` lines used to make the import graph depend on
# where each file sat in the tree, which is why the tree could not be reorganised without
# breaking imports that no test covered. `--no-deps` because requirements.txt already pinned the
# third-party set above; this step only wires up the three local projects.
RUN pip install --no-deps -e packages/engine -e packages/city -e apps/api

EXPOSE 8000

# One worker: every endpoint is CPU-light (a full study is single-digit milliseconds) and the
# only blocking call is the DDA fetch. Scale with replicas, not threads.
CMD ["uvicorn", "solum_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
