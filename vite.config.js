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
})