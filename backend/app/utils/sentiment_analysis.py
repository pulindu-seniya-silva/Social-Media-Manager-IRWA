# backend/app/tools/sentiment_analysis.py

import random

class SentimentAnalysis:
    """
    This is a MOCK SentimentAnalysis class.
    It returns a random sentiment for development purposes.
    Replace this with a real sentiment analysis library like NLTK, TextBlob, or an API call.
    """
    def classify(self, text: str) -> str:
        """Classifies text into 'positive', 'neutral', or 'negative'."""
        # In a real app, you would analyze the text here.
        # For now, we'll return a random result.
        if "love" in text.lower() or "great" in text.lower() or "amazing" in text.lower():
            return "positive"
        if "not" in text.lower() or "bad" in text.lower():
            return "negative"
            
        return random.choice(["positive", "neutral", "negative"])