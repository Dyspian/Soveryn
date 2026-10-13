export type LaunchCountry = {
  iso2: string;
  name: string;
  category: "small" | "medium" | "large" | "very_large";
  min: number;
  max: number;
  target: number;
};

/**
 * Starting-city counts are game configuration, not census totals.
 * Change this file and re-run the importer. Application logic reads the config.
 */
export const LAUNCH_COUNTRIES: LaunchCountry[] = [
  { iso2: "BE", name: "Belgium", category: "small", min: 5, max: 10, target: 8 },
  { iso2: "NL", name: "Netherlands", category: "small", min: 5, max: 10, target: 8 },
  { iso2: "SE", name: "Sweden", category: "small", min: 5, max: 10, target: 8 },
  { iso2: "NO", name: "Norway", category: "small", min: 5, max: 10, target: 8 },
  { iso2: "AE", name: "United Arab Emirates", category: "small", min: 5, max: 10, target: 8 },
  { iso2: "NZ", name: "New Zealand", category: "small", min: 5, max: 10, target: 8 },
  { iso2: "DE", name: "Germany", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "FR", name: "France", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "GB", name: "United Kingdom", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "ES", name: "Spain", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "IT", name: "Italy", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "PL", name: "Poland", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "NG", name: "Nigeria", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "ZA", name: "South Africa", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "EG", name: "Egypt", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "KE", name: "Kenya", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "CD", name: "Democratic Republic of the Congo", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "CA", name: "Canada", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "MX", name: "Mexico", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "AR", name: "Argentina", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "VE", name: "Venezuela", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "CL", name: "Chile", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "JP", name: "Japan", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "ID", name: "Indonesia", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "SA", name: "Saudi Arabia", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "AU", name: "Australia", category: "medium", min: 10, max: 20, target: 15 },
  { iso2: "BR", name: "Brazil", category: "large", min: 20, max: 35, target: 28 },
  { iso2: "CN", name: "China", category: "large", min: 20, max: 35, target: 28 },
  { iso2: "US", name: "United States", category: "very_large", min: 25, max: 40, target: 32 },
  { iso2: "IN", name: "India", category: "very_large", min: 25, max: 40, target: 32 },
];

export function startingCityTargetTotal(): number {
  return LAUNCH_COUNTRIES.reduce((sum, country) => sum + country.target, 0);
}
