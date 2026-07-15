# Backend Phase 1 — Plan de développement
# Bab Morocco BD Intelligence Platform

> Ce fichier est la référence de développement du backend Phase 1.
> Chaque sous-phase doit être complétée et testée avant de passer à la suivante.
> Règles globales rappelées en section 0.

---

## 0. Règles globales (à respecter dans chaque SP)

- **Full Mock Data** : aucun appel externe réel (Google Maps, Playwright, Mailgun). Toutes les sources de données externes sont simulées par des providers mock Python.
- **Vraie logique métier** : le scoring, l'analyse sémantique, la génération d'emails et les scénarios de négociation sont implémentés en vrai code Python/Claude — pas de valeurs hardcodées.
- **Emails** : le service d'envoi est un mock qui fait un `logger.info("Email envoyé...")`. Mailgun sera branché en Phase 2.
- **Tests** : chaque SP livrera ses tests `pytest` + `TestClient`. La base de données de test est SQLite in-memory. Chaque SP doit avoir 100% de ses tests verts avant de passer à la suivante.
- **Stack** : FastAPI + SQLAlchemy (async) + Alembic + PostgreSQL (dev/prod) + SQLite (tests).
- **CORS** : configuré pour `http://localhost:3000` (Next.js frontend).
- **Human-in-the-loop** : respecté strictement — aucun email ne part sans validation, aucun scénario de négociation sous le plancher sans flag humain.

---

## SP1 — Fondations : Setup FastAPI + PostgreSQL

### Statut : `[x] Terminé`

### Objectif
Mettre en place le squelette complet du projet backend : structure des dossiers, configuration par variables d'environnement, connexion base de données, migrations Alembic, et premier endpoint de santé.

### Structure cible
```
backend/
├── app/
│   ├── main.py              # App FastAPI, CORS, inclusion des routers
│   ├── config.py            # Settings Pydantic (env vars)
│   ├── database.py          # Engine SQLAlchemy async + get_session
│   ├── models/              # Tables SQLAlchemy (un fichier par domaine)
│   │   └── __init__.py
│   ├── schemas/             # Schemas Pydantic I/O (request / response)
│   │   └── __init__.py
│   ├── routers/             # Endpoints FastAPI (un fichier par domaine)
│   │   └── health.py
│   ├── services/            # Logique métier pure (pas de HTTP ici)
│   │   └── __init__.py
│   └── tests/
│       ├── conftest.py      # Fixtures pytest (client, db in-memory)
│       └── test_health.py
├── alembic/
│   ├── env.py
│   └── versions/
├── alembic.ini
├── requirements.txt
├── .env.example
└── Makefile                 # commandes utiles : dev, test, migrate
```

### Ce qu'on implémente
- `GET /health` → `{ "status": "ok", "version": "1.0.0", "db": "connected" }`
- `GET /` → redirect 307 vers `/docs`
- Configuration via `.env` : `DATABASE_URL`, `ANTHROPIC_API_KEY`, `GOOGLE_MAPS_API_KEY`, `ENV` (development/production)
- Middleware CORS pour `localhost:3000`
- Fixture pytest `conftest.py` avec base SQLite in-memory + `TestClient`

### Tests SP1
```python
# tests/test_health.py
test_health_returns_ok()               # GET /health → 200, status = "ok"
test_health_db_connected()             # champ "db" = "connected"
test_root_redirects_to_docs()          # GET / → 307 /docs
test_cors_header_present()             # Origin: localhost:3000 → Access-Control-Allow-Origin présent
```

---

## SP2 — Modèles de données + CRUD Prospects

### Statut : `[x] Terminé`

### Prérequis : SP1 terminée et tests verts

### Objectif
Créer la table `prospects` en base avec tous ses champs, les schemas Pydantic d'entrée/sortie, et l'API CRUD complète. C'est le cœur du système — toutes les autres SP dépendent de ça.

