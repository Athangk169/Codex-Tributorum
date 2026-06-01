import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc' // Added 'plugin-' here

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    // This provides the 'global' variable that PouchDB is looking for
    global: 'window',
  },

  // Vite (dev + preview) blocks unknown Host headers as DNS-rebinding
  // defence. Our Tailscale serve hostname is the proxy target's Host
  // header, so it has to be allow-listed here. Add any other tailnet
  // hostnames you serve from in the same way.
  server: {
    allowedHosts: [
      'laptop-lg23d2mc.taild8bd6e.ts.net',
      'localhost',
      '127.0.0.1',
    ],
  },
  preview: {
    allowedHosts: [
      'laptop-lg23d2mc.taild8bd6e.ts.net',
      'localhost',
      '127.0.0.1',
    ],
  },
})