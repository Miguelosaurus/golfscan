import type { DistanceUnit } from "@/types/onboarding";

const METERS_PER_YARD = 0.9144;

export function yardsToMeters(yards: number): number {
  return yards * METERS_PER_YARD;
}

export function metersToYards(meters: number): number {
  return meters / METERS_PER_YARD;
}

export function formatDistanceFromYards(
  yards: number | null | undefined,
  unit: DistanceUnit
): string {
  if (typeof yards !== "number" || !Number.isFinite(yards) || yards <= 0) return "";
  const value = unit === "yards" ? yards : yardsToMeters(yards);
  const rounded = Math.round(value);
  return unit === "yards" ? `${rounded} yds` : `${rounded} m`;
}

export function toUnitDistanceValueFromYards(
  yards: number | null | undefined,
  unit: DistanceUnit
): number | null {
  if (typeof yards !== "number" || !Number.isFinite(yards)) return null;
  return unit === "yards" ? yards : yardsToMeters(yards);
}

export function fromUnitDistanceValueToYards(
  value: number,
  unit: DistanceUnit
): number {
  return unit === "yards" ? value : metersToYards(value);
}

