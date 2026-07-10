import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.next/**"],
  },
  {
    // Plain Node scripts (not covered by the TypeScript-aware rules above,
    // which only match .ts/.tsx) — e.g. D2 validation harnesses. Declare the
    // Node/WHATWG globals they actually use instead of disabling no-undef.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
      },
    },
  },
);
