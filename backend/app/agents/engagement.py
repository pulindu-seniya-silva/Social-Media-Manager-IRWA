import os
import io
import pandas as pd
from datetime import datetime
from typing import List, Dict, Any, Optional
import json

from app.utils import google_search
from openai import OpenAI
from ..models.engagement import TopPostAnalysis, InitialAnalysisResponse, PostDetails, StrategicRecommendation, RecommendationDetail

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

# --- get_column_mapping, _perform_external_search, and _generate_strategic_recommendations are unchanged ---
def get_column_mapping(headers: List[str]) -> Dict[str, Optional[str]]:
    mapping = { "content": None, "date": None, "likes": None, "comments": None, "shares": None, "engagement_rate": None }
    lower_headers = {h.strip().lower(): h for h in headers}
    variations = { "content": ["post title", "title", "content", "text"], "date": ["created date", "date", "published at"], "likes": ["likes", "reactions"], "comments": ["comments"], "shares": ["reposts", "shares"], "engagement_rate": ["engagement rate"] }
    for key, alts in variations.items():
        for alt in alts:
            if alt in lower_headers:
                mapping[key] = lower_headers[alt]
                break
    return mapping

def _perform_external_search(keywords: List[str], date_str: Optional[str], future_trends: bool = False) -> Dict[str, Any]:
    if not date_str and not future_trends:
        return {"context": "Analysis skipped: Date missing.", "urls": []}
    try:
        if future_trends:
            base_query = ' '.join(keywords)
            queries = [ f"emerging trends in {base_query} 2026", f"future of {base_query}", f"{base_query} innovations and predictions" ]
        else:
            date_obj = pd.to_datetime(date_str).to_pydatetime()
            date_query = date_obj.strftime("%B %d %Y")
            queries = [f"{' '.join(keywords)} news {date_query}"] if keywords else []
            queries.append(f"social media trends for {date_obj.strftime('%B %Y')}")
        search_results = google_search.search(queries=queries)
        snippets = [res.snippet for result_set in search_results for res in result_set.results]
        urls = [res.url for result_set in search_results for res in result_set.results]
        context = " ".join(snippets) if snippets else "No relevant external context found."
        return {"context": context, "urls": list(set(urls))}
    except Exception as e:
        return {"context": f"Could not retrieve context: {e}", "urls": []}

