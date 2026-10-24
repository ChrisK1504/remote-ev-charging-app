import { isOcppCall, isOcppCallResult, isOcppCallError } from './ocpp-message';

// Envelope checks deliberately do not claim that an action's payload is valid.
describe('OCPP message envelopes (attached sections 4.1.3–4.2.3)', () => {
  it('recognizes and narrows all three forms', () => {
    const call: unknown = [2, 'id', 'Heartbeat', {}];
    const result: unknown = [3, 'id', {}];
    const error: unknown = [4, 'id', 'GenericError', '', {}];
    expect(isOcppCall(call)).toBe(true);
    expect(isOcppCallResult(result)).toBe(true);
    expect(isOcppCallError(error)).toBe(true);
    expect(isOcppCall(result)).toBe(false);
    expect(isOcppCallResult(error)).toBe(false);
    expect(isOcppCallError(call)).toBe(false);
  });
  it('requires exactly four, three, or five elements', () => {
    for (const [guard, frame] of [
      [isOcppCall, [2, 'id', 'Heartbeat', {}]],
      [isOcppCallResult, [3, 'id', {}]],
      [isOcppCallError, [4, 'id', 'GenericError', '', {}]],
    ] as const) {
      expect(guard(frame.slice(0, -1))).toBe(false);
      expect(guard([...frame, 'extra'])).toBe(false);
    }
  });
  it('checks message ID type and the 36-character boundary for every form', () => {
    for (const id of [1, null, 'x'.repeat(37)]) {
      expect(isOcppCall([2, id, 'Heartbeat', {}])).toBe(false);
      expect(isOcppCallResult([3, id, {}])).toBe(false);
      expect(isOcppCallError([4, id, 'GenericError', '', {}])).toBe(false);
    }
    expect(isOcppCall([2, 'x'.repeat(36), 'Heartbeat', {}])).toBe(true);
  });
  it('permits null payloads in CALL and CALLRESULT, but requires object error details', () => {
    expect(isOcppCall([2, 'id', 'Heartbeat', null])).toBe(true);
    expect(isOcppCallResult([3, 'id', null])).toBe(true);
    expect(isOcppCallError([4, 'id', 'GenericError', '', null])).toBe(false);
    expect(isOcppCallError([4, 'id', 'GenericError', '', []])).toBe(false);
  });
  it('rejects invalid field types and unknown error codes', () => {
    expect(isOcppCall([2, 'id', 123, {}])).toBe(false);
    expect(isOcppCall([2, 'id', 'Heartbeat', []])).toBe(false);
    expect(isOcppCallResult([3, 'id', 'payload'])).toBe(false);
    expect(isOcppCallError([4, 'id', 'Unknown', '', {}])).toBe(false);
    expect(isOcppCallError([4, 'id', 'GenericError', 123, {}])).toBe(false);
    expect(
      isOcppCallError([4, 'id', 'OccurenceConstraintViolation', '', {}]),
    ).toBe(true);
  });
  it('rejects non-arrays and unknown type numbers', () => {
    for (const frame of [null, {}, 'frame', [5, 'id', {}]]) {
      expect(isOcppCall(frame)).toBe(false);
      expect(isOcppCallResult(frame)).toBe(false);
      expect(isOcppCallError(frame)).toBe(false);
    }
  });
});
