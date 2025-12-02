import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    ignores: [
      'node_modules/**',
      'images/**',
      'models/**',
      'textures/**',
      'dist/**'
    ],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.worker,
        ...globals.es2021
      }
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['tools/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    }
  },
  {
    files: ['server/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }]
    }
  }
];
