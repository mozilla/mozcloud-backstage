# Changelog

## [0.1.6](https://github.com/mozilla/mozcloud-backstage/compare/v0.1.5...v0.1.6) (2026-10-14)


### Features

* add DevTools plugin gated to cloud-engineering/admins ([aebc258](https://github.com/mozilla/mozcloud-backstage/commit/aebc2587d81253e6e88b581c8e8b9ab5e429406d))
* **app:** add DevTools page and admin-gated sidebar entry ([10418ce](https://github.com/mozilla/mozcloud-backstage/commit/10418ce60b795c7ed740ccb9cbbfa01b2bf04c6f))
* **app:** exclude org-wide admin groups from aggregated member lists ([3f9cdb0](https://github.com/mozilla/mozcloud-backstage/commit/3f9cdb0b609ef3b420254642657fe0d0ae0a5fc0))
* **app:** pruned workgroup member aggregation (exclude org-admin groups) ([d161d7a](https://github.com/mozilla/mozcloud-backstage/commit/d161d7aa05cebdd2a180e8722f0e252656bdba69))
* **app:** use pruned members card that hides org-admin groups from other workgroups ([d364c50](https://github.com/mozilla/mozcloud-backstage/commit/d364c50be2c78e9c2fa76a257a7812d262d34a91))
* **backend:** add DevTools backend plugin ([19a8874](https://github.com/mozilla/mozcloud-backstage/commit/19a88747ebab9032cca263d769de04922c92a371))
* **backend:** gate DevTools behind cloud-engineering/admin permission policy ([75ab1d8](https://github.com/mozilla/mozcloud-backstage/commit/75ab1d887584002b224137beac8b38e8307fb2b1))
* **backend:** union GCP-linked workgroup groups into sign-in ownership ([a24515e](https://github.com/mozilla/mozcloud-backstage/commit/a24515eec44b8cd53f7c0739f4376666933b936c))
* **catalog/auth:** link GCP-IAM workgroup admins to signed-in people for ownership ([97014e5](https://github.com/mozilla/mozcloud-backstage/commit/97014e5b590ab87652ac17867abd07a2093330b3))
* **mozcloud:** emit user:gcp entities and link them into subgroup members ([37abb51](https://github.com/mozilla/mozcloud-backstage/commit/37abb510eadf3f50210a9b9d5b2db9fd7eb37b5f))
* **mozcloud:** key People user entities by email local-part ([29f53d5](https://github.com/mozilla/mozcloud-backstage/commit/29f53d50e0a55f74d16628e1ec93d5b795cc10fe))
* **scaffolder:** add create-tenant-chart software template ([7a91ed0](https://github.com/mozilla/mozcloud-backstage/commit/7a91ed0f4fe38b137d8d375fbcb54d00dcff9126))
* **scaffolder:** add github:ensureAuth preflight action; centralize token resolution ([88d8d34](https://github.com/mozilla/mozcloud-backstage/commit/88d8d34e79310e7f3b09973e75783882e8a7b386))
* **scaffolder:** create-tenant-chart template + enable template discovery ([06d7669](https://github.com/mozilla/mozcloud-backstage/commit/06d7669c0660bad917398e927b4519ecc73d93d5))
* **scaffolder:** include chart name in PR branch (user-tenant-chart) ([f6729b8](https://github.com/mozilla/mozcloud-backstage/commit/f6729b853c7f28a7f62946018764184adc9921ec))
* **scaffolder:** make GitHub OAuth opt-out for local dev ([4a11897](https://github.com/mozilla/mozcloud-backstage/commit/4a118973312780b586ad3826c799bd2c3bfebdcb))
* **scaffolder:** mozcloud run:copier action + module registration ([5216d03](https://github.com/mozilla/mozcloud-backstage/commit/5216d038069e9d32f65a091a0187bf63f60ac33d))
* **scaffolder:** mozcloud tenant add-chart action ([25e32b2](https://github.com/mozilla/mozcloud-backstage/commit/25e32b240b6e68c5858d1e4e2b89315bf06a0657))
* **scaffolder:** mozcloud tenant read action ([1cadbfa](https://github.com/mozilla/mozcloud-backstage/commit/1cadbfab5ac8d8a6fb77ee0bd2523a70ded95225))
* **scaffolder:** obtain GitHub token via a form decorator, drop the picker ([5fc2683](https://github.com/mozilla/mozcloud-backstage/commit/5fc2683546353bf41d3d39c35e0957a44cfadaa2))
* **scaffolder:** user-prefixed PR branches, conventional-commit titles; restore Create nav; drop create-rfc ([c8ccf2b](https://github.com/mozilla/mozcloud-backstage/commit/c8ccf2bfc7a2c142ce57d32895b4e7434321789b))


### Bug Fixes

* **app:** ship config.d.ts in package files ([ffb2e9b](https://github.com/mozilla/mozcloud-backstage/commit/ffb2e9bead6ab8db2ff41e97e8e20dadaf8ba974))
* **app:** ship config.d.ts in package files ([2f63e4c](https://github.com/mozilla/mozcloud-backstage/commit/2f63e4c765df4a05e301f266cdebc3a2c2169339))
* **backend:** correct DevTools admin group to cloud-engineering-admins (plural) ([6d45015](https://github.com/mozilla/mozcloud-backstage/commit/6d45015ff2fd3aa391f797af8816b15e8ca30da3))
* **backend:** declare @backstage/plugin-catalog-node & catalog-model deps ([a466e45](https://github.com/mozilla/mozcloud-backstage/commit/a466e4529482975ce9f132dbd7a40bde668197a4))
* **backend:** gate all DevTools permissions via devToolsPermissions ([2db51af](https://github.com/mozilla/mozcloud-backstage/commit/2db51af239b5d7da75adc460abd79bd5ec7fa161))
* **backend:** install git in image; redact child loggers in run:copier ([3d99146](https://github.com/mozilla/mozcloud-backstage/commit/3d9914663332473936bf7d4210b852ff3b66276d))
* **ci:** build & push release image via release-please output ([57c54be](https://github.com/mozilla/mozcloud-backstage/commit/57c54bedd9ae78b022c38b2a6fa2e8b69506f947))
* **ci:** trigger build-and-push for release-please releases ([0fcbcbb](https://github.com/mozilla/mozcloud-backstage/commit/0fcbcbb39076c9c54e2ac86e22618450e3cf9fbc))
* **mozcloud:** canonicalize person emails in usersQuery (strip plus-addressing, collapse aliases) ([c29a70a](https://github.com/mozilla/mozcloud-backstage/commit/c29a70a9851911a85133920730f60b487b3bbd52))
* **mozcloud:** only emit user:gcp for bare gcp-domain emails, not group:/serviceAccount: principals ([ac171f0](https://github.com/mozilla/mozcloud-backstage/commit/ac171f0acb4b4d84665924093a0e2320e8ef3994))
* **mozcloud:** sanitize email local-part to a valid entity name (plus-addressing) ([8ff09a9](https://github.com/mozilla/mozcloud-backstage/commit/8ff09a9f7a6db8ddc1ce58a4ee857e24314b7dd1))
* **mozcloud:** source user:gcp entities from sg.users (human members), not sg.members (IAM bindings) ([a01591d](https://github.com/mozilla/mozcloud-backstage/commit/a01591d87c0c29bdf1ea2d708f59125dec871921))
* **scaffolder:** correct template location glob to resolve from backend cwd ([f6abd67](https://github.com/mozilla/mozcloud-backstage/commit/f6abd672842cd68082a7b7dbbd336d1faee793e2))
* **scaffolder:** gate GitHub sign-in prompt on a config flag (no local popup) ([167380c](https://github.com/mozilla/mozcloud-backstage/commit/167380c94afa1aad50af5e80d3c00a0fe87a6cc2))
* **scaffolder:** image_regex follows MozCloud paved-path tagging standard ([917f0f4](https://github.com/mozilla/mozcloud-backstage/commit/917f0f4a78d83ce7ec308fc9e2bd6eec7fb0175b))
* **scaffolder:** keep token-injected clone URL recognizable to copier as git ([3ffd095](https://github.com/mozilla/mozcloud-backstage/commit/3ffd09546f9e9a45847fcaddc42d61c2d603da39))
* **scaffolder:** run:copier falls back to integration token + never hangs on auth ([c39f2cc](https://github.com/mozilla/mozcloud-backstage/commit/c39f2cc0683e78b836533ce0b4590ea3790481e4))
* **scaffolder:** set create-tenant-chart owner to group:workgroups/cloud-engineering ([95021d8](https://github.com/mozilla/mozcloud-backstage/commit/95021d8273c9e1c69baa3edf819751326cb803cb))
* **scaffolder:** stop leaking the clone token into copier _src_path ([41776d2](https://github.com/mozilla/mozcloud-backstage/commit/41776d2ca675a27145691c52a7cf58cf3f9f9938))

## [0.1.5](https://github.com/mozilla/mozcloud-backstage/compare/v0.1.4...v0.1.5) (2026-06-26)


### Features

* **auth:** Auth0 frontend sign-in (custom ApiRef + provider registration) ([d642da5](https://github.com/mozilla/mozcloud-backstage/commit/d642da56d30f76a536cbe858ea0e47e4745c7a66))
* **auth:** custom Auth0 frontend ApiRef + register sign-in provider ([247126f](https://github.com/mozilla/mozcloud-backstage/commit/247126f40492b43ee5b7c98ee09f6e5a744da050))
* **auth:** register Auth0 backend provider module ([f318043](https://github.com/mozilla/mozcloud-backstage/commit/f3180432de923a6ac36ac81fda70566d8ff20ad0))
* Create auth0 authenticator override to remove prompt=consent param ([587a38a](https://github.com/mozilla/mozcloud-backstage/commit/587a38a21eb2789c3070a23e3afe401fbf3690a4))
* **overlay:** fetch per-tenant overlay file via UrlReader ([0d210a1](https://github.com/mozilla/mozcloud-backstage/commit/0d210a189824020352e151385c71406565b70459))
* **overlay:** parse owner-authored catalog-info.yaml into entities ([6d1fba5](https://github.com/mozilla/mozcloud-backstage/commit/6d1fba56c0881fe40f6c58de1776fbc02fa90022))
* **overlay:** tenant-scoped merge of overlay entities ([a09afbf](https://github.com/mozilla/mozcloud-backstage/commit/a09afbf6f77da63936880dc54dcc861fea7af5f1))
* **overlay:** wire per-tenant overlays into the tenant provider ([ba905c6](https://github.com/mozilla/mozcloud-backstage/commit/ba905c6ba317661e137024973f579befa916686c))
* owner-authored catalog overlays for Mozcloud tenants ([9957e93](https://github.com/mozilla/mozcloud-backstage/commit/9957e930fbbd5e963732f710d6c6f43cbe3d61cb))
* People API user provider + unified user model ([0d8f581](https://github.com/mozilla/mozcloud-backstage/commit/0d8f581793068e6861c84dae773f6a7bf1258a48))
* **people:** add default all-staff group; people users memberOf it ([4404426](https://github.com/mozilla/mozcloud-backstage/commit/44044264e870a271b7cc48746f12a620098b1bf4))
* **people:** CIS profile schema + personToEntity transform ([959ac3a](https://github.com/mozilla/mozcloud-backstage/commit/959ac3a1a1e29c055d107bb42db4d243b23a1408))
* **people:** MozcloudPeopleEntityProvider + config wiring ([cfde5b6](https://github.com/mozilla/mozcloud-backstage/commit/cfde5b65004e6f2e70ebc982042b5cfe48bd7211))
* **people:** PersonApiSource with OAuth2 + pagination ([dca24f8](https://github.com/mozilla/mozcloud-backstage/commit/dca24f8d944846f69953599a6c4e6133981efa71))


### Bug Fixes

* declare @backstage/backend-plugin-api in backend deps ([f5c68ce](https://github.com/mozilla/mozcloud-backstage/commit/f5c68ceadd24725c969460197134b3055edd8df8))
* **grafana:** match component_code with @&gt; in chart dashboard-selector ([7ce7c5e](https://github.com/mozilla/mozcloud-backstage/commit/7ce7c5ef1a1b5faefdfffdb0aebc32532b2c0826))
* **overlay:** keep refresh button off overlay entities ([7b7a914](https://github.com/mozilla/mozcloud-backstage/commit/7b7a91445a700ae9a047a2a069cf377402082335))
* **overlay:** satisfy Entity.spec JsonObject typing in mergeOverlay ([df8b98a](https://github.com/mozilla/mozcloud-backstage/commit/df8b98a1ba6a2d23938514f4055e12d8b8c2497f))
* **overlay:** stamp managed-by-location on new overlay entities ([cff9a54](https://github.com/mozilla/mozcloud-backstage/commit/cff9a544205497708aee03062400f230329e6404))
* **people:** person-directory user query — group by person, empty memberships for non-members ([1f693ed](https://github.com/mozilla/mozcloud-backstage/commit/1f693ed786034eb1238e4870b1f35a4f0802662d))
* **people:** restore display:ndaed scope in Person API config ([44909e1](https://github.com/mozilla/mozcloud-backstage/commit/44909e135cb75b349cdf1ba2b9e94c6e21b24c94))
* **people:** satisfy prefer-template lint in PersonApiSource url build ([0f5fd12](https://github.com/mozilla/mozcloud-backstage/commit/0f5fd12ced7117c7da3be59896cbe655ec9ca2d1))
* **people:** set spec.memberOf=[] (required by User schema) ([72931fd](https://github.com/mozilla/mozcloud-backstage/commit/72931fdba459acff6c643adc0bbebdc8662abcb4))
