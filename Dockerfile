FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
COPY frontend/public/evidence ./frontend/public/evidence
RUN pip install --no-cache-dir -e ".[api]" && useradd --create-home terrashift && mkdir work && chown terrashift:terrashift work
USER terrashift
ENV TERRASHIFT_JOB_DB=/app/work/jobs.sqlite3
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "terrashift.api:app", "--host", "0.0.0.0", "--port", "8000"]
