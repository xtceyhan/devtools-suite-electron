const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  minimize:       () => ipcRenderer.invoke('win-min'),
  maximize:       () => ipcRenderer.invoke('win-max'),
  close:          () => ipcRenderer.invoke('win-close'),
  clipboardWrite: t  => ipcRenderer.invoke('clipboard-write', t),
  openWSDL:       () => ipcRenderer.invoke('open-wsdl'),
  saveFile:       (opts) => ipcRenderer.invoke('save-file', opts),
  mipZip:         (opts) => ipcRenderer.invoke('mip-zip', opts),
  fetchWsdl:      (opts) => ipcRenderer.invoke('fetch-wsdl', opts),

  // Otomatik güncelleme
  updateDownload: () => ipcRenderer.invoke('update-download'),
  updateInstall:  () => ipcRenderer.invoke('update-install'),
  onUpdateAvailable:    cb => ipcRenderer.on('update-available',     (_e, data) => cb(data)),
  onUpdateNotAvailable: cb => ipcRenderer.on('update-not-available', ()          => cb()),
  onUpdateProgress:     cb => ipcRenderer.on('update-progress',      (_e, data) => cb(data)),
  onUpdateDownloaded:   cb => ipcRenderer.on('update-downloaded',    ()          => cb()),
  onUpdateError:        cb => ipcRenderer.on('update-error',         (_e, data) => cb(data)),
});
