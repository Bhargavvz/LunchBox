import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import base from './base.mjs';

/** Flat config for the Expo apps and the shared RN UI package. */
export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': hooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node, __DEV__: 'readonly' } },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...hooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
];
