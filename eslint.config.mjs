import js from "@eslint/js";
import globals from "globals";

// Foundry VTT runtime globals, for the few files Foundry itself loads
// (module.json "esmodules"). Declared so `no-undef` flags only genuinely
// undefined names.
const foundryGlobals = Object.fromEntries([
  "game", "CONFIG", "CONST", "foundry", "ui", "Hooks", "canvas", "PIXI", "Handlebars",
  "Actor", "Item", "ChatMessage", "Roll", "Scene", "Token", "TokenDocument", "JournalEntry",
  "fromUuid", "fromUuidSync"
].map(k => [k, "readonly"]));

export default [
  { ignores: ["node_modules/**", "packs/**", "_work/**", "dist/**"] },
  js.configs.recommended,
  {
    // Build and content tools run under Node.
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.node } }
  },
  {
    // Loaded by Foundry in the browser.
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { ...globals.browser, ...foundryGlobals } }
  },
  {
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }]
    }
  }
];
