const { app, BrowserWindow, ipcMain, clipboard, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs   = require('fs');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    frame: false, transparent: true, backgroundColor: '#00000000',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.handle('win-min',   e => BrowserWindow.fromWebContents(e.sender).minimize());
ipcMain.handle('win-max',   e => { const w = BrowserWindow.fromWebContents(e.sender); w.isMaximized() ? w.unmaximize() : w.maximize(); });
ipcMain.handle('win-close', e => BrowserWindow.fromWebContents(e.sender).close());
ipcMain.handle('clipboard-write', (_, t) => { clipboard.writeText(t); return true; });

ipcMain.handle('save-file', async (e, { content, defaultName, filters }) => {
  const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Farklı Kaydet',
    defaultPath: defaultName || 'output.xsl',
    filters: filters || [{ name: 'Tüm Dosyalar', extensions: ['*'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  try {
    require('fs').writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, path: result.filePath };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('open-wsdl', async e => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'WSDL Dosyası Seç',
    filters: [{ name: 'WSDL / XML', extensions: ['wsdl', 'xml'] }, { name: 'Tüm Dosyalar', extensions: ['*'] }],
    properties: ['openFile']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    try { return { content: fs.readFileSync(result.filePaths[0], 'utf-8'), path: result.filePaths[0] }; }
    catch (err) { return { error: err.message }; }
  }
  return null;
});

ipcMain.handle('fetch-wsdl', async (e, { url, username, password }) => {
  const https = require('https');
  const http  = require('http');
  const u     = new URL(url);
  const lib   = u.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    const options = {
      hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + (u.search || '') + (url.includes('?') ? '' : '?wsdl'),
      method: 'GET',
      headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'text/xml,application/xml' },
      rejectUnauthorized: false  // self-signed SAP sertifikaları için
    };
    const req = lib.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 401) return resolve({ error: 'Kullanıcı adı veya şifre hatalı (401)' });
        if (res.statusCode !== 200) return resolve({ error: `HTTP ${res.statusCode}` });
        resolve({ xml: data });
      });
    });
    req.on('error', err => resolve({ error: err.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ error: 'Bağlantı zaman aşımı (15s)' }); });
    req.end();
  });
});

