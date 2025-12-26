import js from "@eslint/js";
import globals from "globals";

export default [
    {
        ignores: [
            "dist/*",
            "node_modules/*",
            "playwright-report/*",
            "test-results/*"
        ]
    },
    js.configs.recommended,
    {
        files: ["**/*.js", "**/*.cjs", "**/*.mjs", "**/*.spec.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.node,
                ...globals.browser,
                ...globals.jest,
            },
        },
        rules: {
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
            "no-undef": "error",
            "no-console": "off",
        },
    },
];
