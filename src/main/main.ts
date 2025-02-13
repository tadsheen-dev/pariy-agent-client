/* eslint-disable promise/no-callback-in-promise */
/* eslint-disable prettier/prettier */
/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  desktopCapturer,
  systemPreferences,
} from 'electron';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import fs from 'fs';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

// Import DOM types for media recording
/// <reference types="dom-mediacapture-record" />

// Define interfaces for the audio monitor
interface AudioMonitor {
  startMonitoring: (
    processName: string,
    callback: (isActive: boolean) => void,
  ) => void;
  stopMonitoring: () => void;
}

interface AudioMonitorConstructor {
  new(): AudioMonitor;
  AudioMonitor: new () => AudioMonitor;
}

interface RecordingData {
  agentId: string;
  platform: string;
  timestamp: string;
}

let monitor: AudioMonitor | null = null;

// Dynamic import for audio monitor
let audioMonitor: any;
try {
  audioMonitor = require('../../.erb/dll/audio_monitor.node');
} catch (error) {
  console.error('Failed to load audio monitor:', error);
}

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;
let isUserLoggedIn = false;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

ipcMain.on('update-login-status', (event, status) => {
  isUserLoggedIn = status;
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  try {
    const installer = require('electron-devtools-installer');
    const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
    const extensions = ['REACT_DEVELOPER_TOOLS'];

    return installer
      .default(
        extensions.map((name) => installer[name]),
        forceDownload,
      )
      .catch((err: Error) => console.log('Extension installation error:', err));
  } catch (err) {
    console.log('Extension loader error:', err);
    return null;
  }
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  // Request screen capture access on macOS
  if (process.platform === 'darwin') {
    await systemPreferences.askForMediaAccess('microphone');
    await systemPreferences.askForMediaAccess('camera');
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
      webSecurity: true,
    },
  });

  // Set up display media request handler
  mainWindow.webContents.session.setDisplayMediaRequestHandler(
    (request, callback) => {
      desktopCapturer
        .getSources({
          types: ['window', 'screen'],
          thumbnailSize: { width: 0, height: 0 },
        })
        .then((sources) => {
          // Find Teams window if it exists
          const teamsSource = sources.find(
            (source) =>
              source.name.toLowerCase().includes('teams') &&
              source.name.toLowerCase().includes('meeting'),
          );

          callback({
            video: teamsSource || sources[0],
            audio: 'loopback',
          });
        })
        .catch((error) => {
          console.error('Error getting sources:', error);
          callback({ video: undefined, audio: undefined });
        });
    },
  );

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();

  // Set permissions after window creation
  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowedPermissions = [
        'media',
        'mediaKeySystem',
        'display-capture',
        'desktopCapture',
      ];
      if (allowedPermissions.includes(permission)) {
        callback(true);
      } else {
        callback(false);
      }
    },
  );

  // Enable screen capture
  mainWindow.webContents.session.setPermissionCheckHandler(
    (webContents, permission) => {
      const allowedPermissions = [
        'media',
        'mediaKeySystem',
        'display-capture',
        'desktopCapture',
      ];
      return allowedPermissions.includes(permission);
    },
  );

  // Handle desktop capture request
  ipcMain.handle('DESKTOP_CAPTURER_GET_SOURCES', async (event, opts) => {
    try {
      const sources = await desktopCapturer.getSources(opts);
      return sources;
    } catch (error) {
      console.error('Error getting sources:', error);
      throw error;
    }
  });

  // Get the audio source
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 0, height: 0 },
  });

  console.log(
    'Available sources:',
    sources.map((s) => s.name),
  );

  // After mainWindow is created and before it's shown, add a close event listener
  if (mainWindow) {
    const win = mainWindow;
    win.on('close', (event) => {
      const { dialog } = require('electron');
      if (isUserLoggedIn) {
        event.preventDefault(); // Always prevent immediate close to handle logout
        const choice = dialog.showMessageBoxSync(win, {
          type: 'question',
          buttons: ['Logout', 'Cancel'],
          defaultId: 0,
          cancelId: 1,
          title: 'Logout Confirmation',
          message: 'You are currently logged in. Would you like to log out before exiting?',
          noLink: true,
        });
        if (choice === 0) {
          // User chose Logout; signal renderer to record workTime and logout
          win.webContents.send('perform-logout');
        }
        // If Cancel, do nothing and keep the window open
      }
    });
  }

  // Listen for logout completion from renderer
  ipcMain.on('logout-complete', () => {
    if (mainWindow) {
      // Remove close listeners to allow window to close now
      mainWindow.removeAllListeners('close');
      mainWindow.close();
    }
  });
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);

// Update debounce function to use proper type
const debounce = (func: Function, wait: number) => {
  let timeout: ReturnType<typeof setTimeout>;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Add safe send function
const safeSendToRenderer = (channel: string, ...args: any[]) => {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    try {
      mainWindow.webContents.send(channel, ...args);
    } catch (error) {
      console.log(`Failed to send ${channel}:`, error);
    }
  }
};

// Debounced version of the send function
const debouncedSendToRenderer = debounce(safeSendToRenderer, 100);

