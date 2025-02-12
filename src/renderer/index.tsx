/* eslint-disable no-console */
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);

// Function to handle logout and session cleanup
async function handleLogoutAndCleanup() {
  try {
    const agentData = localStorage.getItem('agent_data');
    const loginTime = localStorage.getItem('login_time');

    if (agentData && loginTime) {
      const agent = JSON.parse(agentData);
      const startTime = parseInt(loginTime, 10);
      const workTime = Math.floor((Date.now() - startTime) / 1000);

      // Call logout API
      const response = await fetch(process.env.API_LOGOUT as string, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          agent_id: agent.id,
          workTime,
        }),
      });

      if (!response.ok) {
        console.error('Logout failed:', await response.json());
      }
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

// Check for existing session and handle cleanup on startup
(async () => {
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

// Add an event listener to logout automatically when the app is closed
window.addEventListener('beforeunload', async () => {
  console.log('App is closing. Logging out...');
  await handleLogoutAndCleanup();
});
