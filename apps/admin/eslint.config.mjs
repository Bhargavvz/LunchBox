import { FlatCompat } from '@eslint/eslintrc';
import base from '@lunchbox/config/eslint/base';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

// Next's config first, so base's typescript-eslint parser wins: its rules need that parser.
const config = [
  ...compat.extends('next/core-web-vitals'),
  ...base,
  // Playwright fixtures take a `use` callback that is not React's `use` hook.
  { files: ['e2e/**'], rules: { 'react-hooks/rules-of-hooks': 'off' } },
  { ignores: ['out/**', '.next/**', 'playwright-report/**', 'next-env.d.ts'] },
];

export default config;
