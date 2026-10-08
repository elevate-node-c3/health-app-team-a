import safetyRules from './domain/safety-rules.json';

export { safetyRules };

const ARABIC_DIACRITICS = /[ً-ْـ]/g;
const SMART_SINGLE_QUOTES = /[‘’ʼ՚]/g;
const SMART_DOUBLE_QUOTES = /[“”]/g;

/**
 * Folds a patient message into the form safety rules are matched against.
 *
 * Matching safety keywords against raw input is how a bypass gets shipped:
 * mobile keyboards autocorrect `'` to U+2019, so a literal `"can't breathe"`
 * keyword silently stops matching the exact phrase it exists to catch. Arabic
 * input varies the same way across hamza forms, ta marbuta, and diacritics.
 */
export function normalizeForMatch(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(SMART_SINGLE_QUOTES, "'")
    .replace(SMART_DOUBLE_QUOTES, '"')
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isArabic(input: string): boolean {
  return /[؀-ۿ]/.test(input);
}

export function detectEmergency(input: string): boolean {
  const text = normalizeForMatch(input);
  return safetyRules.emergency.keywords.some((keyword) =>
    text.includes(normalizeForMatch(keyword)),
  );
}

export function emergencyResponse(input: string): string {
  return isArabic(input)
    ? safetyRules.emergency.responseAr
    : safetyRules.emergency.response;
}

const PROHIBITED_PATTERNS = safetyRules.prohibited.categories.map(
  (category) => ({
    id: category.id,
    patterns: category.patterns.map((p) => new RegExp(p, 'u')),
  }),
);

/** Returns the prohibited category the message asks for, or null. */
export function detectProhibitedIntent(input: string): string | null {
  const text = normalizeForMatch(input);
  for (const category of PROHIBITED_PATTERNS) {
    if (category.patterns.some((pattern) => pattern.test(text)))
      return category.id;
  }
  return null;
}

export function prohibitedResponse(input: string): string {
  return isArabic(input)
    ? safetyRules.prohibited.responseAr
    : safetyRules.prohibited.response;
}

export function policySnippets(query: string): string {
  const text = normalizeForMatch(query);
  const matched = safetyRules.policySnippets.filter((snippet) =>
    snippet.keywords.some((keyword) =>
      text.includes(normalizeForMatch(keyword)),
    ),
  );
  const chosen = matched.length > 0 ? matched : safetyRules.policySnippets;
  return chosen.map((snippet) => snippet.text).join(' ');
}

/**
 * A title followed by something name-shaped.
 *
 * Three things bound this deliberately tightly, because a false positive here
 * deletes a correct answer:
 *
 * - Not case-insensitive. Each name part must be capitalised (or Arabic, which
 *   has no case), so "Dr. Mona Khalil is the best choice" captures "Mona
 *   Khalil" and stops at the lowercase "is". An `i` flag makes the quantifier
 *   swallow the rest of the clause.
 * - A separator after the title is mandatory, so "DRUGS" is not read as "DR" +
 *   the name "UGS".
 * - The bare indefinite Arabic `دكتور`/`دكتورة` is NOT a trigger. It is how
 *   Arabic says "a doctor" generically — "زيارة دكتور جلدية" is "visit a
 *   dermatology doctor", not a person — and since the prompt mandates Arabic
 *   replies to Arabic input, treating it as a name collapses nearly every
 *   Arabic answer. Only the definite `الدكتور(ة)` and the abbreviation `د.`,
 *   which in practice precede an actual name, trigger here.
 */
const TITLE = String.raw`(?:\b[Dd][Rr](?:\.|\b)|\b[Dd]octor\b|\b[Pp]rof(?:\.|\b)|الدكتورة|الدكتور|د\.)`;
const NAME_PART = String.raw`[\p{Lu}؀-ۿ][\p{L}'’-]*`;
const DOCTOR_MENTION = new RegExp(
  String.raw`${TITLE}\s*((?:${NAME_PART})(?:\s+(?:${NAME_PART})){0,3})`,
  'gu',
);

/**
 * Sentence boundary that does not fire on the period of a title abbreviation.
 *
 * A plain `(?<=[.!?])\s+` splits "Dr. Mona Khalil" into "Dr." and "Mona
 * Khalil", which detaches every name from the title that identifies it as a
 * doctor and makes the whole check silently pass everything through. The
 * leading lookbehind uses `[^\p{L}]` rather than `\b` because `\b` does not
 * recognise a boundary before an Arabic letter.
 */
const SENTENCE_BOUNDARY =
  /(?<!(?:^|[^\p{L}])(?:dr|prof|mr|mrs|ms|د)\.)(?<=[.!?؟])[ \t]+/iu;

function namePartsOf(name: string): string[] {
  return normalizeForMatch(name)
    .replace(/\b(dr|doctor|prof|الدكتور|دكتور|د)\b\.?/g, '')
    .split(' ')
    .filter((part) => part.length > 1);
}

/**
 * Whether a mention names a doctor some capability call returned.
 *
 * Two shapes count as verified, because Arabic has no capitalisation to bound
 * the captured name and the mention can over-run into the following words:
 * the allowed name is a prefix of the mention ("Ahmed Hassan" in "Ahmed Hassan
 * can see you"), or every part of the mention belongs to one allowed name
 * ("Dr. Hassan" for "Ahmed Hassan"). The subset arm is checked per-name, so an
 * unrelated "Ahmed" and a separate "Hassan" cannot jointly validate an
 * invented "Dr. Ahmed Hassan". A model that prefixes a real doctor's full name
 * with extra words it made up is the residual gap; it keeps the sentence, but
 * the doctor named first is still one a capability returned.
 */
function isVerifiedMention(parts: string[], allowed: string[][]): boolean {
  return allowed.some(
    (name) =>
      name.every((part, i) => parts[i] === part) ||
      parts.every((part) => name.includes(part)),
  );
}

/**
 * Words that follow a title without naming a person, so a mention leading with
 * one is not a doctor reference at all. The specialty catalog is passed in by
 * the caller; this covers the rest, including the capitalised `Today`/
 * `Tomorrow` the system prompt itself mandates.
 */
function isGenericMention(parts: string[], stoplist: Set<string>): boolean {
  return parts.length === 0 || stoplist.has(parts[0]);
}

/**
 * Drops any sentence naming a doctor that no capability call returned.
 *
 * The system prompt already forbids inventing doctors, but a prompt is not an
 * enforcement point: the acceptance criterion is that invented doctors are
 * *removed from the final response*, so the check has to survive a model that
 * ignores its instructions.
 *
 * `genericTerms` should carry the specialty catalog, so "see a doctor Today"
 * and "زيارة الدكتور الجلدية" are recognised as generic advice rather than as
 * invented people and left alone.
 */
export function stripUnverifiedDoctors(
  text: string,
  allowedNames: Iterable<string>,
  genericTerms: Iterable<string> = [],
): { text: string; removed: string[] } {
  const allowed = [...allowedNames]
    .map(namePartsOf)
    .filter((parts) => parts.length > 0);
  const stoplist = new Set([
    ...safetyRules.nameStoplist.terms.flatMap(namePartsOf),
    ...[...genericTerms].flatMap((term) => namePartsOf(term)),
  ]);
  const removed: string[] = [];

  const keepSentence = (sentence: string): boolean => {
    const mentioned = [...sentence.matchAll(DOCTOR_MENTION)].map((m) => m[1]);
    const invented = mentioned.filter((mention) => {
      const parts = namePartsOf(mention);
      if (isGenericMention(parts, stoplist)) return false;
      return !isVerifiedMention(parts, allowed);
    });
    if (invented.length === 0) return true;
    removed.push(...invented);
    return false;
  };

  // Filtering runs line by line so paragraph breaks and bullet lists survive;
  // joining every sentence with a space would reflow the whole answer.
  const kept = text
    .split('\n')
    .map((line) =>
      line
        .split(SENTENCE_BOUNDARY)
        .filter(keepSentence)
        .join(' ')
        .replace(/[ \t]+/g, ' ')
        .trimEnd(),
    )
    .join('\n')
    .trim();

  return { text: kept, removed };
}
