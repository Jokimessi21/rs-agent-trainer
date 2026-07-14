FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD python -c "from app import app, db; app.app_context().push(); db.create_all()" && gunicorn app:app --bind 0.0.0.0:$PORT --workers 2
