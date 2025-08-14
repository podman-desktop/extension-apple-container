/**********************************************************************
 * Copyright (C) 2025 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/

import globals from 'globals';
import js from '@eslint/js';
import typescriptLint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import { fixupConfigRules, fixupPluginRules } from '@eslint/compat';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FlatCompat } from '@eslint/eslintrc';
import unicorn from 'eslint-plugin-unicorn';
import noNull from 'eslint-plugin-no-null';
import sonarjs from 'eslint-plugin-sonarjs';
import etc from 'eslint-plugin-etc';
import redundantUndefined from 'eslint-plugin-redundant-undefined';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import vitest from '@vitest/eslint-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const TYPESCRIPT_PROJECTS = ['tsconfig.json'];

export default [
  {
    ignores: [
      '*.config.*js',
      '**/*.config.*js',
      '**/*.tests.setup.*js',
      '**/dist/**/*',
      '**/test-resources',
      '**/__mocks__/',
      '**/coverage/',
      'scripts/**',
      '**/src-generated/',
    ],
  },
  js.configs.recommended,
  ...typescriptLint.configs.recommended,
  sonarjs.configs.recommended,
  vitest.configs.all,
  ...fixupConfigRules(
    compat.extends('plugin:import/recommended', 'plugin:import/typescript', 'plugin:etc/recommended'),
  ),
  {
    plugins: {
      // compliant v9 plug-ins
      unicorn,
      vitest,
      // non-compliant v9 plug-ins
      etc: fixupPluginRules(etc),
      import: fixupPluginRules(importPlugin),
      'no-null': fixupPluginRules(noNull),
      'redundant-undefined': fixupPluginRules(redundantUndefined),
      'simple-import-sort': fixupPluginRules(simpleImportSort),
    },
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,

        'eslint-import-resolver-custom-alias': {
          alias: {
            '/@/': './src',
          },
          extensions: ['.ts'],
        },
      },
    },
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      globals: {
        ...globals.node,
      },
      // parser: tsParser,
      sourceType: 'module',
      parserOptions: {
        warnOnUnsupportedTypeScriptVersion: false,
        project: TYPESCRIPT_PROJECTS,
      },
    },
  },
  {
    rules: {
      eqeqeq: 'error',
      'prefer-promise-reject-errors': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: false }],
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        {
          ignoreConditionalTests: true,
        },
      ],
      '@typescript-eslint/no-require-imports': 'off',

      // unicorn custom rules
      'unicorn/prefer-node-protocol': 'error',
      'no-null/no-null': 'error',
      'sonarjs/no-empty-function': 'off',
      'sonarjs/deprecation': 'off',
      'sonarjs/todo-tag': 'off',
      'sonarjs/sonar-no-fallthrough': 'off',

      /**
       * Having a semicolon helps the optimizer interpret your code correctly.
       * This avoids rare errors in optimized code.
       * @see https://twitter.com/alex_kozack/status/1364210394328408066
       */
      semi: ['error', 'always'],
      /**
       * This will make the history of changes in the hit a little cleaner
       */
      'comma-dangle': ['warn', 'always-multiline'],
      /**
       * Just for beauty
       */
      quotes: ['error', 'single', { allowTemplateLiterals: true }],

      'capitalized-comments': 'error',

      // disabled import/namespace rule as the plug-in is not fully compatible using the compat mode
      'import/namespace': 'off',
      'import/no-duplicates': 'error',
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'redundant-undefined/redundant-undefined': 'error',
      'import/no-extraneous-dependencies': 'error',
      'vitest/consistent-test-filename': 'off',
      'vitest/no-hooks': 'off',
      'vitest/require-top-level-describe': 'off',
    },
  },
];
