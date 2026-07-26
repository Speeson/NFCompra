export function boundedText(value: unknown, maximumLength: number): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximumLength ? value.trim() : null;
}

export async function jsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch { return null; }
}

export function optionalBoundedText(value: unknown, maximumLength: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  return boundedText(value, maximumLength) ?? undefined;
}

export function normalizedName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

export function operationId(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : null;
}
