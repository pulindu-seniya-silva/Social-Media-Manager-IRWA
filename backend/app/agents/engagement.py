from fastapi import FastAPI
from pydantic import BaseModel
import nltk
from nltk.sentiment import SentimentIntensityAnalyzer

# Make sure VADER is available
nltk.download("vader_lexicon")

# Create FastAPI app
app = FastAPI()

# Define request body
class PostRequest(BaseModel):
    posts: list[str]

# Reusable function
def analyze_posts(posts):
    sia = SentimentIntensityAnalyzer()
    results = []
    for post in posts:
        score = sia.polarity_scores(post)
        results.append({
            "post": post,
            "sentiment": score
        })
    return results

# API route
@app.post("/analyze")
async def analyze_sentiment(request: PostRequest):
    return {"results": analyze_posts(request.posts)}
