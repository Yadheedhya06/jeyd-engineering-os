import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, aggregate } from '../bin/aggregate.mjs';

const op = (refuted) => ({ refuted });
const dec = (surface, severity, refs) => ({
  id: 'D', surface, severity, opponents: refs.map(op),
});

test('standard, no refutation -> cleared', () => {
  assert.equal(classify(dec('standard', 'high', [false, false, false])).verdict, 'cleared');
});
test('standard majority, high -> blocked', () => {
  assert.equal(classify(dec('standard', 'high', [true, true, false])).verdict, 'blocked');
});
test('standard majority, medium -> revise', () => {
  assert.equal(classify(dec('standard', 'medium', [true, true, false])).verdict, 'revise');
});
test('standard minority, high -> revise', () => {
  assert.equal(classify(dec('standard', 'high', [true, false, false])).verdict, 'revise');
});
test('standard minority, low -> cleared', () => {
  assert.equal(classify(dec('standard', 'low', [true, false, false])).verdict, 'cleared');
});
test('elevated, one refutation, non-critical -> revise', () => {
  assert.equal(classify(dec('elevated', 'high', [false, false, false, false, true])).verdict, 'revise');
});
test('elevated, one refutation, critical -> blocked', () => {
  assert.equal(classify(dec('elevated', 'critical', [false, false, false, false, true])).verdict, 'blocked');
});
test('elevated, clean -> cleared', () => {
  assert.equal(classify(dec('elevated', 'critical', [false, false, false, false, false])).verdict, 'cleared');
});
test('gate fails if any decision is not cleared', () => {
  const r = aggregate({ decisions: [
    { id: 'A', surface: 'standard', severity: 'low', opponents: [op(false), op(false), op(false)] },
    { id: 'B', surface: 'standard', severity: 'high', opponents: [op(true), op(true), op(true)] },
  ] });
  assert.equal(r.gate, 'fail');
  assert.equal(r.summary.blocked, 1);
  assert.equal(r.summary.cleared, 1);
  assert.equal(r.summary.revise, 0);
});
test('gate passes if all cleared', () => {
  const r = aggregate({ decisions: [
    { id: 'A', surface: 'standard', severity: 'low', opponents: [op(false), op(false), op(false)] },
  ] });
  assert.equal(r.gate, 'pass');
});

// Fail-closed input validation
test('unknown surface throws (no silent soft-gate)', () => {
  assert.throws(() => classify({ id: 'X', surface: 'Standard', severity: 'high', opponents: [op(false), op(false), op(false)] }), /unknown surface/);
});
test('unknown severity throws', () => {
  assert.throws(() => classify({ id: 'X', surface: 'standard', severity: 'sev0', opponents: [op(false), op(false), op(false)] }), /unknown severity/);
});
test('standard with fewer than 3 opponents throws', () => {
  assert.throws(() => classify({ id: 'X', surface: 'standard', severity: 'low', opponents: [op(false)] }), /requires >= 3/);
});
test('elevated with fewer than 5 opponents throws', () => {
  assert.throws(() => classify({ id: 'X', surface: 'elevated', severity: 'critical', opponents: [op(false), op(false), op(false), op(false)] }), /requires >= 5/);
});
test('zero opponents throws (never auto-clears)', () => {
  assert.throws(() => classify({ id: 'X', surface: 'standard', severity: 'low', opponents: [] }), /requires >= 3/);
});
test('aggregate throws when decisions is not an array', () => {
  assert.throws(() => aggregate({}), /decisions array/);
});

// Opponent severity escalation (independent adversaries can raise, never lower)
test('opponent escalates: standard minority refute, decision low + opponent high -> revise', () => {
  const r = classify({ id: 'E', surface: 'standard', severity: 'low',
    opponents: [{ refuted: true, severity: 'high' }, op(false), op(false)] });
  assert.equal(r.verdict, 'revise');  // would be 'cleared' on the self-rated low
  assert.equal(r.severity, 'high');   // effective severity is reported
});
test('opponent severity absent -> no escalation', () => {
  const r = classify({ id: 'E', surface: 'standard', severity: 'low',
    opponents: [op(true), op(false), op(false)] });
  assert.equal(r.verdict, 'cleared');
  assert.equal(r.severity, 'low');
});
test('opponent never lowers severity', () => {
  const r = classify({ id: 'E', surface: 'standard', severity: 'critical',
    opponents: [{ refuted: false, severity: 'low' }, op(false), op(false)] });
  assert.equal(r.severity, 'critical');
});
test('opponent with invalid severity throws', () => {
  assert.throws(() => classify({ id: 'E', surface: 'standard', severity: 'low',
    opponents: [{ refuted: false, severity: 'huge' }, op(false), op(false)] }), /opponent has unknown severity/);
});
