import { readFileSync } from 'fs';
import { resolve } from 'path';
import { load } from 'js-yaml';
import { WorkgroupRowSchema } from './schema';
import { workgroupToEntities } from './workgroupToEntities';
import {
  crossWorkgroupRef,
  emailToUserName,
  subgroupName,
  userRef,
} from './refs';

const FIXTURE_LOCATION = 'file:src/__fixtures__/wg-<name>.yaml';

const loadFixture = (name: string) => {
  const raw = readFileSync(
    resolve(__dirname, '..', '__fixtures__', `wg-${name}.yaml`),
    'utf8',
  );
  return WorkgroupRowSchema.parse(load(raw));
};

describe('workgroupToEntities', () => {
  describe('backstage workgroup (no members, all cross-workgroup composition)', () => {
    const wg = loadFixture('backstage');
    const entities = workgroupToEntities(wg, FIXTURE_LOCATION);
    const byKind = (kind: string) => entities.filter(e => e.kind === kind);

    it('emits one parent Group named after the workgroup', () => {
      const parents = byKind('Group').filter(
        g => g.metadata.name === 'backstage',
      );
      expect(parents).toHaveLength(1);
      expect(parents[0].metadata.namespace).toBe('workgroups');
      expect(parents[0].spec).toMatchObject({
        type: 'workgroup',
        children: [
          'group:workgroups/backstage-admins',
          'group:workgroups/backstage-developers',
          'group:workgroups/backstage-viewers',
          'group:workgroups/backstage-iap-access',
        ],
      });
    });

    it('annotates the parent Group with sponsor + tickets', () => {
      const parent = byKind('Group').find(
        g => g.metadata.name === 'backstage',
      )!;
      expect(parent.metadata.annotations?.['mozilla.org/sponsor']).toBe(
        'phammer@mozilla.com',
      );
      expect(parent.metadata.annotations?.['mozilla.org/tickets']).toContain(
        'MZCLD-434',
      );
    });

    it('emits a subgroup Group per subgroup with parent set', () => {
      const subgroups = byKind('Group').filter(
        g => g.metadata.name !== 'backstage',
      );
      expect(subgroups.map(g => g.metadata.name).sort()).toEqual([
        'backstage-admins',
        'backstage-developers',
        'backstage-iap-access',
        'backstage-viewers',
      ]);
      for (const sg of subgroups) {
        expect(sg.spec).toMatchObject({
          parent: 'workgroups/backstage',
          type: 'workgroup-subgroup',
        });
      }
    });

    it("represents cross-workgroup composition via the subgroup's children", () => {
      const admins = byKind('Group').find(
        g => g.metadata.name === 'backstage-admins',
      )!;
      expect((admins.spec as { children?: string[] }).children).toEqual([
        'group:workgroups/sre-admins',
      ]);

      const iap = byKind('Group').find(
        g => g.metadata.name === 'backstage-iap-access',
      )!;
      expect((iap.spec as { children?: string[] }).children).toEqual([
        'group:workgroups/backstage-admins',
        'group:workgroups/backstage-developers',
        'group:workgroups/backstage-viewers',
      ]);
    });

    it('emits no User entities (no members on this workgroup)', () => {
      expect(byKind('User')).toHaveLength(0);
    });
  });

  describe('fxa workgroup (with members)', () => {
    const wg = loadFixture('fxa');
    const entities = workgroupToEntities(wg, FIXTURE_LOCATION);
    const byKind = (kind: string) => entities.filter(e => e.kind === kind);

    it('emits one User per unique member email across all subgroups', () => {
      const users = byKind('User');
      // 1 admin + 14 developers + 8 viewers = 23 members, all unique
      expect(users.length).toBeGreaterThan(20);
      const refs = users.map(
        u =>
          `${u.kind.toLowerCase()}:${u.metadata.namespace}/${u.metadata.name}`,
      );
      expect(refs).toContain(userRef('wclouser@mozilla.com'));
      expect(refs).toContain(userRef('atoufali@mozilla.com'));
      expect(refs).toContain(userRef('bkochendorfer@firefox.gcp.mozilla.com'));
    });

    it('preserves the email and namespace on each User', () => {
      const wclouser = byKind('User').find(
        u => u.metadata.name === emailToUserName('wclouser@mozilla.com'),
      )!;
      expect(wclouser.metadata.namespace).toBe('workgroups');
      expect(wclouser.metadata.annotations?.['mozilla.org/email']).toBe(
        'wclouser@mozilla.com',
      );
      expect(
        (wclouser.spec as { profile?: { email?: string } }).profile?.email,
      ).toBe('wclouser@mozilla.com');
    });

    it('lists each member as a User ref in the subgroup spec.members', () => {
      const developers = byKind('Group').find(
        g => g.metadata.name === subgroupName('fxa', 'developers'),
      )!;
      const members = (developers.spec as { members?: string[] }).members!;
      expect(members).toContain(userRef('atoufali@mozilla.com'));
      expect(members).toContain(userRef('vbudhram@mozilla.com'));
      expect(members.length).toBeGreaterThanOrEqual(14);
    });

    it('parent workgroup members include union of every subgroup so ownership flows down', () => {
      const parent = byKind('Group').find(g => g.metadata.name === 'fxa')!;
      const parentMembers = (parent.spec as { members?: string[] }).members!;
      // Sampled across admins, developers, viewers — ownership of a System
      // by group:workgroups/fxa must surface for users in any subgroup.
      expect(parentMembers).toContain(userRef('wclouser@mozilla.com')); // admins
      expect(parentMembers).toContain(userRef('atoufali@mozilla.com')); // developers
      expect(parentMembers).toContain(
        userRef('akomarzewski@mozilla.com'),
      ); // viewers
    });
  });
});

describe('email + ref helpers', () => {
  it.each([
    ['alice@mozilla.com', 'alice-mozilla-com'],
    ['ALICE@mozilla.com', 'alice-mozilla-com'],
    ['alice@firefox.gcp.mozilla.com', 'alice-firefox-gcp-mozilla-com'],
    ['first.last@mozilla.com', 'first-last-mozilla-com'],
  ])('emailToUserName(%s) -> %s', (input, expected) => {
    expect(emailToUserName(input)).toBe(expected);
  });

  it.each([
    ['sre/admins', 'group:workgroups/sre-admins'],
    ['fxa/developers', 'group:workgroups/fxa-developers'],
  ])('crossWorkgroupRef(%s) -> %s', (input, expected) => {
    expect(crossWorkgroupRef(input)).toBe(expected);
  });
});
