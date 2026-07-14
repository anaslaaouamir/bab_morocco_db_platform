# V2 — Plan des fonctionnalités

> Statut : **proposé, à implémenter** · Version haut-niveau (logique métier uniquement).
> Les détails techniques — modèles, migrations, endpoints — sont volontairement laissés
> pour la phase d'implémentation de chaque feature.
>
> Ce document s'enrichira au fur et à mesure que de nouvelles fonctionnalités V2 sont validées.

---

## Feature 1 — Centre de notifications

### Problème actuel
`notification_bus` est un pub/sub **en mémoire, WebSocket uniquement**. Conséquences :
- Onglet fermé au moment d'un événement → la notification est **perdue à jamais**.
- **Aucune persistance** → pas d'historique, pas de « non lus », pas de vue au réveil.
- Les moments qui comptent (réponse d'un partenaire du Golfe sur un autre fuseau, scan de
  nuit) arrivent **précisément quand personne ne regarde**.

### Idée
**Persister** chaque notification pour que rien ne soit perdu, donner à chaque utilisateur une
**cloche avec l'historique des non-lus**, et router selon le modèle de propriété déjà en place
(Admin voit tout ; Commercial voit uniquement ses prospects).

### Trois niveaux de priorité
| Niveau | Exemples | Canal |
|--------|----------|-------|
| **info** | email ouvert, scan terminé, prospect promu depuis la veille | cloche seulement |
| **action** | réponse à traiter, relance à valider, contact prévu / en retard, nouveaux prospects assignés | cloche + **digest quotidien** |
| **critique** | escalade §9 (taux < plancher, mot-clé légal/exclusivité, contrat > 50 k$), partenaire qui attend ta réponse | **email immédiat** |

### Événements à brancher
On réutilise les points où `notification_bus.publish()` existe déjà, et on en ajoute :
- Réponse partenaire reçue (outreach / négociation / contrat)
- Escalade §9 déclenchée (`requires_human` / `human_review_required`)
- Email ouvert
- Relance J3 / J7 / J30 générée et en attente de validation
- Prospect promu depuis la veille (≥ 75)
- Scan terminé (X ajoutés, Y en veille)
- Nouveaux prospects assignés au commercial
- Contact prévu aujourd'hui / en retard

### Règle anti-bruit (indispensable)
Regroupement par (type + entité) : **5 ouvertures du même email = 1 notification**.
Les ouvertures se regroupent ; les réponses et escalades ne se regroupent jamais.

### Canaux de livraison
- **Cloche in-app persistée** : backfill au chargement depuis la base ; le WebSocket existant
  reste pour le live.
- **Email immédiat** pour le niveau *critique* uniquement — via le transport Resend en place.
- **Digest quotidien** : un email récapitulatif par commercial (actions en attente), généré par
  le scheduler serveur. C'est ce qui donne la « vue complète » au réveil.

---

## Feature 2 — Cycle de vie des prospects : veille & perdu

### 2.1 Re-scoring automatique de la veille

