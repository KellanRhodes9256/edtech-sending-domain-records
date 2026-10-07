import assert from "node:assert/strict";
import test from "node:test";
import { deadlineDecision } from "../src/course_delivery_domain.ts";

test("a learner receives a reminder only in the two-day deadline window", () => {
  const now = new Date("2030-05-01T12:00:00.000Z");
  assert.equal(deadlineDecision("2030-05-03T11:00:00.000Z", now), "send-deadline-reminder");
  assert.equal(deadlineDecision("2030-05-04T12:00:00.000Z", now), "hold");
  assert.equal(deadlineDecision("2030-05-01T11:00:00.000Z", now), "hold");
});
