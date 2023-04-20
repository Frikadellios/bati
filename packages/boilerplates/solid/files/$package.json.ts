import { loadJsonFile } from "../src/utils.js";

export default async function getPackageJson(currentContent: (() => string | Promise<string>) | undefined) {
  const packageJson = await loadJsonFile(currentContent);

  packageJson.dependencies = {
    ...packageJson.dependencies,
    "cross-fetch": "^3.0.0",
    "solid-js": "^1.7.0",
    solide: "latest",
  };

  return packageJson;
}
