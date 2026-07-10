import { readFileSync } from 'fs';
import { resolve } from 'path';
import { load } from 'js-yaml';
import { WorkgroupRowSchema } from './schema';
import { workgroupToEntities } from './workgroupToEntities';
import { crossWorkgroupRef, emailToUserName } from './refs';

const FIXTURE_LOCATION = 'file:src/__fixtures__/wg-<name>.yaml';

const loadFixture = (name: string) => {
  const raw = readFileSync(
    resolve(__dirname, '..', '__fixtures__', `wg-${name}.yaml`),
    'utf8',
  );
  // The BigQuery `workgroups` query projects each subgroup with a
  // `parent` field (the parent workgroup name). YAML fixtures are
  // nested so the parent is implicit — inject it here so the parsed
  // shape matches what the live source emits.
  const parsed = load(raw) as { workgroup: string; subgroups?: object[] };
  const subgroups = (parsed.subgroups ?? []).map(sg => ({
    ...sg,
    parent: parsed.workgroup,
  }));
  return WorkgroupRowSchema.parse({ ...parsed, subgroups });
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

    it('keeps subgroup children empty and exposes cross-workgroup composition via annotation only', () => {
      // Cross-workgroup composition refs are recorded in the
      // `mozilla.org/composed-from` annotation instead of `spec.children`
      // so the Backstage catalog processor doesn't emit `parentOf`
      // relations for them. That keeps stock member-aggregation walkers
      // (`@backstage/plugin-org`'s MembersListCard "Include subgroups")
      // from descending into workgroups we've merely borrowed access
      // from when computing a parent workgroup's transitive members.
      const admins = byKind('Group').find(
        g => g.metadata.name === 'backstage-admins',
      )!;
      // Subgroups now expose their cross-workgroup composition via
      // `spec.children` (resolves into proper Group relations) AND via
      // the annotation (for the legacy "composed-from" card).
      expect((admins.spec as { children?: string[] }).children).toEqual([
        'group:workgroups/sre-admins',
      ]);
      expect(admins.metadata.annotations?.['mozilla.org/composed-from']).toBe(
        'group:workgroups/sre-admins',
      );

      const iap = byKind('Group').find(
        g => g.metadata.name === 'backstage-iap-access',
      )!;
      expect((iap.spec as { children?: string[] }).children).toEqual([
        'group:workgroups/backstage-admins',
        'group:workgroups/backstage-developers',
        'group:workgroups/backstage-viewers',
      ]);
      expect(iap.metadata.annotations?.['mozilla.org/composed-from']).toBe(
        [
          'group:workgroups/backstage-admins',
          'group:workgroups/backstage-developers',
          'group:workgroups/backstage-viewers',
        ].join(','),
      );
    });

    it('annotates the parent Group with a source-location pointing at the workgroup YAML', () => {
      const parent = byKind('Group').find(
        g => g.metadata.name === 'backstage',
      )!;
      expect(
        parent.metadata.annotations?.['backstage.io/source-location'],
      ).toBe(
        'url:https://github.com/mozilla/global-platform-admin/blob/main/google-workspace-management/tf/workgroups/backstage.yaml',
      );
    });

    it('annotates each subgroup with the same source-location as the parent (subgroups are inlined in the YAML)', () => {
      const subgroup = byKind('Group').find(
        g => g.metadata.name === 'backstage-admins',
      )!;
      expect(
        subgroup.metadata.annotations?.['backstage.io/source-location'],
      ).toBe(
        'url:https://github.com/mozilla/global-platform-admin/blob/main/google-workspace-management/tf/workgroups/backstage.yaml',
      );
    });

    it('adds a DAWG link and a source-location link on the parent Group', () => {
      const parent = byKind('Group').find(
        g => g.metadata.name === 'backstage',
      )!;
      expect(parent.metadata.links).toEqual([
        {
          url: 'https://protosaur.dev/dawg/workgroup/backstage',
          title: 'View on DAWG',
          icon: 'dawg',
        },
        {
          url: 'url:https://github.com/mozilla/global-platform-admin/blob/main/google-workspace-management/tf/workgroups/backstage.yaml',
          title: 'View source on Github',
          icon: 'github',
        },
      ]);
    });

    it('adds a DAWG link on each subgroup with a hash anchor for the subgroup', () => {
      const subgroup = byKind('Group').find(
        g => g.metadata.name === 'backstage-admins',
      )!;
      expect(subgroup.metadata.links).toEqual([
        {
          url: 'https://protosaur.dev/dawg/workgroup/backstage#admins',
          title: 'View on DAWG',
          icon: 'dawg',
        },
        {
          url: 'url:https://github.com/mozilla/global-platform-admin/blob/main/google-workspace-management/tf/workgroups/backstage.yaml',
          title: 'View source on Github',
          icon: 'github',
        },
      ]);
    });

    it('emits no User entities (no members on this workgroup)', () => {
      expect(byKind('User')).toHaveLength(0);
    });
  });

  describe('people users are not emitted; gcp users are', () => {
    // Human `mozilla.org`-domain users come from the separate
    // `userToEntities` transform fed by the users source. The workgroup
    // transform only emits `user:gcp/…` entities, for
    // `@firefox.gcp.mozilla.com` IAM identities found in subgroup members.
    const wg = loadFixture('fxa');
    const entities = workgroupToEntities(wg, FIXTURE_LOCATION);
    const byKind = (kind: string) => entities.filter(e => e.kind === kind);

    it('emits user:gcp entities only for @firefox.gcp.mozilla.com members', () => {
      const gcpUsers = byKind('User');
      expect(gcpUsers.map(u => u.metadata.name).sort()).toEqual([
        'bkochendorfer',
        'dkirchner',
      ]);
      expect(gcpUsers.every(u => u.metadata.namespace === 'gcp')).toBe(true);
    });

    it('leaves subgroup spec.members empty when it has no gcp members (provider fills it from the users source)', () => {
      const developers = byKind('Group').find(
        g => g.metadata.name === 'fxa-developers',
      )!;
      expect((developers.spec as { members?: string[] }).members ?? []).toEqual(
        [],
      );
    });

    it('links a subgroup with gcp members to their user:gcp refs', () => {
      const viewers = byKind('Group').find(
        g => g.metadata.name === 'fxa-viewers',
      )!;
      expect((viewers.spec as { members?: string[] }).members).toEqual([
        'user:gcp/bkochendorfer',
        'user:gcp/dkirchner',
      ]);
    });

    it('parent workgroup has no direct members of its own', () => {
      const parent = byKind('Group').find(g => g.metadata.name === 'fxa')!;
      expect((parent.spec as { members?: string[] }).members ?? []).toEqual([]);
    });
  });
});

