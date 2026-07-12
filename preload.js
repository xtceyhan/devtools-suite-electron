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
});
