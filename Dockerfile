FROM python:3

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY static .
COPY main.py .

ENTRYPOINT ["python3", "main.py"]