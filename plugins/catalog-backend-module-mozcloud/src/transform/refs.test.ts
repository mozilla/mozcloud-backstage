import { emailLocalPart } from './refs';

describe('emailLocalPart', () => {
  it('returns the lowercased local part, preserving dots (resolver-compatible)', () => {
    expect(emailLocalPart('wstuckey@mozilla.com')).toBe('wstuckey');
    expect(emailLocalPart('First.Last@mozilla.com')).toBe('first.last');
    expect(emailLocalPart('jbuck@firefox.gcp.mozilla.com')).toBe('jbuck');
  });

  it('sanitizes characters invalid in a Backstage entity name', () => {
    // plus-addressing: '+' is not allowed in metadata.name
    expect(emailLocalPart('tkorris+bugzilla@mozilla.com')).toBe(
      'tkorris-bugzilla',
    );
    // collapse separator runs and trim edges so the result is always valid
    expect(emailLocalPart('weird.+name@mozilla.com')).toBe('weird-name');
    expect(emailLocalPart('+lead@mozilla.com')).toBe('lead');
  });

  it('always yields a valid entity name (alphanumerics single-separated)', () => {
    const valid = /^[a-z0-9]+([-_.][a-z0-9]+)*$/;
    for (const e of [
      'tkorris+bugzilla@mozilla.com',
      'a..b@mozilla.com',
      'x+@mozilla.com',
      'first.last@mozilla.com',
    ]) {
      expect(emailLocalPart(e)).toMatch(valid);
    }
  });
});
