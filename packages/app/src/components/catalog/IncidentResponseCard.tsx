import { ReactNode } from 'react';
import { InfoCard, Link, Progress } from '@backstage/core-components';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  entityRouteRef,
  useEntity,
} from '@backstage/plugin-catalog-react';
import { Grid, Typography, makeStyles } from '@material-ui/core';
import useAsync from 'react-use/lib/useAsync';
import { readIncidentFields } from './incidentResponse';

const useStyles = makeStyles(theme => ({
  label: {
    color: theme.palette.text.secondary,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing(0.5),
  },
  stackedLink: {
    display: 'block',
    fontSize: 13,
  },
}));

const Field = ({
  label,
  xs = 6,
  children,
}: {
  label: string;
  xs?: 6 | 12;
  children?: ReactNode;
}) => {
  const classes = useStyles();
  return (
    <Grid item xs={xs}>
      <Typography className={classes.label}>{label}</Typography>
      {children ?? <Typography variant="body2">N/A</Typography>}
    </Grid>
  );
};

/**
 * Who to reach and where, for a System: the owner Group with its sponsor and
 * managers, the escalation Slack channel and the PagerDuty service. The URL
 * fields (runbook, Confluence, issue tracker) stay on the Links card.
 */
export const IncidentResponseCard = () => {
  const classes = useStyles();
  const { entity } = useEntity();
  const catalogApi = useApi(catalogApiRef);
  const entityRoute = useRouteRef(entityRouteRef);
  const ownerRef = entity.spec?.owner;

  // A missing owner or a failed lookup leaves `owner` undefined, so the owner
  // rows show N/A while the System's own fields still render.
  const { value: owner, loading } = useAsync(
    async () =>
      typeof ownerRef === 'string'
        ? catalogApi.getEntityByRef(ownerRef)
        : undefined,
    [catalogApi, ownerRef],
  );

  if (loading) return <Progress />;

  const { sponsor, managers, slackUrl, pagerDutyUrl } = readIncidentFields(
    entity,
    owner,
  );

  return (
    <InfoCard title="Incident response">
      <Grid container spacing={2}>
        <Field label="Owner">
          {owner && (
            <Link
              to={entityRoute({
                // kind/namespace lowercased to match catalog ref canonicalization
                // (as @backstage/plugin-catalog-react's entityRouteParams does).
                kind: owner.kind.toLocaleLowerCase('en-US'),
                namespace: (
                  owner.metadata.namespace ?? 'default'
                ).toLocaleLowerCase('en-US'),
                name: owner.metadata.name,
              })}
            >
              {owner.metadata.name}
            </Link>
          )}
        </Field>
        <Field label="Sponsor">
          {sponsor && <Link to={`mailto:${sponsor}`}>{sponsor}</Link>}
        </Field>
        <Field label="Managers" xs={12}>
          {managers.length > 0
            ? managers.map(m => (
                <Link
                  key={m}
                  to={`mailto:${m}`}
                  className={classes.stackedLink}
                >
                  {m}
                </Link>
              ))
            : undefined}
        </Field>
        <Field label="Notification channel">
          {slackUrl && <Link to={slackUrl}>Open in Slack</Link>}
        </Field>
        <Field label="PagerDuty service">
          {pagerDutyUrl && <Link to={pagerDutyUrl}>Open in PagerDuty</Link>}
        </Field>
      </Grid>
    </InfoCard>
  );
};
