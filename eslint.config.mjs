import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  {
    rules: {
      // A leading underscore means "destructured to be thrown away", which is
      // the standard way to omit keys from an object without a helper:
      //   const { gate: _g, ...ref } = statute
      // Without this the omit pattern is unusable and the alternative is a
      // delete on a copy, which is worse code to satisfy a linter.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },

  {
    // The gate scripts, and only those.
    files: ["scripts/**/*.ts"],
    rules: {
      // Every assertion in these files is written as
      //   condition ? pass('...') : fail('...')
      // which the rule reads as an expression whose value is discarded. It is
      // the assertion idiom of this suite, used in roughly ninety places, and
      // it keeps the claim and its two outcomes on adjacent lines where they
      // can be read together. Rewriting them as if/else would be churn across
      // every gate to satisfy a rule about application code.
      //
      // Scoped to scripts/ deliberately: in app, lib or components a discarded
      // expression is still a bug, and the rule still fires there.
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
]);

export default eslintConfig;
