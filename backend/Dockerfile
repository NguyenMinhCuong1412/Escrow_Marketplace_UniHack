# Build từ thư mục gốc repo:  docker build -f backend/Dockerfile -t escrow-attest .
# Chạy:                      docker run --env-file backend/.env -p 8000:8000 escrow-attest
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY ai-pipeline/requirements.txt ai-pipeline/requirements.txt
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY ai-pipeline/evidence_check.py ai-pipeline/evidence_check.py
COPY backend/attest_service.py backend/chain.py backend/
COPY backend/abi backend/abi
# Địa chỉ deploy (nếu có) — có thể thay bằng biến ESCROW_ADDRESS
COPY contracts/deployments contracts/deployments

ENV DATA_DIR=/data PYTHONUNBUFFERED=1
VOLUME /data
WORKDIR /app/backend
EXPOSE 8000
CMD ["uvicorn", "attest_service:app", "--host", "0.0.0.0", "--port", "8000"]
