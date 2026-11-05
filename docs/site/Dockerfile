# Сайт документации: Markdown из docs/guide → HTML, пересобирается сам при правке файлов.
FROM python:3.12-slim
RUN pip install --no-cache-dir --retries 10 markdown==3.7
WORKDIR /app
COPY serve.py /app/serve.py
COPY assets /app/assets
EXPOSE 8000
CMD ["python", "-u", "/app/serve.py", "/guide", "8000"]
