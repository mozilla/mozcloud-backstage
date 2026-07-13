import { usersQuery } from './users';

describe('usersQuery', () => {
  const sql = usersQuery({ project: 'p', dataset: 'd' });

  it('canonicalizes person emails by stripping plus-addressing', () => {
    // aliases like alice+bugzilla@ must collapse onto alice@ (same mailbox)
    expect(sql).toContain("REGEXP_REPLACE(LOWER(email), r'\\+[^@]*', '')");
  });

  it('groups by the canonical email only (collapses aliases into one row)', () => {
    expect(sql).toMatch(/GROUP BY p\.email\b/);
    expect(sql).not.toMatch(/GROUP BY p\.email, p\.name/);
    // name is aggregated once emails are collapsed
    expect(sql).toContain('ANY_VALUE(p.name) AS name');
  });

  it('joins membership on the canonical (plus-stripped) email', () => {
    expect(sql).toContain('ON p.email = LOWER(m.value)');
  });
});
