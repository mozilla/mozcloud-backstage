import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles({
  svg: {
    width: 'auto',
    height: 28,
  },
  path: {
    fill: 'currentColor',
  },
});

// Mozilla symbol, sourced from
// https://www.mozilla.org/media/img/trademarks/symbol.dd452bbb0dd3.svg.
// Inlined so it renders without a network request and inherits color
// via `currentColor` so the theme controls it.
const LogoIcon = () => {
  const classes = useStyles();

  return (
    <svg
      className={classes.svg}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 192.4 233.9"
    >
      <path
        className={classes.path}
        d="M26.5 233.9H0V0h26.5v233.9zm22.6-113.4h119.7v-5l-78.5-33V60.7l78.5-33v-5H72.7V0h119.7v41.6l-64.3 27.5v5l64.3 27.5v41.6H49.1v-22.7zm0-97.8h23.5v23.5H49.1V22.7z"
      />
    </svg>
  );
};

export default LogoIcon;
