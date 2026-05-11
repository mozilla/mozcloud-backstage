# glean

Welcome to the glean plugin!

_This plugin was created through the Backstage CLI_

## Add API to `packages/app/src/apis.ts`

```js
import { createGleanAPIFactory } from 'backstage-plugin-glean';

export const apis: AnyApiFactory[] = [
  //...
  createGleanAPIFactory(),
];
```

## Updating Metrics

After adding new metrics to `metrics.yaml` run `npm build:glean` and commit the updating files in `src/metrics`
