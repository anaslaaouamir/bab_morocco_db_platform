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

_EMAIL_REGEX = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_EMAIL_BLOCKLIST = ("noreply", "no-reply", "example.com", "test@", "sentry")
_EMAIL_CANDIDATE_PATHS = ("", "/contact", "/contact-us", "/about", "/a-propos")
_SCRAPE_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

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
      Stage 1 — free httpx scrape of a few candidate pages (homepage, /contact, /about, ...)
                for an email via regex (no Apify; website/rating/reviews already come from
                RealGoogleMapsProvider — Google Places Details has no business-email field,
                confirmed against the API)
      Stage 2 — Booking.com / Expedia presence + rating: currently disabled, see
                `_check_ota_presence` for why (both platforms actively block scraping).
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
            # Not the Google rating — Booking.com's own 0-10 rating is what this field
            # means (see scoring.py's `> 8.0` check). We don't have a reliable source for
            # it (see _check_ota_presence), so it stays None rather than mislabeling the
            # Google rating (0-5 scale) as a Booking rating.
            "note_booking": None,
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
        """
        Free scrape: GET a short list of candidate pages and regex-match an email in
        the raw HTML. Each candidate page is tried independently — a failure (timeout,
        403, DNS error) on one page must not prevent trying the others. Returns the
        first valid match found, or "" if none of the candidates yield one.
        """
        base = website.rstrip("/")
        for path in _EMAIL_CANDIDATE_PATHS:
            url = base + path
            try:
                response = await client.get(
                    url,
                    headers={"User-Agent": _SCRAPE_USER_AGENT},
                    timeout=10.0,
                    follow_redirects=True,
                )
                if response.status_code >= 400:
                    continue
                for match in _EMAIL_REGEX.findall(response.text):
                    if not any(bad in match.lower() for bad in _EMAIL_BLOCKLIST):
                        return match
            except httpx.HTTPError as exc:
                logger.debug("Email scrape failed for %r | error=%s", url, exc)
                continue
        return ""

    async def _check_ota_presence(
        self, client: httpx.AsyncClient, domain: str, nom: str
    ) -> bool:
        """
        Hardcoded False — verified directly against both platforms (2026-07-02):
        Booking.com returns an AWS WAF JavaScript challenge (HTTP 202, no real search
        results) on every plain HTTP request; Expedia returns an explicit "Bot or Not?"
        block page (HTTP 429). Neither can be scraped for free without a real/headless
        browser. Left as a stub (not deleted) so this can be swapped for a paid Apify
        actor or a browser-based scraper later without touching enrich()'s call sites.
        See BACKEND_PHASE2_SCAN_PLAN.md Section 8 for the decision this is pending on.
        """
        return False


def get_scan_providers():
    """
    Real providers activate when ENV=production and GOOGLE_MAPS_API_KEY is set.
    APIFY_API_TOKEN is no longer required — every enrichment stage is free
    (httpx scraping / hardcoded stubs, see RealEnrichmentService) as of the
    Section 6-9 revision in BACKEND_PHASE2_SCAN_PLAN.md. The setting is kept
    dormant in config for a possible future paid re-introduction (e.g. a
    dedicated Booking.com actor) rather than removed outright.
    Otherwise mocks — used automatically in development and in the test suite.
    """
    from app.services.mock_providers import MockEnrichmentService, MockGoogleMapsProvider

    if settings.ENV == "production" and settings.GOOGLE_MAPS_API_KEY:
        return RealGoogleMapsProvider(), RealEnrichmentService()
    return MockGoogleMapsProvider(), MockEnrichmentService()
