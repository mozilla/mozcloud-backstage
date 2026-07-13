import { emailLocalPart } from './refs';

describe('emailLocalPart', () => {
  it('returns the lowercased local part, preserving dots (resolver-compatible)', () => {
    expect(emailLocalPart('wstuckey@mozilla.com')).toBe('wstuckey');
    expect(emailLocalPart('First.Last@mozilla.com')).toBe('first.last');
    expect(emailLocalPart('jbuck@firefox.gcp.mozilla.com')).toBe('jbuck');
  });

  it('drops plus-addressing so aliases collapse onto the base identity', () => {
    // tkorris+bugzilla and tkorris are the same mailbox / person (Taddes Korris)
    expect(emailLocalPart('tkorris+bugzilla@mozilla.com')).toBe('tkorris');
    expect(emailLocalPart('a.b+tag@mozilla.com')).toBe('a.b');
  });

  it('sanitizes any remaining invalid characters to a valid name', () => {
    const valid = /^[a-z0-9]+([-_.][a-z0-9]+)*$/;
    for (const e of [
      'tkorris+bugzilla@mozilla.com',
      'a..b@mozilla.com',
      'x+y@mozilla.com',
      'first.last@mozilla.com',
      "o'brien@mozilla.com",
    ]) {
      expect(emailLocalPart(e)).toMatch(valid);
    }
  });
});
