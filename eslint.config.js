module.exports = [
  {
    // www/ is the shipped app — it must be linted. android/ contains only the
    // CI-generated copy of www/, so linting it would double-report every finding.
    ignores: ['node_modules/**', 'android/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        indexedDB: 'readonly',
        requestAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        Audio: 'readonly',
        Image: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        prompt: 'readonly',
        module: 'readonly',
        cancelAnimationFrame: 'readonly',
        AbortController: 'readonly',
        IntersectionObserver: 'readonly',
        MediaMetadata: 'readonly',
        NativeBridge: 'readonly',
        // Defined in app.js; native-bridge.js loads first and guards with typeof
        genId: 'readonly',
        fmtTime: 'readonly',
        escHtml: 'readonly',
        parseFileName: 'readonly',
        parseLRC: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
    },
  },
  {
    files: ['**/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
      },
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },
];
