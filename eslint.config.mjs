import avidofood from 'eslint-config-avidofood';

export default [
    {
        // Build output
        ignores: ['dist/**'],
    },
    ...avidofood,
    {
        // The tests define small components next to each other
        files: ['tests/**'],
        rules: { 'vue/one-component-per-file': 'off' },
    },
];
