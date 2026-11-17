import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Nouvelle règle (eslint-plugin-react-hooks 7, livrée avec Next 16).
      // Le code existant charge ses données dans des useEffect avec setState
      // (35 occurrences) : on la garde visible en avertissement, à traiter
      // progressivement, plutôt que de réécrire ces écrans dans la montée de version.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
