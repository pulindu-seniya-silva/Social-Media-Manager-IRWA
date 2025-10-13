import os
import json
import numpy as np
from datetime import datetime, timedelta
import pytz
from openai import OpenAI
from dotenv import load_dotenv

from app.models.post_scheduler import SuggestRequest, SuggestResponse, Slot

# Load environment variables from .env file
load_dotenv()

class PostSchedulerAgent:
    """Agent responsible for suggesting the best time to post."""

    def __init__(self):
        self.llm_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    def _generate_heuristic_heatmap(self, platform: str, content_type: str) -> np.ndarray:
        """Generates a basic 7x24 heatmap based on general platform knowledge."""
        # Start with a base of low engagement
        heatmap = np.full((7, 24), 0.1)

        # General rules (Weekdays: Mon=0, Sun=6)
        weekend_days = [5, 6]
        weekdays = [0, 1, 2, 3, 4]

        # Lunchtime (12-2 PM) and Evening (6-9 PM) boosts
        heatmap[:, 12:14] += 0.2
        heatmap[:, 18:21] += 0.25

        # Platform-specific adjustments
        if platform == "LinkedIn":
            heatmap[weekdays, 9:17] += 0.4 # Business hours
            heatmap[weekend_days, :] *= 0.3 # Lower weekend engagement
        elif platform in ["Instagram", "TikTok"]:
            heatmap[weekend_days, 11:22] += 0.3 # Weekends are prime time
            heatmap[:, 20:23] += 0.2 # Late evening scroll
            if content_type in ["reel", "short", "video"]:
                 heatmap *= 1.2 # Boost for video content
        elif platform == "X (Twitter)":
            heatmap[:, 8:22] += 0.15 # Generally active throughout the day

        # Normalize heatmap to be between 0 and 1
        return np.clip(heatmap, 0, 1)

    def _get_llm_suggestion(self, request: SuggestRequest, top_slots: list[Slot]) -> dict:
        """Queries an LLM to get a refined suggestion and a reason."""
        top_slots_str = "\n".join([
            f"- {s.weekday} at {s.hour_24}:00 (Score: {s.score:.2f})" for s in top_slots
        ])

        prompt = f"""
        You are an expert social media strategist. Your task is to analyze a post and suggest the absolute best time to publish it.

        **Post Context:**
        - **Platform:** {request.platform}
        - **Content Type:** {request.content_type}
        - **Target Timezone:** {request.timezone}
        - **Post Content:** "{request.content[:500]}..."

        **Initial Analysis (Based on general platform traffic):**
        Here are the top 5 generally good time slots for this platform (Weekday 0=Monday, 6=Sunday):
        {top_slots_str}

        **Your Task:**
        1.  **Analyze the Post Content:** Based on the text, what is the topic? Who is the likely audience? Is it time-sensitive?
        2.  **Refine the Timing:** Considering the content, the platform, and the general best times, pick the single best slot (weekday and hour). You can choose one from the list or a different one if you have a strong reason.
        3.  **Provide a Rationale:** Briefly explain *why* your chosen time is the best for this specific post.

        **Output Format:**
        Provide your response as a JSON object with two keys: `best_slot` (an object with `weekday` and `hour_24`) and `reason` (a string).
        Example:
        {{
          "best_slot": {{ "weekday": 4, "hour_24": 19 }},
          "reason": "This post about weekend travel plans will perform best on Friday evening as people are planning their weekends."
        }}
        """

        try:
            response = self.llm_client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.5,
            )
            data = json.loads(response.choices[0].message.content)
            # Basic validation of the returned data
            if 'best_slot' in data and 'weekday' in data['best_slot']:
                return data
        except Exception as e:
            print(f"LLM suggestion failed: {e}")
        return None # Return None on failure


    def suggest_best_time(self, request: SuggestRequest) -> SuggestResponse:
        """Main method to orchestrate the time suggestion process."""
        # 1. Generate the base heuristic heatmap
        heatmap = self._generate_heuristic_heatmap(request.platform, request.content_type)
        heatmap_list = heatmap.tolist()

        # 2. Find the top 5 slots from the heatmap to feed to the LLM
        slots = []
        for w in range(7):
            for h in range(24):
                slots.append(Slot(weekday=w, hour_24=h, score=heatmap[w, h]))
        
        # Sort slots by score, descending
        top_slots = sorted(slots, key=lambda s: s.score, reverse=True)[:5]
        
        # 3. Use LLM to refine the choice if strategy is 'llm'
        llm_reason = "Suggestion based on general platform engagement patterns."
        best_slot = top_slots[0] # Default to the best heuristic slot

        if request.strategy == "llm" and request.content:
            llm_result = self._get_llm_suggestion(request, top_slots)
            if llm_result:
                llm_slot_data = llm_result['best_slot']
                best_slot = Slot(
                    weekday=llm_slot_data['weekday'],
                    hour_24=llm_slot_data['hour_24'],
                    score=1.0 # Give the LLM choice the top score
                )
                llm_reason = llm_result['reason']
                # Boost the LLM's chosen slot in the heatmap for visualization
                heatmap_list[best_slot.weekday][best_slot.hour_24] = 1.0

        # 4. Convert the best local time slot to a future UTC datetime
        target_tz = pytz.timezone(request.timezone)
        now_in_tz = datetime.now(target_tz)
        
        # Find the next occurrence of the target weekday and hour
        days_to_add = (best_slot.weekday - now_in_tz.weekday() + 7) % 7
        
        scheduled_local_time = now_in_tz.replace(
            hour=best_slot.hour_24, minute=0, second=0, microsecond=0
        ) + timedelta(days=days_to_add)

        # If the calculated time is in the past, move it to the next week
        if scheduled_local_time < now_in_tz:
            scheduled_local_time += timedelta(days=7)

        # 5. Format the dates for the response
        best_iso_utc = scheduled_local_time.astimezone(pytz.utc).isoformat()
        best_local_pretty = scheduled_local_time.strftime('%a, %b %d, %Y @ %I:%M %p')

        return SuggestResponse(
            best_iso_utc=best_iso_utc,
            best_local_pretty=best_local_pretty,
            platform=request.platform,
            content_type=request.content_type,
            top_slots=top_slots,
            heatmap=heatmap_list,
            reason=llm_reason,
        )