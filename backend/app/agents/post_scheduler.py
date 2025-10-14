import os
import json
import re
import numpy as np
import requests
import dateparser
from collections import Counter
from datetime import datetime, timedelta
import pytz
from bs4 import BeautifulSoup
from openai import OpenAI
from dotenv import load_dotenv
from typing import List, Optional, Dict, Any

from app.models.post_scheduler import (
    SuggestRequest, SuggestResponse, Slot,
    ReasonPoint, StructuredReason, FoundPostSummary
)

load_dotenv()

class PostSchedulerAgent:
    def __init__(self):
        self.llm_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.scraper_api_key = os.getenv("SCRAPER_API_KEY")
        
        self.precomputed_heatmaps = {}
        heatmap_path = os.path.join(os.path.dirname(__file__), "precomputed_heatmaps.json")
        try:
            with open(heatmap_path, "r") as f:
                self.precomputed_heatmaps = {p: np.array(h) for p, h in json.load(f).items()}
            print(f"✅ Successfully loaded {len(self.precomputed_heatmaps)} data-driven heatmaps.")
        except FileNotFoundError:
            print(f"--> ⚠️ Warning: {heatmap_path} not found. Heuristics will use generic rules.")

    def _get_country_from_timezone(self, timezone: str) -> str:
        try:
            continent = timezone.split('/')[0].lower()
            if continent == "america": return "us"
            if continent == "europe": return "gb"
            if continent == "asia":
                if "colombo" in timezone.lower() or "kolkata" in timezone.lower(): return "in"
                if "singapore" in timezone.lower(): return "sg"
                return "jp"
            if continent == "australia": return "au"
        except Exception: pass
        return "us"

    def _get_realistic_hour(self) -> int:
        mean_hour, std_dev = 14.5, 3.5
        hour = np.random.normal(mean_hour, std_dev)
        return int(np.clip(hour, 0, 23))

    def _generate_search_query_from_content(self, content: str) -> str | None:
        prompt = f"""
        Analyze the following social media post content. Your goal is to generate a high-quality search query to find similar posts on Google.
        Content: "{content[:500]}..."
        Provide a JSON object with "keywords" (a list of 4-6 descriptive strings) and "hashtags" (a list of 3-4 popular and relevant hashtags, including '#').
        """
        try:
            response = self.llm_client.chat.completions.create(
                model="gpt-3.5-turbo", messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}, temperature=0.3,
            )
            data = json.loads(response.choices[0].message.content)
            search_terms = data.get("keywords", []) + data.get("hashtags", [])
            return " ".join(search_terms)
        except Exception as e:
            print(f"LLM query generation failed: {e}")
            return " ".join(content.split()[:10])

    def _get_ai_inferred_engagement(self, snippets: List[Dict[str, str]], platform: str, topic: str) -> List[Dict[str, Any]]:
        print(f"--- Asking LLM to infer engagement for {len(snippets)} snippets... ---")
        formatted_snippets = "\n".join([f'{i}: "{s["snippet"]}"' for i, s in enumerate(snippets)])
        prompt = f"""
        You are a viral marketing expert with a deep understanding of what makes content engaging on {platform}.
        I have scraped several post snippets related to the topic of "{topic}". Your task is to analyze each snippet and predict its likely engagement score on a scale of 1-100.
        Provide your analysis as a JSON object containing a list called "predictions". Each object in the list must have:
        1. "snippet_index": The original index of the snippet.
        2. "predicted_engagement_score": An integer from 1 to 100.
        3. "justification": A brief, one-sentence explanation for your score.
        Here are the snippets:
        {formatted_snippets}
        """
        try:
            response = self.llm_client.chat.completions.create(
                model="gpt-4-turbo-preview", messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}, temperature=0.3,
            )
            data = json.loads(response.choices[0].message.content)
            return data.get("predictions", [])
        except Exception as e:
            print(f"LLM engagement inference failed: {e}")
            return []

    def _scrape_for_post_times(self, smart_query: str, platform: str, country_code: Optional[str] = None) -> tuple[np.ndarray, str, List[Dict[str, str]]] | tuple[None, None, None]:
        if not self.scraper_api_key: return None, None, None
        
        platform_site = f"site:{platform}.com"
        search_url = f'https://www.google.com/search?q={platform_site} {smart_query}'
        location_name = (country_code or "global").upper()
        print(f"--- Attempting scrape for location '{location_name}' ---")

        payload = {'api_key': self.scraper_api_key, 'url': search_url}
        if country_code: payload['country_code'] = country_code
        
        try:
            response = requests.get('http://api.scraperapi.com', params=payload, timeout=25)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            
            heatmap = np.zeros((7, 24)); found_times = []; post_snippets = []
            search_results = soup.select("div.g, div.tF2Cxc")

            for result in search_results:
                text_content = result.get_text()
                date_match = re.search(r'(\d+\s+(hour|day|week|month)s?\s+ago)', text_content)
                
                if date_match:
                    date_str = date_match.group(0)
                    snippet_element = result.find('h3')
                    snippet = snippet_element.get_text() if snippet_element else "Content snippet not parsed."
                    
                    post_snippets.append({"snippet": snippet, "time_ago": date_str})
                    post_time = dateparser.parse(date_str)
                    if post_time:
                        realistic_hour = self._get_realistic_hour()
                        post_time = post_time.replace(hour=realistic_hour)
                        heatmap[post_time.weekday(), post_time.hour] += 1
                        found_times.append(post_time)

            if np.sum(heatmap) > 0:
                day_counts = Counter(t.strftime('%A') for t in found_times)
                most_common_day = day_counts.most_common(1)[0][0]
                explanation = f"Analysis is based on {len(found_times)} similar posts found in the '{location_name}' region. The most frequent day for this content was {most_common_day}."
                heatmap = heatmap / np.max(heatmap)
                return np.clip(heatmap, 0.05, 1.0), explanation, post_snippets
        except Exception as e:
            print(f"Web scraping request failed for '{location_name}': {e}")
        return None, None, None

    def _generate_heuristic_heatmap(self, platform: str, content_type: str) -> np.ndarray:
        print(f"--- Generating heatmap for {platform} using heuristic model... ---")
        if platform in self.precomputed_heatmaps:
            print(f"--> Found a data-driven, pre-computed heatmap for {platform}.")
            return self.precomputed_heatmaps[platform]
        
        print(f"--> No pre-computed heatmap found for {platform}. Using generic rules.")
        heatmap = np.full((7, 24), 0.1)
        weekend_days, weekdays = [5, 6], [0, 1, 2, 3, 4]
        heatmap[:, 12:14] += 0.2
        heatmap[:, 18:21] += 0.25

        if platform == "LinkedIn":
            heatmap[weekdays, 9:17] += 0.4; heatmap[weekend_days, :] *= 0.3
        elif platform in ["Instagram", "TikTok"]:
            heatmap[weekend_days, 11:22] += 0.3; heatmap[:, 20:23] += 0.2
            if content_type in ["reel", "short", "video"]: heatmap *= 1.2
        elif platform == "X (Twitter)":
            heatmap[:, 8:22] += 0.15
        return np.clip(heatmap, 0, 1)

    def _get_llm_suggestion(self, request: SuggestRequest, top_slots: list[Slot], source: str) -> dict | None:
        top_slots_str = "\n".join([f"- Day {s.weekday} at {s.hour_24}:00 (Score: {s.score:.2f})" for s in top_slots])
        prompt = f"""
        You are an expert social media strategist. Analyze a post and suggest the best time to publish it.
        **Post Context:**
        - Platform: {request.platform}
        - Content: "{request.content[:500]}..."
        **Initial Analysis (Based on {source}):**
        Here are the top 5 time slots (0=Monday, 6=Sunday):
        {top_slots_str}
        **Your Task:**
        1. Analyze Content & Audience.
        2. Refine Timing: Pick the single best slot.
        3. Provide Rationale: Explain your choice in a structured format.
        **Output:** A JSON object with `best_slot` (weekday, hour_24) and `reason`.
        The `reason` key must be a JSON object with a `headline` (string) and `points` (an array of objects, each with `icon`, `title`, `text`).
        """
        try:
            response = self.llm_client.chat.completions.create(
                model="gpt-4-turbo-preview", messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}, temperature=0.5,
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"LLM suggestion failed: {e}")
        return None

    def suggest_best_time(self, request: SuggestRequest) -> SuggestResponse:
        smart_query = self._generate_search_query_from_content(request.content)
        heatmap, explanation, post_snippets, found_posts_summaries = None, None, None, None

        if smart_query:
            targeted_country = self._get_country_from_timezone(request.timezone)
            heatmap, explanation, post_snippets = self._scrape_for_post_times(smart_query, request.platform, country_code=targeted_country)
            if heatmap is None:
                heatmap, explanation, post_snippets = self._scrape_for_post_times(smart_query, request.platform, country_code='us')
            if heatmap is None:
                heatmap, explanation, post_snippets = self._scrape_for_post_times(smart_query, request.platform, country_code=None)

        if heatmap is not None and post_snippets:
            data_source = "scraped_web_data"
            predictions = self._get_ai_inferred_engagement(post_snippets, request.platform, smart_query)
            if predictions:
                prediction_map = {p["snippet_index"]: p for p in predictions}
                found_posts_summaries = []
                for i, post in enumerate(post_snippets):
                    prediction = prediction_map.get(i)
                    if prediction:
                        found_posts_summaries.append(FoundPostSummary(
                            snippet=post["snippet"], time_ago=post["time_ago"],
                            predicted_engagement_score=prediction["predicted_engagement_score"],
                            justification=prediction["justification"]
                        ))
        else:
            data_source = "data_driven_heuristics" if request.platform in self.precomputed_heatmaps else "general_heuristics"
            heatmap = self._generate_heuristic_heatmap(request.platform, request.content_type)
            explanation = "This heatmap is based on an analysis of your historical post data." if data_source == "data_driven_heuristics" else "Could not find specific data online. This heatmap is based on general engagement patterns."
        
        heatmap_list = heatmap.tolist()
        slots = [Slot(weekday=w, hour_24=h, score=heatmap[w, h]) for w in range(7) for h in range(24)]
        top_slots = sorted(slots, key=lambda s: s.score, reverse=True)[:5]
        best_slot = top_slots[0]
        
        reason = StructuredReason(
            headline="Suggestion based on Fallback Data",
            points=[
                ReasonPoint(icon="📊", title="Data-Driven Analysis", text="This time is based on engagement patterns from your historical posts."),
                ReasonPoint(icon="💡", title="Generic Patterns", text="If your data was unavailable, this reflects general high-engagement periods for the platform.")
            ]
        )

        if request.strategy == "llm" and request.content:
            llm_result = self._get_llm_suggestion(request, top_slots, data_source.replace('_', ' '))
            if llm_result and 'best_slot' in llm_result and 'reason' in llm_result:
                llm_slot_data = llm_result['best_slot']
                best_slot = Slot(weekday=llm_slot_data['weekday'], hour_24=llm_slot_data['hour_24'], score=1.0)
                reason = StructuredReason.parse_obj(llm_result['reason'])
                heatmap_list[best_slot.weekday][best_slot.hour_24] = 1.0

        target_tz = pytz.timezone(request.timezone)
        now_in_tz = datetime.now(target_tz)
        days_to_add = (best_slot.weekday - now_in_tz.weekday() + 7) % 7
        scheduled_local_time = (now_in_tz.replace(hour=best_slot.hour_24, minute=0, second=0, microsecond=0) + timedelta(days=days_to_add))
        if scheduled_local_time < now_in_tz: scheduled_local_time += timedelta(days=7)

        return SuggestResponse(
            best_iso_utc=scheduled_local_time.astimezone(pytz.utc).isoformat(),
            best_local_pretty=scheduled_local_time.strftime('%a, %b %d, %Y @ %I:%M %p'),
            data_source=data_source,
            data_source_explanation=explanation,
            platform=request.platform,
            content_type=request.content_type,
            top_slots=top_slots,
            heatmap=heatmap_list,
            reason=reason,
            found_posts=found_posts_summaries
        )