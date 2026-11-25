import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import solid from "eslint-plugin-solid/configs/typescript";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    ...solid,
    languageOptions: {
      ...solid.languageOptions,
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    rules: {
      ...solid.rules,
      "no-unused-vars": "off",
    },
  },
  {
    files: ["*.config.{js,ts}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
