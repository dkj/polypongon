import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    base: process.env.VITE_BASE_PATH || './',
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
            manifest: {
                name: 'Polypongon',
                short_name: 'Polypongon',
                description: 'A multi-sided pong game',
                theme_color: '#1a1a1a',
                background_color: '#1a1a1a',
                display: 'standalone',
                start_url: '/',
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    }
                ]
            },
            devOptions: {
                enabled: true
            }
        })
    ],
    server: {
        port: 12121,
        strictPort: true,
        proxy: {
            '/socket.io': {
                target: 'http://localhost:12122',
                ws: true,
                changeOrigin: true
            },
            '/api': {
                target: 'http://localhost:12122',
                changeOrigin: true
            }
        }
    }
});