ipcMain.on('start-monitoring', (event, processNames: string) => {
  console.log('Starting monitoring for processes:', processNames);

  if (monitor) {
    console.log('Stopping previous monitor');
    monitor.stopMonitoring();
  }

  try {
    const AudioMonitorClass = (
      audioMonitor as unknown as AudioMonitorConstructor
    ).AudioMonitor;
    monitor = new AudioMonitorClass();

    // Split process names and monitor each one
    const processes = processNames.split(',');
    console.log('Will monitor these processes:', processes);

    processes.forEach((processName) => {
      const trimmedName = processName.trim();
      console.log('Starting monitoring for:', trimmedName);

      monitor?.startMonitoring(trimmedName, (isActive: boolean) => {
        console.log(`Audio session for ${trimmedName}: ${isActive}`);

        // Use debounced send function
        debouncedSendToRenderer('audio-session-update', isActive);
      });
    });
  } catch (error) {
    console.error('Error starting audio monitor:', error);
    console.error(
      'Error details:',
      error instanceof Error ? error.message : error,
    );
  }
});

ipcMain.on('stop-monitoring', () => {
  console.log('Stopping audio monitoring');
  if (monitor) {
    monitor.stopMonitoring();
    monitor = null;
  }
});

// Modify the recording handlers to use safe send
ipcMain.on('start-recording', async (event, data: RecordingData) => {
  try {
    // Create output directory in project root if it doesn't exist
    const projectRoot = path.join(__dirname, '../../');
    const outputPath = path.join(projectRoot, 'output');
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath);
    }
    console.log('Recording will be saved to:', outputPath);

    // Get the audio source
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 },
    });

    console.log(
      'Available sources:',
      sources.map((s) => s.name),
    );

    // Find the window for the specified platform
    const source = sources.find((s) => {
      const windowName = s.name.toLowerCase();
      const platform = data.platform.toLowerCase();

      if (platform === 'teams') {
        return windowName.includes('teams');
      }

      if (platform === 'zoom') {
        return (
          windowName.includes('zoom') &&
          (windowName.includes('meeting') ||
            windowName.includes('webinar') ||
            windowName.includes('call'))
        );
      }

      return windowName.includes(platform);
    });

    if (!source) {
      console.log(
        'No matching window found. Available windows:',
        sources.map((s) => s.name),
      );
      if (mainWindow?.webContents) {
        try {
          mainWindow.webContents.send('recording-status', 'error');
        } catch (sendError) {
          console.error('Error sending recording status:', sendError);
        }
      }
      return;
    }

    console.log('Found source:', source.name);

    // Create temporary and final filenames
    const tempFileName = `temp_${data.agentId}_${data.platform}_${data.timestamp}.webm`;
    const finalFileName = `${data.agentId}_${data.platform}_${data.timestamp}.mp3`;
    const tempFilePath = path.join(outputPath, tempFileName);
    const finalFilePath = path.join(outputPath, finalFileName);

    console.log('Recording will be temporarily saved as:', tempFileName);
    console.log('Final MP3 file will be:', finalFileName);

    // Send the source to renderer process for recording using safe send
    safeSendToRenderer('start-recording-with-source', {
      sourceId: source.id,
      tempFilePath,
      finalFilePath,
    });
  } catch (error) {
    console.error('Recording setup error:', error);
    safeSendToRenderer('recording-status', 'error');
  }
});

// Add save recording handler
ipcMain.on('save-recording', async (event, data) => {
  try {
    console.log('Saving recording...');
    const {
      buffer,
      fileName,
      agentId,
      platform,
      duration,
      startTime,
      endTime,
    } = data;

    // Create output directory if it doesn't exist
    const outputDir = path.join(app.getPath('userData'), 'recordings');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create platform-specific directory
    const platformDir = path.join(outputDir, platform.toLowerCase());
    if (!fs.existsSync(platformDir)) {
      fs.mkdirSync(platformDir, { recursive: true });
    }

    // Create agent-specific directory
    const agentDir = path.join(platformDir, agentId);
    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true });
    }

    const filePath = path.join(agentDir, fileName);
    console.log('Saving to:', filePath);

    // Save the audio file
    fs.writeFileSync(filePath, Buffer.from(buffer));

    // Save metadata in a JSON file
    const metadataPath = filePath.replace('.webm', '.json');
    const metadata = {
      fileName,
      agentId,
      platform,
      duration,
      startTime,
      endTime,
      filePath,
      fileSize: buffer.length,
      mimeType: 'audio/webm;codecs=opus',
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    console.log('Recording saved successfully');
    console.log('Duration:', duration, 'seconds');

    // Notify renderer
    event.reply('recording-status', 'saved');
  } catch (error) {
    console.error('Error saving recording:', error);
    event.reply('recording-status', 'error');
  }
});


// Add save analysis handler
ipcMain.on('save-analysis', async (event, data) => {
  try {
    console.log('Saving analysis results...');
    const { fileName, analysis, metadata } = data;

    // Create analysis directory if it doesn't exist
    const analysisDir = path.join(app.getPath('userData'), 'analysis');
    if (!fs.existsSync(analysisDir)) {
      fs.mkdirSync(analysisDir, { recursive: true });
    }

    // Create platform-specific directory
    const platformDir = path.join(analysisDir, metadata.platform.toLowerCase());
    if (!fs.existsSync(platformDir)) {
      fs.mkdirSync(platformDir, { recursive: true });
    }

    // Create agent-specific directory
    const agentDir = path.join(platformDir, metadata.agentId);
    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true });
    }

    // Save analysis results
    const analysisFileName = fileName.replace('.webm', '_analysis.json');
    const analysisPath = path.join(agentDir, analysisFileName);

    const analysisData = {
      ...analysis,
      metadata,
      fileName,
      analysisTimestamp: new Date().toISOString(),
    };

    fs.writeFileSync(analysisPath, JSON.stringify(analysisData, null, 2));
    console.log('Analysis saved successfully to:', analysisPath);

    // Notify renderer
    event.reply('analysis-status', 'saved');
  } catch (error) {
    console.error('Error saving analysis:', error);
    event.reply('analysis-status', 'error');
  }
});
