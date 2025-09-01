from fastapi import FastAPI
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Social Media Content Generator Pro")