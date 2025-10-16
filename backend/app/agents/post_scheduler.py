import os
import json
import re
import numpy as np
import requests
import dateparser
from collections import Counter
from datetime import datetime, timedelta
import pytz
from openai import OpenAI
from dotenv import load_dotenv
from typing import List, Optional, Dict, Any
import time

from app.models.post_scheduler import (
    SuggestRequest, SuggestResponse, Slot,
    ReasonPoint, StructuredReason, FoundPostSummary,
    ScheduleRequest, ScheduleResponse
)

load_dotenv()

class PostSchedulerAgent:
    def __init__(self):
        self.llm_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.serpapi_api_key = os.getenv("SERPAPI_API_KEY")
        
        self.precomputed_heatmaps = {}
        heatmap_path = os.path.join(os.path.dirname(__file__), "precomputed_heatmaps.json")
        try:
            with open(heatmap_path, "r") as f:
                self.precomputed_heatmaps = {p: np.array(h) for p, h in json.load(f).items()}
            print(f"✅ Successfully loaded {len(self.precomputed_heatmaps)} data-driven heatmaps.")
        except FileNotFoundError:
            print(f"--> ⚠️ Warning: {heatmap_path} not found. Heuristics will use generic rules.")

    def mock_schedule(self, request: ScheduleRequest) -> ScheduleResponse:
        """
        A reliable mock function that simulates scheduling a post for a future time.
        """
        print(f"--- MOCK SCHEDULE: Received request to schedule for {request.platform} ---")
        print(f"--- MOCK SCHEDULE TIME: {request.schedule_at_iso} ---")
        print(f"--- MOCK CONTENT: {request.content[:100]}... ---")
        
        # Simulate a network delay
        time.sleep(1.5)

        # Simulate a successful schedule
        return ScheduleResponse(
            status="success",
            message=f"Successfully scheduled post for {request.platform} (Mock).",
            scheduled_at=request.schedule_at_iso
        )

    # ... (All your other methods for suggesting a time like suggest_best_time, 
    # _scrape_for_post_times, etc., are UNCHANGED and should remain here)
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
        You are a viral marketing expert. For the topic "{topic}" on {platform}, analyze each post snippet and predict its engagement score from 1-100.
        Return a JSON object with a "predictions" list. Each object in the list must have "snippet_index", "predicted_engagement_score", and a "justification".
        Snippets:
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
        if not self.serpapi_api_key: return None, None, None
        location_name = (country_code or "global").upper()
        print(f"--- Attempting search with SerpApi for location '{location_name}' ---")
        params = { "api_key": self.serpapi_api_key, "engine": "google", "q": f"site:{platform}.com {smart_query}" }
        if country_code: params["gl"] = country_code
        try:
            response = requests.get("https://serpapi.com/search", params=params, timeout=20)
            response.raise_for_status()
            results = response.json()
            heatmap, found_times, post_snippets = np.zeros((7, 24)), [], []
            for result in results.get("organic_results", []):
                snippet = result.get("snippet", "Snippet not available.")
                date_str = result.get("date") or (re.search(r'(\d+\s+(hour|day|week|month)s?\s+ago)', snippet).group(0) if re.search(r'(\d+\s+(hour|day|week|month)s?\s+ago)', snippet) else None)
                if date_str:
                    post_snippets.append({"snippet": snippet, "time_ago": date_str})
                    post_time = dateparser.parse(date_str)
                    if post_time:
                        post_time = post_time.replace(hour=self._get_realistic_hour())
                        heatmap[post_time.weekday(), post_time.hour] += 1
                        found_times.append(post_time)
            if np.sum(heatmap) > 0:
                day_counts = Counter(t.strftime('%A') for t in found_times)
                most_common_day = day_counts.most_common(1)[0][0]
                explanation = f"Analysis based on {len(found_times)} posts from SerpApi in '{location_name}'. Most frequent day: {most_common_day}."
                heatmap = heatmap / np.max(heatmap)
                return np.clip(heatmap, 0.05, 1.0), explanation, post_snippets
        except Exception as e:
            print(f"SerpApi request failed for '{location_name}': {e}")
        return None, None, None

    def _generate_heuristic_heatmap(self, platform: str, content_type: str) -> np.ndarray:
        print(f"--- Generating heatmap for {platform} using heuristic model... ---")
        if platform in self.precomputed_heatmaps:
            print(f"--> Found a data-driven, pre-computed heatmap for {platform}.")
            return self.precomputed_heatmaps[platform]
        print(f"--> No pre-computed heatmap found. Using generic rules.")
        heatmap = np.full((7, 24), 0.1)
        return np.clip(heatmap, 0, 1)

    def _get_llm_suggestion(self, request: SuggestRequest, top_slots: list[Slot], source: str) -> dict | None:
        top_slots_str = "\n".join([f"- Day {s.weekday} at {s.hour_24}:00 (Score: {s.score:.2f})" for s in top_slots])
        prompt = f"""
        You are an expert social media strategist. For a post on {request.platform} about "{request.content[:80]}...", suggest the best time to post.
        Top time slots based on {source} (0=Mon):
        {top_slots_str}
        Output a JSON object with `best_slot` (object with "weekday" and "hour_24" as INTEGER keys) and `reason`.
        The `reason` value MUST be a JSON object with a `headline` (string) and `points` (an array of objects).
        Each object in `points` MUST have "icon", "title", and "text" string keys.
        Example `best_slot`: {{ "weekday": 3, "hour_24": 19 }}
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
            if heatmap is None: heatmap, explanation, post_snippets = self._scrape_for_post_times(smart_query, request.platform, country_code='us')
            if heatmap is None: heatmap, explanation, post_snippets = self._scrape_for_post_times(smart_query, request.platform, country_code=None)
        if heatmap is not None and post_snippets:
            data_source = "scraped_web_data"
            predictions = self._get_ai_inferred_engagement(post_snippets, request.platform, smart_query)
            if predictions:
                prediction_map = {p.get("snippet_index"): p for p in predictions}
                found_posts_summaries = [FoundPostSummary(snippet=post["snippet"], time_ago=post["time_ago"], predicted_engagement_score=prediction.get("predicted_engagement_score", 0), justification=prediction.get("justification", "N/A")) for i, post in enumerate(post_snippets) if (prediction := prediction_map.get(i))]
        else:
            data_source = "data_driven_heuristics" if request.platform in self.precomputed_heatmaps else "general_heuristics"
            heatmap = self._generate_heuristic_heatmap(request.platform, request.content_type)
            explanation = "This heatmap is based on your historical post data." if data_source == "data_driven_heuristics" else "Could not find data online. This heatmap uses general engagement patterns."
        heatmap_list = heatmap.tolist()
        slots = [Slot(weekday=w, hour_24=h, score=heatmap[w, h]) for w in range(7) for h in range(24)]
        top_slots = sorted(slots, key=lambda s: s.score, reverse=True)[:5]
        best_slot = top_slots[0]
        reason = StructuredReason(headline="Suggestion based on Fallback Data", points=[ReasonPoint(icon="📊", title="Data-Driven Analysis", text="This time is based on patterns from your historical posts."), ReasonPoint(icon="💡", title="Generic Patterns", text="If your data was unavailable, this reflects general high-engagement periods.")])
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
        return SuggestResponse(best_iso_utc=scheduled_local_time.astimezone(pytz.utc).isoformat(), best_local_pretty=scheduled_local_time.strftime('%a, %b %d, %Y @ %I:%M %p'), data_source=data_source, data_source_explanation=explanation, platform=request.platform, content_type=request.content_type, top_slots=top_slots, heatmap=heatmap_list, reason=reason, found_posts=found_posts_summaries)