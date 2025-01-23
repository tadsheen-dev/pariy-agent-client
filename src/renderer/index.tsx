import { createRoot } from 'react-dom/client';
import App from './App';
// import { ipcRenderer } from 'electron';


const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(<App />);

// // calling IPC exposed from preload script
// window.ipcRenderer.once('ipc-example', (arg) => {
//   // eslint-disable-next-line no-console
//   console.log(arg);
// });

// window.ipcRenderer.send('ipc-example', ['ping']);


window.electron.ipcRenderer.once('ipc-example', (response) => {
  console.log('Received response from main process:', response);
});

