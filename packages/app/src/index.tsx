import '@backstage/cli/asset-types';
import ReactDOM from 'react-dom/client';
import app from './App';
// BUI defaults first, then our overrides so the cascade wins.
import '@backstage/ui/css/styles.css';
import './theme/mozilla/mozilla.css';

ReactDOM.createRoot(document.getElementById('root')!).render(app);
