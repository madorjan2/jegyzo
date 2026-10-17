// Central error code catalog (docs/01-specifikacio/04-uzleti-szabalyok-es-hibakatalogus.md)
// Each entry: HTTP status + Hungarian + English message. Language-independent.

export const GENERAL_ERRORS = {
  VALIDATION_ERROR: { http: 400, hu: 'Érvénytelen adatok.', en: 'Invalid data.' },
  UNAUTHENTICATED: { http: 401, hu: 'A művelethez bejelentkezés szükséges.', en: 'Login is required for this operation.' },
  FORBIDDEN: { http: 403, hu: 'Ehhez a művelethez nincs jogosultságod.', en: 'You do not have permission for this operation.' },
  NOT_FOUND: { http: 404, hu: 'A keresett erőforrás nem található.', en: 'The requested resource was not found.' },
  RATE_LIMITED: { http: 429, hu: 'Túl sok kérés. Próbáld újra később.', en: 'Too many requests. Try again later.' },
  INTERNAL_ERROR: { http: 500, hu: 'Váratlan hiba történt.', en: 'An unexpected error occurred.' },
} as const;

export const AUTH_ERRORS = {
  AUTH_EMAIL_TAKEN: { http: 409, hu: 'Ez az e-mail cím már regisztrálva van.', en: 'This e-mail address is already registered.' },
  AUTH_INVALID_CREDENTIALS: { http: 401, hu: 'Hibás e-mail cím vagy jelszó.', en: 'Wrong e-mail address or password.' },
  AUTH_TOKEN_EXPIRED: { http: 401, hu: 'A munkamenet lejárt, jelentkezz be újra.', en: 'Session expired, please sign in again.' },
  AUTH_REFRESH_INVALID: { http: 401, hu: 'A megújító token érvénytelen vagy visszavont.', en: 'The refresh token is invalid or revoked.' },
  AUTH_USER_INACTIVE: { http: 403, hu: 'A fiók inaktív.', en: 'The account is inactive.' },
  AUTH_WEAK_PASSWORD: { http: 400, hu: 'A jelszó nem felel meg a követelményeknek.', en: 'The password does not meet the requirements.' },
  AUTH_OLD_PASSWORD_MISMATCH: { http: 400, hu: 'A jelenlegi jelszó nem megfelelő.', en: 'The current password is incorrect.' },
} as const;

export const EVENT_ERRORS = {
  EVENT_NOT_FOUND: { http: 404, hu: 'Az esemény nem található.', en: 'The event was not found.' },
  EVENT_NOT_ON_SALE: { http: 409, hu: 'Erre az eseményre jelenleg nem lehet jegyet vásárolni.', en: 'Tickets cannot currently be bought for this event.' },
  EVENT_CANCELLED: { http: 409, hu: 'Az eseményt lemondták.', en: 'The event has been cancelled.' },
  EVENT_INVALID_STATE: { http: 409, hu: 'Az esemény állapota nem teszi lehetővé ezt a műveletet.', en: 'The event state does not allow this operation.' },
  EVENT_PUBLISH_VALIDATION_FAILED: { http: 409, hu: 'Az esemény nem publikálható: hiányos vagy érvénytelen adatok.', en: 'The event cannot be published: incomplete or invalid data.' },
  VENUE_INACTIVE: { http: 409, hu: 'A helyszín inaktív.', en: 'The venue is inactive.' },
  SECTION_ALREADY_HAS_TICKET_TYPE: { http: 409, hu: 'Ehhez a szektorhoz már tartozik jegytípus.', en: 'This section already has a ticket type.' },
  TICKET_TYPE_INACTIVE: { http: 409, hu: 'Ez a jegytípus nem vásárolható.', en: 'This ticket type cannot be bought.' },
  SALES_WINDOW_CLOSED: { http: 409, hu: 'A jegyértékesítés erre az időpontra nem elérhető.', en: 'Ticket sales are not available at this time.' },
} as const;

