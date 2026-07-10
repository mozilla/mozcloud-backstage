import { personToEntity, allStaffGroupEntity } from './personToEntity';
import { UserRowSchema } from './schema';
import { emailLocalPart } from './refs';

const LOCATION = 'mozcloud-people:fake';

const fullUser = UserRowSchema.parse({
  email: 'alice@mozilla.com',
  name: 'Alice Anderson',
  github_login: 'alicegh',
  github_node_id: 'U_alice',
  github_orgs: ['mozilla', 'mozilla-services'],
  memberships: [],
});

describe('personToEntity', () => {
  it('places entity in the people namespace named from the email', () => {
    const e = personToEntity(fullUser, LOCATION);
    expect(e.kind).toBe('User');
    expect(e.metadata.namespace).toBe('people');
    expect(e.metadata.name).toBe(emailLocalPart('alice@mozilla.com'));
  });

  it('uses name as displayName when name is non-empty', () => {
    const e = personToEntity(fullUser, LOCATION);
    expect((e.spec as any).profile.displayName).toBe('Alice Anderson');
  });

  it('falls back displayName to email local-part when name is undefined', () => {
    const user = UserRowSchema.parse({
      email: 'alice@mozilla.com',
      memberships: [],
    });
    const e = personToEntity(user, LOCATION);
    expect((e.spec as any).profile.displayName).toBe('alice');
  });

  it('falls back displayName to email local-part when name is empty string', () => {
    const user = UserRowSchema.parse({
      email: 'alice@mozilla.com',
      name: '   ',
      memberships: [],
    });
    const e = personToEntity(user, LOCATION);
    expect((e.spec as any).profile.displayName).toBe('alice');
  });

  it('falls back displayName to email local-part when name is null', () => {
    const user = UserRowSchema.parse({
      email: 'alice@mozilla.com',
      name: null,
      memberships: [],
    });
    const e = personToEntity(user, LOCATION);
    expect((e.spec as any).profile.displayName).toBe('alice');
  });

  it('sets mozilla.org/email annotation always', () => {
    const e = personToEntity(fullUser, LOCATION);
    expect(e.metadata.annotations?.['mozilla.org/email']).toBe(
      'alice@mozilla.com',
    );
  });

  it('sets spec.profile.email always', () => {
    const e = personToEntity(fullUser, LOCATION);
    expect((e.spec as any).profile.email).toBe('alice@mozilla.com');
  });

  it('sets managed-by-location and origin-location annotations', () => {
    const e = personToEntity(fullUser, LOCATION);
    expect(e.metadata.annotations?.['backstage.io/managed-by-location']).toBe(
      LOCATION,
    );
    expect(
      e.metadata.annotations?.['backstage.io/managed-by-origin-location'],
    ).toBe(LOCATION);
  });

  it('sets github annotations when login/id/orgs present', () => {
    const e = personToEntity(fullUser, LOCATION);
    const ann = e.metadata.annotations ?? {};
    expect(ann['github.com/user-login']).toBe('alicegh');
    expect(ann['github.com/user-id']).toBe('U_alice');
    expect(ann['mozilla.org/github-orgs']).toBe('mozilla,mozilla-services');
  });

  it('omits github annotations when login/id/orgs are absent', () => {
    const user = UserRowSchema.parse({
      email: 'alice@mozilla.com',
      memberships: [],
    });
    const e = personToEntity(user, LOCATION);
    const ann = e.metadata.annotations ?? {};
    expect(ann).not.toHaveProperty('github.com/user-login');
    expect(ann).not.toHaveProperty('github.com/user-id');
    expect(ann).not.toHaveProperty('mozilla.org/github-orgs');
  });

  it('omits mozilla.org/github-orgs when orgs array is empty', () => {
    const user = UserRowSchema.parse({
      email: 'alice@mozilla.com',
      github_login: 'alicegh',
      github_orgs: [],
      memberships: [],
    });
    const e = personToEntity(user, LOCATION);
    expect(e.metadata.annotations).not.toHaveProperty(
      'mozilla.org/github-orgs',
    );
  });

  it('includes a gravatar picture URL', () => {
    const e = personToEntity(fullUser, LOCATION);
    const picture = (e.spec as any).profile.picture as string;
    expect(picture).toMatch(/^https:\/\/gravatar\.com\/avatar\/[a-f0-9]+\?/);
    expect(picture).toContain('d=initials');
    expect(picture).toContain('s=256');
  });

  it('includes GitHub link for @mozilla.com email when github_login present', () => {
    const e = personToEntity(fullUser, LOCATION);
    const links = (e.metadata as any).links as Array<{
      url: string;
      title?: string;
    }>;
    const ghLink = links?.find(l => l.url.startsWith('https://github.com/'));
    expect(ghLink).toBeDefined();
    expect(ghLink?.url).toBe('https://github.com/alicegh');
  });

  it('omits GitHub link when github_login absent', () => {
    const user = UserRowSchema.parse({
      email: 'alice@mozilla.com',
      name: 'Alice',
      memberships: [],
    });
    const e = personToEntity(user, LOCATION);
    const links = (e.metadata as any).links as
      | Array<{ url: string }>
      | undefined;
    expect(
      links?.find(l => l.url.startsWith('https://github.com/')),
    ).toBeUndefined();
  });

  it('includes People Directory and DAWG links for @mozilla.com email', () => {
    const e = personToEntity(fullUser, LOCATION);
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
    const user = UserRowSchema.parse({
      email: 'alice@example.com',
      memberships: [],
    });
    const e = personToEntity(user, LOCATION);
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

  it('sets spec.memberOf to the all-staff group', () => {
    const e = personToEntity(fullUser, LOCATION);
    expect((e.spec as any).memberOf).toEqual(['group:people/all-staff']);
  });
});

describe('allStaffGroupEntity', () => {
  it('builds the all-staff Group in the people namespace', () => {
    const g = allStaffGroupEntity(LOCATION);
    expect(g.kind).toBe('Group');
    expect(g.metadata.namespace).toBe('people');
    expect(g.metadata.name).toBe('all-staff');
    expect((g.spec as any).type).toBe('organization');
    expect((g.spec as any).children).toEqual([]);
    expect((g.spec as any).members).toEqual([]);
    expect(g.metadata.annotations?.['backstage.io/managed-by-location']).toBe(
      LOCATION,
    );
  });
});
