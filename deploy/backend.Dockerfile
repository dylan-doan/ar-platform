# Zoustec backend (FastAPI) — production image
# Multi-stage: deps caching + slim runtime

FROM python:3.12-slim as builder
WORKDIR /build
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini .
ENV PATH=/root/.local/bin:$PATH \
    PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
