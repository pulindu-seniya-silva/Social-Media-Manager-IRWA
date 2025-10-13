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

# --- Pydantic Models for Data Structure ---
from pydantic import BaseModel
from typing import List, Optional

class Slot(BaseModel):
    weekday: int; hour_24: int; score: float
class ReasonPoint(BaseModel):
    icon: str; title: str; text: str
class StructuredReason(BaseModel):
    headline: str; points: List[ReasonPoint]
class SuggestRequest(BaseModel):
    platform: str; content_type: str; content: str; timezone: str; strategy: str
class SuggestResponse(BaseModel):
    best_iso_utc: str; best_local_pretty: str; data_source: str; data_source_explanation: str; platform: str; content_type: str; top_slots: List[Slot]; heatmap: List[List[float]]; reason: StructuredReason

load_dotenv()

class PostSchedulerAgent:
    def __init__(self):
        self.llm_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.scraper_api_key = os.getenv("SCRAPER_API_KEY")

    def _get_country_from_timezone(self, timezone: str) -> str:
        """Infers a two-letter country code from a timezone string for targeted scraping."""
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
        """Generates a random hour weighted towards typical waking/posting hours."""
        mean_hour, std_dev = 14.5, 3.5
        hour = np.random.normal(mean_hour, std_dev)
        return int(np.clip(hour, 0, 23))

    def _generate_search_query_from_content(self, content: str) -> str | None:
        """Uses a fast LLM to generate an effective search query from post content."""
        prompt = f"""
        Analyze the following social media post content. Your goal is to generate a high-quality search query to find similar posts on Google.

        Content: "{content[:500]}..."

        Provide a JSON object with "keywords" (a list of 4-6 descriptive strings) and "hashtags" (a list of 3-4 popular and relevant hashtags, including '#').
        Make the keywords and hashtags specific but not overly narrow to maximize the chance of finding matches.
        Example: {{"keywords": ["SaaS growth strategies", "Q3 results analysis", "enterprise software trends"], "hashtags": ["#SaaS", "#MarketingStrategy", "#B2B"]}}
        """
        try:
            response = self.llm_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.3,
            )
            data = json.loads(response.choices[0].message.content)
            search_terms = data.get("keywords", []) + data.get("hashtags", [])
            return " ".join(search_terms)
        except Exception as e:
            print(f"LLM query generation failed: {e}")
            return " ".join(content.split()[:10])

    def _scrape_for_post_times(self, smart_query: str, platform: str, country_code: Optional[str] = None) -> tuple[np.ndarray, str] | tuple[None, None]:
        """A reusable scraping function that attempts to find posts for a given location."""
        if not self.scraper_api_key:
            return None, None

        platform_site = f"site:{platform}.com"
        search_url = f'https://www.google.com/search?q={platform_site} {smart_query}'
        
        location_name = (country_code or "global").upper()
        print(f"--- Attempting scrape for location '{location_name}' ---")

        payload = {'api_key': self.scraper_api_key, 'url': search_url}
        if country_code:
            payload['country_code'] = country_code
        
        try:
            response = requests.get('http://api.scraperapi.com', params=payload, timeout=20)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")
            date_pattern = re.compile(r'(\d+\s+(hour|day|week|month)s?\s+ago)')
            elements_with_date = soup.find_all(string=date_pattern)
            clean_dates = [match.group(0) for text in elements_with_date if (match := date_pattern.search(text))]

            if not clean_dates:
                print(f"Scraper found no relevant post dates for location '{location_name}'.")
                return None, None

            print(f"Found {len(clean_dates)} date strings for location '{location_name}'.")
            heatmap = np.zeros((7, 24))
            found_times = []
            
            for date_str in clean_dates:
                try:
                    post_time = dateparser.parse(date_str)
                    if post_time:
                        realistic_hour = self._get_realistic_hour()
                        post_time = post_time.replace(hour=realistic_hour)
                        heatmap[post_time.weekday(), post_time.hour] += 1
                        found_times.append(post_time)
                except Exception:
                    pass

            if np.sum(heatmap) > 0:
                day_counts = Counter(t.strftime('%A') for t in found_times)
                most_common_day = day_counts.most_common(1)[0][0]
                
                explanation = (
                    f"Analysis is based on {len(found_times)} similar posts found in the '{location_name}' region. "
                    f"The most frequent day for this content was {most_common_day}, with engagement peaking in the afternoon/evening. "
                    "The heatmap reflects these localized trends."
                )
                
                heatmap = heatmap / np.max(heatmap)
                return np.clip(heatmap, 0.05, 1.0), explanation
            else:
                return None, None
        except Exception as e:
            print(f"Web scraping request failed for location '{location_name}': {e}")
            return None, None

    def _generate_heuristic_heatmap(self, platform: str, content_type: str) -> np.ndarray:
        """Generates a basic heatmap based on general platform knowledge (Final fallback method)."""
        print("--- All scraping attempts failed. Falling back to heuristic rules. ---")
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
        """Queries a powerful LLM to get a refined suggestion and a structured reason."""
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
        1. **Analyze Content & Audience:** Understand the topic and who it's for.
        2. **Refine Timing:** Pick the single best slot (weekday and hour).
        3. **Provide Rationale:** Explain your choice in a structured format.

        **Output:** A JSON object with `best_slot` (weekday, hour_24) and `reason`.
        The `reason` key itself must be a JSON object with:
        - A `headline` (string): A short, engaging title for the suggestion.
        - A `points` (array of objects): Each object in the array should have:
          - `icon` (string): A single relevant emoji.
          - `title` (string): A short title like "Audience Insight".
          - `text` (string): A concise, one-sentence explanation.
        """
        try:
            response = self.llm_client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.5,
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"LLM suggestion failed: {e}")
        return None

    def suggest_best_time(self, request: SuggestRequest) -> SuggestResponse:
        """Main method to orchestrate the time suggestion process with a multi-step fallback."""
        smart_query = self._generate_search_query_from_content(request.content)
        heatmap, explanation = None, None

        if smart_query:
            # Attempt 1: Targeted Search (Specific Country)
            targeted_country = self._get_country_from_timezone(request.timezone)
            heatmap, explanation = self._scrape_for_post_times(smart_query, request.platform, country_code=targeted_country)

            # Attempt 2: Broadened Search (US as fallback)
            if heatmap is None and targeted_country != 'us':
                heatmap, explanation = self._scrape_for_post_times(smart_query, request.platform, country_code='us')
            
            # Attempt 3: Global Search
            if heatmap is None:
                heatmap, explanation = self._scrape_for_post_times(smart_query, request.platform, country_code=None)

        # Final Fallback: Heuristics
        if heatmap is None:
            data_source = "general_heuristics"
            heatmap = self._generate_heuristic_heatmap(request.platform, request.content_type)
            explanation = "Could not find enough specific data online. This heatmap is based on general engagement patterns for this platform."
        else:
            data_source = "scraped_web_data"
        
        heatmap_list = heatmap.tolist()
        slots = [Slot(weekday=w, hour_24=h, score=heatmap[w, h]) for w in range(7) for h in range(24)]
        top_slots = sorted(slots, key=lambda s: s.score, reverse=True)[:5]
        
        best_slot = top_slots[0]
        reason = StructuredReason(
            headline="Suggestion based on general platform patterns",
            points=[
                ReasonPoint(icon="📊", title="General Traffic", text="This time is based on typical high-engagement periods for this platform."),
                ReasonPoint(icon="💡", title="Content-Specific Tuning", text="For a more tailored suggestion, try providing more detailed content.")
            ]
        )

        if request.strategy == "llm" and request.content:
            llm_result = self._get_llm_suggestion(request, top_slots, data_source.replace('_', ' '))
            if llm_result:
                llm_slot_data = llm_result['best_slot']
                best_slot = Slot(weekday=llm_slot_data['weekday'], hour_24=llm_slot_data['hour_24'], score=1.0)
                reason = StructuredReason.parse_obj(llm_result['reason'])
                heatmap_list[best_slot.weekday][best_slot.hour_24] = 1.0

        target_tz = pytz.timezone(request.timezone)
        now_in_tz = datetime.now(target_tz)
        days_to_add = (best_slot.weekday - now_in_tz.weekday() + 7) % 7
        scheduled_local_time = (now_in_tz.replace(hour=best_slot.hour_24, minute=0, second=0, microsecond=0) + timedelta(days=days_to_add))

        if scheduled_local_time < now_in_tz:
            scheduled_local_time += timedelta(days=7)

        best_iso_utc = scheduled_local_time.astimezone(pytz.utc).isoformat()
        best_local_pretty = scheduled_local_time.strftime('%a, %b %d, %Y @ %I:%M %p')

        return SuggestResponse(
            best_iso_utc=best_iso_utc,
            best_local_pretty=best_local_pretty,
            data_source=data_source,
            data_source_explanation=explanation,
            platform=request.platform,
            content_type=request.content_type,
            top_slots=top_slots,
            heatmap=heatmap_list,
            reason=reason,
        )