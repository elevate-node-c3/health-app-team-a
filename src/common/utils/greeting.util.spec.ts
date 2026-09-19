import { buildGreetingText, timeOfDay } from './greeting.util';

const CAIRO = 'Africa/Cairo';

/**
 * Africa/Cairo is UTC+2 (no DST since 2015). We pick UTC instants whose Cairo
 * wall-clock hour lands in each band.
 */
describe('greeting.util (Africa/Cairo)', () => {
  it('is morning before 12:00 Cairo time', () => {
    // 07:00 UTC => 09:00 Cairo
    const at = new Date('2026-09-19T07:00:00Z');
    expect(timeOfDay(at, CAIRO)).toBe('morning');
    expect(buildGreetingText(at, CAIRO)).toBe('Good morning');
  });

  it('is afternoon between 12:00 and 16:59 Cairo time', () => {
    // 12:00 UTC => 14:00 Cairo
    const at = new Date('2026-09-19T12:00:00Z');
    expect(timeOfDay(at, CAIRO)).toBe('afternoon');
    expect(buildGreetingText(at, CAIRO)).toBe('Good afternoon');
  });

  it('is evening from 17:00 Cairo time onward', () => {
    // 15:00 UTC => 17:00 Cairo
    const at = new Date('2026-09-19T15:00:00Z');
    expect(timeOfDay(at, CAIRO)).toBe('evening');
    expect(buildGreetingText(at, CAIRO)).toBe('Good evening');
  });

  it('treats the noon boundary as afternoon', () => {
    // 10:00 UTC => 12:00 Cairo exactly
    const at = new Date('2026-09-19T10:00:00Z');
    expect(timeOfDay(at, CAIRO)).toBe('afternoon');
  });

  it('uses Cairo time, not the host UTC time (late-evening rollover)', () => {
    // 22:30 UTC => 00:30 next day Cairo => morning
    const at = new Date('2026-09-19T22:30:00Z');
    expect(timeOfDay(at, CAIRO)).toBe('morning');
  });
});
