import { useEntity } from '@backstage/plugin-catalog-react';
import { InfoCard, Link } from '@backstage/core-components';
import { Chip, Grid, Typography, makeStyles } from '@material-ui/core';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';

const useStyles = makeStyles(theme => ({
  label: {
    color: theme.palette.text.secondary,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing(0.5),
  },
  chip: {
    marginRight: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
  },
  argoLink: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    fontSize: 13,
    marginBottom: theme.spacing(0.5),
  },
  region: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: theme.palette.text.secondary,
    minWidth: 100,
  },
}));

interface ArgoLink {
  region: string;
  url: string;
}

/** Parse the `region=url|region=url|...` annotation format. */
function parseArgoUrls(raw?: string): ArgoLink[] {
  if (!raw) return [];
  return raw
    .split('|')
    .map(entry => {
      const eq = entry.indexOf('=');
      if (eq < 0) return null;
      return { region: entry.slice(0, eq), url: entry.slice(eq + 1) };
    })
    .filter((x): x is ArgoLink => x !== null);
}

export const DeploymentCard = () => {
  const classes = useStyles();
  const { entity } = useEntity();
  const ann = entity.metadata.annotations ?? {};

  const realm = ann['mozilla.org/realm'];
  const env = ann['mozilla.org/environment'];
  const chartName = ann['mozilla.org/chart-name'];
  const argoLinks = parseArgoUrls(ann['mozilla.org/argocd-urls']);

  return (
    <InfoCard title="Deployment">
      <Grid container spacing={2}>
        {env && (
          <Grid item xs={6}>
            <Typography className={classes.label}>Environment</Typography>
            <Chip size="small" label={env} className={classes.chip} />
          </Grid>
        )}
        {realm && (
          <Grid item xs={6}>
            <Typography className={classes.label}>Realm</Typography>
            <Typography variant="body2">{realm}</Typography>
          </Grid>
        )}
        {chartName && (
          <Grid item xs={6}>
            <Typography className={classes.label}>Chart</Typography>
            <Typography variant="body2">{chartName}</Typography>
          </Grid>
        )}
        {argoLinks.length > 0 && (
          <Grid item xs={12}>
            <Typography className={classes.label}>ArgoCD</Typography>
            {argoLinks.map(({ region, url }) => (
              <div key={region} className={classes.argoLink}>
                <span className={classes.region}>{region}</span>
                <Link to={url}>open application</Link>
                <OpenInNewIcon fontSize="inherit" />
              </div>
            ))}
          </Grid>
        )}
      </Grid>
    </InfoCard>
  );
};
