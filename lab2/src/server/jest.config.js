module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/*.test.ts'],
    clearMocks: true,
    testEnvironmentOptions: {
        customExportConditions: ['node', 'node-addons'],
    },
    setupFiles: ['./jest.setup.js'],
};