import { config } from "@repo/eslint-config/base";

export default [
  ...config,
  {
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
];
