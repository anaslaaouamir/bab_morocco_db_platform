import type { Prospect } from "@/types/prospect";

// 18 realistic Moroccan travel-industry partners across all pipeline stages.
// Score breakdown always sums to the stated total; prospects in Outreach+
// have total >= 75 (spec §4 threshold).

const mockProspects: Prospect[] = [

  // ═══════════════════════════════════════════════════════════
  // PROSPECTION — 3 newly identified, scoring not yet finalised
  // ═══════════════════════════════════════════════════════════

  {
    id: "p001",
    nom: "Bivouac Erg Chebbi Premium",
    type: "prestataire_activites",
    pays: "Maroc",
    ville: "Merzouga",
    region: "Drâa-Tafilalet",
    adresseWeb: "bivouac-ergchebbi.ma",
    emailContact: "contact@bivouac-ergchebbi.ma",
    nomContact: "Youssef Ait Brahim",
    posteContact: "Gérant",
    capaciteDescription: "12 tentes de luxe · 24 personnes max",
    presenceBooking: true,
    noteBooking: 8.9,
    presenceExpedia: false,
    score: {
      activiteDigitale: 17,  // Booking présent, Instagram limité
      coherenceMarche: 20,   // Sahara = bucket-list européen
      tailleCapacite: 10,    // Petite structure
      contactDecideur: 10,   // Contact via formulaire Booking seulement
      liberteOta: 15,        // Aucune exclusivité
    },
    stage: "prospection",
    commissionStandard: 18,
    commissionPlancher: 15,
    langue: "fr",
    dateAjout: "2026-06-15",
    notes: "Camp très bien noté. Manque de contact direct — enrichissement nécessaire.",
  },

  {
    id: "p002",
    nom: "Riad Ksar Ighnda",
    type: "hotel_riad",
    pays: "Maroc",
    ville: "Ouarzazate",
    region: "Drâa-Tafilalet",
    adresseWeb: "riad-ighnda.ma",
    emailContact: "info@riad-ighnda.ma",
    nomContact: "Hassan Ouchbane",
    posteContact: "Propriétaire",
    nbChambres: 12,
    presenceBooking: true,
    noteBooking: 8.4,
    presenceExpedia: false,
    score: {
      activiteDigitale: 14,  // Site basique, peu d'avis récents
      coherenceMarche: 18,   // Tourisme culturel / aventure Europe
      tailleCapacite: 9,     // 12 chambres
      contactDecideur: 8,    // Pas d'email direct trouvé
      liberteOta: 12,        // Présence OTA non exclusive mais floue
    },
    stage: "prospection",
    commissionStandard: 10,
    commissionPlancher: 8,
    langue: "fr",
    dateAjout: "2026-06-16",
    notes: "Bonne note Booking. Site daté — opportunité de digitalisation.",
  },

  {
    id: "p003",
    nom: "Agadir Marina Watersports",
    type: "prestataire_activites",
    pays: "Maroc",
    ville: "Agadir",
    region: "Souss-Massa",
    adresseWeb: "agadir-watersports.com",
    emailContact: "booking@agadir-watersports.com",
    nomContact: "Karim Benjelloun",
    posteContact: "Directeur commercial",
    capaciteDescription: "Jet-ski, paddle, plongée · 60 sorties / jour",
    presenceBooking: false,
    presenceExpedia: false,
    score: {
      activiteDigitale: 16,  // Instagram 8k, TripAdvisor listé
      coherenceMarche: 19,   // Activités plage = cœur marché européen estival
      tailleCapacite: 11,    // Volume journalier correct
      contactDecideur: 10,   // Réponse via Facebook Messenger
      liberteOta: 13,        // GetYourGuide, non exclusif
    },
    stage: "prospection",
    commissionStandard: 18,
    commissionPlancher: 15,
    langue: "fr",
    dateAjout: "2026-06-17",
  },

  // ═══════════════════════════════════════════════════════════
  // QUALIFICATION — scoring finalisé, décision outreach en cours
  // ═══════════════════════════════════════════════════════════

  {
    id: "p004",
    nom: "Riad El Fenn",
    type: "hotel_riad",
    pays: "Maroc",
    ville: "Marrakech",
    region: "Marrakech-Safi",
    adresseWeb: "riadelfenn.com",
    emailContact: "reservations@riadelfenn.com",
    linkedinContact: "linkedin.com/company/riad-el-fenn",
    nomContact: "Vanessa Branson",
    posteContact: "Directrice générale",
    nbChambres: 28,
    capaciteDescription: "28 suites + 3 villas privées · Piscine rooftop",
    presenceBooking: true,
    noteBooking: 9.4,
    presenceExpedia: true,
    score: {
      activiteDigitale: 22,  // Booking 9.4, IG 47k, presse internationale
      coherenceMarche: 23,   // Clientèle luxury européenne — parfait alignement
      tailleCapacite: 12,    // Boutique 28 chambres, volume limité mais premium
      contactDecideur: 13,   // Email DG disponible, LinkedIn actif
      liberteOta: 15,        // Pas d'exclusivité OTA
    },
    stage: "qualification",
    commissionStandard: 10,
    commissionPlancher: 8,
    langue: "en",
    dateAjout: "2026-06-05",
    dateProchainContact: "2026-06-25",
    notes: "Score 85 ✓ — outreach autorisé. Angle : visibilité marché Golfe + co-marketing lancement.",
  },

  {
    id: "p005",
    nom: "Sahara Desert Experience",
    type: "prestataire_activites",
    pays: "Maroc",
    ville: "Merzouga",
    region: "Drâa-Tafilalet",
    adresseWeb: "sahara-desert-experience.com",
    emailContact: "info@sahara-desert-experience.com",
    linkedinContact: "linkedin.com/in/omar-sahara-guide",
    nomContact: "Omar El Moutaoukil",
    posteContact: "Fondateur & Guide senior",
    capaciteDescription: "Circuits 3–7 jours · 200 clients / mois en haute saison",
    presenceBooking: true,
    noteBooking: 9.1,
    presenceExpedia: false,
    score: {
      activiteDigitale: 20,  // TripAdvisor #1 Merzouga, Booking 9.1, social actif
      coherenceMarche: 24,   // Désert = produit phare cible Europe & Golfe
      tailleCapacite: 13,    // Volume élevé pour un opérateur local
      contactDecideur: 12,   // Email direct + LinkedIn fondateur
      liberteOta: 13,        // Viator listé, non exclusif
    },
    stage: "qualification",
    commissionStandard: 18,
    commissionPlancher: 15,
    langue: "fr",
    dateAjout: "2026-06-07",
    dateProchainContact: "2026-06-26",
    notes: "Score 82 ✓ — outreach autorisé. Très bien référencé. Angle : audience OTA internationale.",
  },

  {
    id: "p006",
    nom: "Royal Transfer Morocco",
    type: "transport",
    pays: "Maroc",
    ville: "Casablanca",
    region: "Casablanca-Settat",
    adresseWeb: "royaltransfer.ma",
    emailContact: "direction@royaltransfer.ma",
    linkedinContact: "linkedin.com/company/royal-transfer-morocco",
    nomContact: "Mehdi Lahmidi",
    posteContact: "PDG",
    capaciteDescription: "Flotte 25 véhicules · Aéroports Casa, Marrakech, Agadir, Fès",
    presenceBooking: true,
    noteBooking: 4.7,
    presenceExpedia: false,
    score: {
      activiteDigitale: 18,  // Google Business 4.7★, site pro
      coherenceMarche: 16,   // Transferts = nécessaire mais priorité secondaire
      tailleCapacite: 14,    // Grande flotte, couverture nationale
      contactDecideur: 13,   // PDG LinkedIn + email direct
      liberteOta: 10,        // Contrats avec Booking Taxi
    },
    stage: "qualification",
    commissionStandard: 15,
    commissionPlancher: 12,
    langue: "fr",
    dateAjout: "2026-06-09",
    notes: "Score 71 — sous seuil 75. Réévaluation prévue si meilleure liberté OTA obtenue.",
  },

  // ═══════════════════════════════════════════════════════════
  // OUTREACH — email J0 envoyé, en attente de réponse
  // ═══════════════════════════════════════════════════════════

  {
    id: "p007",
    nom: "Riad Dar Anika",
    type: "hotel_riad",
    pays: "Maroc",
    ville: "Marrakech",
    region: "Marrakech-Safi",
    adresseWeb: "daranika.com",
    emailContact: "contact@daranika.com",
    nomContact: "Leila Idrissi",
    posteContact: "Directrice",
    nbChambres: 18,
    capaciteDescription: "18 chambres · Spa traditionnel hammam · Rooftop",
    presenceBooking: true,
    noteBooking: 9.2,
    presenceExpedia: false,
    score: {
      activiteDigitale: 20,  // Booking 9.2, IG 22k, TripAdvisor Cert. d'Excellence
      coherenceMarche: 22,   // Clientèle parisienne, presse française régulière
      tailleCapacite: 14,    // 18 chambres — volume correct segment boutique
      contactDecideur: 12,   // Email formulaire site, pas email direct DG
      liberteOta: 15,        // Non exclusif
    },
    stage: "outreach",
    commissionStandard: 10,
    commissionPlancher: 8,
    langue: "fr",
    dateAjout: "2026-05-28",
    dateProchainContact: "2026-06-26",
    notes: "J0 envoyé 2026-06-23. Angle : badge Partenaire Fondateur + visibilité UK & Golfe.",
  },

  {
    id: "p008",
    nom: "Atlas Amadil Beach Hotel",
    type: "hotel_riad",
    pays: "Maroc",
    ville: "Agadir",
    region: "Souss-Massa",
    adresseWeb: "atlas-amadil.com",
    emailContact: "sales@atlas-amadil.com",
    linkedinContact: "linkedin.com/company/atlas-hotels-resorts",
    nomContact: "Rachid Bensouda",
    posteContact: "Directeur des ventes",
    nbChambres: 197,
    capaciteDescription: "197 chambres · Bord de mer · 3 piscines · Club kids",
    presenceBooking: true,
    noteBooking: 8.7,
    presenceExpedia: true,
    score: {
      activiteDigitale: 20,  // Présence solide Booking + Expedia + TA
      coherenceMarche: 20,   // Famille + soleil = cœur du marché européen
      tailleCapacite: 18,    // 197 chambres — volume fort
      contactDecideur: 12,   // Dir. des ventes LinkedIn, email pro
      liberteOta: 7,         // Contrats actifs Booking + Expedia — liberté réduite
    },
    stage: "outreach",
    commissionStandard: 10,
    commissionPlancher: 8,
    langue: "fr",
    dateAjout: "2026-06-01",
    dateProchainContact: "2026-06-27",
    notes: "J0 envoyé 2026-06-23. Watchpoint : engagement OTA existant. Angle : canal Golfe inexploité.",
  },

  {
    id: "p009",
    nom: "Atlas Events & MICE",
    type: "mice",
    pays: "Maroc",
    ville: "Casablanca",
    region: "Casablanca-Settat",
    adresseWeb: "atlas-events.ma",
    emailContact: "pierre.dubois@atlas-events.ma",
    linkedinContact: "linkedin.com/in/pierre-dubois-mice",
    nomContact: "Pierre Dubois",
    posteContact: "Directeur général",
    capaciteDescription: "Séminaires 10–500 pax · Teambuilding · Incentive desert & montagne",
    presenceBooking: false,
    presenceExpedia: false,
    score: {
      activiteDigitale: 16,  // Site pro, LinkedIn actif, peu d'avis publics
      coherenceMarche: 22,   // MICE = cible France, Belgique, Suisse confirmée
      tailleCapacite: 15,    // Capacité groupes élevée
      contactDecideur: 15,   // DG email direct + LinkedIn
      liberteOta: 8,         // Plateforme Incenteev existante (non exclusive)
    },
    stage: "outreach",
    commissionStandard: 12,
    commissionPlancher: 10,
    langue: "fr",
    dateAjout: "2026-06-03",
    dateProchainContact: "2026-06-28",
    notes: "J0 envoyé 2026-06-23. Segment MICE sous-exploité. Angle : destination clé en main Maroc.",
  },

  // ═══════════════════════════════════════════════════════════
  // NÉGOCIATION — réponse reçue, termes en discussion
  // ═══════════════════════════════════════════════════════════

  {
    id: "p010",
    nom: "Terres d'Aventure",
    type: "tour_operateur",
    pays: "France",
    ville: "Paris",
    region: "Île-de-France",
    adresseWeb: "terdav.com",
    emailContact: "partenariats@terdav.com",
    linkedinContact: "linkedin.com/company/terres-d-aventure",
    nomContact: "Sandrine Moreau",
    posteContact: "Responsable partenariats",
    capaciteDescription: "TO aventure & randonnée · 50 000 clients / an · Présent 80 pays",
    presenceBooking: false,
    presenceExpedia: false,
    score: {
      activiteDigitale: 24,  // Site #1 FR TO aventure, newsletter 120k, IG 80k
      coherenceMarche: 24,   // Clientèle française randonnée / aventure = cœur cible
      tailleCapacite: 20,    // Volume énorme, impact fort
      contactDecideur: 13,   // Resp. partenariats email direct
      liberteOta: 7,         // Accords Viator / Airbnb Experiences — liberté partielle
    },
    stage: "negociation",
    commissionStandard: 12,
    commissionPlancher: 10,
    langue: "fr",
    dateAjout: "2026-05-10",
    dateProchainContact: "2026-06-27",
    notes: "Demande commission 14% (au-dessus standard 12%). Objection : risque pré-lancement. Contre-offre B préparée : 12% + Badge Fondateur + accès beta.",
  },

  {
    id: "p011",
    nom: "Sofitel Agadir Thalassa Sea & Spa",
    type: "hotel_luxe",
    pays: "Maroc",
    ville: "Agadir",
    region: "Souss-Massa",
    adresseWeb: "sofitel.com/agadir",
    emailContact: "h3648-sl@sofitel.com",
    linkedinContact: "linkedin.com/company/sofitel-agadir",
    nomContact: "Jean-Marc Lefevre",
    posteContact: "Directeur général",
    nbChambres: 368,
    capaciteDescription: "368 chambres & suites · 2 piscines · Spa Thalasso 2 000 m²",
    presenceBooking: true,
    noteBooking: 8.8,
    presenceExpedia: true,
    score: {
      activiteDigitale: 24,  // Présence Booking + Expedia + Marriott Bonvoy forte
      coherenceMarche: 24,   // Luxe Agadir — cible Europe + Golfe idéale
      tailleCapacite: 20,    // 368 chambres — volume maximum
      contactDecideur: 13,   // DG email hotelier confirmé
      liberteOta: 10,        // Bonvoy + OTAs majeurs, pas d'exclusivité
    },
    stage: "negociation",
    commissionStandard: 10,
    commissionPlancher: 8,
    langue: "fr",
    dateAjout: "2026-05-05",
    dateProchainContact: "2026-06-26",
    notes: "Intéressé. Demande reporting mensuel détaillé + SLA 24h support. À inclure dans le contrat. Contre-offre 9% discutée.",
  },

  {
    id: "p012",
    nom: "Marco Vasco",
    type: "agence_voyage",
    pays: "France",
    ville: "Paris",
    region: "Île-de-France",
    adresseWeb: "marcovasco.fr",
    emailContact: "b2b@marcovasco.fr",
    linkedinContact: "linkedin.com/company/marco-vasco",
    nomContact: "Antoine Girard",
    posteContact: "Directeur B2B & Partenariats",
    capaciteDescription: "Voyages sur-mesure haut de gamme · 30 000 clients / an · Maroc top 3 dest.",
    presenceBooking: false,
    presenceExpedia: false,
    score: {
      activiteDigitale: 22,  // Site fort, presse luxe, avis Trustpilot 4.7/5
      coherenceMarche: 23,   // Clientèle CSP+ française, sur-mesure = parfait
      tailleCapacite: 18,    // Volume fort, Maroc déjà top destination
      contactDecideur: 15,   // Dir. B2B email direct + LinkedIn
      liberteOta: 6,         // Propre plateforme propriétaire
    },
    stage: "negociation",
    commissionStandard: 14,
    commissionPlancher: 12,
    langue: "fr",
    dateAjout: "2026-05-18",
    dateProchainContact: "2026-06-25",
    notes: "Très motivé. Demande commission 16% + extranet partenaire dédié. Contre-offre : 14% standard + co-marketing lancement + accès beta extranet Q4.",
  },

  // ═══════════════════════════════════════════════════════════
  // CLOSING — offre validée, contrat en finalisation
  // ═══════════════════════════════════════════════════════════

  {
    id: "p013",
    nom: "Riad Kniza",
    type: "hotel_riad",
    pays: "Maroc",
    ville: "Marrakech",
    region: "Marrakech-Safi",
    adresseWeb: "riadkniza.com",
    emailContact: "reservations@riadkniza.com",
    linkedinContact: "linkedin.com/company/riad-kniza",
    nomContact: "Abdellatif Aït Ben Abdeslem",
    posteContact: "Propriétaire & Directeur",
    nbChambres: 17,
    capaciteDescription: "17 chambres · Hammam privatif · Collection d'art berbère",
    presenceBooking: true,
    noteBooking: 9.6,
    presenceExpedia: false,
    score: {
      activiteDigitale: 22,  // Booking 9.6 — référence medina, TA Travelers' Choice
      coherenceMarche: 24,   // Luxury culturel = clientèle UK / France / Golfe
      tailleCapacite: 11,    // 17 chambres — boutique premium
      contactDecideur: 15,   // Propriétaire email direct + WhatsApp confirmé
      liberteOta: 11,        // Booking uniquement, ouvert à diversifier
    },
    stage: "closing",
    commissionStandard: 10,
    commissionPlancher: 8,
    langue: "en",
    dateAjout: "2026-04-20",
    dateProchainContact: "2026-06-24",
    notes: "Accord verbal sur 10%. Contrat généré — en attente signature YouSign. ⚡ PRIORITÉ.",
  },

  {
    id: "p014",
    nom: "Voyageurs du Monde",
    type: "tour_operateur",
    pays: "France",
    ville: "Paris",
    region: "Île-de-France",
    adresseWeb: "vdm.com",
    emailContact: "partenaires@vdm.com",
    linkedinContact: "linkedin.com/company/voyageurs-du-monde",
    nomContact: "Nathalie Chapuis",
    posteContact: "Directrice des achats",
    capaciteDescription: "TO haut de gamme sur-mesure · 80 000 clients / an · Leader France",
    presenceBooking: false,
    presenceExpedia: false,
    score: {
      activiteDigitale: 25,  // Notoriété maximale, presse haut de gamme, IG 120k
      coherenceMarche: 25,   // Clientèle CSP++ française — alignement parfait
      tailleCapacite: 20,    // Potentiel de volume exceptionnel
      contactDecideur: 13,   // Dir. achats confirmée via LinkedIn + email
      liberteOta: 9,         // Propre CRS + Tourplan — pas d'exclusivité OTA externe
    },
    stage: "closing",
    commissionStandard: 12,
    commissionPlancher: 10,
    langue: "fr",
    dateAjout: "2026-04-10",
    dateProchainContact: "2026-06-25",
    notes: "Accord 12% + commission verrouillée 12 mois. Contrat envoyé via YouSign — relance prévue vendredi. Deal estimé > 80 000 $ / an ⚠️ VALIDATION HUMAINE REQUISE.",
  },

  // ═══════════════════════════════════════════════════════════
  // ACTIVATION OTA — contrat signé, partenaire actif sur babmorocco.com
  // ═══════════════════════════════════════════════════════════

  {
    id: "p015",
    nom: "Jumeirah Al Naseem",
    type: "hotel_luxe",
    pays: "Émirats Arabes Unis",
    ville: "Dubaï",
    region: "Jumeirah",
    adresseWeb: "jumeirah.com/al-naseem",
    emailContact: "partnerships@jumeirah.com",
    linkedinContact: "linkedin.com/company/jumeirah-hotels-resorts",
    nomContact: "Fatima Al Mansoori",
    posteContact: "Director of Distribution & Partnerships",
    nbChambres: 430,
    capaciteDescription: "430 chambres · Accès direct plage Burj Al Arab · 7 restaurants",
    presenceBooking: true,
    noteBooking: 9.0,
    presenceExpedia: true,
    score: {
      activiteDigitale: 24,  // Présence digitale mondiale, IG 200k+
      coherenceMarche: 24,   // Luxe EAU = cible Golfe & Europe aisée
      tailleCapacite: 20,    // Volume & prestige maximum
      contactDecideur: 14,   // Director Partnerships email direct LinkedIn
      liberteOta: 5,         // Présent partout mais pas d'exclusivité confirmée
    },
    stage: "activation_ota",
    commissionStandard: 10,
    commissionPlancher: 8,
    langue: "en",
    dateAjout: "2026-03-15",
    notes: "✅ Signé 2026-05-30. Webhook OTA déclenché — actif sur babmorocco.com depuis 2026-05-30 14:37 UTC. 1er partenaire Golfe — vitrine stratégique.",
  },

  // ═══════════════════════════════════════════════════════════
  // MIS EN VEILLE — score < 75 ou séquence outreach sans réponse
  // ═══════════════════════════════════════════════════════════

  {
    id: "p016",
    nom: "Palais Amani",
    type: "hotel_luxe",
    pays: "Maroc",
    ville: "Fès",
    region: "Fès-Meknès",
    adresseWeb: "palaisamani.com",
    emailContact: "info@palaisamani.com",
    nomContact: "Isabelle Laurent",
    posteContact: "Directrice",
    nbChambres: 14,
    capaciteDescription: "14 chambres & suites · Piscine medina · Restaurant gastronomique",
    presenceBooking: true,
    noteBooking: 9.5,
    presenceExpedia: false,
    score: {
      activiteDigitale: 22,  // Booking 9.5, Condé Nast Traveller listé
      coherenceMarche: 22,   // Luxe medina Fès = tourisme culturel haut de gamme
      tailleCapacite: 6,     // 14 chambres — volume trop faible pour priorité
      contactDecideur: 8,    // Pas d'email direct identifié, site générique
      liberteOta: 12,        // Booking uniquement, partiellement libre
    },
    stage: "veille",
    commissionStandard: 10,
    commissionPlancher: 8,
    langue: "fr",
    dateAjout: "2026-05-20",
    dateProchainContact: "2026-07-20",
    notes: "Score 70 — sous seuil 75. Réévaluation juillet 2026. Enrichir contact décideur en priorité.",
  },

  {
    id: "p017",
    nom: "Riad Laaroussa",
    type: "hotel_riad",
    pays: "Maroc",
    ville: "Fès",
    region: "Fès-Meknès",
    adresseWeb: "riad-laaroussa.com",
    emailContact: "contact@riad-laaroussa.com",
    nomContact: "Noureddine El Fassi",
    posteContact: "Gérant",
    nbChambres: 8,
    capaciteDescription: "8 chambres · Terrasse panoramique medina · Cours de cuisine",
    presenceBooking: true,
    noteBooking: 9.3,
    presenceExpedia: false,
    score: {
      activiteDigitale: 18,  // Booking 9.3, blog voyage récurrent, IG limité
      coherenceMarche: 20,   // Authenticité medina = cible europe culturelle
      tailleCapacite: 5,     // Très petit — 8 chambres
      contactDecideur: 15,   // Gérant email direct + WhatsApp actif
      liberteOta: 15,        // Non exclusif
    },
    stage: "veille",
    commissionStandard: 10,
    commissionPlancher: 8,
    langue: "fr",
    dateAjout: "2026-05-25",
    dateProchainContact: "2026-07-25",
    notes: "Score 73 — sous seuil. Très bonne note Booking. Volume insuffisant actuellement. Recontacter à l'ouverture du deuxième riad (annoncé S2 2026).",
  },

  // ═══════════════════════════════════════════════════════════
  // PERDU — signé avec concurrent ou abandon définitif
  // ═══════════════════════════════════════════════════════════

  {
    id: "p018",
    nom: "Medina Expeditions",
    type: "tour_operateur",
    pays: "France",
    ville: "Lyon",
    region: "Auvergne-Rhône-Alpes",
    adresseWeb: "medina-expeditions.fr",
    emailContact: "contact@medina-expeditions.fr",
    linkedinContact: "linkedin.com/company/medina-expeditions",
    nomContact: "Christophe Valette",
    posteContact: "Gérant",
    capaciteDescription: "TO spécialisé Maghreb · 2 000 clients / an",
    presenceBooking: false,
    presenceExpedia: false,
    score: {
      activiteDigitale: 18,  // Site correct, présence réseaux correcte
      coherenceMarche: 22,   // TO spécialiste Maghreb = alignement fort
      tailleCapacite: 14,    // Volume correct pour un TO régional
      contactDecideur: 15,   // Gérant email direct
      liberteOta: 12,        // Travelfactory partenaire principal, non exclusif
    },
    stage: "perdu",
    commissionStandard: 12,
    commissionPlancher: 10,
    langue: "fr",
    dateAjout: "2026-04-01",
    notes: "❌ Perdu 2026-06-10. Signé accord exclusif 24 mois avec Evaneos. Réactiver en 2028.",
  },
];

export default mockProspects;
