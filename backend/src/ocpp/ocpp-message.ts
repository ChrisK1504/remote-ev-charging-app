import {
  OCPP_ERROR_CODES,
  OcppCallMessage,
  OcppCallResult,
  OcppCallError,
  OcppMessageType,
} from './ocpp.types';

export function isOcppMessageId(value: unknown): value is string {
  // Section 4.1.4 specifies a maximum, not a minimum length.
  return typeof value === 'string' && [...value].length <= 36;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPayload(value: unknown): boolean {
  return value === null || isObject(value);
}

export function isOcppCall(message: unknown): message is OcppCallMessage {
  return (
    Array.isArray(message) &&
    message.length === 4 &&
    message[0] === OcppMessageType.Call &&
    isOcppMessageId(message[1]) &&
    typeof message[2] === 'string' &&
    isPayload(message[3])
  );
}

export function isOcppCallResult(message: unknown): message is OcppCallResult {
  return (
    Array.isArray(message) &&
    message.length === 3 &&
    message[0] === OcppMessageType.CallResult &&
    isOcppMessageId(message[1]) &&
    isPayload(message[2])
  );
}

export function isOcppCallError(message: unknown): message is OcppCallError {
  return (
    Array.isArray(message) &&
    message.length === 5 &&
    message[0] === OcppMessageType.CallError &&
    isOcppMessageId(message[1]) &&
    typeof message[2] === 'string' &&
    OCPP_ERROR_CODES.some((code) => code === message[2]) &&
    typeof message[3] === 'string' &&
    isObject(message[4])
  );
}
