module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/dist"],
  moduleNameMapper: {
    "^@src/(.*)$": "<rootDir>/dist/cjs/$1",
  },
  testMatch: ["**/*.test.js"],
  transform: {},
};
