module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.test.json',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': 'error',
    'no-console': 'error',
    'no-restricted-syntax': [
      'error',
      {
        selector: "ImportDeclaration[source.value='chalk']",
        message: 'chalk is forbidden in RepoDoctor v0.0.1.',
      },
      {
        selector: "ImportDeclaration[source.value='ora']",
        message: 'ora is forbidden in RepoDoctor v0.0.1.',
      },
      {
        selector: "ImportDeclaration[source.value='inquirer']",
        message: 'inquirer is forbidden in RepoDoctor v0.0.1.',
      },
    ],
    'no-undef': 'off',
  },
  overrides: [
    {
      files: ['tests/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
    {
      files: ['src/logger/ConsoleTransport.ts'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
  ignorePatterns: ['dist', 'node_modules', '*.js', '*.cjs', '*.mjs'],
};
