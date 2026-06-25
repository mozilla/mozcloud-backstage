import { personToEntity } from './personToEntity';
import { PersonRosterRowSchema } from './schema';
import { emailToUserName } from './refs';

const LOCATION = 'mozcloud-people:fake';

describe('PersonRosterRowSchema', () => {
  it('parses a roster row and strips unknown keys', () => {
    const row = PersonRosterRowSchema.parse({
      user_id: 'ad|Mozilla-LDAP|alice',
      primary_email: 'alice@mozilla.com',
      uuid: 'some-uuid',
      active: true,
      extra_unknown_field: 'dropped',
    });
    expect(row).toEqual({
      user_id: 'ad|Mozilla-LDAP|alice',
      primary_email: 'alice@mozilla.com',
      uuid: 'some-uuid',
      active: true,
    });
  });

  it('requires user_id and primary_email', () => {
    expect(() =>
      PersonRosterRowSchema.parse({ primary_email: 'x@y.com' }),
    ).toThrow();
    expect(() => PersonRosterRowSchema.parse({ user_id: 'x' })).toThrow();
  });
});

describe('personToEntity', () => {
  const rosterRow = {
    user_id: 'ad|Mozilla-LDAP|alice',
    primary_email: 'alice@mozilla.com',
    uuid: 'abc-123',
    active: true,
  };

  const enrichment = {
    name: 'Alice Anderson',
    githubLogin: 'alicegh',
    githubNodeId: 'U_alice',
    githubOrgs: ['mozilla', 'mozilla-services'],
  };

  it('places entity in the people namespace named from the email', () => {
    const e = personToEntity(rosterRow, enrichment, LOCATION);
    expect(e.kind).toBe('User');
    expect(e.metadata.namespace).toBe('people');
    expect(e.metadata.name).toBe(emailToUserName('alice@mozilla.com'));
  });

  it('uses BQ name as displayName when enrichment is present and non-empty', () => {
    const e = personToEntity(rosterRow, enrichment, LOCATION);
    expect((e.spec as any).profile.displayName).toBe('Alice Anderson');
  });

  it('falls back displayName to email local-part when enrichment is absent', () => {
    const e = personToEntity(rosterRow, undefined, LOCATION);
    expect((e.spec as any).profile.displayName).toBe('alice');
  });

  it('falls back displayName to email local-part when enrichment name is empty/null', () => {
    const e1 = personToEntity(rosterRow, { ...enrichment, name: '' }, LOCATION);
    expect((e1.spec as any).profile.displayName).toBe('alice');

    const e2 = personToEntity(
      rosterRow,
      { ...enrichment, name: null },
      LOCATION,
    );
    expect((e2.spec as any).profile.displayName).toBe('alice');
  });

  it('sets email annotation and spec.profile.email always', () => {
    const e = personToEntity(rosterRow, undefined, LOCATION);
    expect((e.spec as any).profile.email).toBe('alice@mozilla.com');
    expect(e.metadata.annotations?.['mozilla.org/email']).toBe(
      'alice@mozilla.com',
    );
  });

  it('sets user-id annotation always', () => {
    const e = personToEntity(rosterRow, undefined, LOCATION);
    expect(e.metadata.annotations?.['mozilla.org/user-id']).toBe(
      'ad|Mozilla-LDAP|alice',
    );
  });

  it('sets managed-by-location and origin-location annotations', () => {
    const e = personToEntity(rosterRow, enrichment, LOCATION);
    expect(e.metadata.annotations?.['backstage.io/managed-by-location']).toBe(
      LOCATION,
    );
    expect(
      e.metadata.annotations?.['backstage.io/managed-by-origin-location'],
    ).toBe(LOCATION);
  });

  it('sets github annotations when enrichment has github data', () => {
    const e = personToEntity(rosterRow, enrichment, LOCATION);
    const ann = e.metadata.annotations ?? {};
    expect(ann['github.com/user-login']).toBe('alicegh');
    expect(ann['github.com/user-id']).toBe('U_alice');
    expect(ann['mozilla.org/github-orgs']).toBe('mozilla,mozilla-services');
  });

  it('omits github annotations when enrichment has no github data', () => {
    const e = personToEntity(rosterRow, { name: 'Alice' }, LOCATION);
    const ann = e.metadata.annotations ?? {};
    expect(ann).not.toHaveProperty('github.com/user-login');
    expect(ann).not.toHaveProperty('github.com/user-id');
    expect(ann).not.toHaveProperty('mozilla.org/github-orgs');
  });

  it('omits mozilla.org/github-orgs when orgs array is empty', () => {
    const e = personToEntity(
      rosterRow,
      { ...enrichment, githubOrgs: [] },
      LOCATION,
    );
    expect(e.metadata.annotations).not.toHaveProperty(
      'mozilla.org/github-orgs',
    );
  });

  it('includes a gravatar picture URL', () => {
    const e = personToEntity(rosterRow, enrichment, LOCATION);
    const picture = (e.spec as any).profile.picture as string;
    expect(picture).toMatch(/^https:\/\/gravatar\.com\/avatar\/[a-f0-9]+\?/);
    expect(picture).toContain('d=initials');
    expect(picture).toContain('s=256');
  });

  it('includes GitHub link when githubLogin present', () => {
    const e = personToEntity(rosterRow, enrichment, LOCATION);
    const links = (e.metadata as any).links as Array<{
      url: string;
      title?: string;
    }>;
    const ghLink = links?.find(l => l.url.startsWith('https://github.com/'));
    expect(ghLink).toBeDefined();
    expect(ghLink?.url).toBe('https://github.com/alicegh');
  });

  it('omits GitHub link when githubLogin absent', () => {
    const e = personToEntity(rosterRow, { name: 'Alice' }, LOCATION);
    const links = (e.metadata as any).links as
      | Array<{ url: string }>
      | undefined;
    expect(
      links?.find(l => l.url.startsWith('https://github.com/')),
    ).toBeUndefined();
  });

  it('includes People Directory and DAWG links for @mozilla.com email', () => {
    const e = personToEntity(rosterRow, enrichment, LOCATION);
    const links = (e.metadata as any).links as Array<{
      url: string;
      title?: string;
    }>;
    const peopleLink = links?.find(l => l.url.includes('people.mozilla.org'));
    const dawgLink = links?.find(l => l.url.includes('protosaur.dev/dawg'));
    expect(peopleLink).toBeDefined();
    expect(dawgLink).toBeDefined();
  });

  it('omits People Directory and DAWG links for non-@mozilla.com email', () => {
    const nonMozRow = { ...rosterRow, primary_email: 'alice@example.com' };
    const e = personToEntity(nonMozRow, undefined, LOCATION);
    const links = (e.metadata as any).links as
      | Array<{ url: string }>
      | undefined;
    expect(
      links?.find(l => l.url.includes('people.mozilla.org')),
    ).toBeUndefined();
    expect(
      links?.find(l => l.url.includes('protosaur.dev/dawg')),
    ).toBeUndefined();
  });

  it('does NOT set spec.memberOf', () => {
    const e = personToEntity(rosterRow, enrichment, LOCATION);
    expect((e.spec as any).memberOf).toBeUndefined();
  });
});
