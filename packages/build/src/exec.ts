import { readFile, opendir, copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { VikeMeta } from "./types";

function toDist(filepath: string, source: string, dist: string) {
  const split = filepath.split(path.sep).filter((p) => !p.includes("VIKE_"));
  split[split.length - 1] = split[split.length - 1].replace(/^\$(.*)\.js$/, "$1");
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
  for await (const d of await opendir(dir)) {
    const entry = path.join(dir, d.name);
    if (d.isDirectory()) {
      yield* walk(entry, meta);
    } else if (d.isFile()) yield entry;
  }
}

function transformFileAfterExec(filepath: string, fileContent: unknown): string {
  const parsed = path.parse(filepath);
  switch (parsed.ext) {
    case ".ts":
    case ".js":
      return fileContent as string;
    case ".json":
      return JSON.stringify(fileContent, null, 2);
    default:
      throw new Error(`Unsupported extension ${parsed.ext} (${filepath})`);
  }
}

export default async function main(options: { source: string | string[]; dist: string }, meta: VikeMeta) {
  const sources = Array.isArray(options.source) ? options.source : [options.source];
  const targets = new Set<string>();

  // reverse here so that if multiple files end-up in the same place, the last one prevails
  for (const source of sources.reverse()) {
    for await (const p of walk(source, meta)) {
      const target = toDist(p, source, options.dist);
      if (targets.has(target)) {
        // TODO: how to handle this information message?
        console.warn(`Ignoring ${p} because ${target} has already been written`);
        continue;
      } else {
        targets.add(target);
      }
      const parsed = path.parse(p);
      if (parsed.name.startsWith("$") && parsed.ext.match(/\.tsx?$/)) {
        throw new Error(`Typescript file needs to be compiled before it can be imported: '${p}'`);
      } else if (parsed.name.startsWith("$") && parsed.ext.match(/\.jsx?$/)) {
        const f = await import(p);

        const fileContent = transformFileAfterExec(target, await f.default());

        if (fileContent !== null) {
          await safeWriteFile(target, fileContent);
        }
      } else {
        // simple copy
        await safeCopyFile(p, target);
      }
    }
  }
}
