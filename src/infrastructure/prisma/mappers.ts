export function parseDomainDate(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${label} date`);
  return date;
}


export function parseNullableDomainDate(value: string | null, label: string): Date | null {
  return value === null ? null : parseDomainDate(value, label);
}

export function toDomainIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function toReadonlyJsonObject(value: unknown): Readonly<Record<string, unknown>> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return Object.freeze({ ...(value as Record<string, unknown>) });
  return Object.freeze({});
}
