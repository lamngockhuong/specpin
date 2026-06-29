// Runs after `npm install`: fetches the platform-matched specpin binary so the
// `specpin` command works immediately. Failures here are non-fatal, the bin
// launcher retries the download on first run, so installs under restricted
// networks (or `--ignore-scripts`) still self-heal later.

import { ensureBinary } from "./download.mjs";

try {
  const out = await ensureBinary();
  console.log(`specpin: installed binary at ${out}`);
} catch (err) {
  console.warn(`specpin: postinstall could not fetch the binary (${err.message}).`);
  console.warn("specpin: it will be downloaded automatically the first time you run `specpin`.");
}
