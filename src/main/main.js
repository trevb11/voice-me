const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
let midiInput;
let currentPortName = null;   // track which device is actually connected
let pollInterval    = null;

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 600,
    minWidth: 900,
    minHeight: 400,
    backgroundColor: '#E8E8EC',
    titleBarStyle: 'hiddenInset',   // macOS native: traffic lights inset
    vibrancy: 'under-window',       // Liquid Glass / frosted window (Tahoe)
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    closeMidi();
  });
}

// ─── MIDI ─────────────────────────────────────────────────────────────────────

function cleanPortName(name) {
  return name
    .replace(/Generic USB MIDI Keyboard/gi, '')
    .replace(/USB MIDI Interface/gi, '')
    .replace(/USB Audio Device/gi, '')
    .replace(/MIDI Interface/gi, '')
    .trim();
}

function initMidi() {
  try {
    const midi = require('midi');
    midiInput = new midi.Input();

    const portCount = midiInput.getPortCount();
    const ports = [];

    for (let i = 0; i < portCount; i++) {
      ports.push({ index: i, name: cleanPortName(midiInput.getPortName(i)) });
    }

    console.log('[MIDI] Available ports:', ports);

    // Send port list and auto-connect once window is ready
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('midi:ports', ports);
      if (portCount > 0) {
        connectToPort(0);
      }
    });

    return ports;
  } catch (err) {
    console.error('[MIDI] Failed to initialize:', err.message);
    // Send error to renderer so user sees a helpful message
    mainWindow?.webContents?.send('midi:error', err.message);
    return [];
  }
}

function connectToPort(portIndex) {
  if (!midiInput) return;

  try {
    // Close if already open
    try { midiInput.closePort(); } catch (_) {}

    midiInput.openPort(portIndex);
    midiInput.ignoreTypes(false, false, false); // sysex, timing, active sensing

    midiInput.on('message', (deltaTime, message) => {
      const [status, note, velocity] = message;
      const channel  = status & 0x0f;
      const type     = status & 0xf0;

      // 0x90 = noteOn, 0x80 = noteOff
      // Some keyboards send noteOn with velocity 0 as noteOff
      if (type === 0x90 && velocity > 0) {
        const event = { type: 'noteOn', note, velocity, channel };
        mainWindow?.webContents?.send('midi:event', event);
      } else if (type === 0x80 || (type === 0x90 && velocity === 0)) {
        const event = { type: 'noteOff', note, velocity: 0, channel };
        mainWindow?.webContents?.send('midi:event', event);
      } else if (type === 0xb0) {
        // Control change (e.g. sustain pedal = CC 64)
        const event = { type: 'controlChange', note, velocity, channel };
        mainWindow?.webContents?.send('midi:event', event);
      }
    });

    const rawName  = midiInput.getPortName(portIndex);
    const portName = cleanPortName(rawName);
    currentPortName = portName;  // track for polling
    console.log(`[MIDI] Connected to: ${portName}`);
    mainWindow?.webContents?.send('midi:connected', { portIndex, portName });
  } catch (err) {
    console.error('[MIDI] Failed to connect to port:', err.message);
    mainWindow?.webContents?.send('midi:error', err.message);
  }
}

function closeMidi() {
  try {
    midiInput?.closePort();
  } catch (_) {}
  currentPortName = null;
}

function pollMidiPorts() {
  if (!midiInput) return;

  const portCount = midiInput.getPortCount();
  const ports     = [];
  for (let i = 0; i < portCount; i++) {
    ports.push({ index: i, name: cleanPortName(midiInput.getPortName(i)) });
  }

  // Send fresh port list to renderer so dropdown stays current
  mainWindow?.webContents?.send('midi:ports', ports);

  // Case 1: nothing connected, and a device is now available → auto-connect
  if (!currentPortName && portCount > 0) {
    connectToPort(0);
    return;
  }

  // Case 2: something was connected — check if it's still there
  if (currentPortName) {
    const stillPresent = ports.some(p => p.name === currentPortName);

    if (!stillPresent) {
      // Our device is gone
      currentPortName = null;
      mainWindow?.webContents?.send('midi:disconnected');

      // Fall back to another device if one is available
      if (portCount > 0) {
        connectToPort(0);
      }
    }
  }
}

// ─── IPC handlers (renderer → main) ──────────────────────────────────────────

ipcMain.handle('midi:getPorts', () => {
  if (!midiInput) return [];
  const count = midiInput.getPortCount();
  const ports = [];
  for (let i = 0; i < count; i++) {
    ports.push({ index: i, name: midiInput.getPortName(i) });
  }
  return ports;
});

ipcMain.on('midi:connectPort', (_, portIndex) => {
  connectToPort(portIndex);
});

ipcMain.handle('midi:refresh', () => {
  closeMidi();
  const midi = require('midi');
  midiInput = new midi.Input();

  const portCount = midiInput.getPortCount();
  const ports = [];
  for (let i = 0; i < portCount; i++) {
    ports.push({ index: i, name: cleanPortName(midiInput.getPortName(i)) });
  }

  // Auto-connect to the first available port after refresh
  if (portCount > 0) {
    connectToPort(0);
  }

  return ports;
});

// ─── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  initMidi();
  pollInterval = setInterval(pollMidiPorts, 1500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  clearInterval(pollInterval);
  closeMidi();
  if (process.platform !== 'darwin') app.quit();
});
