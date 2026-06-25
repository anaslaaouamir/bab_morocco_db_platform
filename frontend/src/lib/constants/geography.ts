// Shared geography data used by AddProspectDialog and ScanProspectDialog.

export const COUNTRIES = [
  "Maroc", "France", "Belgique", "Suisse", "Luxembourg",
  "Royaume-Uni", "Irlande", "États-Unis", "Canada", "Australie",
  "Espagne", "Italie", "Portugal",
  "Allemagne", "Autriche",
  "Émirats Arabes Unis", "Arabie Saoudite", "Qatar", "Koweït", "Bahreïn", "Jordanie",
  "Pays-Bas", "Danemark", "Suède", "Norvège",
  "Mexique", "Argentine", "Colombie",
  "Autre",
] as const;

export type Country = (typeof COUNTRIES)[number];

// Countries grouped by commercial market — used by ScanProspectDialog's grouped Select.
export const COUNTRIES_BY_MARKET: { group: string; countries: Country[] }[] = [
  { group: "Maroc",              countries: ["Maroc"] },
  { group: "Europe francophone", countries: ["France", "Belgique", "Suisse", "Luxembourg"] },
  { group: "Europe anglophone",  countries: ["Royaume-Uni", "Irlande"] },
  { group: "Europe DACH",        countries: ["Allemagne", "Autriche"] },
  { group: "Europe Sud",         countries: ["Espagne", "Italie", "Portugal"] },
  { group: "Golfe",              countries: ["Émirats Arabes Unis", "Arabie Saoudite", "Qatar", "Koweït", "Bahreïn"] },
];

// Suggested cities per country. An empty array (or missing key) means the user types freely.
export const CITIES_BY_COUNTRY: Record<string, string[]> = {
  "Maroc":                 ["Marrakech", "Casablanca", "Fès", "Agadir", "Tanger", "Essaouira", "Chefchaouen", "Ouarzazate", "Merzouga", "Rabat", "Meknès", "Dakhla", "Taroudant", "El Jadida", "Tétouan"],
  "France":                ["Paris", "Lyon", "Marseille", "Bordeaux", "Nice", "Toulouse", "Nantes", "Strasbourg", "Lille", "Montpellier"],
  "Belgique":              ["Bruxelles", "Anvers", "Gand", "Liège", "Bruges"],
  "Suisse":                ["Genève", "Zürich", "Lausanne", "Berne", "Bâle"],
  "Luxembourg":            ["Luxembourg"],
  "Royaume-Uni":           ["Londres", "Manchester", "Édimbourg", "Birmingham", "Bristol", "Glasgow", "Liverpool"],
  "Irlande":               ["Dublin", "Cork", "Galway"],
  "Allemagne":             ["Berlin", "Munich", "Hambourg", "Francfort", "Cologne", "Stuttgart", "Düsseldorf"],
  "Autriche":              ["Vienne", "Salzbourg", "Innsbruck", "Graz"],
  "Espagne":               ["Madrid", "Barcelone", "Séville", "Valence", "Malaga", "Bilbao", "Palma de Majorque"],
  "Italie":                ["Rome", "Milan", "Florence", "Venise", "Naples", "Turin", "Bologne"],
  "Portugal":              ["Lisbonne", "Porto", "Faro", "Braga"],
  "Pays-Bas":              ["Amsterdam", "Rotterdam", "La Haye", "Utrecht"],
  "Danemark":              ["Copenhague", "Aarhus", "Odense"],
  "Suède":                 ["Stockholm", "Göteborg", "Malmö"],
  "Norvège":               ["Oslo", "Bergen", "Stavanger"],
  "Émirats Arabes Unis":   ["Dubaï", "Abu Dhabi", "Sharjah", "Ras Al Khaïmah"],
  "Arabie Saoudite":       ["Riyad", "Djeddah", "La Mecque", "Médine", "Dammam"],
  "Qatar":                 ["Doha", "Al Wakrah", "Al Khor"],
  "Koweït":                ["Koweït City", "Hawalli", "Salmiya"],
  "Bahreïn":               ["Manama", "Riffa", "Muharraq"],
  "Jordanie":              ["Amman", "Aqaba", "Pétra", "Jerash"],
  "États-Unis":            ["New York", "Los Angeles", "Miami", "Chicago", "San Francisco", "Houston", "Boston"],
  "Canada":                ["Toronto", "Montréal", "Vancouver", "Calgary", "Ottawa"],
  "Australie":             ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"],
  "Mexique":               ["Mexico", "Cancún", "Guadalajara", "Monterrey"],
  "Argentine":             ["Buenos Aires", "Mendoza", "Córdoba", "Rosario"],
  "Colombie":              ["Bogotá", "Medellín", "Cartagena", "Cali"],
};
