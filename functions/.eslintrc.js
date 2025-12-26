module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
  },
  extends: ["eslint:recommended"],
  rules: {
    "no-unused-vars": "off", // disable unused vars warning
    "object-curly-spacing": "off", // disable spacing warning
    "quotes": ["error", "double", { "allowTemplateLiterals": true }],
    "prefer-arrow-callback": "error",
  },
};
