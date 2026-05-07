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
  projectId: {
    fontFamily: 'monospace',
    fontSize: 14,
    wordBreak: 'break-all',
  },
  envChip: {
    marginRight: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
  },
}));

const splitCsv = (s?: string) =>
  (s ?? '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

export const GcpProjectCard = () => {
  const classes = useStyles();
  const { entity } = useEntity();
  const projectId = entity.metadata.name;
  const ann = entity.metadata.annotations ?? {};
  const realm = ann['mozilla.org/realm'];
  const envs = splitCsv(ann['mozilla.org/environments']);
  const consoleUrl = `https://console.cloud.google.com/home/dashboard?project=${encodeURIComponent(
    projectId,
  )}`;

  return (
    <InfoCard
      title="GCP project"
      action={
        <Link to={consoleUrl} title="Open in Google Cloud Console">
          <OpenInNewIcon fontSize="small" />
        </Link>
      }
    >
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Typography className={classes.label}>Project ID</Typography>
          <Typography className={classes.projectId}>{projectId}</Typography>
        </Grid>
        {realm && (
          <Grid item xs={6}>
            <Typography className={classes.label}>Realm</Typography>
            <Typography variant="body2">{realm}</Typography>
          </Grid>
        )}
        {envs.length > 0 && (
          <Grid item xs={6}>
            <Typography className={classes.label}>Environments</Typography>
            {envs.map(e => (
              <Chip
                key={e}
                size="small"
                label={e}
                className={classes.envChip}
              />
            ))}
          </Grid>
        )}
        <Grid item xs={12}>
          <Link to={consoleUrl}>Open in Google Cloud Console</Link>
        </Grid>
      </Grid>
    </InfoCard>
  );
};