**Problème actuel.** `scan_pipeline` met un prospect `< 75` en `veille` puis l'oublie. Rien ne le
re-scanne ni ne le re-score, alors que `CLAUDE.md §4` promet « mise en veille avec date de
re-évaluation ». Un prospect faiblement noté il y a 6 mois (peu d'avis) peut être ≥ 75 aujourd'hui
— on ne le saura jamais. La veille est un **cimetière**.

**Idée.** Transformer la veille en **file auto-gérée**, avec un rythme de re-vérification dégressif
pour ne pas cramer les API. Hébergé par le **scheduler serveur existant** (celui des scans
nocturnes) — pas par le navigateur, car le re-scoring ne nécessite **aucun humain**.

**Logique :**

1. **Date de re-évaluation à l'entrée**, calée sur la distance au seuil :
   - 70–74 → re-check ~30 j
   - 50–69 → ~90 j
   - < 50 → ~180 j (ou jamais)

2. **On ne rafraîchit que les signaux qui bougent** : note Google, nombre d'avis, statut
   ouvert/fermé. Les signaux issus du scrape du site (HTTPS, CTA, réseaux sociaux) changent
   rarement → gardés figés pour économiser. C'est ce qui rend le re-scoring peu coûteux.

3. **Re-calcul du score :**
   - **≥ 75** → promotion automatique en `prospection`, ré-assignation à un commercial,
     notification.
   - **toujours < 75** → on repousse la date de re-évaluation (backoff) et on recommence.

4. **Garde-fous de sortie** (la veille ne gonfle pas indéfiniment) :
   - Google renvoie « fermé définitivement » → bascule directe en `perdu`.
   - Après N re-évaluations infructueuses → sortie de la boucle (`perdu`, motif « jamais
     qualifié »).

### 2.2 Traitement des prospects « perdus »

**Principe : ne PAS traiter les perdus comme la veille.**

Deux raisons :
- **Délivrabilité** — maintenant que les envois sont réels, réémailer quelqu'un qui a dit non
  (ou qui t'a marqué en spam) plombe un domaine d'envoi jeune.
- **Métier** — `perdu` est une **décision humaine** (`CLAUDE.md §9`). La ressusciter
  automatiquement contredit cette décision.

**Problème actuel.** Le modèle ne distingue pas les types de perte (juste `stage="perdu"` +
`notes` libres).

**Idée.** Au moment de marquer perdu, **capturer un motif + un flag « recontactable »** :

- **Perdu dur** (pas intéressé, déjà en exclusivité OTA, injoignable, hostile)
  → **jamais retouché** automatiquement.
- **Perdu circonstanciel** (« pas cette saison », budget, timing, « rappelez-moi au lancement »)
  → **recontactable = oui**, avec éventuellement une date.

**Règles :**
- **Aucun ré-email automatique**, jamais.
- Les seuls perdus « recontactables » ressortent comme une **suggestion à un humain** (angle
  saisonnier, ou au lancement de l'OTA — l'argument « Partenaire Fondateur » reprend de la valeur
  à ce moment-là).
- L'humain décide de relancer, comme il avait décidé d'abandonner.

**Résumé du cycle de vie :**

| État | Traitement | Déclencheur d'action |
|------|-----------|----------------------|
| **veille** | recyclage automatique (personne n'a dit non, juste sous le seuil) | scheduler serveur |
| **perdu (dur)** | figé, jamais recontacté | — |
| **perdu (circonstanciel)** | pas de recyclage auto ; suggestion à un humain | décision humaine |

---

## Feature 3 — Module « RDV / Appels »

### Problème actuel
Chaque email d'outreach (J0/J3/J7) se termine par le CTA « appel 20 min » — généré par Claude.
Mais **quand un partenaire accepte (« oui, mardi 14h »), le produit n'a nulle part où mettre cette
info.** Elle finit au mieux dans les `notes` en texte libre. Conséquences :
- Un RDV accepté peut passer à la trappe (pas de rappel, pas de suivi).
- L'objectif **« 50 conversations actives »** n'est mesurable par rien — une conversation, c'est
  littéralement un appel, et rien ne les compte.

> À ne pas confondre : il ne s'agit **pas** d'envoyer un email de plus pour demander un appel
> (les emails le font déjà). Il s'agit de **capturer le RDV comme donnée**.

### Idée
Un **objet « Appel »** que le commercial crée quand un partenaire accepte, qui devient un vrai
palier de pipeline entre outreach et négociation.

**Contenu d'un appel :**
- date / heure, canal (téléphone / Meet / Zoom)
- statut : `proposé` → `confirmé` → `fait` → `no-show`
- **issue** après l'appel : intéressé / à relancer / négociation lancée + notes

**Comportement :**
- apparaît sur le dashboard (« Appels aujourd'hui »), déclenche un rappel (→ notifications, Feature 1)
- **compte enfin comme une vraie conversation active**

**Deux niveaux :**
1. **Minimal** — le commercial loggue l'appel à la main.
2. **Enrichi** — un **lien de réservation** (style Calendly) inséré dans l'email : le prospect
   choisit son créneau lui-même, ce qui supprime le ping-pong « quel horaire vous va ».
3. Bonus une fois Claude réel : brief pré-appel + compte-rendu/next-step post-appel auto-loggé.

**Inspiration :** HubSpot Meetings / Calendly — le « book a call » EST l'événement de conversion
dans une séquence de vente, et l'IA gère la préparation et le suivi.

---

## Feature 4 — Moteur de saisonnalité tourisme

### Problème actuel
La réactivation J30 doit utiliser un « angle saisonnier » (spec §5), mais **aucun moteur ne sait
quelle saison vaut le coup pour quel marché.** Le timing de prospection est décidé au hasard,
alors que dans le tourisme **le timing = le taux de réponse.**

> Précision : connaître la saison **ne nécessite pas Claude** — la date d'aujourd'hui la donne
> gratuitement. L'intelligence est dans le **mapping saison → segment à travailler maintenant.**

### Idée
Une couche qui, à partir de la date, dit **quel segment prioriser maintenant** parce que sa saison
arrive — et fait remonter les prospects déjà scannés correspondants.

**Mapping saison → segment (marchés Bab Morocco) :**
| Saison | Voyageurs cibles | Segments à travailler |
|--------|------------------|-----------------------|
| Été (juin–août) | Européens | TO/agences France, UK, Allemagne + côte/Atlas Maroc |
| Ramadan / Eid | Golfe | TO EAU/Arabie, hôtels luxe |
| Mi-saison (auto/printemps) | tous (météo idéale désert & Marrakech) | riads, activités, transferts Maroc |
| Vacances d'hiver | Européens (soleil) | riads, circuits |

**Ce que ça fait :**
1. **Filtre les prospects déjà scannés** pour remonter le segment en saison
   (« tu as 40 TO européens qualifiés — c'est le moment de les travailler pour l'été »).
2. **Propose un scan ciblé** (« lance un scan riads Marrakech pour la mi-saison »).
3. **Nourrit l'angle saisonnier** des relances J30 (déjà dans la spec, mais sans moteur).

**Valeur :** on prospecte le segment qui va convertir **maintenant** parce que sa saison arrive,
au lieu de prospecter au hasard. Timing du lead-gen calé sur la demande réelle du marché.

---

## Feature 5 — Carte de couverture marché & détection de trous

### Problème actuel
On prospecte sans vue d'ensemble de **ce qu'on couvre déjà**. Le dashboard montre des comptes par
pays, mais pas les **manques** : on peut avoir 30 riads à Marrakech et **0 à Fès**, 4 hôtels luxe
à Dubaï et **0 à Abu Dhabi**, sans jamais s'en rendre compte.

### Idée
Une grille **ville/type × marché** qui montre la couverture actuelle et **signale les trous** :
- « sous-couvert : hôtels luxe Abu Dhabi »
- « sur-couvert : riads Marrakech »
- et **propose le prochain scan** pour combler le trou prioritaire.

### Valeur
L'objectif **500 qualifiés** devient **stratégique** au lieu de quantitatif : on remplit les trous
prioritaires (Maroc > France > EAU) au lieu de re-scanner ce qu'on a déjà. Nourrit directement la
Saisonnalité (Feature 4).

---

## Feature 6 — Améliorations du dashboard

Trois ajouts, tous sur la page dashboard existante.

### 6.1 — Vue par commercial (admin uniquement)
**Problème :** le dashboard additionne **tous** les prospects. L'admin ne voit pas **qui gère quoi**.
**Idée :** un tableau visible par l'admin seulement — **une ligne par commercial** : nombre de
prospects, conversations actives, partenariats signés (et éventuellement contacts en retard).
**Valeur :** l'admin voit d'un coup la **charge** et la **performance** de chaque commercial — pour
rééquilibrer, repérer qui décroche, savoir ce que chacun fait.

### 6.2 — Statistiques d'emails
**Problème :** aucun **taux réel** d'email sur le dashboard ; la pastille actuelle « email envoyé »
est devinée, pas mesurée.
**Idée :** un petit bloc — **X envoyés · Y ouverts (Z %) · W réponses**. La donnée d'ouverture
(`opened_at`) existe déjà, il suffit de l'afficher.
**Valeur :** une fois les vrais envois lancés, savoir **si l'outreach marche** (ou si les emails
tombent à plat).

### 6.3 — Évolution dans le temps (semaine / mois)
**Problème :** tout le dashboard est une **photo de l'instant** — les totaux actuels. Rien ne montre
si ça **avance**.
**Idée :** un sélecteur **semaine / mois** qui montre l'évolution des chiffres clés sur la période —
nouveaux prospects, emails envoyés, réponses reçues, signés.
**Valeur :** pour un pipeline en construction, voir le **mouvement** (« +12 prospects, +5 réponses
cette semaine ») motive et pilote mieux que le total figé.

---

## Écartées (traçabilité des décisions)
- **WhatsApp comme canal** — reporté (décision produit, pas maintenant). À ré-ouvrir si besoin
  sur les marchés Maroc/Golfe.
- **Comptes « Groupe » / chaînes** — écarté : peu de chaînes attendues, coût non justifié.
  À ré-ouvrir seulement si des portefeuilles multi-propriétés apparaissent.
- **Dossier de préparation IA par partenaire** — écarté : redondant avec `ClaudeEmailGenerator`,
  qui personnalise déjà l'email et l'angle à partir des données du prospect.
- **Score de valeur (potentiel de revenu)** — écarté : le seul signal exploitable (nombre d'avis
  Google) est **déjà pris en compte** dans le score de taille/capacité ; pas de donnée nouvelle
  (le nombre de chambres n'est pas récupérable).
- **File d'actions prioritaires par commercial** — écarté : **doublon** avec les cartes
  « Alertes prioritaires » et « Actions en attente » déjà présentes sur le dashboard.
- **Garde-fou « échelle de concessions » en négociation** — écarté : `ClaudeNegotiationGenerator`
  reçoit déjà les données du prospect et les règles de négociation ; la logique de concession est
  portée par le prompt, pas besoin d'une couche séparée.

---

*À suivre : autres fonctionnalités V2 (à ajouter ci-dessous au fur et à mesure).*
