# 01 — Demo adatkészlet

> A seed adatok **determinisztikusak** (`NFR-01`): minden betöltés után pontosan
> ugyanazok az azonosítók, összegek és állapotok jönnek létre. A táblázatokban
> szereplő értékekre a QA konkrét állításokat fogalmazhat meg.
>
> Az azonosítók sorszámozása kötelező érvényű a seedben: az `Event` az 1-től
> induló sorrendet követi, a székek pedig szektoronként, soronként, növekvő
> számmal jönnek létre.

---

## 1. Felhasználók

Minden felhasználó jelszava a táblázatban szereplő érték (a `BR-17`-nek megfelelő).

| # | E-mail | Jelszó | Név | Szerepkör | Nyelv | Aktív |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `admin@jegyzo.local` | `Admin1234` | Rendszer Admin | `ADMIN` | hu | ✅ |
| 2 | `szervezo@jegyzo.local` | `Szervezo1234` | Kovács Anna | `SZERVEZO` | hu | ✅ |
| 3 | `szervezo2@jegyzo.local` | `Szervezo1234` | Nagy Béla | `SZERVEZO` | hu | ✅ |
| 4 | `vasarlo@jegyzo.local` | `Vasarlo1234` | Szabó Péter | `VASARLO` | hu | ✅ |
| 5 | `vevő2@jegyzo.local` | `Vasarlo1234` | Tóth Kata | `VASARLO` | hu | ✅ |
| 6 | `buyer@jegyzo.local` | `Vasarlo1234` | John Smith | `VASARLO` | en | ✅ |
| 7 | `inaktiv@jegyzo.local` | `Vasarlo1234` | Régi Felhasználó | `VASARLO` | hu | ❌ |

> Megjegyzés: az 5. felhasználó e-mail címe szándékosan tartalmaz ékezetet
> (`vevő2@jegyzo.local`), hogy az ékezetkezelés tesztelhető legyen.

## 2. Helyszínek

| # | Név | Város | Szektorok | Kapacitás |
| --- | --- | --- | --- | --- |
| 1 | Papp László Budapest Sportaréna | Budapest | `Erkély A` (ülőhelyes), `Erkély B` (ülőhelyes), `Küzdőtér` (állóhelyes) | 600 ülő + 400 álló |
| 2 | Müpa – Bartók Béla Nemzeti Hangversenyterem | Budapest | `Földszint` (ülőhelyes), `Karzat` (ülőhelyes) | 300 ülő |
| 3 | A38 Hajó | Budapest | `Fedélzet` (állóhelyes) | 500 álló |
| 4 | Szegedi Szabadtéri Színpad | Szeged | `Nézőtér` (ülőhelyes) | 200 ülő |
| 5 | Megszűnt Rendezvényhelyszín | Debrecen | – | inaktív helyszín (`BR-22` teszteléséhez) |

### 2.1 Szektor-szerkezet (részletek)

| Helyszín | Szektor | Típus | Sorok | Székek/sor |
| --- | --- | --- | --- | --- |
| 1 | Erkély A | ülőhelyes | `A`–`F` (6 sor) | 50 |
| 1 | Erkély B | ülőhelyes | `A`–`F` (6 sor) | 50 |
| 1 | Küzdőtér | állóhelyes | – | kapacitás: 400 |
| 2 | Földszint | ülőhelyes | `A`–`J` (10 sor) | 20 |
| 2 | Karzat | ülőhelyes | `A`–`E` (5 sor) | 20 |
| 3 | Fedélzet | állóhelyes | – | kapacitás: 500 |
| 4 | Nézőtér | ülőhelyes | `A`–`H` (8 sor) | 25 |

A székek címkéje a sor és a szám összefűzése: `A12`, `F50`.

## 3. Események

