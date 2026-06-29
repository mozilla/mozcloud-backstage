# Changelog

## [0.1.6](https://github.com/mozilla/mozcloud-backstage/compare/v0.1.5...v0.1.6) (2026-06-29)


### Bug Fixes

* **ci:** build & push release image via release-please output ([57c54be](https://github.com/mozilla/mozcloud-backstage/commit/57c54bedd9ae78b022c38b2a6fa2e8b69506f947))
* **ci:** trigger build-and-push for release-please releases ([0fcbcbb](https://github.com/mozilla/mozcloud-backstage/commit/0fcbcbb39076c9c54e2ac86e22618450e3cf9fbc))

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
