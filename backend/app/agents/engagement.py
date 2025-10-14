import os
import io
import json
import pandas as pd
from datetime import datetime
from typing import List, Dict, Any, Optional

from app.utils import google_search
from openai import OpenAI
from ..models.engagement import AnalysisReport, TopPostAnalysis

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

def get_column_mapping(headers: List[str]) -> Dict[str, Optional[str]]:
    """A fast, reliable manual mapping for common column names."""
    mapping = {
        "content": None, "date": None, "likes": None, "comments": None,
        "shares": None, "engagement_rate": None
    }
    lower_headers = {h.strip().lower(): h for h in headers}
    variations = {
        "content": ["post title", "title", "content", "text"],
        "date": ["created date", "date", "published at"],
        "likes": ["likes", "reactions"],
        "comments": ["comments"],
        "shares": ["reposts", "shares"],
        "engagement_rate": ["engagement rate"]
    }
    for key, alts in variations.items():
        for alt in alts:
            if alt in lower_headers:
                mapping[key] = lower_headers[alt]
                break
    return mapping

def _perform_external_search(keywords: List[str], date_obj: datetime) -> Dict[str, Any]:
    if not date_obj:
        return {"context": "Analysis skipped: Date missing for the top post.", "urls": []}
    try:
        date_query = date_obj.strftime("%B %d %Y")
        queries = [f"{' '.join(keywords)} news {date_query}"] if keywords else []
        queries.append(f"social media trends for {date_obj.strftime('%B %Y')}")
        search_results = google_search.search(queries=queries)
        snippets = [res.snippet for result_set in search_results for res in result_set.results]
        urls = [res.url for result_set in search_results for res in result_set.results]
        context = " ".join(snippets) if snippets else "No relevant external context found."
        return {"context": context, "urls": list(set(urls))}
    except Exception as e:
        return {"context": f"Could not retrieve external context: {e}", "urls": []}

def _generate_strategic_recommendations(top_post_data: Dict, external_context: str) -> str:
    if not client: return "OpenAI API key is not configured."
    system_prompt = (
        "You are an expert Social Media Strategist. Your task is to analyze a top-performing social media post "
        "in light of external world events to provide concise, actionable recommendations."
    )
    user_prompt = f"""
    Analyze the following TOP-PERFORMING social media post and the external context provided.
    ## Top Post Data:
    - Content: "{top_post_data.get('title')}"
    - Engagement Rate: {top_post_data.get('engagement_rate'):.2f}%
    - Keywords from Content: {top_post_data.get('keywords')}
    ## External Context (News & Trends from around the post date):
    {external_context}
    ## Your Task:
    Based on all the information, provide a strategic recommendation.
    1.  Start with a one-sentence conclusion explaining WHY the post was likely successful, linking its topic to the external context.
    2.  Provide two concrete, actionable recommendations for the Content Creator agent to replicate this success. Frame them as direct instructions.
    """
    try:
        response = client.chat.completions.create(model="gpt-4o", messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}])
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"Error generating recommendations: {e}"

# --- Main Entry Point (UPGRADED to handle multiple worksheets) ---
def analyze_report_file(file_content: bytes, filename: str) -> AnalysisReport:
    df = None
    try:
        if filename.endswith('.csv'):
            # For CSV, we assume the first descriptive row might exist and skip it.
            # Pandas is often smart enough, but header=1 is a good hint for these files.
            try:
                df = pd.read_csv(io.BytesIO(file_content), header=1)
            except Exception:
                # If that fails, try reading normally
                df = pd.read_csv(io.BytesIO(file_content))
        elif filename.endswith('.xlsx') or filename.endswith('.xls'):
            xls_engine = 'xlrd' if filename.endswith('.xls') else 'openpyxl'
            xls_file = pd.ExcelFile(io.BytesIO(file_content), engine=xls_engine)
            
            sheet_name_to_load = None
            for sheet in xls_file.sheet_names:
                # Read the first few rows to inspect headers
                # We tell pandas to expect the header on the second row (index 1)
                sheet_df = pd.read_excel(xls_file, sheet_name=sheet, header=1, nrows=1)
                headers = [str(h).strip().lower() for h in sheet_df.columns]
                
                if any(h in ["post title", "title", "content"] for h in headers):
                    sheet_name_to_load = sheet
                    break
            
            if not sheet_name_to_load:
                raise ValueError("Could not find a valid worksheet with a 'Post title' column in the Excel file. Please ensure the file contains a sheet with detailed post data.")

            df = pd.read_excel(xls_file, sheet_name=sheet_name_to_load, header=1)
        else:
            raise ValueError("Unsupported file type.")
    except Exception as e:
        raise ValueError(f"Failed to read or parse the file. It may be corrupted, password-protected, or in an unexpected format. Error: {e}")

    if df.empty:
        raise ValueError("The identified worksheet or CSV file contains no data.")

    df.columns = [str(col).strip() for col in df.columns]
    
    column_map = get_column_mapping(list(df.columns))
    if not column_map.get("content"):
        raise ValueError("Invalid file. The agent requires a 'Post title' or similar column. Please upload the 'All posts' report, not the 'Metrics' summary.")

    posts = df.to_dict(orient='records')
    engagement_key = column_map.get("engagement_rate")
    if not engagement_key:
        raise ValueError("Agent could not identify an 'engagement_rate' column in the file.")

    for post in posts:
        rate_val = str(post.get(engagement_key, '0'))
        # Handle cases where rate might be non-numeric
        try:
            post['_clean_engagement'] = float(rate_val.replace('%', '').strip())
        except (ValueError, TypeError):
            post['_clean_engagement'] = 0.0

    top_post = max(posts, key=lambda p: p['_clean_engagement'])
    
    total_engagement = sum(p['_clean_engagement'] for p in posts)
    avg_engagement = total_engagement / len(posts)

    post_title = str(column_map.get("content") and top_post.get(column_map["content"], "N/A"))
    date_val = column_map.get("date") and top_post.get(column_map["date"])
    created_date_obj = pd.to_datetime(date_val).to_pydatetime() if pd.notna(date_val) else None

    likes = int(float(column_map.get("likes") and top_post.get(column_map["likes"], 0)))
    comments = int(float(column_map.get("comments") and top_post.get(column_map["comments"], 0)))
    shares = int(float(column_map.get("shares") and top_post.get(column_map["shares"], 0)))
    engagement_rate = top_post['_clean_engagement']
    
    keywords = [tag.strip() for tag in post_title.split() if tag.startswith('#')]
    analysis_data = { "title": post_title, "engagement_rate": engagement_rate, "keywords": keywords }

    search_result = _perform_external_search(keywords, created_date_obj)
    recommendations = _generate_strategic_recommendations(analysis_data, search_result['context'])
    
    top_post_analysis = TopPostAnalysis(
        post_title=post_title,
        engagement_rate=engagement_rate,
        likes=likes,
        comments=comments,
        shares=shares,
        external_context_summary=search_result['context'],
        relevant_urls=search_result['urls'],
        strategic_recommendations=recommendations
    )

    return AnalysisReport(
        total_posts_analyzed=len(posts),
        average_engagement_rate=avg_engagement,
        top_performing_post=top_post_analysis
    )