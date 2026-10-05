module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/releases/__tests__/env-setup.ts'],
  collectCoverageFrom: ['**/*.ts', '!**/__tests__/**', '!**/generated/**'],
};
