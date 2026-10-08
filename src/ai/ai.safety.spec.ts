import {
  detectEmergency,
  detectProhibitedIntent,
  normalizeForMatch,
  policySnippets,
  safetyRules,
  stripUnverifiedDoctors,
} from './ai.safety';

describe('normalisation that safety matching depends on', () => {
  it('folds the punctuation and Arabic spellings that real keyboards produce', () => {
    expect(normalizeForMatch('I CAN’T  breathe')).toBe("i can't breathe");
    expect(normalizeForMatch('نَوْبَة قَلْبِيَّة')).toBe('نوبه قلبيه');
    expect(normalizeForMatch('أَلَم فى الصدر')).toBe('الم في الصدر');
  });
});

describe('emergency detection', () => {
  it.each([
    'severe chest pain since this morning',
    'I can’t breathe properly',
    'he is unconscious on the floor',
    'I want to kill myself',
    'عندي نزيف حاد',
    'أعتقد أنها جلطة',
  ])('flags %s', (input) => {
    expect(detectEmergency(input)).toBe(true);
  });

  it.each([
    'I would like to book a dermatology appointment',
    'which specialty treats acne',
    'ابحث عن طبيب جلدية',
  ])('leaves %s to normal triage', (input) => {
    expect(detectEmergency(input)).toBe(false);
  });
});

describe('prohibited-request detection', () => {
  it.each([
    ['diagnose me please', 'diagnosis'],
    ['what illness do i have', 'diagnosis'],
    ['can you prescribe amoxicillin', 'medication'],
    ['which painkiller should i take', 'medication'],
    ['what dosage of paracetamol', 'dosage'],
    ['how many tablets per day', 'dosage'],
    ['كم الجرعة المناسبة', 'dosage'],
    ['اي دواء افضل', 'medication'],
  ])('classifies %s as %s', (input, category) => {
    expect(detectProhibitedIntent(input)).toBe(category);
  });

  it.each([
    // A patient volunteering history, asking about specialties, or asking a
    // logistics question must not be swallowed by the guard.
    'I was diagnosed with asthma three years ago',
    'my doctor prescribed something last month and I need a follow-up',
    'which specialty should I see for knee pain',
    'do I have to pay before the appointment',
    'how much does a consultation cost',
    'ما هو التخصص المناسب لألم الظهر',
  ])('does not decline %s', (input) => {
    expect(detectProhibitedIntent(input)).toBeNull();
  });
});

describe('approved policy snippets', () => {
  it('returns the snippet matching the query', () => {
    expect(policySnippets('can I cancel my booking')).toContain('24 hours');
  });

  it('answers from the artefact only', () => {
    const texts = safetyRules.policySnippets.map((s) => s.text);
    for (const sentence of policySnippets('fees').split(/(?<=\.)\s+/))
      expect(texts.some((t) => t.includes(sentence.trim()))).toBe(true);
  });

  it('falls back to every approved snippet rather than inventing one', () => {
    expect(policySnippets('something unrelated entirely')).toBe(
      safetyRules.policySnippets.map((s) => s.text).join(' '),
    );
  });
});

describe('removing doctors no capability returned', () => {
  it('keeps a verified doctor and drops an invented one', () => {
    const result = stripUnverifiedDoctors(
      'Dr. Ahmed Hassan is available on Tuesday. Dr. Mona Khalil also has slots. Book early.',
      ['Ahmed Hassan'],
    );
    expect(result.text).toBe(
      'Dr. Ahmed Hassan is available on Tuesday. Book early.',
    );
    expect(result.removed).toEqual(['Mona Khalil']);
  });

  it('accepts a surname-only reference to a verified doctor', () => {
    const result = stripUnverifiedDoctors('Dr. Hassan can see you.', [
      'Ahmed Hassan',
    ]);
    expect(result.removed).toEqual([]);
  });

  it('will not let two different doctors jointly validate one invented name', () => {
    const result = stripUnverifiedDoctors('See Dr. Ahmed Khalil.', [
      'Ahmed Hassan',
      'Mona Khalil',
    ]);
    expect(result.removed).toEqual(['Ahmed Khalil']);
    expect(result.text).toBe('');
  });

  it('strips an invented Arabic doctor', () => {
    const result = stripUnverifiedDoctors(
      'دكتور أحمد حسن متاح غدا. د. منى خليل ايضا متاحه.',
      ['أحمد حسن'],
    );
    expect(result.text).toContain('أحمد حسن');
    expect(result.text).not.toContain('منى خليل');
  });

  it('leaves an answer that names no doctor untouched', () => {
    const text = 'A cardiologist is the right specialty for these symptoms.';
    expect(stripUnverifiedDoctors(text, []).text).toBe(text);
  });
});
