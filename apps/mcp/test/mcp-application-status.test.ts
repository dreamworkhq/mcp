import assert from "node:assert/strict";
import test from "node:test";
import { formatApiErrorMessage } from "../src/client.js";

test("keeps the reason beside the code when a route sends both", () => {
  // The retry gates answer `{ error: "retry_not_safe", message: "…" }` on
  // 409; an agent needs the reason, not the code.
  assert.equal(
    formatApiErrorMessage(
      { error: "retry_not_safe", message: "This application may have been submitted. It needs operator review before retry." },
      409,
    ),
    "retry_not_safe: This application may have been submitted. It needs operator review before retry.",
  );
  assert.equal(formatApiErrorMessage({ error: "not_found" }, 404), "not_found");
});

test("formats structured API errors without collapsing to object strings", () => {
  assert.equal(
    formatApiErrorMessage({ error: { message: "Invalid enum value" } }, 400),
    "Invalid enum value",
  );
  assert.equal(
    formatApiErrorMessage(
      { error: { issues: [{ message: "Bad status" }] } },
      400,
    ),
    '{"issues":[{"message":"Bad status"}]}',
  );
});
