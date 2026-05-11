const { contextBridge } = require('electron');
const path = require('path');

contextBridge.exposeInMainWorld('electronDistPath', {
  distPath: path.join(__dirname, 'dist').replace(/\\/g, '/')
});