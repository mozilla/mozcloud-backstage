/*
 * Hi!
 *
 * Note that this is an EXAMPLE Backstage backend. Please check the README.
 *
 * Happy hacking!
 */

import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-proxy-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-github'));
// backend.add(import('@backstage/plugin-techdocs-backend'));

// auth plugin
backend.add(import('@backstage/plugin-auth-backend'));
// See https://backstage.io/docs/backend-system/building-backends/migrating#the-auth-plugin
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
// See https://backstage.io/docs/auth/guest/provider

// catalog plugin
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);

// See https://backstage.io/docs/features/software-catalog/configuration#subscribing-to-catalog-errors
backend.add(import('@backstage/plugin-catalog-backend-module-logs'));

// permission plugin
backend.add(import('@backstage/plugin-permission-backend'));
// Custom policy: allow-all EXCEPT DevTools permissions, which require
// membership of the cloud-engineering/admin workgroup subgroup.
backend.add(import('./modules/permissionPolicyDevToolsAdmin'));

// search plugin
backend.add(import('@backstage/plugin-search-backend'));

// search engine
// See https://backstage.io/docs/features/search/search-engines
backend.add(import('@backstage/plugin-search-backend-module-pg'));

// search collators
backend.add(import('@backstage/plugin-search-backend-module-catalog'));
// backend.add(import('@backstage/plugin-search-backend-module-techdocs'));

//
// add github auth provider plugin
//
backend.add(import('@backstage/plugin-auth-backend-module-github-provider'));

//
// add github discovery plugin
//
backend.add(import('@backstage/plugin-catalog-backend-module-github'));

//
// add github events plugin
//
backend.add(import('@backstage/plugin-events-backend-module-github'));

//
// Google IAP auth provider
//
backend.add(import('@backstage/plugin-auth-backend-module-gcp-iap-provider'));

//
// Auth0 auth provider
//
// Custom module: same as @backstage/plugin-auth-backend-module-auth0-provider
// but drops the hardcoded `prompt=consent` from the authorize request so a
// first-party Auth0 app skips the consent screen. See the module for details.
backend.add(import('./modules/authModuleAuth0NoConsentProvider'));

//
// Ownership resolver: union a signed-in person's GCP-identity workgroup
// memberships (user:gcp/*) into their ownershipEntityRefs. See the module.
//
backend.add(import('./modules/authModuleGcpLinkedOwnership'));

//
// mozcloud module for the catalog backend plugin
// -- this will read mozcloud workgroup definitions and generate group & user entities for us
//
backend.add(import('@internal/plugin-catalog-backend-module-mozcloud'));

//
// MCP Actions plugin
//
backend.add(import('@backstage/plugin-mcp-actions-backend'));

//
// DevTools plugin (info/config/external-deps). Access is gated by the
// custom permission policy in ./modules/permissionPolicyDevToolsAdmin.
//
backend.add(import('@backstage/plugin-devtools-backend'));

backend.start();
