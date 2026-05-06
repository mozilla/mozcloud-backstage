export interface Config {
  app: {
    analytics?: {
      glean?: {
        /**
         * Glean App ID
         * @visibility frontend
         */
        appId: string;

        /**
         * Debugging configuration
         *
         * @visibility frontend
         */
        debug?: {
          /**
           * Log analytics debug statements to the console.
           * Defaults to false.
           *
           * @visibility frontend
           */
          logging?: boolean;

          /**
           * Set a debug tag for use in the Glean Debug Viewer.
           * Defaults to undefined.
           *
           * @visibility frontend
           */
          tag?: string;
        };

        /**
         * Whether to enable Glean Analytics.
         * Defaults to false.
         *
         * @visibility frontend
         */
        enabled?: boolean;

        /**
         * Maps to glean channel. Required
         *
         * @visibility frontend
         */
        environment: 'development' | 'production';
      };
    };
  };
}
