import { defineConfig } from 'vite';

export default defineConfig({
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
