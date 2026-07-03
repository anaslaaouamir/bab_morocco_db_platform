"""
RealGoogleMapsProvider and RealEnrichmentService — production replacements for
MockGoogleMapsProvider / MockEnrichmentService (see BACKEND_PHASE2_SCAN_PLAN.md).
Output dict shapes must match the mock providers exactly so scan_pipeline.py
requires no changes beyond awaiting these calls.

Enrichment strategy (see SCRAPING_ENRICHMENT_SCORING_PLAN.md Section 4): a plain
httpx GET runs first on every prospect site — fast and free, and sufficient for
most real sites. A Playwright-rendered fetch only runs as a fallback, triggered
per-site when httpx found neither an email nor a phone, or when the httpx
response looks like a thin JS shell (real content loaded client-side, invisible
to a plain GET). This was validated against 10 real prospect sites across 5
partner types: httpx averaged ~3.7s/site vs Playwright's ~13.2s/site, so the
fallback is deliberately conditional, not a default path.
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
_EMAIL_BLOCKLIST = ("noreply", "no-reply", "example.com", "test@", "sentry", "wixpress")
_EMAIL_BAD_EXTENSIONS = (".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif", ".ico")
_EMAIL_CANDIDATE_PATHS = ("", "/contact", "/contact-us", "/about", "/a-propos")
_SCRAPE_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# Requires a leading "+" or "00" country-code marker (real GPS coordinates found
# embedded in map widgets during testing never carry this) — see _valid_phone
# for the second layer of the same defense.
_PHONE_REGEX = re.compile(r"(?:\+\d{1,3}|00\d{1,3})[\s.\-]?(?:\(?\d{1,4}\)?[\s.\-]?){2,5}\d{2,4}")

_CTA_WORDS = (
    "book now", "réserver", "reserver", "réservation en ligne",
    "request a quote", "demander un devis", "check availability",
    "vérifier la disponibilité", "get a quote",
)
_SOCIAL_DOMAINS: dict[str, str] = {
    "instagram.com": "instagram",
    "facebook.com": "facebook",
    "linkedin.com/company": "linkedin",
    "tiktok.com": "tiktok",
    "wa.me": "whatsapp",
    "whatsapp.com": "whatsapp",
    "youtube.com": "youtube",
}
_LANG_PATH_HINTS = ("/en/", "/fr/", "/es/", "/de/", "/ar/")
_LANG_HREFLANG_RE = re.compile(r'hreflang=["\'](\w{2})', re.I)
_TARGET_LANGS = {"fr", "en", "es", "de", "ar"}

# Thin-shell heuristic — calibrated from one real failure case (a JS-rendered
# transport-company site returned 10,123 chars via httpx while every legitimate
# content-bearing page in the same test sample measured 29,939+ chars). Not
# final — validate against a larger sample before trusting this number long-term.
_THIN_HTML_THRESHOLD = 15_000
_PLAYWRIGHT_TIMEOUT_MS = 8_000
_PLAYWRIGHT_SETTLE_MS = 1_000

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


def _valid_phone(match: str) -> bool:
    """
    Second layer of GPS-coordinate rejection (first layer is the +/00 prefix
    requirement in _PHONE_REGEX itself). A real phone number's digit count
    falls in a plausible international range and never has 5+ digits after a
    single decimal point — GPS coordinates like "9.3251406" do.
    """
    digits = re.sub(r"\D", "", match)
    if not (10 <= len(digits) <= 15):
        return False
    if re.search(r"\.\d{5,}", match):
        return False
    return True


def _extract_page_signals(html: str, url: str) -> dict:
    """
    Pulls every type-agnostic signal out of one already-fetched page in a
    single pass — no extra requests. Used identically on httpx-fetched and
    Playwright-fetched HTML (see SCRAPING_ENRICHMENT_SCORING_PLAN.md Section 4).
    """
    if not html:
        return {}
    low = html.lower()

    email = ""
    for m in _EMAIL_REGEX.findall(html):
        ml = m.lower()
        if any(bad in ml for bad in _EMAIL_BLOCKLIST):
            continue
        if ml.endswith(_EMAIL_BAD_EXTENSIONS):
            continue
        email = m
        break

    phone = ""
    for m in _PHONE_REGEX.findall(html):
        if _valid_phone(m):
            phone = m.strip()
            break

    socials = sorted({label for domain, label in _SOCIAL_DOMAINS.items() if domain in low})

    langs = {m.lower() for m in _LANG_HREFLANG_RE.findall(html)} & _TARGET_LANGS
    langs |= {p.strip("/") for p in _LANG_PATH_HINTS if p in low}

    return {
        "email": email,
        "phone": phone,
        "https_actif": url.startswith("https://"),
        "cta_reservation_present": any(word in low for word in _CTA_WORDS),
        "formulaire_contact_present": "<form" in low and ("email" in low or "contact" in low),
        "reseaux_sociaux": ",".join(socials) if socials else None,
        "langues_disponibles": ",".join(sorted(langs)) if langs else None,
        "_html_len": len(html),
    }


class RealGoogleMapsProvider:
    """
    Queries the legacy Google Places API — Text Search — for real places
    matching (ville, type_partenaire). Paginates via next_page_token until
    `limite` results are collected or the API is exhausted. For each result,
    fetches the website, phone, and business status via a Place Details call
    (Text Search does not return these).
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
                    "business_status": details.get("business_status") or None,
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
        API — only website, phone, and business_status are available beyond what
        Text Search already returns), so email is sourced entirely via website
        scraping in RealEnrichmentService instead.
        """
        if not place_id:
            return {}
        data = await self._get_json(
            client,
            _PLACES_DETAILS_URL,
            {
                "place_id": place_id,
                "fields": "website,international_phone_number,business_status",
                "key": settings.GOOGLE_MAPS_API_KEY,
            },
        )
        if data.get("status") != "OK":
            return {}
        result = data.get("result", {})
        return {
            "website": result.get("website", ""),
            "phone": result.get("international_phone_number", ""),
            "business_status": result.get("business_status", ""),
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
      Stage 1 — free httpx scrape of a few candidate pages (homepage, /contact, /about, ...),
                extracting email, phone, and every type-agnostic signal (HTTPS, booking CTA,
                social links, published languages, contact form) from each page fetched.
      Stage 2 — Playwright fallback: only runs when Stage 1 found neither an email nor a
                phone, or when the homepage response looks like a thin JS shell (see
                _THIN_HTML_THRESHOLD). Re-extracts every signal from the rendered page and
                fully replaces Stage 1's results when it succeeds.
      Stage 3 — Booking.com / Expedia presence: hardcoded False, see `_check_ota_presence`
                (both platforms actively block scraping — unchanged from prior findings).
    Any stage failure degrades gracefully — the pipeline never crashes on
    enrichment errors, it just falls back to the raw/default values, matching
    MockEnrichmentService's guaranteed-output-shape contract.
    """

    async def enrich(self, raw: dict, browser=None) -> dict:
        enriched = dict(raw)
        enriched.pop("_index", None)
        enriched.pop("place_id", None)
        enriched.pop("phone", None)

        website = raw.get("adresse_web") or ""
        phone_google = raw.get("phone") or ""
        reviews_count = raw.get("nb_avis_google") or 0

        signals: dict = {}
        homepage_len = 0

        async with httpx.AsyncClient(timeout=30.0) as client:
            if website:
                signals, homepage_len = await self._gather_page_signals(client, website)

            presence_booking = await self._check_ota_presence(client, "booking.com", raw["nom"])
            presence_expedia = await self._check_ota_presence(client, "expedia.com", raw["nom"])

        if website:
            needs_fallback = (
                (not signals.get("email") and not signals.get("phone") and not phone_google)
                or homepage_len < _THIN_HTML_THRESHOLD
            )
            if needs_fallback:
                pw_html = await self._fetch_with_playwright(website, browser)
                if pw_html:
                    pw_signals = _extract_page_signals(pw_html, website)
                    signals = {k: v for k, v in pw_signals.items() if k != "_html_len"}

        telephone = phone_google or signals.get("phone") or None

        enriched.update({
            "adresse_web": website,
            "email_contact": signals.get("email") or "",
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
            "note_google": raw.get("note_google"),
            "nb_avis_google": raw.get("nb_avis_google"),
            "telephone": telephone,
            "business_status": raw.get("business_status"),
            "https_actif": signals.get("https_actif"),
            "cta_reservation_present": signals.get("cta_reservation_present"),
            "formulaire_contact_present": signals.get("formulaire_contact_present"),
            "reseaux_sociaux": signals.get("reseaux_sociaux"),
            "langues_disponibles": signals.get("langues_disponibles"),
        })
        return enriched

    async def _gather_page_signals(self, client: httpx.AsyncClient, website: str) -> tuple[dict, int]:
        """
        Fetches the homepage plus (only while email is still missing) a few
        contact-page candidates, merging type-agnostic signals across every page
        actually fetched. Returns the merged signals plus the homepage's raw HTML
        length — the length feeds the thin-shell Playwright-fallback check in
        enrich(), so it's tracked from the homepage specifically, not the total.
        """
        base = website.rstrip("/")
        merged: dict = {
            "email": "", "phone": "", "https_actif": None,
            "cta_reservation_present": None, "formulaire_contact_present": None,
            "reseaux_sociaux": None, "langues_disponibles": None,
        }
        homepage_len = 0

        for i, path in enumerate(_EMAIL_CANDIDATE_PATHS):
            if i > 0 and merged["email"]:
                break  # only keep hunting extra pages while email is still missing
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
                html = response.text
            except httpx.HTTPError as exc:
                logger.debug("Page fetch failed for %r | error=%s", url, exc)
                continue

            if i == 0:
                homepage_len = len(html)

            page_signals = _extract_page_signals(html, url)
            for key in ("email", "phone", "reseaux_sociaux", "langues_disponibles"):
                if not merged.get(key) and page_signals.get(key):
                    merged[key] = page_signals[key]
            for key in ("https_actif", "cta_reservation_present", "formulaire_contact_present"):
                if merged.get(key) is None and page_signals.get(key) is not None:
                    merged[key] = page_signals[key]

        return merged, homepage_len

    async def _fetch_with_playwright(self, url: str, browser=None) -> str:
        """
        Headless-browser fallback for JS-rendered sites httpx can't see. Uses
        wait_until="load" rather than "networkidle" — confirmed in testing that
        many real sites (chat widgets, analytics beacons) never go network-idle,
        which caused false timeouts. Never raises — any failure (timeout, block,
        crash) degrades to "" and the caller keeps whatever httpx already found.

        `browser` is an optional shared Playwright Browser instance (passed by
        the scan pipeline — see SCRAPING_ENRICHMENT_SCORING_PLAN.md Section 6, one
        browser per scan job rather than one per prospect). When not provided,
        launches and closes its own instance for standalone use.
        """
        from playwright.async_api import async_playwright

        owns_browser = browser is None
        pw_ctx = None
        try:
            if owns_browser:
                pw_ctx = await async_playwright().start()
                browser = await pw_ctx.chromium.launch(headless=True)

            page = await browser.new_page(user_agent=_SCRAPE_USER_AGENT)
            try:
                await page.goto(url, timeout=_PLAYWRIGHT_TIMEOUT_MS, wait_until="load")
                await page.wait_for_timeout(_PLAYWRIGHT_SETTLE_MS)
                html = await page.content()
            finally:
                await page.close()
            return html
        except Exception as exc:
            logger.debug("Playwright fallback failed for %r | error=%s", url, exc)
            return ""
        finally:
            if owns_browser and pw_ctx is not None:
                if browser is not None:
                    await browser.close()
                await pw_ctx.stop()

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
    (httpx scraping, Playwright fallback, hardcoded stubs — see
    RealEnrichmentService) as of BACKEND_PHASE2_SCAN_PLAN.md's Section 6-9
    revision and SCRAPING_ENRICHMENT_SCORING_PLAN.md Section 4. The setting is
    kept dormant in config for a possible future paid re-introduction rather
    than removed outright.
    Otherwise mocks — used automatically in development and in the test suite.
    """
    from app.services.mock_providers import MockEnrichmentService, MockGoogleMapsProvider

    if settings.ENV == "production" and settings.GOOGLE_MAPS_API_KEY:
        return RealGoogleMapsProvider(), RealEnrichmentService()
    return MockGoogleMapsProvider(), MockEnrichmentService()
