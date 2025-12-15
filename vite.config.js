import { defineConfig } from 'vite';

export default defineConfig({
    base: process.env.VITE_BASE_PATH || './',
    server: {
        port: 12121,
        strictPort: true,
        proxy: {
            '/socket.io': {
                target: 'http://localhost:12122',
                ws: true,
                changeOrigin: true
            }
        }
    }
});
