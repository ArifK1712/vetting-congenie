import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Screens moved onto the read layer (src/queries) must not read the whole
  // database again; add each folder here once it's migrated.
  {
    files: ["src/features/queue/**", "src/features/request-detail/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/store/app",
              importNames: ["useDb", "useAppStore"],
              message: "Read data through a hook in src/queries (and write through src/services), so the screen is ready for an API.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
