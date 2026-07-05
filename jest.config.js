module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/track-resolver/__tests__/env-setup.ts'],
  collectCoverageFrom: ['**/*.ts', '!**/__tests__/**', '!**/generated/**'],
};
