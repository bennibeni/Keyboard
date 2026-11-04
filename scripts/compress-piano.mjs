// Run with Node and ffmpeg installed: node scripts/compress-piano.mjs
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("../public/samples/piano/", import.meta.url));
for (const name of readdirSync(directory).filter((name) => name.endsWith(".wav"))) {
  const source = `${directory}/${name}`;
  const result = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", source,
    "-codec:a", "libmp3lame", "-b:a", "96k", source.replace(/\.wav$/, ".mp3"),
  ], { stdio: "inherit" });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`Failed: ${name}`);
}
