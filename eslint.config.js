import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser }
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn'
    }
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser }
    }
  },
  {
    ignores: ['dist/**', 'node_modules/**']
  }
];
