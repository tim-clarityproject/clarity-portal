export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        alert: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        React: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        URL: 'readonly',
        navigator: 'readonly',
        // Standard browser features the app uses (they were missing, so
        // ESLint reported them as undefined).
        ResizeObserver: 'readonly',
        URLSearchParams: 'readonly',
        performance: 'readonly',
        getComputedStyle: 'readonly',
        crypto: 'readonly',
        CustomEvent: 'readonly',
        CSS: 'readonly',
        Element: 'readonly',
        queueMicrotask: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
    },
  },
];
