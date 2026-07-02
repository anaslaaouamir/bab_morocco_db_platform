"""
RealGoogleMapsProvider and RealEnrichmentService — production replacements for
MockGoogleMapsProvider / MockEnrichmentService (see BACKEND_PHASE2_SCAN_PLAN.md).
Output dict shapes must match the mock providers exactly so scan_pipeline.py
requires no changes beyond awaiting these calls.
"""
import asyncio
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_PLACES_TEXTSEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
_PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"

_QUERY_TEMPLATES: dict[str, str] = {
    "hotel_riad": "riad hotel {ville} {pays}",
    "hotel_luxe": "luxury 5 star hotel {ville} {pays}",
    "tour_operateur": "tour operator travel agency {ville} {pays}",
    "agence_voyage": "agence de voyage {ville} {pays}",
    "prestataire_activites": "activities experiences tours {ville} {pays}",
    "transport": "airport transfer shuttle {ville} {pays}",
    "to_golfe": "tour operator {ville} {pays}",
    "mice": "MICE incentive event agency {ville} {pays}",
}
_DEFAULT_QUERY_TEMPLATE = "hotel {ville} {pays}"

_MAX_PAGE_SIZE = 20


class RealGoogleMapsProvider:
    """
    Queries the legacy Google Places API — Text Search — for real places
    matching (ville, type_partenaire). Paginates via next_page_token until
    `limite` results are collected or the API is exhausted. For each result,
    fetches the website via a Place Details call (Text Search does not
    return it).
    """

    async def search(
        self, ville: str, pays: str, type_partenaire: str, limite: int
    ) -> list[dict]:
        query_template = _QUERY_TEMPLATES.get(type_partenaire, _DEFAULT_QUERY_TEMPLATE)
        text_query = query_template.format(ville=ville, pays=pays)

        raw_places: list[dict] = []
        page_token: str | None = None

        async with httpx.AsyncClient(timeout=30.0) as client:
            while len(raw_places) < limite:
                params: dict = {"query": text_query, "key": settings.GOOGLE_MAPS_API_KEY}
                if page_token:
                    # Google requires a short delay before a page token becomes valid.
                    await asyncio.sleep(2)
                    params["pagetoken"] = page_token

                data = await self._search_page_with_retry(client, params, limite - len(raw_places))
                status = data.get("status")
                if status not in ("OK", "ZERO_RESULTS"):
                    raise RuntimeError(
                        f"Google Places Text Search failed: {status} — {data.get('error_message', '')}"
                    )

                places = data.get("results", [])
                raw_places.extend(places[: limite - len(raw_places)])

                page_token = data.get("next_page_token")
                if not page_token or not places:
                    break

            results: list[dict] = []
            for i, place in enumerate(raw_places):
                website = await self._fetch_website(client, place.get("place_id", ""))
                results.append({
                    "nom": place.get("name", ""),
                    "adresse_web": website,
                    "email_contact": "",
                    "ville": ville,
                    "pays": pays,
                    "type": type_partenaire,
                    "place_id": place.get("place_id", ""),
                    "note_google": place.get("rating"),
                    "nb_avis_google": place.get("user_ratings_total", 0),
                    "_index": i,
                })

        return results

    async def _search_page_with_retry(
        self, client: httpx.AsyncClient, params: dict, wanted: int, max_attempts: int = 6
    ) -> dict:
        """
        Google's legacy Text Search endpoint is occasionally flaky — the exact
        same request can non-deterministically return a truncated result set
        (observed: 20 results on one call, 1 on the next, same params). Retry
        a few times when the page looks suspiciously short relative to what
        was asked for, keeping the best (longest) response seen.
        """
        best: dict | None = None
        for attempt in range(max_attempts):
            data = await self._get_json(client, _PLACES_TEXTSEARCH_URL, params)
            if data.get("status") not in ("OK", "ZERO_RESULTS"):
                return data  # let the caller raise on real errors

            count = len(data.get("results", []))
            if best is None or count > len(best.get("results", [])):
                best = data

            if count >= min(wanted, _MAX_PAGE_SIZE) or attempt == max_attempts - 1:
                break
            await asyncio.sleep(1)

        return best

    async def _fetch_website(self, client: httpx.AsyncClient, place_id: str) -> str:
        if not place_id:
            return ""
        data = await self._get_json(
            client,
            _PLACES_DETAILS_URL,
            {"place_id": place_id, "fields": "website", "key": settings.GOOGLE_MAPS_API_KEY},
        )
        if data.get("status") != "OK":
            return ""
        return data.get("result", {}).get("website", "")

    async def _get_json(self, client: httpx.AsyncClient, url: str, params: dict) -> dict:
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Google Places API HTTP error | status=%s | body=%.300s",
                exc.response.status_code, exc.response.text,
            )
            raise RuntimeError(
                f"Google Places API request failed: {exc.response.status_code} {exc.response.text[:200]}"
            ) from exc
        except httpx.HTTPError as exc:
            logger.error("Google Places API network error | error=%s", exc)
            raise RuntimeError(f"Google Places API network error: {exc}") from exc
