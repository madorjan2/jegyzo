# 04 — Üzleti szabályok és hibakatalógus

> Az üzleti szabályok (`BR-xx`) a viselkedést, a hibakódok (pl. `SEAT_TAKEN`,
> `PAYMENT_DECLINED`) a megfigyelhető hibaválaszt írják le. Mindkettő
> **tesztelhető állítás**.

---

## 1. Üzleti szabályok

### 1.1 Foglalás, helyek és kapacitás

| ID | Szabály |
| --- | --- |
| BR-01 | Egy szék egy eseményre egyszerre legfeljebb egy nem lejárt, nem lemondott foglaláshoz tartozhat. |
| BR-02 | A foglalás zárolása a létrehozástól számított **10 percig** érvényes. Lejáratkor a foglalás `LEJART` állapotba kerül, minden helye felszabadul, és a helyek újra elérhetővé válnak. |
| BR-03 | Állóhelyes jegytípusnál az **eladott + zárolt** darabszám nem haladhatja meg a jegytípus kapacitását. A kapacitás pontosan elérhető, de nem léphető túl. |
| BR-04 | Egy felhasználó egy eseményre legfeljebb a jegytípus `maxPerUser` értékéig vásárolhat (alapértelmezés **8**). A limitbe a még zárolt, fizetésre váró foglalások is beleszámítanak; a lejárt és lemondott foglalások nem. |
| BR-29 | Egy foglalás legalább **1** és legfeljebb **20** jegyet tartalmazhat. |
| BR-28 | Ülőhelyes jegy ára a szék szektorához tartozó jegytípus ára; ülőhelynél egy tétel mindig pontosan egy székhez tartozik. |

### 1.2 Értékesítés és állapotok

| ID | Szabály |
| --- | --- |
| BR-05 | Értékesítés kizárólag az esemény értékesítési ablaka és a jegytípus ablaka **közös metszetében** lehetséges. |
| BR-06 | Lemondott eseményre nem hozható létre új foglalás. |
| BR-11 | Múltbeli kezdésű esemény nem publikálható; `LEZAJLT` és `LEMONDVA` állapotú esemény adatai nem módosíthatók. |
| BR-19 | Publikálás csak akkor lehetséges, ha **minden** feltétel teljesül: (a) van legalább egy aktív jegytípus, (b) a helyszín aktív, (c) a kezdés a jövőben van, (d) az értékesítési ablak érvényes (`BR-23`), (e) a leírás hossza megfelelő. |
| BR-22 | Inaktív helyszínre nem hozható létre új esemény. A meglévő események változatlanok maradnak. |
| BR-23 | Az értékesítési ablakra: `salesStartAt < salesEndAt ≤ startsAt`. |
| BR-24 | Egy eseményen egy szektornak legfeljebb egy jegytípusa lehet. |
| BR-25 | Inaktív jegytípus nem vásárolható, de a már kiállított jegyek érvényesek maradnak. |
| BR-26 | A helyszín későbbi módosítása (új sor, új szék) nem érinti a korábban publikált események helyeit. |
| BR-27 | Egy publikált esemény automatikusan `LEZAJLT` állapotba kerül, ha az `endsAt` (`startsAt + durationMinutes`) elmúlt. |

### 1.3 Pénzügy

| ID | Szabály |
| --- | --- |
| BR-07 | Szolgáltatási díj **250 Ft jegyenként**. `végösszeg = jegyárak összege + szolgáltatási díj`. |
| BR-08 | A fizetési kérés **idempotens**: azonos idempotencia kulccsal nem jön létre újabb tranzakció, hanem az első kérés eredménye adódik vissza. |
| BR-09 | Sikeres fizetés után a jegyek **azonnal** kiállítódnak, a helyek `ELADOTT` állapotba kerülnek, és e-mail megy a vásárlónak. |
| BR-10 | Visszatérítés kizárólag esemény lemondása miatt, automatikusan, **teljes összeggel** történik. Egy foglalásra legfeljebb egy sikeres visszatérítés létezhet. |
| BR-15 | Minden pénzösszeg **HUF**, egész szám. Megjelenítés ezer-elválasztóval: `12 500 Ft`. |

### 1.4 Kártya és mock PSP

| ID | Szabály |
| --- | --- |
| BR-12 | Kártyaszám: 13–19 számjegy és **Luhn-érvényes**; lejárat: jövőbeli hónap; CVC: 3 számjegy (AMEX esetén 4). Szóközök megengedettek a bevitelben. |
| BR-13 | A mock PSP kimenetele **determinisztikus**, a kártyaszám alapján (lásd 3. pont). |

### 1.5 Felhasználó, biztonság, megjelenítés

