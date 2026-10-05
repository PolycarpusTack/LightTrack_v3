module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/baseline/**/*.test.js'],
  modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/out/'],
  // TypeScript sources (LT3-006) are compiled on the fly; JavaScript runs as is.
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }]
  },
  collectCoverage: false,
  clearMocks: true,
  restoreMocks: true,
  verbose: true
};
