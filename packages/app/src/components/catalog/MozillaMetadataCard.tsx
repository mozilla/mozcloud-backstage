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
  riskHigh: {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.error.contrastText,
  },
  riskLow: {
    backgroundColor: theme.palette.success.main,
    color: theme.palette.success.contrastText,
  },
  ticketLink: {
    display: 'block',
    fontSize: 13,
  },
}));

const splitCsv = (s?: string) =>
  (s ?? '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

const ticketLabel = (url: string) => {
  // Best-effort: pull the issue key out of a Jira URL.
  const match = url.match(/\/browse\/([A-Z][A-Z0-9_-]+-\d+)/);
  return match?.[1] ?? url;
};

export const MozillaMetadataCard = () => {
  const classes = useStyles();
  const { entity } = useEntity();
  const ann = entity.metadata.annotations ?? {};

  const risk = ann['mozilla.org/risk-level'];
  const fn = ann['mozilla.org/function'];
  const slack = ann['mozilla.org/slack-channel'];
  const clusterType = ann['mozilla.org/cluster-type'];
  const riskUuid = ann['mozilla.org/risk-uuid'];
  const tickets = splitCsv(ann['mozilla.org/tickets']);
  const sponsor = ann['mozilla.org/sponsor'];

  return (
    <InfoCard title="Mozilla">
      <Grid container spacing={2}>
        {fn && (
          <Grid item xs={6}>
            <Typography className={classes.label}>Function</Typography>
            <Typography variant="body2">{fn}</Typography>
          </Grid>
        )}
        {risk && (
          <Grid item xs={6}>
            <Typography className={classes.label}>Risk</Typography>
            <Chip
              label={risk}
              size="small"
              className={risk === 'high' ? classes.riskHigh : classes.riskLow}
            />
          </Grid>
        )}
        {clusterType && (
          <Grid item xs={6}>
            <Typography className={classes.label}>Cluster</Typography>
            <Typography variant="body2">{clusterType}</Typography>
          </Grid>
        )}
        {slack && (
          <Grid item xs={6}>
            <Typography className={classes.label}>Slack</Typography>
            <Typography variant="body2">#{slack}</Typography>
          </Grid>
        )}
        {sponsor && (
          <Grid item xs={12}>
            <Typography className={classes.label}>Sponsor</Typography>
            <Link to={`mailto:${sponsor}`}>{sponsor}</Link>
          </Grid>
        )}
        {tickets.length > 0 && (
          <Grid item xs={12}>
            <Typography className={classes.label}>Tickets</Typography>
            {tickets.map(t => (
              <Link key={t} to={t} className={classes.ticketLink}>
                {ticketLabel(t)}
              </Link>
            ))}
          </Grid>
        )}
        {riskUuid && (
          <Grid item xs={12}>
            <Typography className={classes.label}>Risk UUID</Typography>
            <Typography variant="caption">{riskUuid}</Typography>
          </Grid>
        )}
      </Grid>
    </InfoCard>
  );
};
