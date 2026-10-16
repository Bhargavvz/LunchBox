import { FlatCompat } from '@eslint/eslintrc';
import base from '@lunchbox/config/eslint/base';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [...base, ...compat.extends('next/core-web-vitals'), { ignores: ['out/**', '.next/**', 'playwright-report/**'] }];
