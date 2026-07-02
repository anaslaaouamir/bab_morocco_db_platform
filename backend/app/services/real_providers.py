"""
RealGoogleMapsProvider and RealEnrichmentService — production replacements for
MockGoogleMapsProvider / MockEnrichmentService (see BACKEND_PHASE2_SCAN_PLAN.md).
Output dict shapes must match the mock providers exactly so scan_pipeline.py
requires no changes beyond awaiting these calls.
"""
import asyncio
import logging
import re

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_PLACES_TEXTSEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
_PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"

_APIFY_BASE_URL = "https://api.apify.com/v2"
_APIFY_CRAWLER_ACTOR = "apify~website-content-crawler"
_APIFY_POLL_INTERVAL_S = 3
_APIFY_RUN_TIMEOUT_S = 60

_EMAIL_REGEX = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_EMAIL_BLOCKLIST = ("noreply", "no-reply", "example.com", "test@", "sentry")

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
                details = await self._fetch_details(client, place.get("place_id", ""))
                results.append({
                    "nom": place.get("name", ""),
                    "adresse_web": details.get("website", ""),
                    "email_contact": "",
                    "ville": ville,
                    "pays": pays,
                    "type": type_partenaire,
                    "place_id": place.get("place_id", ""),
                    "phone": details.get("phone", ""),
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

    async def _fetch_details(self, client: httpx.AsyncClient, place_id: str) -> dict:
        """
        Place Details does not expose a business email field (confirmed against the
        API — only website and phone are available beyond what Text Search already
        returns), so email is sourced entirely via website scraping in
        RealEnrichmentService instead.
        """
        if not place_id:
            return {}
        data = await self._get_json(
            client,
            _PLACES_DETAILS_URL,
            {
                "place_id": place_id,
                "fields": "website,international_phone_number",
                "key": settings.GOOGLE_MAPS_API_KEY,
            },
        )
        if data.get("status") != "OK":
            return {}
        result = data.get("result", {})
        return {
            "website": result.get("website", ""),
            "phone": result.get("international_phone_number", ""),
        }

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


class RealEnrichmentService:
    """
    Enriches a raw place dict (from RealGoogleMapsProvider) with real data:
      Stage 1 — website /contact page crawl for an email (Apify website-content-crawler;
                website/rating/reviews already come from RealGoogleMapsProvider — Google
                Places Details has no business-email field, confirmed against the API)
      Stage 2 — Booking.com / Expedia presence heuristic (HEAD request)
    Any stage failure degrades gracefully — the pipeline never crashes on
    enrichment errors, it just falls back to the raw/default values, matching
    MockEnrichmentService's guaranteed-output-shape contract.
    """

    async def enrich(self, raw: dict) -> dict:
        idx = raw.get("_index", 0)
        enriched = dict(raw)
        enriched.pop("_index", None)
        enriched.pop("place_id", None)
        enriched.pop("phone", None)
        enriched.pop("note_google", None)
        enriched.pop("nb_avis_google", None)

        website = raw.get("adresse_web") or ""
        note = raw.get("note_google")
        reviews_count = raw.get("nb_avis_google") or 0

        async with httpx.AsyncClient(timeout=30.0) as client:
            email = ""
            if website:
                email = await self._scrape_email_from_website(client, website)

            presence_booking = await self._check_ota_presence(client, "booking.com", raw["nom"])
            presence_expedia = await self._check_ota_presence(client, "expedia.com", raw["nom"])

        enriched.update({
            "adresse_web": website,
            "email_contact": email,
            "presence_booking": presence_booking,
            "note_booking": note,
            "presence_expedia": presence_expedia,
            "nb_chambres": None,
            "linkedin_contact": None,
            "nom_contact": "Responsable",
            "poste_contact": "DG",
            "capacite_description": (
                f"{reviews_count} avis Google" if reviews_count else None
            ),
        })
        return enriched

    async def _scrape_email_from_website(self, client: httpx.AsyncClient, website: str) -> str:
        try:
            contact_url = website.rstrip("/") + "/contact"
            run = await self._run_apify_actor(
                client,
                _APIFY_CRAWLER_ACTOR,
                {"startUrls": [{"url": contact_url}, {"url": website}], "maxCrawlPages": 2},
            )
            items = await self._get_dataset_items(client, run)
            for item in items:
                text = item.get("text", "")
                for match in _EMAIL_REGEX.findall(text):
                    if not any(bad in match.lower() for bad in _EMAIL_BLOCKLIST):
                        return match
            return ""
        except Exception as exc:
            logger.warning("Website email scrape failed for %r | error=%s", website, exc)
            return ""

    async def _check_ota_presence(
        self, client: httpx.AsyncClient, domain: str, nom: str
    ) -> bool:
        try:
            response = await client.head(
                f"https://www.{domain}/search.html",
                params={"ss": nom},
                follow_redirects=True,
            )
            path = str(response.url.path).lower()
            marker = "/hotel/" if "booking" in domain else "/h"
            return marker in path
        except httpx.HTTPError:
            return False

    async def _run_apify_actor(
        self, client: httpx.AsyncClient, actor: str, run_input: dict
    ) -> dict:
        start = await client.post(
            f"{_APIFY_BASE_URL}/acts/{actor}/runs",
            params={"token": settings.APIFY_API_TOKEN},
            json=run_input,
        )
        start.raise_for_status()
        run = start.json()["data"]

        elapsed = 0
        while run.get("status") not in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
            if elapsed >= _APIFY_RUN_TIMEOUT_S:
                raise TimeoutError(f"Apify actor {actor} timed out after {elapsed}s")
            await asyncio.sleep(_APIFY_POLL_INTERVAL_S)
            elapsed += _APIFY_POLL_INTERVAL_S
            poll = await client.get(
                f"{_APIFY_BASE_URL}/actor-runs/{run['id']}",
                params={"token": settings.APIFY_API_TOKEN},
            )
            poll.raise_for_status()
            run = poll.json()["data"]

        if run.get("status") != "SUCCEEDED":
            raise RuntimeError(f"Apify actor {actor} finished with status {run.get('status')}")

        return run

    async def _get_dataset_items(self, client: httpx.AsyncClient, run: dict) -> list[dict]:
        dataset_id = run["defaultDatasetId"]
        response = await client.get(
            f"{_APIFY_BASE_URL}/datasets/{dataset_id}/items",
            params={"token": settings.APIFY_API_TOKEN},
        )
        response.raise_for_status()
        return response.json()


def get_scan_providers():
    """
    Same activation gate as the Claude generators: real providers only when
    ENV=production and both required keys are set. Otherwise mocks — used
    automatically in development and in the test suite.
    """
    from app.services.mock_providers import MockEnrichmentService, MockGoogleMapsProvider

    if settings.ENV == "production" and settings.GOOGLE_MAPS_API_KEY and settings.APIFY_API_TOKEN:
        return RealGoogleMapsProvider(), RealEnrichmentService()
    return MockGoogleMapsProvider(), MockEnrichmentService()
