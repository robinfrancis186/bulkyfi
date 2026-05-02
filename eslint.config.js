import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      parser: tsParser,
      globals: {
        document: "readonly",
        File: "readonly",
        FileReader: "readonly",
        HTMLCanvasElement: "readonly",
        HTMLImageElement: "readonly",
        IDBDatabase: "readonly",
        indexedDB: "readonly",
        Image: "readonly",
        localStorage: "readonly",
        URL: "readonly",
        window: "readonly"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-undef": "off",
      "no-unused-vars": "off",
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
];
