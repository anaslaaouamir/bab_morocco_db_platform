"""
MockGoogleMapsProvider and MockEnrichmentService.
All data is deterministic by seed = hash(ville + type_partenaire).
No external calls are made; no real delays are introduced.
"""
import hashlib
import random
from typing import Any

# ── City/type configuration ───────────────────────────────────────────────────

_CITY_CONFIGS: dict[tuple[str, str], dict[str, Any]] = {
    ("marrakech", "hotel_riad"): {
        "prefixes": ["Riad", "Riad El", "Dar", "Riad Dar"],
        "words": ["Hassan", "Youssef", "Fatima", "Aïcha", "Omar", "Karima",
                  "Zouina", "Mehdi", "Nadia", "Bilal", "Soukaina", "Rachid"],
        "domain": "ma",
        "email_domain": "ma",
        "pays": "Maroc",
    },
    ("dubai", "hotel_luxe"): {
        "prefixes": ["Hotel", "Residence", "Suites", "Palace"],
        "words": ["Al Barsha", "Marina", "Downtown", "DIFC", "JBR",
                  "Palm", "Creek", "Festival", "Jumeirah", "Business Bay"],
        "domain": "com",
        "email_domain": "com",
        "pays": "EAU",
    },
    ("paris", "tour_operateur"): {
        "prefixes": [""],
        "words": ["Martin", "Dubois", "Bernard", "Petit", "Moreau",
                  "Laurent", "Simon", "Michel", "Lefebvre", "Leroy"],
        "suffix": "Voyages",
        "domain": "fr",
        "email_domain": "fr",
        "pays": "France",
    },
    ("casablanca", "agence_voyage"): {
        "prefixes": ["Agence", "Travel", "Tour"],
        "words": ["Atlas", "Sahara", "Maroc", "Soleil", "Horizon",
                  "Bab", "Medina", "Oasis", "Palmier", "Mogador"],
        "suffix": "Travel",
        "domain": "ma",
        "email_domain": "ma",
        "pays": "Maroc",
    },
}

_DEFAULT_CONFIG: dict[str, Any] = {
    "prefixes": ["Hotel", "Lodge", "Resort"],
    "words": ["Alpha", "Beta", "Gamma", "Delta", "Epsilon",
              "Zeta", "Eta", "Theta", "Iota", "Kappa"],
    "domain": "com",
    "email_domain": "com",
}


def _make_seed(ville: str, type_partenaire: str) -> int:
    raw = f"{ville.lower()}_{type_partenaire.lower()}"
    return int(hashlib.md5(raw.encode()).hexdigest(), 16) % (2**31)


def _slugify(text: str) -> str:
    return (
        text.lower()
        .replace(" ", "-")
        .replace("ï", "i")
        .replace("â", "a")
        .replace("é", "e")
        .replace("è", "e")
        .replace("ê", "e")
        .replace("ô", "o")
        .replace("û", "u")
        .replace("à", "a")
        .replace("ç", "c")
        .replace("'", "")
    )


class MockGoogleMapsProvider:
    """
    Generates a deterministic list of raw place results for a given
    (ville, type_partenaire) combination.
    """

    def search(
        self, ville: str, pays: str, type_partenaire: str, limite: int
    ) -> list[dict]:
        key = (ville.lower(), type_partenaire.lower())
        cfg = _CITY_CONFIGS.get(key, _DEFAULT_CONFIG)
        rng = random.Random(_make_seed(ville, type_partenaire))

        results = []
        used_slugs: set[str] = set()

        for i in range(limite):
            prefix = rng.choice(cfg["prefixes"]).strip()
            word = rng.choice(cfg["words"])
            suffix = cfg.get("suffix", "")

            parts = [p for p in [prefix, word, suffix] if p]
            nom = " ".join(parts)

            slug = _slugify(nom)
            # ensure uniqueness within batch
            base_slug = slug
            counter = 0
            while slug in used_slugs:
                counter += 1
                slug = f"{base_slug}-{counter}"
            used_slugs.add(slug)

            domain = cfg["domain"]
            email_domain = cfg["email_domain"]
            adresse_web = f"https://{slug}.{domain}"
            email_contact = f"contact@{slug}.{email_domain}"

            results.append({
                "nom": nom,
                "adresse_web": adresse_web,
                "email_contact": email_contact,
                "ville": ville,
                "pays": pays,
                "type": type_partenaire,
                "_index": i,
                "_rng_state": rng.getstate(),
            })

        return results


class MockEnrichmentService:
    """
    Simulates web scraping and enrichment for each raw place.
    Uses index parity to produce a deterministic mix of high/low quality:
      even index → good attributes (outreach territory)
      odd  index → poor attributes (veille territory)
    """

    def enrich(self, raw: dict) -> dict:
        idx = raw.get("_index", 0)
        enriched = dict(raw)

        # Remove internal keys
        enriched.pop("_index", None)
        enriched.pop("_rng_state", None)

        if idx % 2 == 0:
            # High-quality prospect
            enriched["presence_booking"] = True
            enriched["note_booking"] = 8.5 + (idx % 10) * 0.1
            enriched["presence_expedia"] = True
            enriched["nb_chambres"] = 30 + idx * 3
            enriched["linkedin_contact"] = f"https://linkedin.com/in/{_slugify(raw['nom'])}"
            enriched["nom_contact"] = "Directeur Général"
            enriched["poste_contact"] = "DG"
            enriched["capacite_description"] = None
        else:
            # Low-quality prospect
            enriched["presence_booking"] = False
            enriched["note_booking"] = None
            enriched["presence_expedia"] = False
            enriched["nb_chambres"] = 4
            enriched["linkedin_contact"] = None
            enriched["nom_contact"] = "Responsable"
            enriched["poste_contact"] = "Gérant"
            enriched["capacite_description"] = None

        return enriched
