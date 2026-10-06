import {
  boundedHistory,
  parseSuggestion,
  SUGGESTION_MARKER,
  visibleContent,
} from './ai.util';

describe('AI history and search boundaries', () => {
  it('keeps only the latest eight completed turns within the character budget', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      input: `${i}`,
      content: 'answer',
      outcome: 'completed',
    }));
    rows.push({
      input: 'secret partial',
      content: 'partial',
      outcome: 'failed',
    });
    const history = boundedHistory(rows);
    expect(history).toHaveLength(16);
    expect(history[0].content).toBe('12');
    expect(history.some((row) => row.content === 'secret partial')).toBe(false);
    expect(
      boundedHistory([
        { input: 'a'.repeat(16001), content: 'b', outcome: 'completed' },
      ]),
    ).toEqual([]);
  });

  it('never streams a partially received metadata marker', () => {
    for (let i = 1; i <= SUGGESTION_MARKER.length; i++) {
      expect(visibleContent(`answer${SUGGESTION_MARKER.slice(0, i)}`)).toBe(
        'answer',
      );
    }
    expect(visibleContent(`answer${SUGGESTION_MARKER}{"specialty":"x"}`)).toBe(
      'answer',
    );
  });

  it('hands off catalog IDs and supported filters without exposing action fields', () => {
    const suggestion = parseSuggestion(
      `answer${SUGGESTION_MARKER}{"specialty":"id","availability":"Tomorrow","nearMe":true,"book":true}</search-suggestion>`,
      [{ id: 'id', name: 'Cardiology' }],
    );
    expect(suggestion).toEqual({
      specialty: 'Cardiology',
      nearMe: true,
      availability: 'Tomorrow',
      requiresLocation: true,
      search: {
        method: 'GET',
        path: '/search',
        query: { specialty: 'id', availability: ['Tomorrow'] },
      },
    });
    expect(() =>
      parseSuggestion(`${SUGGESTION_MARKER}{"specialty":"invented"}`, []),
    ).toThrow('Invalid specialty');
  });
});
