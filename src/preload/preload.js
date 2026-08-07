const { contextBridge, ipcRenderer } = require('electron');

// Expose a clean, typed API to the renderer — never expose raw ipcRenderer
contextBridge.exposeInMainWorld('midi', {
  // Renderer → Main
  getPorts:     ()    => ipcRenderer.invoke('midi:getPorts'),
  connectPort:  (i)   => ipcRenderer.send('midi:connectPort', i),
  refresh:      ()    => ipcRenderer.invoke('midi:refresh'),

  // Main → Renderer (event subscriptions)
  onEvent:      (cb)  => ipcRenderer.on('midi:event',     (_, e) => cb(e)),
  onPorts:      (cb)  => ipcRenderer.on('midi:ports',     (_, p) => cb(p)),
  onConnected:  (cb)  => ipcRenderer.on('midi:connected', (_, d) => cb(d)),
  onDisconnected: (cb) => ipcRenderer.on('midi:disconnected', () => cb()),
  onError:      (cb)  => ipcRenderer.on('midi:error',     (_, m) => cb(m)),

  // Cleanup
  removeAllListeners: () => {
    ['midi:event','midi:ports','midi:connected','midi:error','midi:disconnected']
      .forEach(ch => ipcRenderer.removeAllListeners(ch));
  },
});