def _generate_strategic_recommendations(post_data: Dict, external_context: str) -> StrategicRecommendation:
    default_response = StrategicRecommendation( theme="Analysis Incomplete", reason="Could not generate strategic insights from the provided data.", recommendations=[ RecommendationDetail(title="Try Again", description="Try analyzing a different post."), RecommendationDetail(title="Check Content", description="Ensure the post title is descriptive.") ])
    if not client: return default_response
    system_prompt = ( "You are an expert Social Media Strategist. Your task is to analyze a social media post and external context, " "then provide a deeply structured, actionable strategic recommendation in JSON format." )
    user_prompt = f"""
    Analyze the following social media post and external context.
    ## Post Data:
    - Content: "{post_data.get('post_title')}"
    - Engagement Rate: {post_data.get('engagement_rate'):.2f}%
    ## External Context (News & Trends from around the post date):
    {external_context}
    ## Your Task:
    Generate a JSON object with the following structure:
    1. "theme": A short, catchy title for the core strategic theme (e.g., "Data-Driven Storytelling").
    2. "reason": A concise, one-sentence conclusion explaining WHY the post was likely successful.
    3. "recommendations": A JSON array containing exactly two recommendation objects. Each object must have:
        - "title": A very short, action-oriented title (2-3 words, e.g., "Amplify Data").
        - "description": A concise, actionable recommendation (under 15 words).
    Example JSON output:
    {{
        "theme": "Topical Authority",
        "reason": "This post succeeded by tapping into a trending industry conversation at the perfect time.",
        "recommendations": [
            {{ "title": "Double-Down on Data", "description": "Create more posts that use specific metrics to demonstrate value." }},
            {{ "title": "Host an Expert Q&A", "description": "Invite an industry expert to discuss this topic further in a live session." }}
        ]
    }}
    """
    try:
        response = client.chat.completions.create( model="gpt-4o", response_format={"type": "json_object"}, messages=[ {"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt} ])
        recommendation_json = json.loads(response.choices[0].message.content)
        return StrategicRecommendation(**recommendation_json)
    except Exception:
        return default_response

# --- CORRECTED: This function is now more robust against AI response errors ---
def _generate_upcoming_trends(post_title: str, trend_context: str) -> List[str]:
    """Uses AI to brainstorm future content ideas based on trend research."""
    if not client: return ["OpenAI API key is not configured."]
    
    system_prompt = (
        "You are a creative Content Strategist. Your task is to generate a list of "
        "compelling, forward-looking content ideas based on a user's past post and current trend data."
    )
    user_prompt = f"""
    A user's past successful post was titled: "{post_title}"
    
    Here is some context on upcoming trends in that topic area:
    "{trend_context}"

    Based on this, generate a JSON object containing a single key "ideas" which holds an array of 
    3 to 4 distinct, actionable, and creative content idea STRINGS for future posts.
    The ideas should be concise (under 12 words each).
    
    Example JSON format:
    {{
        "ideas": ["Idea one as a string...", "Idea two as a string...", "Idea three as a string..."]
    }}
    """
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
        )
        response_json = json.loads(response.choices[0].message.content)
        
        # Robust parsing: Find the list, regardless of the key
        ideas_list = []
        for value in response_json.values():
            if isinstance(value, list):
                ideas_list = value
                break
        
        # Final check: ensure all items in the list are strings. If they are dicts, extract the first value.
        processed_ideas = []
        for item in ideas_list:
            if isinstance(item, str):
                processed_ideas.append(item)
            elif isinstance(item, dict) and item:
                # Extract the first value from the dict, whatever the key might be
                processed_ideas.append(str(next(iter(item.values()))))

        return processed_ideas if processed_ideas else ["Could not extract valid trend ideas."]

    except Exception as e:
        return [f"Error generating trend ideas: {e}"]

# --- get_detailed_analysis_for_post remains functionally the same ---
def get_detailed_analysis_for_post(post: PostDetails) -> TopPostAnalysis:
    keywords = [tag.strip() for tag in post.post_title.replace('#', '').split() if len(tag) > 3][:5]
    historical_context_result = _perform_external_search(keywords, post.created_date)
    recommendations = _generate_strategic_recommendations(post.dict(), historical_context_result['context'])
    future_trends_result = _perform_external_search(keywords, post.created_date, future_trends=True)
    upcoming_trends = _generate_upcoming_trends(post.post_title, future_trends_result['context'])
    
    return TopPostAnalysis(
        post_title=post.post_title,
        engagement_rate=post.engagement_rate,
        likes=post.likes,
        comments=post.comments,
        shares=post.shares,
        external_context_summary=historical_context_result['context'],
        relevant_urls=historical_context_result['urls'],
        strategic_recommendations=recommendations,
        upcoming_trends=upcoming_trends
    )

# --- process_report_file function remains unchanged ---
def process_report_file(file_content: bytes, filename: str) -> InitialAnalysisResponse:
    df = None
    try:
        if filename.endswith('.csv'):
            try: df = pd.read_csv(io.BytesIO(file_content), header=1)
            except Exception: df = pd.read_csv(io.BytesIO(file_content))
        elif filename.endswith(('.xlsx', '.xls')):
            xls_engine = 'xlrd' if filename.endswith('.xls') else 'openpyxl'
            xls_file = pd.ExcelFile(io.BytesIO(file_content), engine=xls_engine)
            sheet_name_to_load = next((s for s in xls_file.sheet_names if any(h in ["post title", "title", "content"] for h in [str(c).strip().lower() for c in pd.read_excel(xls_file, sheet_name=s, header=1, nrows=1).columns])), None)
            if not sheet_name_to_load: raise ValueError("Could not find a valid worksheet with a 'Post title' column.")
            df = pd.read_excel(xls_file, sheet_name=sheet_name_to_load, header=1)
        else: raise ValueError("Unsupported file type.")
    except Exception as e: raise ValueError(f"Failed to read or parse the file. Error: {e}")

    if df.empty: raise ValueError("The file contains no data.")

    df.columns = [str(col).strip() for col in df.columns]
    column_map = get_column_mapping(list(df.columns))

    if not all([column_map.get("content"), column_map.get("engagement_rate")]):
        raise ValueError("File must contain 'Post title' and 'Engagement rate' columns.")

    posts_data = []
    total_engagement = 0
    
    for index, row in df.iterrows():
        try:
            rate_val = str(row.get(column_map["engagement_rate"], '0'))
            clean_engagement = float(rate_val.replace('%', '').strip())
            total_engagement += clean_engagement

            date_val = row.get(column_map["date"])
            posts_data.append(PostDetails(
                id=index,
                post_title=str(row.get(column_map["content"], "N/A")),
                created_date=str(date_val) if pd.notna(date_val) else None,
                likes=int(float(row.get(column_map["likes"], 0))),
                comments=int(float(row.get(column_map["comments"], 0))),
                shares=int(float(row.get(column_map["shares"], 0))),
                engagement_rate=clean_engagement
            ))
        except (ValueError, TypeError): continue

    if not posts_data: raise ValueError("No valid post data could be extracted.")
    avg_engagement = total_engagement / len(posts_data) if posts_data else 0

    return InitialAnalysisResponse(
        total_posts_analyzed=len(posts_data),
        average_engagement_rate=avg_engagement,
        posts=posts_data
    )