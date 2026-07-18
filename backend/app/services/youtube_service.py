"""YouTube recipe video lookup — ported from Eatvisor youtubeService.js.

Uses YOUTUBE_API_KEY when set; otherwise returns curated Indian cooking fallbacks.
Results are cached in-memory for 24h to keep API usage low.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_TTL = 24 * 3600

_FALLBACK = [
    {
        "videoId": "Vy5rqzxKFbU",
        "title": "Healthy Indian Breakfast for Weight Loss",
        "thumbnail": "https://i.ytimg.com/vi/Vy5rqzxKFbU/mqdefault.jpg",
        "channel": "Healthy Recipes",
    },
    {
        "videoId": "9Mq7gdVMhBk",
        "title": "Diabetes-Friendly Meals | Complete Day Plan",
        "thumbnail": "https://i.ytimg.com/vi/9Mq7gdVMhBk/mqdefault.jpg",
        "channel": "Health Coach",
    },
    {
        "videoId": "IkP97uCJ2L8",
        "title": "High Protein Vegetarian Meal Prep",
        "thumbnail": "https://i.ytimg.com/vi/IkP97uCJ2L8/mqdefault.jpg",
        "channel": "Fit Kitchen",
    },
    {
        "videoId": "7e-NxACJhNM",
        "title": "Easy Low Calorie Dinner Ideas",
        "thumbnail": "https://i.ytimg.com/vi/7e-NxACJhNM/mqdefault.jpg",
        "channel": "Nutrition Guide",
    },
]


def search_videos(query: str, max_results: int = 3) -> list[dict[str, Any]]:
    key = (query or "healthy indian meal").lower().strip()[:100]
    now = time.time()
    cached = _CACHE.get(key)
    if cached and now - cached[0] < _TTL:
        return cached[1][:max_results]

    if not settings.youtube_api_key:
        return _FALLBACK[:max_results]

    try:
        with httpx.Client(timeout=10.0) as client:
            res = client.get(
                "https://www.googleapis.com/youtube/v3/search",
                params={
                    "part": "snippet",
                    "q": query,
                    "type": "video",
                    "maxResults": max_results,
                    "key": settings.youtube_api_key,
                    "relevanceLanguage": "en",
                    "regionCode": "IN",
                },
            )
            res.raise_for_status()
            items = res.json().get("items") or []
        videos = [
            {
                "videoId": it["id"]["videoId"],
                "title": it["snippet"]["title"],
                "thumbnail": (
                    (it["snippet"].get("thumbnails") or {}).get("medium")
                    or (it["snippet"].get("thumbnails") or {}).get("default")
                    or {}
                ).get("url"),
                "channel": it["snippet"].get("channelTitle"),
                "url": f"https://www.youtube.com/watch?v={it['id']['videoId']}",
            }
            for it in items
            if it.get("id", {}).get("videoId")
        ]
        if not videos:
            videos = _FALLBACK[:max_results]
        _CACHE[key] = (now, videos)
        return videos[:max_results]
    except Exception as exc:
        logger.warning("YouTube search failed (fallback): %s", exc)
        return _FALLBACK[:max_results]
