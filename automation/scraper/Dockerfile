FROM python:3.12-slim
RUN pip install --no-cache-dir "python-jobspy>=1.1.80" "psycopg2-binary>=2.9" "feedparser>=6.0" "requests>=2.31"
WORKDIR /app
COPY scraper.py /app/scraper.py
CMD ["python", "/app/scraper.py"]
