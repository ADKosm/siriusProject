FROM python:3

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY static ./static
COPY main.py .
COPY recsys.json .

ENTRYPOINT ["python3", "main.py"]