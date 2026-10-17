# AGENTS.md — Jegyzo projekt biblia

> **Ez az első fájl, amit egy agentnek el kell olvasnia ebben a repóban.**
> Operatív belépési pont: mi a feladat, mi a kötelező szerződés, honnan jön a
> munka, hogyan kell dolgozni és mit tilos. A részletes termékszabályok a
> [dokumentumtérkép](#7-dokumentumtérkép) szerinti fájlokban vannak – ez a fájl
> nem ismétli meg őket, hanem elirányít hozzájuk.

---

## 1. Mi ez a repó, és mi a helyzet most

A **Jegyzo** egy fiktív magyar online jegyértékesítő platform (koncert- és egyéb
események), amely **QA sandboxként** készül: a tesztelést tanuló kollégák egy
valósághű, elosztott rendszeren gyakorolják a manuális, automatizált és agentic
tesztelést.

| Tény | Állapot |
| --- | --- |
| Termékspecifikáció, architektúra, docker szerződés | ✅ kész (`docs/`) |
| Fejlesztői backlog (Epic + User Story + AC) | ✅ kész az It's a Plan `JGY` projektben |
| **Alkalmazás kód (`backend/`, `frontend/`)** | ✅ megvalósítva a `JGY` User Story-k alapján |
| Docker Compose | ✅ kész — a `docker compose up -d` a teljes stacket indítja |

**Az állapot:** a `JGY` projekt User Story-i meg vannak valósítva a `backend/` és
`frontend/` könyvtárban, a repóban lévő specifikáció szerint. A további munka
(hibajavítás, bővítés) ugyanígy a story-kból indul. Nem kell és nem szabad
tőlem/embertől kérdezni az eligazítást: minden, ami a munkához kell, ebben a
repóban és a trackerben van.

## 2. Nem tárgyalható szerződés

Ezek nem javaslatok. Ha valamit itt nem tudsz teljesíteni, azt a story
kommentjében indokold, de ne csendben térj el tőlük.

| Terület | Előírás |
| --- | --- |
| Stack | Node.js 22 + TypeScript + **NestJS** (API), **React + Vite** (felület), **PostgreSQL 16** |
| Könyvtárak | `backend/` és `frontend/`, mindkettőben `Dockerfile` |
| API gyökér | minden üzleti végpont **`/api`** előtag alatt |
| Health | **`GET /health`** (a `/api` előtag nélkül) → `200`, `{"status":"ok"}` |
| API dokumentáció | **`GET /api/docs`** interaktív OpenAPI, az összes végponttal |
| CORS | engedélyezett origin: a `CORS_ORIGIN` környezeti változó (alapból `http://localhost:5173`) |
| Adatbázis | a `DATABASE_URL` alapján; induláskor migráció + **idempotens** seed, ha üres az adatbázis |
| Reset | `npm run db:reset` a futó API konténerben: séma újra + seed, **≤ 60 s** |
| E-mail | SMTP a `SMTP_HOST`:`SMTP_PORT` címre (MailHog), valódi küldés nincs |
| Hibaválasz | egységes alak: `{"error":{"code","message","messageEn","details"}}` |
| Nyelv (kód) | angol: osztályok, változók, fájlnevek, commit üzenetek |
| Nyelv (felület) | **magyar az alapértelmezett**, angolra váltható; minden szöveg nyelvi erőforrásból |
| API hibanyelv | `Accept-Language: hu\|en` fejléc szerint; a **hibakód mindig azonos** |
| Időzóna | `Europe/Budapest` |
| Pénz | HUF, **egész szám**, megjelenítés `12 500 Ft` formában |

A pontos, teljes szerződés (környezeti változók, Dockerfile-elvárások,
adatáramlás): [docs/02-architektura/01-rendszerkep.md](docs/02-architektura/01-rendszerkep.md).

## 3. Honnan jön a munka

A munka az **It's a Plan** trackerben van, `JGY` projekt (team: `madorjan`):

- **11 Epic** (`JGY-3`, `JGY-11`, `JGY-20`, `JGY-31`, `JGY-39`, `JGY-45`,
  `JGY-55`, `JGY-64`, `JGY-74`, `JGY-89`, `JGY-97`)
- **88 User Story** (`JGY-4` … `JGY-101`), mindegyik tartalmazza:
  leírás, **Acceptance Criteria (bullet lista)**, **Definition of Done**,
  pontszám, prioritás (`urgent/high/medium/low`), követelmény-hivatkozások
  (`FR`/`BR`/`NFR`) és **függőségi kapcsolatok** (`blocked_by`).

### Elérés

A tracker **ugyanannak a compose stacknek a része** (`tracker-*` szolgáltatások):
`docker compose up -d` elindítja az alkalmazással együtt. Külön compose fájl
nincs. A seed a `JGY` projektet tölti be a `tracker-postgres` kötetbe.

**A) MCP** (ha elérhető a sessionben): `.omp/mcp.json` → `itsaplan` szerver,
`http://localhost:3000/mcp`, az API kulcsot a `.env`-ből olvassa. Ha nem
látszik, indítsd újra az MCP-t (`/mcp reload`).

