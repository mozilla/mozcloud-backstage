import {
  HomePageRecentlyVisited,
  HomePageStarredEntities,
  HomePageToolkit,
  HomePageTopVisited,
} from '@backstage/plugin-home';
import { HomePageSearchBar } from '@backstage/plugin-search';
import { SearchContextProvider } from '@backstage/plugin-search-react';
import { Content, Header, Page } from '@backstage/core-components';
import { Grid, makeStyles } from '@material-ui/core';
import { ConfluenceIcon, GitHubIcon, JiraIcon, DawgIcon } from '../icons';

const useStyles = makeStyles(theme => ({
  searchBarInput: {
    maxWidth: '60vw',
    margin: 'auto',
    backgroundColor: theme.palette.background.paper,
    borderRadius: '50px',
    boxShadow: theme.shadows[1],
  },
  searchBarOutline: {
    borderStyle: 'none',
  },
}));

const tools = [
  {
    url: 'https://mozilla-hub.atlassian.net',
    label: 'Jira',
    icon: <JiraIcon fontSize="large" />,
  },
  {
    url: 'https://mozilla-hub.atlassian.net/wiki',
    label: 'Confluence',
    icon: <ConfluenceIcon fontSize='large' />,
  },
  {
    url: 'https://github.com/mozilla',
    label: 'GitHub: mozilla',
    icon: <GitHubIcon fontSize='large' />,
  },
  {
    url: 'https://github.com/mozilla-services',
    label: 'GitHub: mozilla-services',
    icon: <GitHubIcon fontSize='large' />,
  },
  {
    url: 'https://protosaur.dev/dawg/',
    label: 'Data Access Workgroups',
    icon: <DawgIcon fontSize='large' />,
  },
];

export const HomePage = () => {
  const classes = useStyles();
  return (
    <SearchContextProvider>
      <Page themeId="home">
        <Header title="Welcome to Mozilla Backstage" pageTitleOverride="Home" />
        <Content>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <HomePageSearchBar
                classes={{ root: classes.searchBarInput }}
                InputProps={{
                  classes: { notchedOutline: classes.searchBarOutline },
                }}
                placeholder="Search the catalog and docs"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <HomePageRecentlyVisited />
            </Grid>
            <Grid item xs={12} md={6}>
              <HomePageTopVisited />
            </Grid>
            <Grid item xs={12} md={6}>
              <HomePageStarredEntities />
            </Grid>
            <Grid item xs={12} md={6}>
              <HomePageToolkit title="Mozilla quick links" tools={tools} />
            </Grid>
          </Grid>
        </Content>
      </Page>
    </SearchContextProvider>
  );
};
