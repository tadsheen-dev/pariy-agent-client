/* eslint-disable no-console */
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(<App />);

window.electron.ipcRenderer.once('ipc-example', (response) => {
  console.log('Received response from main process:', response);
});

// Add an event listener to logout automatically when the app is closed
window.addEventListener('beforeunload', () => {
  console.log('App is closing. Logging out...');
  // Simulate API logout call if needed
  localStorage.removeItem('agent_token');
  localStorage.removeItem('agent_data');
  localStorage.removeItem('login_time');
});