export const BOOKING_ERRORS = {
  BOOKING_NOT_FOUND: { http: 404, hu: 'A foglalás nem található.', en: 'The booking was not found.' },
  BOOKING_EMPTY: { http: 400, hu: 'A foglalás nem tartalmaz jegyet.', en: 'The booking contains no tickets.' },
  BOOKING_TOO_MANY_TICKETS: { http: 400, hu: 'Egy foglalás legfeljebb 20 jegyet tartalmazhat.', en: 'A booking can contain at most 20 tickets.' },
  BOOKING_EXPIRED: { http: 409, hu: 'A foglalás lejárt, a helyek felszabadultak.', en: 'The booking has expired and the seats were released.' },
  BOOKING_WRONG_STATE: { http: 409, hu: 'A foglalás állapota nem teszi lehetővé ezt a műveletet.', en: 'The booking state does not allow this operation.' },
  CAPACITY_EXCEEDED: { http: 409, hu: 'A kiválasztott jegytípusból nincs ennyi szabad hely.', en: 'Not enough free capacity for the selected ticket type.' },
  TICKET_LIMIT_EXCEEDED: { http: 409, hu: 'Ebből a jegytípusból ennyit nem vásárolhatsz.', en: 'You cannot buy this many of that ticket type.' },
  SEAT_TAKEN: { http: 409, hu: 'A kiválasztott hely időközben elkelt.', en: 'The selected seat has already been taken.' },
  SEAT_NOT_FOUND: { http: 404, hu: 'A kiválasztott hely nem található.', en: 'The selected seat was not found.' },
  SEAT_NOT_AVAILABLE: { http: 409, hu: 'A kiválasztott hely nem elérhető.', en: 'The selected seat is not available.' },
  SEAT_NOT_IN_EVENT: { http: 400, hu: 'A hely nem ehhez az eseményhez tartozik.', en: 'The seat does not belong to this event.' },
} as const;

export const PAYMENT_ERRORS = {
  CARD_INVALID_NUMBER: { http: 400, hu: 'A kártyaszám érvénytelen.', en: 'The card number is invalid.' },
  CARD_EXPIRED: { http: 400, hu: 'A kártya lejárt.', en: 'The card has expired.' },
  CARD_CVC_INVALID: { http: 400, hu: 'A CVC kód érvénytelen.', en: 'The CVC code is invalid.' },
  PAYMENT_DECLINED: { http: 402, hu: 'A kártyát a bank elutasította.', en: 'The card was declined by the bank.' },
  PAYMENT_INSUFFICIENT_FUNDS: { http: 402, hu: 'Nincs elegendő fedezet a kártyán.', en: 'Insufficient funds on the card.' },
  PAYMENT_TIMEOUT: { http: 504, hu: 'A fizetési szolgáltatás nem válaszolt. Próbáld újra.', en: 'The payment service did not respond. Please try again.' },
  PAYMENT_PROCESSING_ERROR: { http: 502, hu: 'Feldolgozási hiba a fizetés során.', en: 'A processing error occurred during payment.' },
  PAYMENT_ALREADY_COMPLETED: { http: 409, hu: 'Ez a foglalás már ki van fizetve.', en: 'This booking has already been paid.' },
} as const;

export const TICKET_ERRORS = {
  TICKET_NOT_FOUND: { http: 404, hu: 'A jegy nem található.', en: 'The ticket was not found.' },
  TICKET_REVOKED: { http: 409, hu: 'A jegy visszavonásra került.', en: 'The ticket has been revoked.' },
  REFUND_ALREADY_ISSUED: { http: 409, hu: 'Ehhez a foglaláshoz már készült visszatérítés.', en: 'A refund has already been issued for this booking.' },
  REFUND_NOT_ALLOWED: { http: 409, hu: 'Ehhez a foglaláshoz nem készíthető visszatérítés.', en: 'A refund cannot be issued for this booking.' },
} as const;

export const ALL_ERRORS = {
  ...GENERAL_ERRORS,
  ...AUTH_ERRORS,
  ...EVENT_ERRORS,
  ...BOOKING_ERRORS,
  ...PAYMENT_ERRORS,
  ...TICKET_ERRORS,
} as const;

export type ErrorCode = keyof typeof ALL_ERRORS;
