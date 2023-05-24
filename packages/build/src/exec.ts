import { loadFile, transformAndGenerate, type VikeMeta } from "@batijs/core";
import { copyFile, mkdir, opendir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const reIgnoreFile = /^(chunk-|asset-|#)/gi;

function toDist(filepath: string, source: string, dist: string) {
  const split = filepath.split(path.sep);
  split[split.length - 1] = split[split.length - 1].replace(/^\$\$?(.*)\.[tj]sx?$/, "$1");
  return split.join(path.sep).replace(source, dist);
}

async function safeCopyFile(source: string, destination: string) {
  const destinationDir = path.dirname(destination);
  await mkdir(destinationDir, {
    recursive: true,
  });
  await copyFile(source, destination);
}

async function safeWriteFile(destination: string, content: string) {
  const destinationDir = path.dirname(destination);
  await mkdir(destinationDir, {
    recursive: true,
  });
  await writeFile(destination, content, { encoding: "utf-8" });
}

async function* walk(dir: string, meta: VikeMeta): AsyncGenerator<string> {
  if (!existsSync(dir)) return;
  for await (const d of await opendir(dir)) {
    const entry = path.join(dir, d.name);
    if (d.isDirectory()) {
      yield* walk(entry, meta);
    } else if (d.isFile()) yield entry;
  }
}

function transformFileAfterExec(filepath: string, fileContent: unknown): string {
  const parsed = path.parse(filepath);
  const ext = parsed.ext || parsed.name;
  switch (ext) {
    case ".ts":
    case ".js":
    case ".tsx":
    case ".jsx":
    case ".env":
      return fileContent as string;
    case ".json":
      return JSON.stringify(fileContent, null, 2);
    default:
      throw new Error(`Unsupported extension ${ext} (${filepath})`);
  }
}

async function fileContainsBatiMeta(filepath: string) {
  const code = await readFile(filepath, { encoding: "utf-8" });
  return code.includes("import.meta.BATI_");
}

export default async function main(options: { source: string | string[]; dist: string }, meta: VikeMeta) {
  const sources = Array.isArray(options.source) ? options.source : [options.source];
  const targets = new Set<string>();

  for (const source of sources) {
    for await (const p of walk(source, meta)) {
      const target = toDist(p, source, options.dist);
      const parsed = path.parse(p);
      if (parsed.name.match(reIgnoreFile)) {
        continue;
      } else if (parsed.name.startsWith("$") && parsed.ext.match(/\.tsx?$/)) {
        throw new Error(
          `Typescript file needs to be compiled before it can be executed: '${p}'.
Please report this issue to https://github.com/magne4000/bati`
        );
      } else if (parsed.name.startsWith("$") && parsed.ext.match(/\.jsx?$/)) {
        const f = await import(p);

        const fileContent = transformFileAfterExec(
          target,
          await f.default(targets.has(target) ? () => readFile(target, { encoding: "utf-8" }) : undefined, meta)
        );

        if (fileContent !== null) {
          await safeWriteFile(target, fileContent);
        }
        targets.add(target);
      } else if (parsed.ext.match(/\.[tj]sx?$/) && (await fileContainsBatiMeta(p))) {
        const mod = await loadFile(p);
        const fileContent = await transformAndGenerate(mod.$ast, meta, {
          filepath: p,
        });

        if (fileContent) {
          await safeWriteFile(target, fileContent);
        }
        targets.add(target);
      } else {
        // simple copy
        await safeCopyFile(p, target);
        targets.add(target);
      }
    }
  }
}
