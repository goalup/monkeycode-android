import type { ChatMessage } from '../handler';
import { normalizeTimestampToNs } from '../handler';
import {
  getDotIndexForEntryId,
  getUserInputIndexDots,
  mergeLoadedUserInputIndexEntries,
  mergeUserInputIndexEntries,
  normalizeUserInputIndexPage,
} from '../userInputIndex';

const NS_1 = 1793069663570000000;
const NS_2 = 1793069652970000000;

describe('normalizeTimestampToNs', () => {
  it('keeps nanosecond timestamps and aligns them to 10ms', () => {
    expect(normalizeTimestampToNs(NS_1)).toBe(NS_1);
    expect(normalizeTimestampToNs(1793069663572965432)).toBe(1793069663570000000);
  });

  it('scales millisecond and second timestamps', () => {
    expect(normalizeTimestampToNs(1793069663572)).toBe(1793069663570000000);
    expect(normalizeTimestampToNs(1793069663)).toBe(1793069663000000000);
  });

  it('returns 0 for missing or invalid values', () => {
    expect(normalizeTimestampToNs(0)).toBe(0);
    expect(normalizeTimestampToNs(Number.NaN)).toBe(0);
  });
});

describe('normalizeUserInputIndexPage', () => {
  it('reverses the newest-first page into ascending order and derives ids from timestamps', () => {
    const page = normalizeUserInputIndexPage([
      { id: 'server-id-1', timestamp: NS_1, content: 'newer' },
      { id: 'server-id-2', timestamp: NS_2, content: 'older', truncated: true },
    ]);

    expect(page.map((e) => e.content)).toEqual(['older', 'newer']);
    expect(page.map((e) => e.id)).toEqual([`user-input-${NS_2}`, `user-input-${NS_1}`]);
    expect(page[0].truncated).toBe(true);
  });

  it('falls back to the provided id when no timestamp is present', () => {
    expect(normalizeUserInputIndexPage([{ id: 'fallback', content: 'x' }])).toEqual([
      { id: 'fallback', timestamp: 0, content: 'x', truncated: false },
    ]);
  });
});

describe('mergeLoadedUserInputIndexEntries', () => {
  it('prepends older pages', () => {
    const current = normalizeUserInputIndexPage([{ timestamp: NS_1, content: 'newer' }]);
    const older = normalizeUserInputIndexPage([{ timestamp: NS_2, content: 'older' }]);
    expect(mergeLoadedUserInputIndexEntries(current, older).map((e) => e.content)).toEqual(['older', 'newer']);
  });
});

describe('mergeUserInputIndexEntries', () => {
  it('deduplicates against the REST index and appends unseen live user messages', () => {
    const entries = normalizeUserInputIndexPage([{ timestamp: NS_2, content: 'from-rest' }]);
    const live: ChatMessage[] = [
      { id: `user-input-${NS_2}`, kind: 'user', text: 'duplicate', time: NS_2 },
      { id: `user-input-${NS_1}`, kind: 'user', text: 'live-only', time: NS_1 },
      { id: 'assistant-1', kind: 'assistant', text: 'ignore me', time: NS_1 },
    ];

    const merged = mergeUserInputIndexEntries(entries, live);
    expect(merged.map((e) => e.content)).toEqual(['from-rest', 'live-only']);
  });
});

describe('dots', () => {
  const entries = normalizeUserInputIndexPage(
    Array.from({ length: 10 }, (_, i) => ({ timestamp: NS_1 - i * 10_000_000, content: `m${i}` })),
  );

  it('buckets entries into at most maxDots dots covering every entry', () => {
    const dots = getUserInputIndexDots(entries, 6);
    expect(dots).toHaveLength(6);
    expect(dots[0].startIndex).toBe(0);
    expect(dots[dots.length - 1].endIndex).toBe(entries.length - 1);
    dots.forEach((dot, i) => {
      if (i > 0) expect(dot.startIndex).toBe(dots[i - 1].endIndex + 1);
    });
  });

  it('maps an entry id to its dot index', () => {
    const target = entries[7];
    const dotIndex = getDotIndexForEntryId(entries, target.id, 6);
    expect(dotIndex).not.toBeNull();
    const dot = getUserInputIndexDots(entries, 6)[dotIndex as number];
    expect(dot.startIndex <= 7 && dot.endIndex >= 7).toBe(true);
  });

  it('returns null for unknown or empty ids', () => {
    expect(getDotIndexForEntryId(entries, 'missing', 6)).toBeNull();
    expect(getDotIndexForEntryId(entries, null, 6)).toBeNull();
  });
});
