import {
  LoggerService,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';

/**
 * Placeholder for the v2 workgroups provider. Wired into the module so the
 * config schema is ready and the provider name is reserved, but the
 * `mozdata.mozcloud.workgroups` table does not yet exist — `connect`
 * therefore logs a warning and never schedules a refresh.
 *
 * When the workgroups table lands, replace this body with logic analogous
 * to {@link MozcloudTenantEntityProvider}: read rows, transform to Group
 * (and User) entities in the `workgroups` namespace, apply a full mutation.
 */
export class MozcloudWorkgroupEntityProvider implements EntityProvider {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(
    private readonly logger: LoggerService,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private readonly _taskRunner: SchedulerServiceTaskRunner,
  ) {}

  getProviderName(): string {
    return 'MozcloudWorkgroupEntityProvider';
  }

  async connect(_connection: EntityProviderConnection): Promise<void> {
    this.logger.warn(
      `${this.getProviderName()} is not yet implemented; tenant Group shells will be the only workgroup entities until the mozcloud.workgroups table exists.`,
    );
  }
}