### Modèle SQLAlchemy `Prospect`
```python
# Champs principaux
id: UUID (PK, auto-généré)
nom: str (NOT NULL)
type: Enum(hotel_riad, hotel_luxe, tour_operateur, agence_voyage,
           prestataire_activites, transport, to_golfe, mice)
pays: str
ville: str
region: Optional[str]
adresse_web: str (UNIQUE — sert à la déduplication)
email_contact: str
linkedin_contact: Optional[str]
nom_contact: str
poste_contact: str
nb_chambres: Optional[int]
capacite_description: Optional[str]
presence_booking: bool
note_booking: Optional[float]
presence_expedia: bool

# Score breakdown (5 colonnes séparées + total calculé)
score_activite_digitale: int  # 0–25
score_coherence_marche: int   # 0–25
score_taille_capacite: int    # 0–20
score_contact_decideur: int   # 0–15
score_liberte_ota: int        # 0–15
score_total: int              # calculé automatiquement, stocké

# Pipeline
stage: Enum(prospection, qualification, outreach, negociation,
            closing, activation_ota, veille, perdu)
commission_standard: float
commission_plancher: float
langue: Enum(fr, en, es, de, ar)
date_ajout: date
date_prochain_contact: Optional[date]
notes: Optional[str]

# Méta
created_at: datetime (auto)
updated_at: datetime (auto-update)
```

### Endpoints CRUD
```
GET    /prospects                     → liste paginée (page, page_size=20)
                                        filtres : stage, type, score_min, pays, langue
GET    /prospects/{id}                → fiche complète
POST   /prospects                     → créer un prospect (ajout manuel)
PUT    /prospects/{id}                → modifier un prospect
PATCH  /prospects/{id}/stage          → changer de stage uniquement (drag kanban)
DELETE /prospects/{id}                → supprimer
GET    /prospects/stats               → nb par stage, score moyen, nb éligibles outreach
```

### Mapper camelCase ↔ snake_case
Un service `ProspectMapper` assure la conversion automatique entre le JSON camelCase du frontend Next.js (`adresseWeb`, `emailContact`, etc.) et le snake_case Python/PostgreSQL (`adresse_web`, `email_contact`). Le frontend n'a rien à modifier.

### Règles métier dans le CRUD
- `score_total` est toujours recalculé côté backend à partir des 5 critères — jamais accepté tel quel depuis le frontend.
- `commission_standard` et `commission_plancher` ont des valeurs par défaut selon le `type` si non fournis.
- `langue` est auto-déduite du `pays` si non fournie.

### Tests SP2
```python
test_create_prospect_manual()          # POST → 201, id UUID généré
test_create_requires_mandatory_fields() # POST sans nom → 422
test_list_prospects_paginated()        # GET → structure paginée correcte
test_filter_by_stage()                 # GET ?stage=outreach → seulement outreach
test_filter_by_score_min()             # GET ?score_min=75 → score_total >= 75
test_get_prospect_by_id()              # GET /{id} → 200
test_get_unknown_id_returns_404()      # GET /uuid-inexistant → 404
test_update_prospect()                 # PUT → champs modifiés
test_patch_stage()                     # PATCH /stage → stage mis à jour
test_delete_prospect()                 # DELETE → 204, GET → 404
test_score_total_always_computed()     # score_total = somme des 5 critères
test_deduplication_adresse_web()       # POST même adresse_web → 409
test_stats_endpoint()                  # GET /stats → structure correcte
```

---

## SP3 — Moteur de Scoring

### Statut : `[x] Terminé`

### Prérequis : SP2 terminée et tests verts

### Objectif
Implémenter la logique de scoring définie dans `CLAUDE.md §4` en Python pur. Le scoring est déclenché automatiquement à chaque création et modification de prospect. C'est la règle de qualification centrale du système.

### Algorithme (CLAUDE.md §4)

| Critère | Max | Règles de calcul |
|---------|-----|-----------------|
| `activite_digitale` | 25 | site web présent (+8), présence Booking (+7), note Booking > 8 (+5), présence Expedia (+5) |
| `coherence_marche` | 25 | pays dans marché prioritaire Maroc/France/EAU (+20 à +25), marché secondaire (+10 à +15), hors cible (+0 à +5) |
| `taille_capacite` | 20 | selon `nb_chambres` ou `capacite_description` : > 50 (+20), 20–50 (+15), 10–20 (+10), < 10 (+5), inconnu (+5) |
| `contact_decideur` | 15 | email présent (+8), LinkedIn présent (+7) |
| `liberte_ota` | 15 | présent sur < 2 OTAs concurrentes (+15), sur 2 (+8), exclusif concurrent (+0) |

**Seuil de passage :** `score_total >= 75` → stage = `outreach`. En dessous → stage = `veille`.

### Ce qu'on implémente