**B) REST** (ez mindig működik):

```bash
set -a && . ./.env && set +a            # ITSAPLAN_API_KEY betöltése

# story-k listázása a projektben
curl -s "http://localhost:3000/projects/JGY/issues?limit=200" \
  -H "x-api-key: $ITSAPLAN_API_KEY"

# egy story teljes tartalma (JGY-4 = a 4-es sorszámú issue)
curl -s "http://localhost:3000/projects/JGY/issues/4" \
  -H "x-api-key: $ITSAPLAN_API_KEY"
```

A teljes API leírás: http://localhost:3000/docs . Ha a tracker nem fut, a
work item-ek tartalma a `tools/itsaplan/backlog/*.json` fájlokban is megtalálható
(ugyanaz a tartalom, gépi formában).

## 4. Hogyan dolgozz

1. **Egy story = egy munkamenet.** A story Acceptance Criteria pontjai és a
   Definition of Done a „kész” definíció. Ne kezdj a következőbe, amíg az
   aktuális nem teljesül.
2. **A függőségek sorrendje kötelező.** Amelyik story `blocked_by` kapcsolattal
   hivatkozik egy másikra, azt előbb kell megvalósítani. Ajánlott sorrend:
   `E1 → E2 → E3 → E4 → E5 → E6 → E7 → E8 → E9 → E10`, az `E11` pedig
   folyamatosan, a felületekkel együtt.
3. **Tartsd futtatható állapotban a rendszert.** Minden story végén:
   `docker compose up -d` lefut, az API healthcheckje zöld, a seed betölt.
4. **Ne törj meg korábbi működést.** A QA kollégák a korábbi story-kra is
   teszteseteket írnak.
5. **A hibakódok kötelezőek.** A hibakatalógus kódjait (`SEAT_TAKEN`,
   `CAPACITY_EXCEEDED`, `PAYMENT_DECLINED`, …) és a hozzájuk tartozó HTTP
   státuszokat használd, ne saját szöveges hibákat.
6. **Bizonytalanság esetén dönts és dokumentálj.** Ha a specifikáció kétféleképp
   értelmezhető, válassz, és az indoklást írd a story kommentjébe. Ne
   kérdezz vissza embertől, és ne hagyd a döntést nyitva.
7. **A dokumentáció nem módosítható** (`docs/**`, `README.md`, `AGENTS.md`).
   Ha a specifikáció hibás, azt a story kommentjében jelezd.

### Kész definíció (minden storyra)

- minden Acceptance Criteria pont teljesül,
- a hivatkozott `FR`/`BR`/`NFR` követelmények betartottak,
- a végpont megjelenik az OpenAPI leírásban,
- a hibák a katalógus szerinti kóddal és üzenettel jönnek (magyarul és angolul),
- a felület magyarul és angolul is teljes (nincs hiányzó fordítás),
- `docker compose up -d` után a rendszer elindul és a seed lefut.

### Amit el kell tudnod mutatni (verifikáció)

- a konkrét futtatott parancs és annak kimenete (nem „működik” állítás),
- a seed adatkészlet egy konkrét értékén végigvitt folyamat
  (pl. a 8. esemény 10 kapacitásán a 4. jegy sikerül, az 5. `CAPACITY_EXCEEDED`),
- a hibaágak: legalább egy hibás bemenet a story AC-i közül.

## 5. Amit tilos

- **Scope-on kívüli funkció:** kuponok, kedvezménykódok, értékelések, wallet,
  loyalty, jegyviszonteladás, vásárló által kezdeményezett visszatérítés, valós
  fizetési integráció, számlázás, többpénznemes árazás, beléptető alkalmazás.
- Befejezetlen munka: `TODO`, csonkolt végpont, placeholder, „később
  implementáljuk”, hamis fallback.
- A specifikáció átírása, hogy az illeszkedjen a kódhoz.
- Titok commitolása: a `.env` **soha** nem kerülhet verziókezelésbe
  (az `ITSAPLAN_API_KEY`-t tartalmazza). Új környezeti változót a `.env.example`-be
  vegyél fel, kitöltetlenül.

## 6. Gyakori parancsok

