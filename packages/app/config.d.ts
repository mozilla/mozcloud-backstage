export interface Config {
  scaffolder?: {
    /**
     * When true, the create-tenant-chart form decorator prompts the initiating
     * user to sign in to GitHub on submit, so their PRs are authored as them.
     * Leave unset (e.g. local development) to skip the prompt and let the
     * backend fall back to its integration token. Set this in stage/prod.
     *
     * @visibility frontend
     */
    githubUserAuth?: boolean;
  };
}