**`services/scoring.py`**
```python
class ScoringEngine:
    def compute_breakdown(self, prospect_data: dict) -> ScoreBreakdown
    def compute_total(self, breakdown: ScoreBreakdown) -> int
    def evaluate_stage(self, total: int, current_stage: str) -> str
    def should_escalate(self, total: int) -> bool  # total >= 85 = prospect premium
```

**Intégration dans le CRUD :**
- `POST /prospects` → scoring auto avant insertion
- `PUT /prospects/{id}` → scoring recalculé si champs pertinents changent

**Endpoint additionnel :**
```
POST /prospects/score-preview    → calcule et retourne le score sans créer de prospect
                                   (utilisé par le formulaire frontend pour l'aperçu live)
```

### Tests SP3
```python
test_perfect_prospect_score_100()         # tous critères max → 100
test_empty_prospect_score_near_zero()     # aucun champ → score bas
test_activite_digitale_booking_adds_7()  # presence_booking=True → +7
test_coherence_maroc_priority_market()   # pays=Maroc → score max cohérence
test_taille_50_rooms_gives_max()         # nb_chambres=60 → taille max
test_contact_email_only_gives_8()        # email présent, pas linkedin → 8
test_liberte_no_ota_gives_15()           # 0 OTA concurrente → 15
test_score_75_triggers_outreach_stage()  # total=75 → stage=outreach
test_score_74_triggers_veille_stage()    # total=74 → stage=veille
test_score_recalculated_on_update()      # PUT avec nouveaux champs → score mis à jour
test_score_preview_endpoint()            # POST /score-preview → score sans insertion BDD
```

---

## SP4 — Pipeline de Scan (Mock Google Maps)

### Statut : `[x] Terminé`

### Prérequis : SP2 + SP3 terminées et tests verts

### Objectif
Implémenter le workflow de scan complet avec un provider Google Maps **mocké**. La logique du pipeline (création de job, progression, déduplication, scoring automatique) est 100% réelle. Seule la source de données raw est simulée.

### Modèle `ScanJob`
```python
id: UUID
ville: str
pays: str
type_partenaire: PartnerTypeEnum
limite: int
statut: Enum(pending, running, done, error)
nb_trouves: int          # résultats bruts Google Maps
nb_ajoutes: int          # nouveaux prospects insérés (hors doublons)
nb_veille: int           # score < 75
nb_doublons: int         # déjà existants en base
progression: int         # 0–100
erreur: Optional[str]
created_at: datetime
completed_at: Optional[datetime]
```

### Endpoints
```
POST /scan/start              → valide les params, crée ScanJob, lance pipeline en background
GET  /scan/{job_id}           → statut + progression (polling toutes les 2s depuis frontend)
GET  /scan/history            → liste des ScanJobs passés
```

### Pipeline (BackgroundTask FastAPI)
```
Étape 1 — MockGoogleMapsProvider.search(ville, pays, type, limite)
          → génère N résultats réalistes (noms, sites web, notes, coordonnées)
          → varie selon la ville pour être réaliste (Marrakech → noms arabes, Dubai → noms anglais)

Étape 2 — MockEnrichmentService.enrich(results)
          → simule la visite du site web (présence Booking/Expedia, email, LinkedIn)
          → délai simulé pour chaque résultat (realistic timing)

Étape 3 — ScoringEngine.compute(enriched_result)  [vraie logique SP3]

Étape 4 — Déduplication : si adresse_web déjà en base → skip (incrémente nb_doublons)

Étape 5 — Insertion en base avec stage = "outreach" (score >= 75) ou "veille" (<75)

Étape 6 — Mise à jour ScanJob.progression à chaque prospect traité
```

### MockGoogleMapsProvider — règles de génération
- Marrakech/Maroc + hotel_riad → noms type "Riad [prénom arabe]", Booking 8.0–9.5, sites `.ma`
- Dubai/EAU + hotel_luxe → noms internationaux, Booking 8.5–9.8, sites `.com`
- Paris/France + tour_operateur → noms type "[Nom] Voyages", emails `@[nom].fr`
- Les données générées sont **déterministes par seed** (ville+type) pour que les tests soient reproductibles