```bash
# teljes stack indítása (az alkalmazás kódja után)
docker compose up -d
docker compose ps                      # healthcheck állapotok

# amíg nincs kész az alkalmazás kódja, csak az infrastruktúra
docker compose up -d postgres mailhog kiwi-db kiwi-init kiwi

# csak a tracker (a JGY backlog) indítása
docker compose up -d tracker-postgres tracker-minio tracker-minio-init \
  tracker-migrate tracker-seed tracker-api tracker-worker tracker-bot tracker-web

# adatok visszaállítása tiszta állapotba
docker compose exec api npm run db:reset

# naplók
docker compose logs -f api
docker compose logs kiwi-init

# minden adat törlése és elölről
docker compose down -v && docker compose up -d
```

Elérési címek: felület `http://localhost:5173` · API `http://localhost:4000/api`
· API docs `http://localhost:4000/api/docs` · health `http://localhost:4000/health`
· MailHog `http://localhost:8025` · Kiwi TCMS `https://localhost:8443` ·
tracker felület `http://localhost:3001` · tracker API/MCP `http://localhost:3000`.

## 7. Dokumentumtérkép

| Kérdés | Fájl |
| --- | --- |
| Mi a termék, kik a szereplők, mi van a hatókörön kívül? | [docs/01-specifikacio/01-latasmod-es-hatokor.md](docs/01-specifikacio/01-latasmod-es-hatokor.md) |
| Milyen entitások, mezők, állapotgépek, számítások vannak? | [docs/01-specifikacio/02-domain-szotar-es-adatmodell.md](docs/01-specifikacio/02-domain-szotar-es-adatmodell.md) |
| Mit kell tudni a rendszernek (`FR-xxx`)? | [docs/01-specifikacio/03-funkcionalis-kovetelmenyek.md](docs/01-specifikacio/03-funkcionalis-kovetelmenyek.md) |
| Milyen üzleti szabályok, hibakódok, teszt-kártyák vannak (`BR-xx`)? | [docs/01-specifikacio/04-uzleti-szabalyok-es-hibakatalogus.md](docs/01-specifikacio/04-uzleti-szabalyok-es-hibakatalogus.md) |
| Milyen minőségi elvárások vannak (`NFR-xx`)? | [docs/01-specifikacio/05-nemfunkcionalis-kovetelmenyek.md](docs/01-specifikacio/05-nemfunkcionalis-kovetelmenyek.md) |
| Hogyan épül fel a rendszer, mi a docker szerződés? | [docs/02-architektura/01-rendszerkep.md](docs/02-architektura/01-rendszerkep.md) |
| Hogyan kell futtatni, resetelni, hibát keresni? | [docs/02-architektura/02-docker-es-futtatas.md](docs/02-architektura/02-docker-es-futtatas.md) |
| Milyen adatokat kell a seednek létrehoznia? | [docs/03-adatok/01-demo-adatkeszlet.md](docs/03-adatok/01-demo-adatkeszlet.md) |
| Részletes implementációs munkamódszer | [docs/04-ai-agent/01-implementacios-instrukciok.md](docs/04-ai-agent/01-implementacios-instrukciok.md) |
| Melyik Epic/Story mire hivatkozik és mi a függőségi sorrend? | [docs/05-backlog/00-epic-es-story-vazlat.md](docs/05-backlog/00-epic-es-story-vazlat.md) |

## 8. Ismert csapdák

- **A `./backend` és `./frontend` könyvtár a helyén van**, a `docker compose up -d`
  a teljes stacket indítja (api, web, postgres, mailhog, kiwi). Ha az `api` nem
  indul, előbb a `docker compose logs api` kimenetét nézd.
- **A `.env` már létezik** a munkakörnyezetben, de csak az `ITSAPLAN_API_KEY`-t
  tartalmazza — a többi érték a compose beépített alapértékeiből jön. Ha új
  változót vezetsz be, a `.env.example`-be vedd fel.
- **A tracker kiadása rögzítve van.** A `TRACKER_VERSION` (alapból `1.1.0`) és a
  `tracker/seed/jgy-seed.sql` szorosan összetartozik: a seed a forrás kiadás
  oszlopsorrendjét követi, ezért nagyobb kiadásnál a betöltés
  `missing data for column ...` hibával elhasal. Ne emeld a `TRACKER_VERSION`-t a
  seed újragenerálása nélkül (lásd `tracker/README.md`).
- **A Kiwi TCMS a 8080-as portot használja**, ami a fejlesztői gépen foglalt
  lehet. Ilyenkor a konténer nem indul: állítsd át a `KIWI_PORT`-ot a `.env`-ben.
- **A tracker API-ja nem megbízható HTTP státuszokban**: előfordul, hogy egy
  sikeres létrehozásnál `500`-at, egy már létező kapcsolatnál `409`-et ad. Ne
  státuszkódra építs, hanem olvasd vissza az állapotot
  (lásd: `tools/itsaplan/import_backlog.py`).
- **A `tools/itsaplan/*` eszközök** a backlog karbantartására valók; az
  alkalmazás implementálásához nem kell őket futtatni.
