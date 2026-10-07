import avidofood from 'eslint-config-avidofood';

export default [
    ...avidofood,
    {
        rules: {
            // A Vue 2 plugin adds its instance method to Vue.prototype
            'no-param-reassign': ['error', { props: true, ignorePropertyModificationsFor: ['Vue'] }],
        },
    },
];
