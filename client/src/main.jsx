import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './review-ui.css';
import './atelier-base.css';
import './atelier-home.css';
import './atelier-shell.css';
import './atelier-flow.css';
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
