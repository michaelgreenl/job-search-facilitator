import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    plugins: [vue()],
    server: {
        proxy: {
            '/api': 'http://127.0.0.1:3000',
            '/agent': {
                target: 'http://127.0.0.1:3001',
                rewrite: (path) => path.replace(/^\/agent/, ''),
            },
        },
    },
    css: {
        preprocessorOptions: {
            scss: {
                additionalData: `
          @use "@/assets/styles/_variables.scss" as *;
          @use "@/assets/styles/_utils.scss" as *;
        `,
            },
        },
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'unit',
                    include: ['src/**/*.test.ts'],
                    exclude: ['src/**/*.browser.test.ts'],
                    setupFiles: ['./src/test/setup.ts'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'browser',
                    include: ['src/**/*.browser.test.ts'],
                    setupFiles: ['./src/test/setup.ts'],
                    browser: {
                        enabled: true,
                        headless: true,
                        provider: playwright(),
                        instances: [{ browser: 'chromium' }],
                        screenshotFailures: false,
                        viewport: { width: 1024, height: 768 },
                    },
                },
            },
        ],
    },
})
