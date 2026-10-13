FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install --no-cache-dir -r server/requirements.txt
ENV PORT=8080
CMD ["sh", "-c", "cd server && uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