| ID | Szabály |
| --- | --- |
| BR-16 | Egy e-mail cím csak egyszer regisztrálható, **kis-nagybetűtől függetlenül**. |
| BR-17 | Jelszó: legalább 8 karakter, tartalmaz kisbetűt, nagybetűt és számot. |
| BR-18 | Esemény lemondásakor minden jegy `VISSZAVONT` állapotba kerül, a QR-kódja érvénytelenné válik. |
| BR-20 | Foglalás és jegy kizárólag a tulajdonosa (vagy admin) számára jeleníthető meg és módosítható. |
| BR-21 | Inaktív felhasználó nem tud bejelentkezni, tokent megújítani és foglalást létrehozni. A már kiadott tokenjei érvénytelenek. |
| BR-14 | A felület alapértelmezett nyelve **magyar**; angolra váltható. Az API hibaüzenetei az `Accept-Language` fejléc szerint érkeznek, a hibakód mindig azonos. |
| BR-30 | A jegykód egyedi és meg nem jósolható, legalább 12 karakter. |

## 2. Hibakatalógus

### 2.1 Hibaválasz formátuma

Minden hiba egységes alakot követ:

```json
{
  "error": {
    "code": "SEAT_TAKEN",
    "message": "A kiválasztott hely időközben elkelt.",
    "messageEn": "The selected seat has already been taken.",
    "details": { "seatId": 4821 }
  }
}
```

- `code` – gép által feldolgozható, **nyelvfüggetlen** azonosító.
- `message` / `messageEn` – magyar, illetve angol üzenet (az `Accept-Language`
  csak a felület által megjelenített nyelvet jelöli ki).
- `details` – opcionális, szerkezetfüggő kiegészítés (pl. `field`, `seatId`, `maxPerUser`).

### 2.2 Általános hibák

| Kód | HTTP | Magyar üzenet |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | „Érvénytelen adatok.” |
| `UNAUTHENTICATED` | 401 | „A művelethez bejelentkezés szükséges.” |
| `FORBIDDEN` | 403 | „Ehhez a művelethez nincs jogosultságod.” |
| `NOT_FOUND` | 404 | „A keresett erőforrás nem található.” |
| `RATE_LIMITED` | 429 | „Túl sok kérés. Próbáld újra később.” |
| `INTERNAL_ERROR` | 500 | „Váratlan hiba történt.” |

### 2.3 Fiók és hitelesítés

| Kód | HTTP | Magyar üzenet |
| --- | --- | --- |
| `AUTH_EMAIL_TAKEN` | 409 | „Ez az e-mail cím már regisztrálva van.” |
| `AUTH_INVALID_CREDENTIALS` | 401 | „Hibás e-mail cím vagy jelszó.” |
| `AUTH_TOKEN_EXPIRED` | 401 | „A munkamenet lejárt, jelentkezz be újra.” |
| `AUTH_REFRESH_INVALID` | 401 | „A megújító token érvénytelen vagy visszavont.” |
| `AUTH_USER_INACTIVE` | 403 | „A fiók inaktív.” |
| `AUTH_WEAK_PASSWORD` | 400 | „A jelszó nem felel meg a követelményeknek.” |
| `AUTH_OLD_PASSWORD_MISMATCH` | 400 | „A jelenlegi jelszó nem megfelelő.” |

### 2.4 Esemény, helyszín, jegytípus

| Kód | HTTP | Magyar üzenet |
| --- | --- | --- |
| `EVENT_NOT_FOUND` | 404 | „Az esemény nem található.” |
| `EVENT_NOT_ON_SALE` | 409 | „Erre az eseményre jelenleg nem lehet jegyet vásárolni.” |
| `EVENT_CANCELLED` | 409 | „Az eseményt lemondták.” |
| `EVENT_INVALID_STATE` | 409 | „Az esemény állapota nem teszi lehetővé ezt a műveletet.” |
| `EVENT_PUBLISH_VALIDATION_FAILED` | 409 | „Az esemény nem publikálható: hiányos vagy érvénytelen adatok.” |
| `VENUE_INACTIVE` | 409 | „A helyszín inaktív.” |
| `SECTION_ALREADY_HAS_TICKET_TYPE` | 409 | „Ehhez a szektorhoz már tartozik jegytípus.” |
| `TICKET_TYPE_INACTIVE` | 409 | „Ez a jegytípus nem vásárolható.” |
| `SALES_WINDOW_CLOSED` | 409 | „A jegyértékesítés erre az időpontra nem elérhető.” |

### 2.5 Foglalás