ipcMain.handle('mip-zip', async (e, { flowsJson, resourcesJson, timestamp, flowId }) => {
  const { dialog, BrowserWindow } = require('electron');
  const path = require('path');
  const fs   = require('fs');

  const win = BrowserWindow.fromWebContents(e.sender);
  const result = await dialog.showSaveDialog(win, {
    title: 'MIP Paketini Kaydet',
    defaultPath: `${flowId}_${timestamp}.zip`,
    filters: [{ name: 'ZIP Dosyası', extensions: ['zip'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  try {
    // Manuel ZIP oluşturma (node built-in, ek paket yok)
    const zlib = require('zlib');

    function makeLocalFileHeader(name, data) {
      const nameBuf  = Buffer.from(name, 'utf8');
      const dataBuf  = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      const crc      = crc32(dataBuf);
      const header   = Buffer.alloc(30 + nameBuf.length);
      header.writeUInt32LE(0x04034b50, 0);  // signature
      header.writeUInt16LE(20, 4);           // version needed
      header.writeUInt16LE(0, 6);            // flags
      header.writeUInt16LE(0, 8);            // compression (stored)
      header.writeUInt16LE(0, 10);           // mod time
      header.writeUInt16LE(0, 12);           // mod date
      header.writeUInt32LE(crc, 14);         // crc32
      header.writeUInt32LE(dataBuf.length, 18); // compressed size
      header.writeUInt32LE(dataBuf.length, 22); // uncompressed size
      header.writeUInt16LE(nameBuf.length, 26); // file name length
      header.writeUInt16LE(0, 28);           // extra field length
      nameBuf.copy(header, 30);
      return { header, data: dataBuf, name: nameBuf, crc, size: dataBuf.length };
    }

    function makeCentralDir(entry, offset) {
      const buf = Buffer.alloc(46 + entry.name.length);
      buf.writeUInt32LE(0x02014b50, 0);
      buf.writeUInt16LE(20, 4);
      buf.writeUInt16LE(20, 6);
      buf.writeUInt16LE(0, 8);
      buf.writeUInt16LE(0, 10);
      buf.writeUInt16LE(0, 12);
      buf.writeUInt16LE(0, 14);
      buf.writeUInt32LE(entry.crc, 16);
      buf.writeUInt32LE(entry.size, 20);
      buf.writeUInt32LE(entry.size, 24);
      buf.writeUInt16LE(entry.name.length, 28);
      buf.writeUInt16LE(0, 30);
      buf.writeUInt16LE(0, 32);
      buf.writeUInt16LE(0, 34);
      buf.writeUInt16LE(0, 36);
      buf.writeUInt32LE(0, 38);
      buf.writeUInt32LE(offset, 42);
      entry.name.copy(buf, 46);
      return buf;
    }

    function makeEOCD(entryCount, centralSize, centralOffset) {
      const buf = Buffer.alloc(22);
      buf.writeUInt32LE(0x06054b50, 0);
      buf.writeUInt16LE(0, 4);
      buf.writeUInt16LE(0, 6);
      buf.writeUInt16LE(entryCount, 8);
      buf.writeUInt16LE(entryCount, 10);
      buf.writeUInt32LE(centralSize, 12);
      buf.writeUInt32LE(centralOffset, 16);
      buf.writeUInt16LE(0, 20);
      return buf;
    }

    // CRC32 tablosu
    const crcTable = (() => {
      const t = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c;
      }
      return t;
    })();
    function crc32(buf) {
      let c = 0xFFFFFFFF;
      for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    }

    // Dosyaları tanımla
    const files = [
      { name: `flows/flows.${timestamp}.json`,     data: flowsJson },
      { name: `resources/resources.${timestamp}.json`, data: resourcesJson },
    ];

    const entries = [];
    const localParts = [];
    let offset = 0;

    for (const f of files) {
      const entry = makeLocalFileHeader(f.name, f.data);
      entries.push({ ...entry, offset });
      localParts.push(entry.header, entry.data);
      offset += entry.header.length + entry.data.length;
    }

    const centralParts = entries.map(e => makeCentralDir(e, e.offset));
    const centralSize  = centralParts.reduce((s, b) => s + b.length, 0);
    const eocd         = makeEOCD(entries.length, centralSize, offset);

    const zip = Buffer.concat([...localParts, ...centralParts, eocd]);
    fs.writeFileSync(result.filePath, zip);
    return { success: true, path: result.filePath, zipBase64: zip.toString('base64') };
  } catch (err) {
    return { error: err.message };
  }
});

// ── OTOMATİK GÜNCELLEME ──
// İndirme otomatik başlamaz: kullanıcı uygulama içindeki banner'dan "İndir"e
// basınca başlar, indirme bitince de "Yeniden başlat ve yükle"ye basınca kurulur.
// electron-builder'daki publish:{provider:"github", owner, repo} ayarını kullanır —
// yani "yeni sürüm" GitHub Releases'teki en son sürümdür, sadece commit push değil.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function toRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

autoUpdater.on('update-available',     info => toRenderer('update-available', { version: info.version }));
autoUpdater.on('update-not-available', ()   => toRenderer('update-not-available'));
autoUpdater.on('download-progress',    p    => toRenderer('update-progress', { percent: Math.round(p.percent) }));
autoUpdater.on('update-downloaded',    ()   => toRenderer('update-downloaded'));
autoUpdater.on('error',                err  => toRenderer('update-error', { message: err?.message || String(err) }));

ipcMain.handle('update-check',    () => { if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {}); });
ipcMain.handle('update-download', () => autoUpdater.downloadUpdate());
ipcMain.handle('update-install',  () => autoUpdater.quitAndInstall());

app.whenReady().then(() => {
  createWindow();
  // Uygulama açılışında otomatik kontrol — sadece paketlenmiş (kurulu) sürümde,
  // "npm start" ile geliştirme modunda çalışmaz.
  if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {});
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
