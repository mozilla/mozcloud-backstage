import { emailLocalPart } from './refs';

describe('emailLocalPart', () => {
  it('returns the lowercased local part', () => {
    expect(emailLocalPart('wstuckey@mozilla.com')).toBe('wstuckey');
    expect(emailLocalPart('First.Last@mozilla.com')).toBe('first.last');
    expect(emailLocalPart('jbuck@firefox.gcp.mozilla.com')).toBe('jbuck');
  });
});
