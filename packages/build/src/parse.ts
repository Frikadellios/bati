import { print, prettyPrint, types } from "recast";
import { parse } from "@typescript-eslint/typescript-estree";
import { lazyfy } from "./utils";
import { evalCondition } from "./eval";

export function ast(code: string) {
  return parse(code, {
    loc: true,
    range: true,
  });
}

function simpleAstExpression(code: string) {
  return ast(code).body[0] as types.namedTypes.ExpressionStatement;
}

export const metaAst = lazyfy({
  VIKE_FRAMEWORK: () => simpleAstExpression("import.meta.VIKE_FRAMEWORK"),
  VIKE_DATABASE: () => simpleAstExpression("import.meta.VIKE_DATABASE"),
});

export function transformAst(
  tree: ReturnType<typeof ast>,
  meta: Omit<ImportMeta, "url">
) {
  types.visit(tree, {
    visitIfStatement(path) {
      let found = false;

      this.traverse(path.get("test"), {
        visitMemberExpression(path2) {
          if (
            types.astNodesAreEquivalent(
              path2.value,
              metaAst.VIKE_FRAMEWORK.expression
            )
          ) {
            found = true;
          }

          this.traverse(path2);
        },
      });

      if (found) {
        if (!evalCondition(print(path.value.test).code, meta)) {
          // remove the whole if-block
          path.replace();
        } else {
          // Replace if-block by its content
          if (types.namedTypes.BlockStatement.check(path.value.consequent)) {
            path.replace(...path.value.consequent.body);
          } else {
            path.replace(path.value.consequent);
          }
        }
      }

      this.traverse(path.get("consequent"));
    },
  });

  return tree;
}

export function transform(
  tree: ReturnType<typeof ast>,
  meta: Omit<ImportMeta, "url">
) {
  return prettyPrint(transformAst(tree, meta), {
    tabWidth: 2,
    reuseWhitespace: false,
    wrapColumn: 120,
  }).code;
}