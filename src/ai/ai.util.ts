export const SUGGESTION_MARKER = '\n<search-suggestion>';

export function visibleContent(raw: string): string {
  const marker = raw.indexOf(SUGGESTION_MARKER);
  if (marker >= 0) return raw.slice(0, marker);
  // Withhold any incomplete marker so internal JSON never appears in the UI.
  for (let n = SUGGESTION_MARKER.length - 1; n > 0; n--) {
    if (raw.endsWith(SUGGESTION_MARKER.slice(0, n))) return raw.slice(0, -n);
  }
  return raw;
}

export function boundedHistory(
  rows: { input: string; content: string; outcome: string }[],
) {
  const turns: { role: string; content: string }[][] = [];
  let remaining = 16000;
  for (const row of [...rows].reverse()) {
    if (row.outcome !== 'completed') continue;
    if (row.input.length + row.content.length > remaining) break;
    remaining -= row.input.length + row.content.length;
    turns.unshift([
      { role: 'user', content: row.input },
      { role: 'assistant', content: row.content },
    ]);
    if (turns.length === 8) break;
  }
  return turns.flat();
}

export function parseSuggestion(
  raw: string,
  specialties: { id: string; name: string }[],
): Record<string, unknown> | null {
  const at = raw.indexOf(SUGGESTION_MARKER);
  if (at < 0) return null;
  const data = JSON.parse(
    raw
      .slice(at + SUGGESTION_MARKER.length)
      .replace(/<\/search-suggestion>\s*$/, '')
      .trim(),
  ) as Record<string, unknown>;
  const specialty = specialties.find((s) => s.id === data.specialty);
  if (!specialty) throw new Error('Invalid specialty');
  const availability = ['Any Day', 'Today', 'Tomorrow'].includes(
    String(data.availability),
  )
    ? String(data.availability)
    : 'Any Day';
  const query: Record<string, unknown> = {
    specialty: specialty.id,
    availability: [availability],
  };
  if (typeof data.governorate === 'string' && data.governorate.length <= 100)
    query.governorate = data.governorate;
  // nearMe requires explicit client geolocation; never invent coordinates.
  return {
    specialty: specialty.name,
    nearMe: data.nearMe === true,
    availability,
    search: { method: 'GET', path: '/search', query },
    requiresLocation: data.nearMe === true,
  };
}
