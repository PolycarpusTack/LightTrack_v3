module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/baseline/**/*.test.js'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  collectCoverage: false,
  clearMocks: true,
  restoreMocks: true,
  verbose: true
};
