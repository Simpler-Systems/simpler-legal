import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/shell.css';
import App from './App';
import { startNetMeter } from './lib/netmeter';

// Before the app renders, so the window's own resource timeline is counted from
// the first byte (buffered:true also back-fills anything already recorded).
startNetMeter();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
