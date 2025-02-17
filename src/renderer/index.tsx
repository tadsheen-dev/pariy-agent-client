/* eslint-disable no-console */
import { createRoot } from 'react-dom/client';
import App from './App';
import logout from '../service/logoutService';

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);

// Function to handle logout and session cleanup via fetch (used at startup)
async function handleLogoutAndCleanup() {
  try {
    const agentData = localStorage.getItem('agent_data');
    const loginTime = localStorage.getItem('login_time');

    if (agentData && loginTime) {
      const agent = JSON.parse(agentData);
      const startTime = parseInt(loginTime, 10);
      const workTime = Math.floor((Date.now() - startTime) / 1000);

      // Call logout API via fetch
      await logout(agent.id, workTime);
    }
  } catch (error) {
    console.error('Error during logout:', error);
  } finally {
    // Clear localStorage
    localStorage.removeItem('agent_token');
    localStorage.removeItem('agent_data');
    localStorage.removeItem('login_time');
  }
}

// On startup, check for pending logout session stored in localStorage and send it
(async () => {
  const pendingData = localStorage.getItem('pending_logout_session');
  if (pendingData) {
    console.log('Found pending logout session, sending request...');
    try {
      const response = await fetch(process.env.API_LOGOUT as string, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: pendingData,
      });
      if (!response.ok) {
        console.error('Pending logout API call failed:', await response.json());
      }
    } catch (error) {
      console.error('Error sending pending logout:', error);
    }
    localStorage.removeItem('pending_logout_session');
  }

  // If there's an existing session, clean it up
  const hasExistingSession = localStorage.getItem('agent_token');
  if (hasExistingSession) {
    console.log('Found existing session, cleaning up...');
    await handleLogoutAndCleanup();
  }

  // Render the app after session check
  root.render(<App />);
})();

window.electron.ipcRenderer.once('ipc-example', (response) => {
  console.log('Received response from main process:', response);
});

// Add an event listener to logout automatically when the app is closed using navigator.sendBeacon with localStorage fallback
window.addEventListener('beforeunload', () => {
  console.log('App is closing. Logging out...');
  const agentData = localStorage.getItem('agent_data');
  const loginTime = localStorage.getItem('login_time');
  if (agentData && loginTime) {
    const agent = JSON.parse(agentData);
    const startTime = parseInt(loginTime, 10);
    const workTime = Math.floor((Date.now() - startTime) / 1000);
    const data = JSON.stringify({ agent_id: agent.id, workTime });
    const blob = new Blob([data], { type: 'application/json' });
    // Use sendBeacon to send data asynchronously
    navigator.sendBeacon(process.env.API_LOGOUT as string, blob);
    // Save pending logout session data for retry on next startup
    localStorage.setItem('pending_logout_session', data);
  }
  localStorage.removeItem('agent_token');
  localStorage.removeItem('agent_data');
  localStorage.removeItem('login_time');
});

// --- START periodic pending logout update ---
(function setupPeriodicPendingLogoutUpdate() {
  // Update pending logout session every minute (60000 ms)
  setInterval(() => {
    const agentData = localStorage.getItem('agent_data');
    const loginTime = localStorage.getItem('login_time');
    if (agentData && loginTime) {
      const agent = JSON.parse(agentData);
      const startTime = parseInt(loginTime, 10);
      const workTime = Math.floor((Date.now() - startTime) / 1000);
      const data = JSON.stringify({ agent_id: agent.id, workTime });
      localStorage.setItem('pending_logout_session', data);
      console.log('Periodic pending logout session updated:', data);
    }
  }, 60000);
})();
// --- END periodic pending logout update ---
