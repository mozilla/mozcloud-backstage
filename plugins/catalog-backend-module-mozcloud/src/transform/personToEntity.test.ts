import { unwrapCisProfile, personToEntity } from './personToEntity';
import { PersonProfileRowSchema } from './schema';
import { emailToUserName } from './refs';

const LOCATION = 'mozcloud-people:fake';

describe('unwrapCisProfile', () => {
  it('flattens {value} and {values} one level and drops signature/metadata wrappers', () => {
    const raw = {
      user_id: { value: 'ad|Mozilla-LDAP|alice', signature: {}, metadata: {} },
      primary_email: { value: 'alice@mozilla.com' },
      access_information: { ldap: { values: { grp: null } } },
      staff_information: { staff: { value: true } },
    };
    const out = unwrapCisProfile(raw);
    expect(out.user_id).toBe('ad|Mozilla-LDAP|alice');
    expect(out.primary_email).toBe('alice@mozilla.com');
    // nested object without its own value/values key is returned as-is
    expect(out.staff_information).toEqual({ staff: { value: true } });
    expect(out.access_information).toEqual({ ldap: { values: { grp: null } } });
  });
});

describe('PersonProfileRowSchema', () => {
  it('parses an unwrapped staff profile and strips unknown keys', () => {
    const row = PersonProfileRowSchema.parse({
      user_id: 'ad|Mozilla-LDAP|alice',
      primary_email: 'alice@mozilla.com',
      primary_username: 'alice',
      first_name: 'Alice',
      last_name: 'Anderson',
      picture: 'https://cdn/avatar.png',
      staff_information: { staff: true },
    });
    expect(row).toEqual({
      user_id: 'ad|Mozilla-LDAP|alice',
      primary_email: 'alice@mozilla.com',
      primary_username: 'alice',
      first_name: 'Alice',
      last_name: 'Anderson',
      picture: 'https://cdn/avatar.png',
    });
  });

  it('rejects a profile with no primary_email', () => {
    expect(() =>
      PersonProfileRowSchema.parse({ user_id: 'x', primary_email: null }),
    ).toThrow();
  });
});

describe('personToEntity', () => {
  const row = {
    user_id: 'ad|Mozilla-LDAP|alice',
    primary_email: 'alice@mozilla.com',
    primary_username: 'alice',
    first_name: 'Alice',
    last_name: 'Anderson',
    picture: 'https://cdn/avatar.png',
  };

  it('builds a User in the people namespace named from the email', () => {
    const e = personToEntity(row, LOCATION);
    expect(e.kind).toBe('User');
    expect(e.metadata.namespace).toBe('people');
    expect(e.metadata.name).toBe(emailToUserName('alice@mozilla.com'));
  });

  it('sets profile and the email/username/user-id annotations', () => {
    const e = personToEntity(row, LOCATION);
    const spec = e.spec as {
      profile?: { displayName?: string; email?: string; picture?: string };
    };
    expect(spec.profile).toEqual({
      displayName: 'Alice Anderson',
      email: 'alice@mozilla.com',
      picture: 'https://cdn/avatar.png',
    });
    const ann = e.metadata.annotations ?? {};
    expect(ann['mozilla.org/email']).toBe('alice@mozilla.com');
    expect(ann['mozilla.org/username']).toBe('alice');
    expect(ann['mozilla.org/user-id']).toBe('ad|Mozilla-LDAP|alice');
    expect(ann['backstage.io/managed-by-location']).toBe(LOCATION);
    expect(ann['backstage.io/managed-by-origin-location']).toBe(LOCATION);
  });

  it('falls back displayName to username then email local-part, and omits picture/username when absent', () => {
    const noName = personToEntity(
      {
        user_id: 'u',
        primary_email: 'bob@mozilla.com',
        primary_username: 'bob',
      },
      LOCATION,
    );
    expect((noName.spec as any).profile.displayName).toBe('bob');
    const bare = personToEntity(
      { user_id: 'u', primary_email: 'carol@mozilla.com' },
      LOCATION,
    );
    expect((bare.spec as any).profile.displayName).toBe('carol');
    expect((bare.spec as any).profile).not.toHaveProperty('picture');
    expect(bare.metadata.annotations).not.toHaveProperty(
      'mozilla.org/username',
    );
  });
});
