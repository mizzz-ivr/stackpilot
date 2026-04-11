const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const reactHooks = require('eslint-plugin-react-hooks');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'build/**',
      'coverage/**',
      'node_modules/**'
    ]
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      ...tsPlugin.configs.recommended.rules
    }
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    },
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      ...reactHooks.configs.recommended.rules
    }
  },
  {
    files: ['electron/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', '*.config.{js,cjs,mjs,ts}', 'vite.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
];
