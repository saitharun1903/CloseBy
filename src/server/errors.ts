export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "room_ended"
  | "room_expired"
  | "room_full"
  | "invalid_invite"
  | "pin_required"
  | "invalid_pin"
  | "too_many_attempts"
  | "rate_limited"
  | "conflict"
  | "no_media"
  | "seat_released"
  | "media_unavailable"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  room_ended: 410,
  room_expired: 410,
  room_full: 409,
  invalid_invite: 403,
  pin_required: 401,
  invalid_pin: 403,
  too_many_attempts: 429,
  rate_limited: 429,
  conflict: 409,
  no_media: 409,
  seat_released: 401,
  media_unavailable: 503,
  internal: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}