| # | Név | Kategória | Helyszín | Kezdés (relatív) | Állapot | Szervező |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Budapest Rock Fesztivál 2026 | `KONCERT` | 1 | +30 nap | `PUBLIKALT` | 2 |
| 2 | Beethoven: IX. szimfónia | `KONCERT` | 2 | +14 nap | `PUBLIKALT` | 2 |
| 3 | Elektronikus Éjszaka | `KONCERT` | 3 | +7 nap | `PUBLIKALT` | 3 |
| 4 | Néptánc Gála | `SZINHAZ` | 4 | +45 nap | `PUBLIKALT` | 2 |
| 5 | Döntetlen – író-olvasó találkozó | `EGYEB` | 2 | +3 nap | `PISZKOZAT` | 3 |
| 6 | Téli Fesztivál (előző évi) | `FESZTIVAL` | 1 | −60 nap | `LEZAJLT` | 2 |
| 7 | Lemondott Koncert | `KONCERT` | 1 | +20 nap | `LEMONDVA` | 2 |
| 8 | Telt Ház Próba | `KONCERT` | 3 | +10 nap | `PUBLIKALT` | 3 |
| 9 | Jegy nélküli Szünet | `KONCERT` | 1 | +25 nap | `ERTEKESITES_SZUNETELT` | 2 |
| 10 | Publikálatlan Vázlat | `EGYEB` | 3 | +5 nap | `PISZKOZAT` | 3 |

> A kezdésidők a **seed pillanatához** képest relatívak, így az adatkészlet
> mindig „élő” marad (van múltbeli, közeli és távoli esemény).
> Az `endsAt` = kezdés + az esemény időtartama (alapból 180 perc).

## 4. Jegytípusok

| # | Esemény | Szektor | Név | Ár (Ft) | Típus | Kapacitás | `maxPerUser` | Aktív |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | Erkély A | Erkély A jegy | 12 500 | ülőhelyes | 300 | 8 | ✅ |
| 2 | 1 | Erkély B | Erkély B jegy | 9 900 | ülőhelyes | 300 | 8 | ✅ |
| 3 | 1 | Küzdőtér | Állóhely | 7 500 | állóhelyes | 400 | 8 | ✅ |
| 4 | 2 | Földszint | Földszint | 15 000 | ülőhelyes | 200 | 6 | ✅ |
| 5 | 2 | Karzat | Karzat | 8 500 | ülőhelyes | 100 | 6 | ✅ |
| 6 | 3 | Fedélzet | Belépő | 6 000 | állóhelyes | 500 | 4 | ✅ |
| 7 | 4 | Nézőtér | Nézőtér | 4 500 | ülőhelyes | 200 | 8 | ✅ |
| 8 | 8 | Fedélzet | Belépő | 6 500 | állóhelyes | 10 | 2 | ✅ |
| 9 | 9 | Erkély A | Erkély A jegy | 11 000 | ülőhelyes | 300 | 8 | ✅ |
| 10 | 6 | Erkély A | Erkély A jegy (lezárt) | 10 000 | ülőhelyes | 300 | 8 | ❌ |

> A 8. jegytípus szándékosan **kis kapacitású (10)**, hogy a kapacitás és a
> vásárlói limit határértékei kényelmesen tesztelhetők legyenek.

## 5. Foglalások és fizetések

| # | Kód | Felhasználó | Esemény | Állapot | Tartalom | Összeg |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `JGY-<év>-000001` | 4 | 1 | `FIZETVE` | Erkély A: `A1`, `A2` | 2×12 500 + 500 = **25 500 Ft** |
| 2 | `JGY-<év>-000002` | 4 | 1 | `FIZETVE` | Küzdőtér: 3 db | 3×7 500 + 750 = **23 250 Ft** |
| 3 | `JGY-<év>-000003` | 5 | 1 | `FIZETVE` | Erkély B: `C10` | 9 900 + 250 = **10 150 Ft** |
| 4 | `JGY-<év>-000004` | 6 | 3 | `FIZETVE` | Fedélzet: 2 db | 2×6 000 + 500 = **12 500 Ft** |
| 5 | `JGY-<év>-000005` | 5 | 2 | `ZAROLT` | Földszint: `A1` | 15 000 + 250 = **15 250 Ft** (zár 10 perc) |
| 6 | `JGY-<év>-000006` | 4 | 8 | `LEJART` | Fedélzet: 2 db | 2×6 500 + 500 = **13 500 Ft** |
| 7 | `JGY-<év>-000007` | 5 | 8 | `FIZETVE` | Fedélzet: 2 db | 13 500 Ft |
| 8 | `JGY-<év>-000008` | 4 | 7 | `VISSZATERITVE` | Erkély A: `A10` | 11 000 + 250 = **11 250 Ft** (visszatérítve) |
| 9 | `JGY-<év>-000009` | 4 | 6 | `FIZETVE` | Erkély A: `B5` | 10 000 + 250 = **10 250 Ft** (lezárt esemény) |
| 10 | `JGY-<év>-000010` | 6 | 1 | `LEMONDVA` | Küzdőtér: 1 db | 7 750 Ft (a vásárló lemondta fizetés előtt) |

