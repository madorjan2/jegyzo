# 01 — Implementációs instrukciók (AI coding agent)

> **Célközönség:** az a kódoló agent, amely a Jegyzo alkalmazást a User
> Story-kból megvalósítja. Ez a dokumentum a kötelező kereteket rögzíti; a
> részletes követelmények a `docs/01-specifikacio/` alatt, a munkadarabok az
> It's a Plan `JGY` projektben találhatók.

---

## 1. A feladat

Építsd meg a **Jegyzo** jegyértékesítő platformot: NestJS REST API + React
webes felület + PostgreSQL, Docker Compose-ban futtatva. A részletes
követelmények a specifikációban, a megvalósítandó munka a `JGY` projekt
User Story-iban van.

**Amit implementálnod kell:** pontosan azt, ami a story-kban és a rájuk
hivatkozó követelményekben (`FR-xxx`, `BR-xx`, `NFR-xx`) szerepel.

**Amit ne tegyél:**
- Ne vezess be olyan funkciót, amire nincs story (kuponok, értékelések,
  wallet, vásárló által kezdeményezett visszatérítés, valós fizetésintegráció).
- Ne módosítsd a specifikációt, hogy az illeszkedjen a kódhoz – fordítva.
- Ne hagyj `TODO`, csonkolt végpontot vagy „később implementáljuk” kommentet a
  leadott munkában.

## 2. Források és elsőbbség

1. `docs/01-specifikacio/` – termékspecifikáció (elsődleges forrás).
2. `docs/02-architektura/` – futtatási és szolgáltatás-szerződés.
3. `docs/03-adatok/` – a seed adatok elvárt tartalma.
4. It's a Plan `JGY` projekt – Epic-ek és User Story-k, ezek adják a sorrendet.

Ellentmondás esetén a **specifikáció** az erősebb, és jelezni kell az
eltérést a story kommentjében.

## 3. Technológiai keretek

| Réteg | Előírás |
| --- | --- |
| API | Node.js 22, TypeScript, NestJS, REST |
| Felület | React, TypeScript, Vite |
| Adatbázis | PostgreSQL 16 |
| Konténerizálás | Docker Compose, a gyökérben lévő `docker-compose.yml` szerint |
| E-mail | SMTP → MailHog (nincs valódi küldés) |
| Nyelv a kódban | angol (osztályok, változók, fájlnevek, commit üzenetek) |
| Nyelv a felületen | magyar (alap) és angol, nyelvi erőforrásból |

Az adatbázis-séma, az ORM, a REST útvonalak, a mappastruktúra és a
könyvtárválasztás a te döntésed – de a szerződéses elemek
(`/api`, `/health`, `/api/docs`, CORS, seed, `npm run db:reset`) kötelezőek.

## 4. Munkamódszer

1. **Egy story = egy munkamenet.** A story Acceptance Criteria pontjai a „kész”
   definíció. Ne kezdj bele a következő story-ba, amíg az aktuális AC-i nem
   teljesülnek.
2. **Tartsd futtatható állapotban a rendszert.** Minden story végén a
   `docker compose up -d` működjön, az API healthcheckje zöld legyen.
3. **A story-k sorrendje és függőségei kötelezőek.** Amelyik storyra
   `blocked_by` hivatkozik, azt előbb kell teljesíteni.
4. **A hibaválaszok egységesek.** Minden hiba a 04. dokumentum 2.1 formátumát
   követi, a megadott hibakóddal.
5. **A seed determinisztikus.** A `docs/03-adatok/01-demo-adatkeszlet.md`
   értékeihez igazodj; a seed újrafuttatás után ugyanazt az állapotot adja.
6. **Ne rontsd el a meglévő működést.** Új funkció nem törheti a korábbi
   story-k viselkedését (a QA ezekre külön teszteseteket ír).

## 5. Kész definíció (Definition of Done)

Egy story akkor kész, ha:

- az összes Acceptance Criteria teljesül,
- a hozzá tartozó `FR`/`BR`/`NFR` követelmények betartottak,
- a végpont megjelenik az OpenAPI dokumentációban,
- a hibák a hibakatalógus szerinti kóddal és üzenettel jönnek,
- a felület magyarul és angolul is teljes (nincs hiányzó fordítás),
- a `docker compose up -d` után a rendszer elindul, a seed lefut.

## 6. Tesztelhetőség

A QA kollégák a következő felületeken fognak tesztelni – ezek maradjanak
elérhetők és dokumentáltak:

| Felület | Elérés |
| --- | --- |
| Webes felület | http://localhost:5173 |
| REST API | http://localhost:4000/api |
| Interaktív API dokumentáció | http://localhost:4000/api/docs |
| Health | http://localhost:4000/health |
| Adatbázis | localhost:5432 (`jegyzo` adatbázis) |
| E-mailek | http://localhost:8025 |

A seed adatkészletben rögzített felhasználókkal és foglalásokkal kell tudni
végigvinni a vásárlási folyamatot (lásd a demo adatkészlet 8. pontját).

## 7. Dokumentálás

- Új környezeti változó bevezetésekor frissítsd a `.env.example`-t **és** a
  `docs/02-architektura/01-rendszerkep.md` 2.2 pontját.
- Új végpont megjelenítése az OpenAPI-ban kötelező.
- Ha egy döntés eltér a specifikációtól, azt a story kommentjében indokold.
