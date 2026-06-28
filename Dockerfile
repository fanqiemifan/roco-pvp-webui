FROM python:3.9-slim

WORKDIR /app

COPY . /app

RUN pip install --no-cache-dir -r requirements.txt
RUN mkdir -p /app/cache /app/img

EXPOSE 9988

CMD ["python3", "server.py", "--host", "0.0.0.0", "--port", "9988"]
