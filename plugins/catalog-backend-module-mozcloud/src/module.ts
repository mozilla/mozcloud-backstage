import * as fs from 'fs/promises';
import * as path from 'path';
import * as YAML from 'yaml';

import {
  coreServices,
  createBackendModule,
  SchedulerServiceTaskRunner,
  LoggerService,
} from '@backstage/backend-plugin-api';

import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';

import {
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
  Entity,
  GroupEntityV1alpha1,
  UserEntityV1alpha1,
} from '@backstage/catalog-model';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';

import {
  DefaultGithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';

import { Config } from '@backstage/config';

import { Octokit } from '@octokit/rest';

export class MozcloudEntityProvider implements EntityProvider {
  private readonly env: string;
  private connection?: EntityProviderConnection;
  private taskRunner: SchedulerServiceTaskRunner;
  private logger: LoggerService;
  private config: Config;

  constructor(
    env: string,
    taskRunner: SchedulerServiceTaskRunner,
    logger: LoggerService,
    config: Config,
  ) {
    this.env = env;
    this.taskRunner = taskRunner;
    this.logger = logger;
    this.config = config;
  }

  getProviderName(): string {
    return `mozcloud-${this.env}`;
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;

    await this.taskRunner.run({
      id: this.getProviderName(),
      fn: async () => {
        await this.run();
      },
    });
  }

  async run(): Promise<void> {
    if (!this.connection) {
      throw new Error('not initialized');
    }

    const entitySourceLocation: {
      owner: string;
      repo: string;
      workgroupsPath: string;
      tenantsPath: string;
      ref: string;
    } = this.config.get('catalog.providers.mozcloud.entitySourceLocation');

    // do some github experiments first
    const integrations = ScmIntegrations.fromConfig(this.config);
    const credentialsProvider =
      DefaultGithubCredentialsProvider.fromIntegrations(integrations);
    const { token } = await credentialsProvider.getCredentials({
      url: `https://github.com/${entitySourceLocation.owner}/${entitySourceLocation.repo}`,
    });
    const octokit = new Octokit({ auth: token });

    const response = await octokit.repos.getContent({
      owner: entitySourceLocation.owner,
      repo: entitySourceLocation.repo,
      path: entitySourceLocation.workgroupsPath,
      ref: entitySourceLocation.ref,
    });

    const items = response.data;
    const workgroups = [];

    if (Array.isArray(items)) {
      for (const item of items) {
        if (item.type === 'file' && item.name.toLowerCase().endsWith('yaml')) {
          this.logger.info(`.. processing workgroup file: ${item.name}`);

          const fileResponse = await octokit.repos.getContent({
            owner: entitySourceLocation.owner,
            repo: entitySourceLocation.repo,
            path: item.path,
            ref: entitySourceLocation.ref,
          });

          const content = Buffer.from(
            (fileResponse.data as any).content,
            'base64',
          ).toString('utf-8');
          const workgroup = YAML.parse(content);

          workgroups.push(workgroup);
        }
      }
    }

    const workgroup_emails = new Map();

    for (const workgroup of workgroups) {
      workgroup_emails.set(workgroup.workgroup, new Map());

      for (const subgroup of workgroup.subgroups) {
        workgroup_emails
          .get(workgroup.workgroup)
          .set(subgroup.name, subgroup.members ?? []);
      }
    }

    for (const workgroup of workgroups) {
      for (const subgroup of workgroup.subgroups) {
        for (const subworkgroup of subgroup.workgroups ?? []) {
          const parts = subworkgroup.split('/');

          if (workgroup_emails.get(parts[0]).get(parts[1])) {
            for (const email of workgroup_emails.get(parts[0]).get(parts[1])) {
              workgroup_emails
                .get(workgroup.workgroup)
                .get(subgroup.name)
                .push(email);
            }
          } else {
            this.logger.error(
              `workgroup ${workgroup.workgroup}/${subgroup.name} tries to inherit members from unknown: ${subworkgroup}`,
            );
          }
        }
      }
    }

    // build group resources
    const groupResources = new Map();

    for (const workgroup of workgroup_emails.keys()) {
      const groupEntity: GroupEntityV1alpha1 = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Group',
        metadata: {
          annotations: {
            [ANNOTATION_LOCATION]: `mozcloud-workgroup:https://github.com/mozilla/global-platform-admin/blob/main/google-workspace-management/tf/workgroups/${workgroup}.yaml`,
            [ANNOTATION_ORIGIN_LOCATION]: `mozcloud-workgroup:https://github.com/mozilla/global-platform-admin/blob/main/google-workspace-management/tf/workgroups/${workgroup}.yaml`,
          },
          name: workgroup,
        },
        spec: {
          type: 'mozcloud-workgroup',
          profile: {
            displayName: workgroup,
          },
          children: [],
        },
      };

      groupResources.set(workgroup, groupEntity);

      for (const subgroup of workgroup_emails.get(workgroup).keys()) {
        groupResources
          .get(workgroup)
          .spec.children.push(`${workgroup}--${subgroup}`);

        const subgroupEntity: GroupEntityV1alpha1 = {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Group',
          metadata: {
            annotations: {
              [ANNOTATION_LOCATION]: `mozcloud-workgroup:https://github.com/mozilla/global-platform-admin/blob/main/google-workspace-management/tf/workgroups/${workgroup}.yaml`,
              [ANNOTATION_ORIGIN_LOCATION]: `mozcloud-workgroup:https://github.com/mozilla/global-platform-admin/blob/main/google-workspace-management/tf/workgroups/${workgroup}.yaml`,
            },
            name: `${workgroup}--${subgroup}`,
          },
          spec: {
            type: 'mozcloud-workgroup',
            profile: {
              displayName: `${workgroup}--${subgroup}`,
            },
            children: [],
          },
        };

        groupResources.set(`${workgroup}--${subgroup}`, subgroupEntity);
      }
    }

    // build user resources
    const userResources = new Map();

    for (const workgroup of workgroup_emails.keys()) {
      for (const subgroup of workgroup_emails.get(workgroup).keys()) {
        for (const email of workgroup_emails.get(workgroup).get(subgroup)) {
          const parts = email.split('@');

          if (!userResources.has(parts[0])) {
            const userEntity: UserEntityV1alpha1 = {
              apiVersion: 'backstage.io/v1alpha1',
              kind: 'User',
              metadata: {
                annotations: {
                  [ANNOTATION_LOCATION]: `mozcloud-user:https://people.mozilla.org/s?query=${email}&who=staff`,
                  [ANNOTATION_ORIGIN_LOCATION]: `mozcloud-user:https://people.mozilla.org/s?query=${email}&who=staff`,
                },
                name: parts[0],
              },
              spec: {
                profile: {
                  displayName: parts[0],
                  email: email,
                },
                memberOf: [`${workgroup}--${subgroup}`],
              },
            };

            userResources.set(parts[0], userEntity);
          } else {
            userResources
              .get(parts[0])
              .spec.memberOf.push(`${workgroup}--${subgroup}`);
          }
        }
      }
    }

    this.logger.info(`found ${groupResources.size} mozcloud workgroups`);
    this.logger.info(`found ${userResources.size} mozcloud users`);

    const allEntities = Array.from(groupResources.values())
      .concat(Array.from(userResources.values()))
      .map(entity => ({
        entity,
        locationKey: `mozcloud-provider:${this.env}`,
      }));

    await this.connection.applyMutation({
      type: 'full',
      entities: allEntities,
    });
  }
}

export const catalogModuleMozcloud = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'mozcloud',
  register(reg) {
    reg.registerInit({
      deps: {
        logger: coreServices.logger,
        catalog: catalogProcessingExtensionPoint,
        scheduler: coreServices.scheduler,
        config: coreServices.rootConfig,
      },
      async init({ logger, catalog, scheduler, config }) {
        const frequency_minutes: number =
          config.getOptionalNumber(
            'catalog.providers.mozcloud.schedule.frequency.minutes',
          ) || 60;
        const timeout_seconds: number =
          config.getOptionalNumber(
            'catalog.providers.mozcloud.schedule.timeout.seconds',
          ) || 10;
        const initialDelay_seconds: number =
          config.getOptionalNumber(
            'catalog.providers.mozcloud.schedule.initialDelay.seconds',
          ) || 30;

        const taskRunner = scheduler.createScheduledTaskRunner({
          frequency: { minutes: frequency_minutes },
          timeout: { seconds: timeout_seconds },
          initialDelay: { seconds: initialDelay_seconds },
        });

        const mozcloud = new MozcloudEntityProvider(
          'dev',
          taskRunner,
          logger,
          config,
        );
        catalog.addEntityProvider(mozcloud);
      },
    });
  },
});
