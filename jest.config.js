/**
 * Jest configuration for LightTrack
 */

module.exports = {
  // Test environment
  testEnvironment: 'jsdom',
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  
  // Module paths
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/test/mocks/styleMock.js',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/test/mocks/fileMock.js'
  },
  
  // Test match patterns
  testMatch: [
    '<rootDir>/test/**/*.test.js',
    '<rootDir>/src/**/*.test.js'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/index.js',
    '!node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75
    }
  },
  
  // Transform files
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/archive/'
  ],
  
  // Module file extensions
  moduleFileExtensions: ['js', 'json'],
  
  // Globals
  globals: {
    'window': {},
    'document': {}
  },
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks between tests
  restoreMocks: true,
  
  // Fake timers
  fakeTimers: {
    enableGlobally: true
  },
  
  // Test timeout
  testTimeout: 10000
};