Ebből következő, ellenőrizhető állapotok:

- **7. esemény (`LEMONDVA`)**: 1 db `VISSZATERITVE` foglalás, 1 db sikeres
  visszatérítés, 1 db visszavont jegy, a katalógusban nem jelenik meg.
- **8. esemény**: 10 db kapacitás; 2 db `FIZETVE` foglalás (4 jegy), 1 db
  `LEJART` (2 jegy) → **6 jegy foglalt, 4 db szabad**.
- **1. esemény**: Erkély A-ból csak `A1`, `A2` eladott (`A1` zárolt? nem),
  a többi szabad; a Küzdőtérből 3 db eladott, 1 db lemondott → 3 db eladott,
  397 szabad.
- **6. esemény (`LEZAJLT`)**: nem jelenik meg a katalógusban, adatai nem
  szerkeszthetők (`BR-11`).

## 6. Pénzügyi napló (elvárt kezdőállapot)

| Típus | Foglalás | Összeg |
| --- | --- | --- |
| `BEVETEL` | 1 | 25 500 |
| `BEVETEL` | 2 | 23 250 |
| `BEVETEL` | 3 | 10 150 |
| `BEVETEL` | 4 | 12 500 |
| `BEVETEL` | 7 | 13 500 |
| `BEVETEL` | 9 | 10 250 |
| `VISSZATERITES` | 8 | 11 250 |

**Eseményenkénti bevétel példa:** 1. esemény = 25 500 + 23 250 + 10 150 =
**58 900 Ft**; 7. esemény = 11 250 − 11 250 = **0 Ft**.

## 7. Kártyaadatok a tesztekhez

A mock PSP viselkedését a [04 — Üzleti szabályok és hibakatalógus](../01-specifikacio/04-uzleti-szabalyok-es-hibakatalogus.md)
3. pontja írja le. Teszteléshez használt kártyák:

| Kártyaszám | Lejárat | CVC | Várt eredmény |
| --- | --- | --- | --- |
| `4242 4242 4242 4242` | `12/2030` | `123` | sikeres fizetés |
| `4000 0000 0000 0002` | `12/2030` | `123` | elutasítva (`PAYMENT_DECLINED`) |
| `4000 0000 0000 9995` | `12/2030` | `123` | nincs fedezet (`PAYMENT_INSUFFICIENT_FUNDS`) |
| `4000 0000 0000 0069` | `12/2030` | `123` | lejárt kártya (`CARD_EXPIRED`) |
| `4000 0000 0000 0101` | `12/2030` | `123` | CVC hiba (`CARD_CVC_INVALID`) |
| `4000 0000 0000 0119` | `12/2030` | `123` | feldolgozási hiba (`PAYMENT_PROCESSING_ERROR`) |
| `4111 1111 1111 1111` | `12/2030` | `123` | időtúllépés (`PAYMENT_TIMEOUT`) |
| `1234 5678 9012 3456` | `12/2030` | `123` | érvénytelen kártyaszám (Luhn-hiba) |

## 8. Tesztelési kiindulópontok

| Kiindulás | Mit érdemes rajta vizsgálni |
| --- | --- |
| 3. esemény (7 nap múlva, 500 állóhely, 2 eladott jegy) | értékesítési ablak, kapacitás, `maxPerUser = 4` |
| 8. esemény (10 kapacitás, 4 szabad) | határérték: 4 db sikerül, 5. db `CAPACITY_EXCEEDED` |
| 5. foglalás (`ZAROLT`, 10 perc) | zár lejárata, felszabadulás, fizetés lejárat után |
| 7. esemény (`LEMONDVA`) | visszatérítés, jegyvisszavonás, QR-érvénytelenség |
| 9. esemény (`ERTEKESITES_SZUNETELT`) | vásárlási kísérlet tiltása, hibaüzenet |
| 10. esemény (`PISZKOZAT`) | nem jelenik meg a katalógusban, szerkeszthető |
| 7. felhasználó (inaktív) | bejelentkezés tiltása, tokenek érvénytelensége |
| 5. helyszín (inaktív) | nem hozható létre rá esemény |

> A seed **nem** hoz létre olyan állapotot, amelynél egy szék egyszerre két
> foglalásban szerepelne – az ilyen állapot csak hibás implementáció
> következménye lehet.
