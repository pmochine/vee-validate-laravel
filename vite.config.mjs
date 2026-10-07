import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const fromRoot = (file) => fileURLToPath(new URL(file, import.meta.url));

// Copies the hand-written types next to the build. Without "type": "module" in package.json,
// TypeScript reads a .d.ts file as CommonJS and a .d.mts file as ESM, so we ship both.
const types = () => ({
    name: 'types',
    generateBundle({ format }) {
        if (format !== 'es') return;
        const source = readFileSync(fromRoot('./src/index.d.ts'), 'utf8');
        this.emitFile({ type: 'asset', fileName: 'index.d.ts', source });
        this.emitFile({ type: 'asset', fileName: 'index.d.mts', source });
    },
});

// https://vite.dev/config/
export default defineConfig({
    build: {
        outDir: './dist',
        // Vue 3 needs ES2016 and Proxy. ES2019 works in every browser that Vue supports
        target: 'es2019',
        lib: {
            entry: fromRoot('./src/index.js'),
            name: 'VeeValidateLaravel',
            fileName: 'vee-validate-laravel',
            formats: ['es', 'umd'],
        },
        rolldownOptions: {
            external: ['vue', 'vee-validate'],
            output: {
                // Global variables of the peer dependencies in the UMD build
                globals: {
                    vue: 'Vue',
                    'vee-validate': 'VeeValidate',
                },
            },
        },
    },
    plugins: [types()],
    test: {
        environment: 'jsdom',
        include: ['tests/**/*.test.js'],
    },
});
