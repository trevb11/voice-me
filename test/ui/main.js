// Electron shell for the compose-mode flow test. Renderer logs are relayed to
// stdout; the page signals completion with UI-DONE and its own exit code.
const { app, BrowserWindow } = require('electron');
const path = require('path');

let failures = 0;

app.whenReady().then(() => {
  const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  w.webContents.on('console-message', (_e, _level, message) => {
    if (message.startsWith('[app] no MIDI bridge')) return;
    console.log(message);
    if (message.startsWith('FAIL')) failures++;
    if (message === 'UI-DONE') { w.destroy(); app.exit(failures ? 1 : 0); }
  });
  w.loadFile(path.join(__dirname, 'harness.html'));
});

setTimeout(() => { console.log('TIMED OUT'); app.exit(1); }, 60000);
