import { createHash } from 'crypto';
import { UserRow } from './schema';
import { userToEntities } from './userToEntities';
import { emailToUserName } from './refs';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const LOCATION = 'mozcloud-users:fake';

const baseRow = (overrides: Partial<UserRow> = {}): UserRow => ({
  email: 'alice@mozilla.com',
  name: 'Alice Anderson',
  github_login: 'alicegithub',
  github_node_id: 'U_kgDOABCDEF',
  github_orgs: ['mozilla', 'mozilla-services'],
  memberships: [
    { workgroup: 'fxa', subgroup: 'developers' },
    { workgroup: 'backstage', subgroup: 'admins' },
  ],
  ...overrides,
});

describe('userToEntities', () => {
  it('emits exactly one User entity per row', () => {
    const entities = userToEntities(baseRow(), LOCATION);
    expect(entities).toHaveLength(1);
    expect(entities[0].kind).toBe('User');
  });

  it('names the User by sanitizing the email and puts it in the workgroups namespace', () => {
    const [user] = userToEntities(baseRow(), LOCATION);
    expect(user.metadata.name).toBe(emailToUserName('alice@mozilla.com'));
    expect(user.metadata.namespace).toBe('workgroups');
  });

  it('populates spec.profile.email and prefers the Workday name as displayName', () => {
    const [user] = userToEntities(baseRow(), LOCATION);
    const profile = (
      user.spec as { profile?: { email?: string; displayName?: string } }
    ).profile;
    expect(profile?.email).toBe('alice@mozilla.com');
    expect(profile?.displayName).toBe('Alice Anderson');
  });

  it('falls back to the email local-part when name is not available', () => {
    const [user] = userToEntities(baseRow({ name: null }), LOCATION);
    const profile = (user.spec as { profile?: { displayName?: string } })
      .profile;
    expect(profile?.displayName).toBe('alice');
  });

  it('maps memberships[] to spec.memberOf using <workgroup>-<subgroup> in the workgroups namespace', () => {
    const [user] = userToEntities(baseRow(), LOCATION);
    expect((user.spec as { memberOf?: string[] }).memberOf).toEqual([
      'workgroups/fxa-developers',
      'workgroups/backstage-admins',
    ]);
  });

  it('annotates with email and github metadata', () => {
    const [user] = userToEntities(baseRow(), LOCATION);
    const ann = user.metadata.annotations ?? {};
    expect(ann['mozilla.org/email']).toBe('alice@mozilla.com');
    expect(ann['github.com/user-login']).toBe('alicegithub');
    expect(ann['github.com/user-id']).toBe('U_kgDOABCDEF');
    expect(ann['mozilla.org/github-orgs']).toBe('mozilla,mozilla-services');
    expect(ann['backstage.io/managed-by-location']).toBe(LOCATION);
    expect(ann['backstage.io/managed-by-origin-location']).toBe(LOCATION);
  });

  it('omits github annotations when the user has no github metadata', () => {
    const [user] = userToEntities(
      baseRow({
        github_login: undefined,
        github_node_id: undefined,
        github_orgs: [],
      }),
      LOCATION,
    );
    const ann = user.metadata.annotations ?? {};
    expect(ann).not.toHaveProperty('github.com/user-login');
    expect(ann).not.toHaveProperty('github.com/user-id');
    expect(ann).not.toHaveProperty('mozilla.org/github-orgs');
  });

  it('omits github-orgs when the array is empty even if login is set', () => {
    const [user] = userToEntities(baseRow({ github_orgs: [] }), LOCATION);
    const ann = user.metadata.annotations ?? {};
    expect(ann['github.com/user-login']).toBe('alicegithub');
    expect(ann).not.toHaveProperty('mozilla.org/github-orgs');
  });

  it('emits an empty memberOf when the user has no memberships', () => {
    const [user] = userToEntities(baseRow({ memberships: [] }), LOCATION);
    expect((user.spec as { memberOf?: string[] }).memberOf).toEqual([]);
  });

  it('handles github_login being explicitly null (BQ null path)', () => {
    const [user] = userToEntities(baseRow({ github_login: null }), LOCATION);
    expect(user.metadata.annotations).not.toHaveProperty(
      'github.com/user-login',
    );
  });

  it('handles github_node_id being explicitly null (BQ null path)', () => {
    const [user] = userToEntities(baseRow({ github_node_id: null }), LOCATION);
    expect(user.metadata.annotations).not.toHaveProperty('github.com/user-id');
  });

  describe('gravatar picture', () => {
    it('hashes the email with SHA-256 (lowercased, trimmed) for the avatar URL', () => {
      const [user] = userToEntities(
        baseRow({ email: '  Alice@MOZILLA.com  ' }),
        LOCATION,
      );
      const expectedHash = sha256('alice@mozilla.com');
      const picture = (user.spec as { profile?: { picture?: string } }).profile
        ?.picture!;
      expect(picture).toContain(`https://gravatar.com/avatar/${expectedHash}?`);
    });

    it('uses d=initials as the fallback and seeds it with the name', () => {
      const [user] = userToEntities(baseRow(), LOCATION);
      const picture = (user.spec as { profile?: { picture?: string } }).profile
        ?.picture!;
      const url = new URL(picture);
      expect(url.searchParams.get('d')).toBe('initials');
      expect(url.searchParams.get('name')).toBe('Alice Anderson');
      expect(url.searchParams.get('s')).toBe('256');
    });

    it('omits the name param when the user has no Workday name', () => {
      const [user] = userToEntities(baseRow({ name: null }), LOCATION);
      const picture = (user.spec as { profile?: { picture?: string } }).profile
        ?.picture!;
      const url = new URL(picture);
      expect(url.searchParams.has('name')).toBe(false);
      expect(url.searchParams.get('d')).toBe('initials');
    });
  });

  describe('links', () => {
    it('adds a GitHub profile link plus mozilla.com directory links', () => {
      const [user] = userToEntities(baseRow(), LOCATION);
      expect(user.metadata.links).toEqual([
        {
          url: 'https://github.com/alicegithub',
          title: '@alicegithub on GitHub',
          icon: 'github',
        },
        {
          url: 'https://people.mozilla.org/s?query=alice%40mozilla.com&who=staff',
          title: 'People Directory Profile',
        },
        {
          url: 'https://protosaur.dev/dawg/user/alice%40mozilla.com',
          title: 'alice@mozilla.com on DAWG',
          icon: 'dawg',
        },
      ]);
    });

    it('omits the GitHub profile link when github_login is missing', () => {
      const [user] = userToEntities(baseRow({ github_login: null }), LOCATION);
      const links = user.metadata.links ?? [];
      expect(
        links.find(l => l.url.startsWith('https://github.com/')),
      ).toBeUndefined();
      // mozilla.com directory links still present
      expect(
        links.some(l => l.url.startsWith('https://people.mozilla.org/')),
      ).toBe(true);
      expect(
        links.some(l => l.url.startsWith('https://protosaur.dev/dawg/user/')),
      ).toBe(true);
    });

    it('emits no mozilla.com directory links for non-@mozilla.com users', () => {
      const [user] = userToEntities(
        baseRow({ email: 'alice@example.org', github_login: null }),
        LOCATION,
      );
      expect(user.metadata.links).toEqual([]);
    });
  });
});
