export const FEATURE_LABELS: Record<string, string> = {
  PPLC: "Capital (GeoNames PPLC)",
  PPLA: "First-order administrative seat (GeoNames PPLA)",
  PPLA2: "Second-order administrative seat (GeoNames PPLA2)",
  PPLA3: "Third-order administrative seat (GeoNames PPLA3)",
  PPLA4: "Fourth-order administrative seat (GeoNames PPLA4)",
  PPL: "Populated place (GeoNames PPL)",
  PPLX: "Section of a populated place (GeoNames PPLX)",
};

export function featureLabel(code: string): string {
  return FEATURE_LABELS[code] ?? `GeoNames feature ${code}`;
}

export function populationLabel(population: number | null, quality: string, sourceToken: string | null): string {
  if (population != null) {
    return new Intl.NumberFormat("en").format(population);
  }
  if (quality === "population_source_zero") {
    return "Not reported (source token 0, not treated as a verified count)";
  }
  if (sourceToken) {
    return `Not reported (source value “${sourceToken}” could not be used)`;
  }
  return "Not reported";
}

export function formatCoordinate(value: number, axis: "lat" | "lon"): string {
  const direction = axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(5)}° ${direction}`;
}
