# AI Generation Fixes — Plan de reference
# A appliquer avant de brancher l'API Claude en production
# Modele : rester sur Sonnet (claude-sonnet-4-6 aujourd'hui / claude-sonnet-5 si migre) pour tout — pas de passage a Opus pour l'instant

---

## Contexte

Audit du code existant (`email_generator.py`, `negotiation_generator.py`, `contract_generator.py`)
face aux vraies donnees de `backend/bab_morocco.db` (30 prospects reels, 119 messages de
negociation, 23 contrats). Objectif : les 3 generateurs Mock -> Claude doivent produire des
emails/negociations/contrats corrects des le premier essai reel.

Ce fichier sert de check-list. Quand on dit "applique les changements", ce document est la
reference complete — chaque item ci-dessous doit etre traite.

---

## Fix #2 — Parsing JSON fragile (bloquant)

**Probleme :** les 3 generateurs font un `json.loads(raw)` brut. Claude Sonnet entoure souvent
sa reponse de balises ```` ```json ```` ou ajoute une phrase avant/apres -> `ValueError` ->
generation cassee.

**Solution :** ecrire une fonction utilitaire unique (ex. `app/services/json_extract.py`) qui :
1. Retire les balises de code (```` ``` ```` / ```` ```json ````) si presentes.
2. Extrait la sous-chaine entre le premier `{`/`[` et le dernier `}`/`]`.
3. Parse avec `json.loads`.
4. Leve une erreur claire et loggee si ca echoue quand meme.

Faire passer les 3 generateurs (`ClaudeEmailGenerator`, `ClaudeNegotiationGenerator`,
`ClaudeContractGenerator`) par cette fonction au lieu de `json.loads()` direct.

---

## Fix #3 — Contrats tronques (bloquant)

**Probleme :** `ClaudeContractGenerator.generate_clauses()` utilise `max_tokens=4096` pour
10 clauses de 150-250 mots chacune. Trop juste, surtout en arabe/allemand (plus de tokens par
mot) -> reponse coupee -> JSON invalide.

**Solution :**
- Monter `max_tokens` a ~8000.
- Passer en appel streaming (`client.messages.stream(...)` + `get_final_message()`) pour eviter
  les timeouts HTTP sur une reponse longue.

---

## Fix #4 — Negociation sans historique (qualite)

**Probleme :** `analyze()` et `generate_scenarios()` dans `negotiation_generator.py` ne recoivent
que le dernier message entrant. `negotiation_service.py` a deja `get_history()` mais ne l'utilise
pas dans les prompts. 119 messages en base, jamais lus par Claude.

**Solution :**
- Dans `NegotiationService`, recuperer les ~6 derniers messages via `get_history()`.
- Les formater en texte simple (`"Partenaire: ..."` / `"Nous: ..."`) et les injecter dans le
  prompt `analyze()` et le prompt `generate_scenarios()`.
- Objectif : Claude ne doit pas re-proposer un avantage deja propose, ni se contredire par
  rapport a un message deja envoye.

---

## Fix #5 — Relances sans contexte du J0 (qualite)

**Probleme :** `generate_step_variants()` (`outreach_service.py`) genere J+3/J+7/J+30 en appelant
`generate(prospect, step, variant)` sans jamais montrer l'email precedent. Le prompt dit "angle
different" mais Claude ne voit pas l'ancien sujet/corps pour etre reellement different.

**Solution :**
- Avant de generer une relance, recuperer les emails deja envoyes du meme prospect
  (`list_emails()` existe deja dans `OutreachService`).
- Passer au moins les sujets (idealement sujet + corps) des etapes precedentes dans le prompt de
  `ClaudeEmailGenerator.generate()`, avec instruction explicite : "le sujet et l'angle doivent
  etre clairement differents de ceux ci-dessous."

---

## Fix #6 — Contact generique "Responsable / DG" + emails vides (qualite + risque)

**Probleme :** en base, `nom_contact='Responsable'` et `poste_contact='DG'` pour les 30
prospects reels. Le prompt email insere ca tel quel -> "Bonjour Responsable," dans un vrai
email. En plus, 13/30 prospects ont `email_contact=''` (vide).

**Solution :**
- Ajouter une regle dans le prompt email : si `nom_contact` est generique/vide ("Responsable",
  vide, etc.), utiliser une formule de politesse neutre ("Madame, Monsieur,") au lieu du texte
  litteral.
- Cote service (envoi), bloquer/flaguer l'envoi pour les prospects sans `email_contact` valide
  plutot que de tenter un envoi vers une adresse vide.

---

## Fix #7 — Signaux de credibilite reels non transmis (qualite)

**Probleme :** la base contient `note_google` (jusqu'a 4.7), `nb_avis_google` (jusqu'a 9 583),
et `langues_disponibles` (ex. `'ar,en,es,fr'`) — aucun de ces champs n'atteint le prompt email
actuel (`email_generator.py` ne passe que nom/type/ville/commission/score).

**Solution :**
- Ajouter `note_google`, `nb_avis_google`, `langues_disponibles` aux donnees injectees dans le
  prompt email.
- Instruction : "utilise la note Google / nombre d'avis comme argument de credibilite quand ils
  sont eleves ; n'invente rien si absent."

---

## Fix #8 — Score interne expose dans l'email (risque)

**Probleme :** `Score: {prospect.score_total}/100` est injecte dans le prompt d'email
(`email_generator.py`). Risque que Claude ecrive un truc du genre "impressionne par votre score
de 75/100" dans un email reel envoye a un partenaire — c'est un chiffre interne de triage.

**Solution :** retirer la ligne `Score: .../100` du prompt d'**email uniquement**. Le garder dans
les prompts de negociation/qualification ou c'est un usage interne legitime.

---

## Fix #9 — Type de partenaire passe en code brut (qualite mineure)

**Probleme :** le prompt email/negociation recoit `prospect.type` tel quel (`hotel_luxe`,
`agence_voyage`, etc.) au lieu d'un libelle clair.

**Solution :** reutiliser la fonction `_partner_type_description()` deja presente dans
`contract_generator.py` pour traduire le type en texte clair ("hotel de luxe 5 etoiles", etc.)
avant de l'injecter dans les prompts email et negociation. Utiliser aussi l'angle d'accroche
correspondant par type de partenaire (voir Mission 2 de `system_prompt_v2.md` — hotel/riad =
visibilite + remplissage, TO = inventaire exclusif, agence B2B = catalogue + extranet, activites
= audience captive OTA, MICE = destination cle en main).

---

## Fix #10 — Modele : rester sur Sonnet

Aucune action. On garde `claude-sonnet-4-6` (ou `claude-sonnet-5` si migre) pour les 3
generateurs. Pas de passage a Opus pour l'instant — a revisiter plus tard si besoin de qualite
juridique/negociation superieure.

---

## Fix #1 (allege) — Garde-fous de securite dans les prompts

**Decision :** on NE branche PAS le fichier complet `system_prompt_v2.md` comme `system=` sur
les appels Claude (juge inutile / trop lourd par l'utilisateur). A la place, ajouter 3-4 lignes
courtes de garde-fou directement dans les prompts existants (email + negociation + contrat) :

- Ne jamais promettre une fonctionnalite OTA qui n'existe pas encore (portail partenaire
  self-service, analytics avances, channel managers).
- Ne jamais donner de chiffres de trafic/ventes/reservations non fournis explicitement dans les
  donnees du prospect — ne rien inventer.
- Ne jamais reveler d'informations sur la strategie ou la roadmap technique interne.
- Toute negociation sous le plancher de commission -> deja gere en Python
  (`_apply_hard_escalation_rules`), pas besoin de dupliquer dans le prompt, mais rappeler a
  Claude de ne pas proposer de rabais sous ce plancher de sa propre initiative.

---

## Fix #11 — Loi applicable au contrat (nouveau, suite a la recherche)

**Contexte :** recherche web faite sur le droit applicable aux contrats B2B internationaux
(Rome I, Hague Principles, Code des obligations et contrats marocain) + protection des donnees
par region (RGPD, UK GDPR, PDPL Golfe, Loi 09-08 Maroc).

**Constat :**
- Le droit applicable a un contrat B2B international est un **choix des parties** (party
  autonomy) — il n'y a pas une seule loi "correcte" imposee.
- Le code actuel (`contract_generator.py` -> `_get_jurisdiction()`) choisit **la loi du pays du
  partenaire** pour chaque contrat. Ce n'est pas faux, mais ce n'est qu'une option parmi
  d'autres, et ce n'est pas ce que l'utilisateur a decide.
- **Deux choses ne sont PAS negociables, quel que soit le droit choisi pour le contrat :**
  - La protection des donnees suit toujours la region du partenaire/voyageurs (deja gere
    correctement par `_get_gdpr_clause_label()` : RGPD Europe/UK, PDPL Golfe, Loi 09-08 Maroc).
  - Pour un partenaire UE qui pourrait avoir un statut d'agent commercial, les regles
    imperatives de son pays restent protegees meme si on choisit le droit marocain — a couvrir
    par une clause de reserve.

**Decision utilisateur (validee) :**
> Le contrat est regi par le **droit marocain**, et il doit aussi respecter le droit de
> protection des donnees de chaque region du partenaire — **Loi 09-08** (Maroc), **RGPD**
> (UE/UK), **PDPL** (Golfe).

**Changements a apporter dans `contract_generator.py` :**
- `_get_jurisdiction()` : ne plus faire varier le droit applicable selon le pays du partenaire.
  Fixer le droit applicable a **droit marocain** pour tous les contrats, quel que soit le pays
  du partenaire.
- Juridiction (ville des tribunaux) : a clarifier avec l'utilisateur si on garde
  "tribunaux de Casablanca" pour tous, ou si on ajoute une clause d'arbitrage international
  neutre (option recommandee precedemment : droit marocain + arbitrage international, plus
  facile a faire accepter par un partenaire etranger qu'un tribunal marocain pur). **Non tranche
  — a redemander avant d'implementer.**
- Ajouter dans la clause `juridiction` une phrase de reserve : les regles imperatives du pays du
  partenaire restant applicables si la loi locale l'exige (protection agent commercial UE, etc.).
- `_get_gdpr_clause_label()` : NE PAS toucher — deja correct (RGPD/PDPL/Loi 09-08 selon le pays
  du partenaire, independamment du droit applicable choisi pour le contrat).

---

## Ordre d'implementation propose

1. Fix #2 + Fix #3 (anti-crash / anti-troncature) — priorite absolue, sans ca rien ne marche de
   maniere fiable.
2. Fix #1 allege (garde-fous courts dans les prompts).
3. Fix #4 (historique negociation) + Fix #5 (contexte email precedent).
4. Fix #6 + Fix #7 + Fix #8 (qualite/personnalisation email).
5. Fix #9 (libelles de type).
6. Fix #11 (droit applicable du contrat) — necessite de confirmer le point "juridiction /
   arbitrage" avant de coder.

Commit apres chaque groupe (comportement deja convenu avec l'utilisateur).