describe('gcp identity members', () => {
  it('emits user:gcp entities for @firefox.gcp.mozilla.com members and links them', () => {
    const wg = {
      workgroup: 'cloud-engineering',
      sponsor: 's@mozilla.com',
      tickets: [],
      managers: [],
      subgroups: [
        {
          parent: 'cloud-engineering',
          name: 'admins',
          members: [
            'wstuckey@firefox.gcp.mozilla.com',
            'sa@project.iam.gserviceaccount.com',
          ],
        },
      ],
    } as any;
    const out = workgroupToEntities(wg, 'loc');
    const gcpUser = out.find(
      e => e.kind === 'User' && e.metadata.namespace === 'gcp',
    );
    expect(gcpUser?.metadata.name).toBe('wstuckey');
    const sub = out.find(
      e => e.kind === 'Group' && e.metadata.name === 'cloud-engineering-admins',
    );
    expect((sub!.spec as any).members).toContain('user:gcp/wstuckey');
    // service-account IAM principals are NOT turned into gcp users
    expect(out.some(e => e.metadata.name === 'sa')).toBe(false);
  });

  it('ignores type-prefixed IAM principals (group:/serviceAccount:) at the gcp domain', () => {
    const wg = {
      workgroup: 'mofo-data',
      sponsor: 's@mozilla.com',
      tickets: [],
      managers: [],
      subgroups: [
        {
          parent: 'mofo-data',
          name: 'viewers',
          members: [
            'realuser@firefox.gcp.mozilla.com',
            // A Google Group principal that also lives at the gcp domain — its
            // local-part contains a ':' and must NOT become a user:gcp entity
            // (would be an invalid metadata.name and fail catalog ingestion).
            'group:gcp-wg-mofo-data--viewers@firefox.gcp.mozilla.com',
          ],
        },
      ],
    } as any;
    const out = workgroupToEntities(wg, 'loc');
    const gcpUsers = out.filter(
      e => e.kind === 'User' && e.metadata.namespace === 'gcp',
    );
    // only the bare user email becomes a gcp user
    expect(gcpUsers.map(u => u.metadata.name)).toEqual(['realuser']);
    // no entity name ever contains a ':'
    expect(out.every(e => !e.metadata.name.includes(':'))).toBe(true);
    const sub = out.find(
      e => e.kind === 'Group' && e.metadata.name === 'mofo-data-viewers',
    );
    expect((sub!.spec as any).members).toEqual(['user:gcp/realuser']);
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
