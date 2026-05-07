import { useEntity } from '@backstage/plugin-catalog-react';
import { InfoCard, Link } from '@backstage/core-components';
import { Chip, Grid, Typography, makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  label: {
    color: theme.palette.text.secondary,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing(0.5),
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  chip: {
    marginRight: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
  },
}));

const splitCsv = (s?: string) =>
  (s ?? '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

export const ChartCard = () => {
  const classes = useStyles();
  const { entity } = useEntity();
  const ann = entity.metadata.annotations ?? {};

  const chartName = ann['mozilla.org/chart-name'];
  const releaseName = ann['mozilla.org/release-name'];
  const targetRevision = ann['mozilla.org/target-revision'];
  const deploymentType = ann['mozilla.org/deployment-type'];
  const autoUpdate = ann['mozilla.org/auto-update'];
  const imageAliases = splitCsv(ann['mozilla.org/image-aliases']);
  const repoSlug = ann['github.com/project-slug'];

  return (
    <InfoCard title="Chart">
      <Grid container spacing={2}>
        {chartName && (
          <Grid item xs={6}>
            <Typography className={classes.label}>Chart name</Typography>
            <Typography className={classes.mono}>{chartName}</Typography>
          </Grid>
        )}
        {deploymentType && (
          <Grid item xs={6}>
            <Typography className={classes.label}>Deployment type</Typography>
            <Chip
              size="small"
              label={deploymentType}
              className={classes.chip}
            />
          </Grid>
        )}
        {repoSlug && (
          <Grid item xs={12}>
            <Typography className={classes.label}>
              Application repository
            </Typography>
            <Link to={`https://github.com/${repoSlug}`}>{repoSlug}</Link>
          </Grid>
        )}
        {releaseName && (
          <Grid item xs={6}>
            <Typography className={classes.label}>Release name</Typography>
            <Typography className={classes.mono}>{releaseName}</Typography>
          </Grid>
        )}
        {targetRevision && (
          <Grid item xs={6}>
            <Typography className={classes.label}>Target revision</Typography>
            <Typography className={classes.mono}>{targetRevision}</Typography>
          </Grid>
        )}
        {autoUpdate !== undefined && (
          <Grid item xs={6}>
            <Typography className={classes.label}>Image auto-update</Typography>
            <Chip
              size="small"
              label={autoUpdate === 'true' ? 'enabled' : 'disabled'}
              color={autoUpdate === 'true' ? 'primary' : 'default'}
            />
          </Grid>
        )}
        {imageAliases.length > 0 && (
          <Grid item xs={12}>
            <Typography className={classes.label}>Images</Typography>
            {imageAliases.map(a => (
              <Chip
                key={a}
                size="small"
                label={a}
                className={classes.chip}
                variant="outlined"
              />
            ))}
          </Grid>
        )}
      </Grid>
    </InfoCard>
  );
};