| Kód | HTTP | Magyar üzenet |
| --- | --- | --- |
| `BOOKING_NOT_FOUND` | 404 | „A foglalás nem található.” |
| `BOOKING_EMPTY` | 400 | „A foglalás nem tartalmaz jegyet.” |
| `BOOKING_TOO_MANY_TICKETS` | 400 | „Egy foglalás legfeljebb 20 jegyet tartalmazhat.” |
| `BOOKING_EXPIRED` | 409 | „A foglalás lejárt, a helyek felszabadultak.” |
| `BOOKING_WRONG_STATE` | 409 | „A foglalás állapota nem teszi lehetővé ezt a műveletet.” |
| `CAPACITY_EXCEEDED` | 409 | „A kiválasztott jegytípusból nincs ennyi szabad hely.” |
| `TICKET_LIMIT_EXCEEDED` | 409 | „Ebből a jegytípusból ennyit nem vásárolhatsz.” |
| `SEAT_TAKEN` | 409 | „A kiválasztott hely időközben elkelt.” |
| `SEAT_NOT_FOUND` | 404 | „A kiválasztott hely nem található.” |
| `SEAT_NOT_AVAILABLE` | 409 | „A kiválasztott hely nem elérhető.” |
| `SEAT_NOT_IN_EVENT` | 400 | „A hely nem ehhez az eseményhez tartozik.” |

### 2.6 Fizetés

| Kód | HTTP | Magyar üzenet |
| --- | --- | --- |
| `CARD_INVALID_NUMBER` | 400 | „A kártyaszám érvénytelen.” |
| `CARD_EXPIRED` | 400 | „A kártya lejárt.” |
| `CARD_CVC_INVALID` | 400 | „A CVC kód érvénytelen.” |
| `PAYMENT_DECLINED` | 402 | „A kártyát a bank elutasította.” |
| `PAYMENT_INSUFFICIENT_FUNDS` | 402 | „Nincs elegendő fedezet a kártyán.” |
| `PAYMENT_TIMEOUT` | 504 | „A fizetési szolgáltatás nem válaszolt. Próbáld újra.” |
| `PAYMENT_PROCESSING_ERROR` | 502 | „Feldolgozási hiba a fizetés során.” |
| `PAYMENT_ALREADY_COMPLETED` | 409 | „Ez a foglalás már ki van fizetve.” |

### 2.7 Jegy és visszatérítés

| Kód | HTTP | Magyar üzenet |
| --- | --- | --- |
| `TICKET_NOT_FOUND` | 404 | „A jegy nem található.” |
| `TICKET_REVOKED` | 409 | „A jegy visszavonásra került.” |
| `REFUND_ALREADY_ISSUED` | 409 | „Ehhez a foglaláshoz már készült visszatérítés.” |
| `REFUND_NOT_ALLOWED` | 409 | „Ehhez a foglaláshoz nem készíthető visszatérítés.” |

## 3. Mock fizetési szolgáltató

### 3.1 Kimenetel táblázat

A kártyaszám (szóközök nélkül) határozza meg a kimenetelt:

| Kártyaszám | Eredmény (`status`) | Hibakód |
| --- | --- | --- |
| `4242424242424242` | `SIKERES` | – |
| `4000000000000002` | `ELUTASITOTT` | `PAYMENT_DECLINED` |
| `4000000000009995` | `ELUTASITOTT` | `PAYMENT_INSUFFICIENT_FUNDS` |
| `4000000000000069` | `ELUTASITOTT` | `CARD_EXPIRED` |
| `4000000000000101` | `ELUTASITOTT` | `CARD_CVC_INVALID` |
| `4000000000000119` | `FELDOLGOZASI_HIBA` | `PAYMENT_PROCESSING_ERROR` |
| `4111111111111111` | `IDOTULLEPES` | `PAYMENT_TIMEOUT` |
| bármely más Luhn-érvényes kártyaszám | `SIKERES` | – |

### 3.2 Viselkedés nem sikeres kimenetelnél

| Eredmény | Foglalás állapota | Helyek | Újrapróbálás |
| --- | --- | --- | --- |
| `ELUTASITOTT` | visszaáll `ZAROLT`-ra | zárolva maradnak | lehetséges a zár lejártáig |
| `FELDOLGOZASI_HIBA` | visszaáll `ZAROLT`-ra | zárolva maradnak | lehetséges a zár lejártáig |
| `IDOTULLEPES` | FIZETESRE_VAR marad | zárolva maradnak | lehetséges a zár lejártáig; a lejárat után `LEJART` |

### 3.3 PSP hivatkozás

Minden fizetési kísérlet kap egy `pspReference` azonosítót
(`MOCK-<6 hexadecimális karakter>`) és egy `attemptNumber` sorszámot. A
tranzakciós napló **append-only**: módosítani nem, csak bővíteni lehet.

## 4. Hibák és üzenetek tesztelési szempontjai

- A hibakód és a HTTP státusz **nyelvfüggetlen**, a szöveg nyelvfüggő → ugyanaz
  a hiba `Accept-Language: hu` és `en` esetén azonos kóddal, eltérő szöveggel.
- Minden hibaválasz a 2.1 szerinti szerkezetet követi, egyetlen kivétel nélkül.
- Érvénytelen kérés (pl. hiányzó kötelező mező) mindig `VALIDATION_ERROR`, nem
  `500`.
- Váratlan szerverhiba esetén a válasz nem tartalmazhat stack trace-t és belső
  útvonalat.