### Tests SP4
```python
test_scan_job_created_on_start()            # POST /start → 201, job_id retourné
test_scan_invalid_params_rejected()         # POST sans ville → 422
test_scan_status_polling()                  # GET /{job_id} → statut évolue
test_scan_completes_with_results()          # scan terminé → nb_ajoutes > 0
test_scan_respects_limite()                 # limite=10 → nb_trouves <= 10
test_deduplication_prevents_duplicates()    # 2 scans même config → nb_doublons > 0 au 2e
test_low_score_goes_to_veille()             # prospects enrichissement faible → veille
test_high_score_goes_to_outreach()          # prospects enrichissement bon → outreach
test_scan_history_lists_jobs()              # GET /history → liste
test_scan_pipeline_end_to_end()             # scan complet → prospects en base + scorés
```

---

## SP5 — Moteur Outreach (Génération emails + Séquences)

### Statut : `[x] Terminé`

### Prérequis : SP2 + SP3 terminées et tests verts

### Objectif
Implémenter la génération des 3 variantes d'email (A/B/C) via Claude Sonnet, les séquences de relance J0/J+3/J+7/J+30 (CLAUDE.md §5), et le service d'envoi mocké (log uniquement).

### Modèle `OutreachEmail`
```python
id: UUID
prospect_id: UUID (FK → prospects)
sequence_step: Enum(j0, j3, j7, j30)
variant: Enum(A, B, C)
langue: LangueEnum
sujet: str
corps: str
statut: Enum(draft, validated, sent, opened, clicked)
date_envoi_prevu: date
date_envoi_reel: Optional[datetime]
created_at: datetime
```

### Endpoints
```
POST /outreach/{prospect_id}/generate     → génère les 3 variantes J0 via Claude
GET  /outreach/{prospect_id}              → liste tous les emails du prospect
GET  /outreach/{prospect_id}/next-step    → prochain step de séquence à envoyer
POST /outreach/{email_id}/validate        → valide un email (human-in-the-loop obligatoire)
POST /outreach/{email_id}/send            → envoie (mock) l'email, statut → "sent"
POST /outreach/trigger-followups          → calcule et crée les relances dues (cron-ready)
```

### Génération emails — prompt Claude
Le prompt envoyé à Claude inclut :
- Contexte Bab Morocco (OTA Maroc, cibles Europe/Golfe, pré-lancement)
- Profil prospect : type, pays, ville, commission, score, notes
- Langue cible (fr/en/es/de/ar)
- Instructions pour 3 variantes :
  - **A — Direct** : pitch professionnel, proposition claire, CTA appel 20 min
  - **B — Bénéfices** : 3 bénéfices tangibles mis en avant, ton consultant
  - **C — Storytelling** : narration autour du voyageur idéal, ton émotionnel

### Règles séquence (CLAUDE.md §5)
```
J0   → Email initial (variant validée)
J+3  → Si statut J0 != "opened" : Relance #1 (objet différent, angle bénéfice)
J+7  → Si toujours pas de réponse : Relance #2 (ton direct, dernier essai)
J+30 → Si prospect en veille : Réactivation (angle saisonnier)
```

### Règle human-in-the-loop stricte
- `POST /send` retourne `403` si l'email n'est pas en statut `validated`
- Aucun contournement possible via l'API

### MockEmailSender
```python
class MockEmailSender:
    async def send(self, email: OutreachEmail) -> bool:
        logger.info(f"[MOCK EMAIL SENT] → {email.prospect.email_contact} | {email.sujet} | Variant {email.variant}")
        return True
```

### Tests SP5
```python
test_generate_creates_3_variants()              # POST /generate → 3 emails draft
test_variant_a_b_c_all_present()                # variantes A, B, C toutes créées
test_email_language_matches_prospect_pays()     # pays=France → langue=fr
test_cannot_send_without_validation()           # POST /send sans validate → 403
test_validate_then_send_succeeds()              # validate → send → statut "sent"
test_mock_sender_logs_email(caplog)             # vérifier le log [MOCK EMAIL SENT]
test_followup_j3_created_if_j0_not_opened()    # trigger-followups → j3 créé
test_followup_not_created_if_j0_opened()        # j0 ouvert → pas de j3
test_j30_reactivation_for_veille_prospects()    # prospect en veille → j30
test_sequence_respects_date_offsets()           # j3 = date_j0 + 3 jours
```

---

## SP6 — Moteur de Négociation IA

### Statut : `[x] Terminé`

### Prérequis : SP2 + SP5 terminées et tests verts

### Objectif
Implémenter l'analyse sémantique des messages entrants et la génération des 3 scénarios de réponse (CLAUDE.md §6), avec détection automatique du seuil d'escalade humaine et respect du plancher absolu de commission.

