import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import {
  authOwnershipResolutionExtensionPoint,
  type AuthOwnershipResolver,
} from '@backstage/plugin-auth-node';
import {
  Entity,
  RELATION_MEMBER_OF,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import type { AuthService } from '@backstage/backend-plugin-api';

/**
 * Logins whose Workday local-part differs from their GCP IAM local-part.
 *
 * SECURITY / MAINTENANCE: linking is by bare local-part
 * (`user:people/<lp>` ↔ `user:gcp/<lp>`), which assumes mozilla.com local-parts
 * are unique per person and align 1:1 with GCP IAM local-parts. This map is the
 * hand-maintained exception list for the mismatches. Because the linked gcp
 * identity's groups flow into `ownershipEntityRefs` (and thus permission gates
 * like DevTools admin), add an entry here whenever a new person's GCP IAM
 * local-part differs from their Workday local-part — and never map a login to a
 * gcp local-part that belongs to a different human. Owner: Cloud Engineering.
 */
export const STATIC_LOGIN_TO_GCP: Record<string, string> = {
  jbuckley: 'jbuck',
  jthomas: 'jason',
};

function memberOfGroups(entity: Entity): string[] {
  return (entity.relations ?? [])
    .filter(
      r => r.type === RELATION_MEMBER_OF && r.targetRef.startsWith('group:'),
    )
    .map(r => r.targetRef);
}

/**
 * Ownership resolver that keeps the default ownership (the user's own ref +
 * its `memberOf` groups) and unions in the groups of the caller's linked GCP
 * identity (`user:gcp/<localpart>`), so workgroup admin/viewer membership —
 * expressed via GCP IAM identities — grants ownership to the signed-in person.
 */
export class GcpLinkedOwnershipResolver implements AuthOwnershipResolver {
  constructor(
    private readonly catalog: {
      getEntityByRef: typeof catalogServiceRef.T.getEntityByRef;
    },
    private readonly auth: AuthService,
  ) {}

  async resolveOwnershipEntityRefs(entity: Entity) {
    const base = [stringifyEntityRef(entity), ...memberOfGroups(entity)];
    const localPart = entity.metadata.name;
    const gcpLocalPart = STATIC_LOGIN_TO_GCP[localPart] ?? localPart;
    const gcpRef = `user:gcp/${gcpLocalPart}`;
    const credentials = await this.auth.getOwnServiceCredentials();
    const gcpEntity = await this.catalog.getEntityByRef(gcpRef, {
      credentials,
    });
    const gcpGroups = gcpEntity ? memberOfGroups(gcpEntity) : [];
    return {
      ownershipEntityRefs: Array.from(new Set([...base, ...gcpGroups])),
    };
  }
}

export const authModuleGcpLinkedOwnership = createBackendModule({
  pluginId: 'auth',
  moduleId: 'gcp-linked-ownership',
  register(reg) {
    reg.registerInit({
      deps: {
        ownership: authOwnershipResolutionExtensionPoint,
        catalog: catalogServiceRef,
        auth: coreServices.auth,
      },
      async init({ ownership, catalog, auth }) {
        ownership.setAuthOwnershipResolver(
          new GcpLinkedOwnershipResolver(catalog, auth),
        );
      },
    });
  },
});

export default authModuleGcpLinkedOwnership;
