const legacyFeatureSuffixPattern =
  /^@\/features\/.*\.(contract|db|persistence|routes|service|util)$/u;

function getStaticSource(node) {
  return typeof node.source?.value === "string" ? node.source.value : null;
}

module.exports = {
  meta: {
    name: "feature-boundaries"
  },
  rules: {
    "no-legacy-feature-suffix-imports": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Disallow old feature suffix module imports in favor of feature boundaries."
        }
      },
      create(context) {
        function check(node) {
          const source = getStaticSource(node);
          if (!source || !legacyFeatureSuffixPattern.test(source)) {
            return;
          }

          context.report({
            node: node.source,
            message:
              "Use feature boundary files (`db.ts`, `http.ts`) or the standardized `_shared` structure instead of old suffix modules."
          });
        }

        return {
          ExportAllDeclaration: check,
          ExportNamedDeclaration: check,
          ImportDeclaration: check
        };
      }
    }
  }
};
