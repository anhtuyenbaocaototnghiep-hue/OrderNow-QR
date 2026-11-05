// F-072 (ADR-030 D-127): PIN xác nhận thao tác tiền gửi qua header `X-Actor-Pin` — gắn vào user của request bằng Symbol
// (không lọt vào JSON trả về, nhật ký thao tác hay log). Dịch vụ đọc bằng `user[ACTOR_PIN]`.
export const ACTOR_PIN = Symbol('actorPin');

export function withActorPin(req, user) {
  if (user) user[ACTOR_PIN] = req.get('x-actor-pin') || null;
  return user;
}
