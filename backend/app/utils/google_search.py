import os
from typing import List, Dict, Any
from serpapi import GoogleSearch

# --- Data Structures (Interface for the Agent) ---
class PerQueryResult:
    def __init__(self, snippet: str, url: str):
        self.snippet = snippet
        self.url = url

class SearchResults:
    def __init__(self, query: str, results: List[PerQueryResult]):
        self.query = query
        self.results = results

# --- Mock Search Function (Fallback) ---
def _mock_search(queries: List[str]) -> List[SearchResults]:
    """
    This is the MOCK google_search function for fallback purposes.
    """
    print("--- MOCK SEARCH: Simulating search. (SERPAPI_API_KEY not found) ---")
    mock_results_data = [
        ("AI-powered content creation tools are revolutionizing social media.", "https://techcrunch.com/mock/ai-in-social-media"),
        ("Industry report shows authentic storytelling is the top trend for Q4 2025.", "https://www.socialmediatoday.com/mock/q4-trends-report"),
    ]
    final_output = []
    for q in queries:
        results = [PerQueryResult(snippet, url) for snippet, url in mock_results_data]
        final_output.append(SearchResults(query=q, results=results))
    return final_output

# --- Live SerpApi Search Function (Corrected) ---
def search(queries: List[str]) -> List[SearchResults]:
    """
    Performs a live Google search for a list of queries using SerpApi.
    If the SERPAPI_API_KEY is not set, it falls back to the mock search.
    """
    api_key = os.getenv("SERPAPI_API_KEY")

    if not api_key:
        return _mock_search(queries)

    print(f"--- LIVE SEARCH: Performing search for queries: {queries} ---")
    
    all_results = []

    for query in queries:
        try:
            # --- THIS IS THE FIX ---
            # 1. Set up the parameters for the search
            params = {
                "api_key": api_key,
                "engine": "google",
                "q": query,
            }
            
            # 2. Create a search object with the parameters
            search_client = GoogleSearch(params)
            
            # 3. Get the results as a dictionary
            response = search_client.get_dict()
            
            # Process the organic results from the API response
            organic_results = response.get("organic_results", [])
            
            query_results = [
                PerQueryResult(
                    snippet=res.get("snippet", "No snippet available."),
                    url=res.get("link", "#")
                )
                for res in organic_results
            ]
            
            all_results.append(SearchResults(query=query, results=query_results))

        except Exception as e:
            print(f"An error occurred while searching for query '{query}': {e}")
            all_results.append(SearchResults(query=query, results=[]))
            
    return all_results