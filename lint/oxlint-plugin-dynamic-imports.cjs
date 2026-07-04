module.exports = {
  meta: {
    name: "dynamic-imports"
  },
  rules: {
    "no-dynamic-import": {
      meta: {
        type: "problem",
        docs: {
          description: "Disallow dynamic import() outside explicit exceptions."
        }
      },
      create(context) {
        return {
          ImportExpression(node) {
            context.report({
              node,
              message: "Dynamic import() is not allowed here."
            });
          }
        };
      }
    }
  }
};
