import test from "node:test";
import assert from "node:assert/strict";
import { buildArrivalNotice, serializeArrivalNotice, parseArrivalNotice } from "../src/model/arrival-notice.js";

const result = (repaired, spent, damagedIds) => ({ repaired, spent, damagedIds });

test("S51: a sound fleet needs no arrival notice", () => {
  assert.equal(buildArrivalNotice(result([], 0, [])), null);
});

test("S51: the repair count, price and remaining damage round trip", () => {
  for (const [input, expected] of [
    [result([{ id: "a" }, { id: "b" }], 150, []), { count: 2, gold: 150, short: false }],
    [result([{ id: "a" }], 37, ["a", "b"]), { count: 1, gold: 37, short: true }],
    [result([], 0, ["a"]), { count: 0, gold: 0, short: true }],
    [result([{ id: "a" }], 0, []), { count: 1, gold: 0, short: false }],
  ]) {
    const notice = buildArrivalNotice(input);
    assert.deepEqual(notice, expected);
    assert.deepEqual(parseArrivalNotice(serializeArrivalNotice(notice)), expected);
  }
});

test("S51: corrupt or inconsistent stored notices are rejected without throwing", () => {
  for (const raw of [null, "", "{", "null", "[]", "{}", '{"count":-1,"gold":0,"short":true}',
    '{"count":1.5,"gold":1,"short":false}', '{"count":1,"gold":-1,"short":false}',
    '{"count":0,"gold":0,"short":false}', '{"count":0,"gold":1,"short":true}',
    '{"count":1,"gold":1,"short":"false"}', '{"count":1,"gold":1e999,"short":false}']) {
    assert.equal(parseArrivalNotice(raw), null, String(raw));
  }
});
