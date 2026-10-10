import { MEDICAL_DISCLAIMER_TEXT } from 'src/medical-question/medical-question.constants';

export const SUGGESTION_MARKER = '\n<search-suggestion>';

/**
 * The disclaimer the system attaches to every answer.
 *
 * Idempotent: the error handler wraps content that may already have been
 * disclaimered by the path that then failed, and appending a second copy
 * would wedge the failure notice between two disclaimers.
 */
export function withDisclaimer(content: string): string {
  const body = withoutDisclaimer(content).trimEnd();
  return `${body}\n\n${MEDICAL_DISCLAIMER_TEXT}`;
}

/**
 * Strips the system-attached disclaimer before an answer is replayed to the
 * model as history. Left in, it consumes the history character budget on every
 * turn and primes the model to write its own copy of a line the system owns.
 */
export function withoutDisclaimer(content: string): string {
  const at = content.indexOf(MEDICAL_DISCLAIMER_TEXT);
  return at < 0 ? content : content.slice(0, at).trimEnd();
}

export function visibleContent(raw: string): string {
  const marker = raw.indexOf(SUGGESTION_MARKER);
  if (marker >= 0) return raw.slice(0, marker);
  // Withhold any incomplete marker so internal JSON never appears in the UI.
  for (let n = SUGGESTION_MARKER.length - 1; n > 0; n--) {
    if (raw.endsWith(SUGGESTION_MARKER.slice(0, n))) return raw.slice(0, -n);
  }
  return raw;
}

/**
 * Stateful equivalent of `visibleContent()` for a growing stream. Scanning
 * the full `raw` string from offset 0 on every chunk makes the generation
 * loop O(n²) in response length; this only (re)scans the region that could
 * possibly contain a marker that wasn't visible last call.
 */
export function createVisibleContentTracker() {
  let confirmedLength = 0;
  return (raw: string): string => {
    const searchFrom = Math.max(
      0,
      confirmedLength - (SUGGESTION_MARKER.length - 1),
    );
    const marker = raw.indexOf(SUGGESTION_MARKER, searchFrom);
    if (marker >= 0) return raw.slice(0, marker);
    for (let n = SUGGESTION_MARKER.length - 1; n > 0; n--) {
      if (raw.endsWith(SUGGESTION_MARKER.slice(0, n))) return raw.slice(0, -n);
    }
    confirmedLength = raw.length;
    return raw;
  };
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
