// Adds more rows to wb_gridspike with the same value pattern as the first 30, for volume and
// paging tests (brief §5.9: 250+ rows).
// Usage: node scripts/test-env/add-gridspike-rows.mjs --from 31 --to 260
// See docs/testing/gridformatter-test-environment.md.
import { arg, call } from "./lib.mjs";
import { rowValues } from "./create-gridspike.mjs";

const from = Number(arg("from", "31"));
const to = Number(arg("to", "260"));
if (!(from >= 1 && to >= from)) throw new Error("--from and --to must be row numbers with from <= to");

let ok = 0;
let failed = 0;
for (let start = from; start <= to; start += 10) {
  const batch = [];
  for (let i = start; i <= Math.min(start + 9, to); i++) batch.push(call("POST", "wb_gridspikes", rowValues(i, 3)));
  for (const result of await Promise.allSettled(batch)) {
    if (result.status === "fulfilled") ok++;
    else {
      failed++;
      console.error(result.reason.message);
    }
  }
}
console.log(`created ${ok}, failed ${failed}`);