### Modèle `NegotiationMessage`
```python
id: UUID
prospect_id: UUID (FK → prospects)
direction: Enum(inbound, outbound)   # reçu du partenaire / envoyé par Bab Morocco
corps: str
date_message: datetime

# Champs remplis après analyse IA (inbound uniquement)
analyse_intent: Optional[str]        # tres_motive / interesse / contre_offre / objection
analyse_objection: Optional[str]     # prix / risque / concurrence / timing / confiance
taux_demande: Optional[float]        # taux extrait du message si mentionné
requires_human: bool                 # True si taux < plancher OU cas spec §9

created_at: datetime
```

### Endpoints
```
POST /negotiation/{prospect_id}/message        → soumettre message inbound → analyse auto
GET  /negotiation/{prospect_id}/analysis       → dernière analyse + 3 scénarios générés
GET  /negotiation/{prospect_id}/history        → historique complet inbound + outbound
POST /negotiation/{prospect_id}/respond        → valider scénario + générer message de réponse
                                                 → 403 si requires_human = True
```

### Analyse sémantique — prompt Claude
Claude reçoit :
- Le message inbound brut
- Le profil du prospect (type, pays, commission standard et plancher, score, historique)
- Instructions pour retourner un JSON structuré :
  ```json
  {
    "intent": "contre_offre",
    "intent_score": 3,
    "objection_type": "prix",
    "objection_detail": "Le partenaire demande 14% au lieu de 12%",
    "taux_demande": 14.0,
    "requires_human": false
  }
  ```

### Génération des 3 scénarios (CLAUDE.md §6)
```
Scénario A — Accepter        : concéder le taux demandé (si >= plancher) ou escalade
Scénario B — Contre-proposer : maintenir commission standard + contreparties non-financières
             Contreparties disponibles (CLAUDE.md §6) :
             - Badge Partenaire Fondateur
             - Commission verrouillée 12 mois
             - Co-marketing lancement
             - Influence produit (feedback extranet)
             - Accès bêta privé
Scénario C — Escalade humaine : transmission au responsable commercial
```

### Règles d'escalade obligatoire (CLAUDE.md §9)
- `taux_demande < commission_plancher` → `requires_human = True` automatique
- Partenaire demande exclusivité géographique/catégorie → `requires_human = True`
- Contrat valeur estimée > 50 000$/an → `requires_human = True`
- Menace légale ou insatisfaction grave → `requires_human = True`

### Tests SP6
```python
test_analyze_message_returns_structure()           # POST /message → analyse JSON complète
test_detects_counter_offer_intent()                # "je voudrais 14%" → intent=contre_offre
test_extracts_requested_rate()                     # "14% de commission" → taux_demande=14.0
test_below_plancher_sets_requires_human()          # taux < plancher → requires_human=True
test_at_plancher_no_human_required()               # taux = plancher → requires_human=False
test_generates_3_scenarios()                       # GET /analysis → 3 scénarios
test_scenario_b_includes_nonfinancial_perks()      # scénario B mentionne contreparties
test_cannot_respond_when_requires_human()          # POST /respond avec flag → 403
test_respond_without_flag_succeeds()               # POST /respond sans flag → 200
test_history_contains_inbound_and_outbound()       # GET /history → les 2 directions
```

---

## Checklist de validation par SP

Avant de considérer une SP comme terminée :

- [ ] Tous les tests pytest passent (`pytest -v`)
- [ ] Aucune erreur mypy (`mypy app/`)
- [ ] L'endpoint est accessible via `/docs` (Swagger UI)
- [ ] Le frontend peut appeler l'endpoint sans erreur CORS
- [ ] Les migrations Alembic sont à jour (`alembic upgrade head`)
- [ ] Le `.env.example` est mis à jour avec les nouvelles variables si besoin

---

## Variables d'environnement (.env)

```env
# Base de données
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/bab_morocco

# IA
ANTHROPIC_API_KEY=sk-ant-...

# Scraping (Phase 2 — pas utilisé en Phase 1)
GOOGLE_MAPS_API_KEY=...

# Email (Phase 2 — mock en Phase 1)
MAILGUN_API_KEY=
MAILGUN_DOMAIN=

# App
ENV=development
SECRET_KEY=changeme
```

---

*Version 1.0 — Juin 2026*
*Backend Phase 1 — Bab Morocco BD Intelligence Platform*
