# Jegyzo – jegyértékesítő sandbox (QA / agentic testing)

> ## ⚠️ Figyelmeztetés: a projekt 100%-ban „vibe coded”
>
> Ebben a repóban **egyetlen sort sem írtam én** (a repó tulajdonosa). A teljes
> dokumentáció, a specifikáció, az It's a Plan backlog (`JGY`), a `backend/` és
> `frontend/` alkalmazás, a Docker- és tracker stack, valamint a seed adatok
> **AI coding agentek promptokból generált kimenetei** — kézi átírás, érdemi
> emberi review és hagyományos fejlesztési folyamat nélkül.
>
> Ezért a kód **nem termelési minőségű**, és nem tekintendő referenciának arra,
> hogyan kell szoftvert írni. A repó célja épp az, hogy egy hitelesen kaotikus,
> elosztott rendszeren lehessen manuális, automatizált és agentic tesztelést
> gyakorolni: a benne lévő hibák nagy része nem véletlen, hanem a sandbox
> tananyaga.

## Futtatás

**Előfeltétel:** Docker (Compose v2) és internet az image-letöltésekhez. Lokális
Node.js vagy Python **nem** szükséges: mindkét Dockerfile többfázisú build, a
stack konténerekből épül.

```bash
git clone <repo-url> && cd jegyzo

cp .env.example .env          # Windows: copy .env.example .env
docker compose up -d          # MINDEN: alkalmazás + Kiwi TCMS + It's a Plan tracker
docker compose ps             # healthcheck állapotok
```

Egyetlen compose stack van: a fenti parancs az alkalmazást, a Kiwi TCMS-t és az
It's a Plan trackert (a `JGY` backlog forrását) is elindítja. Az elérési címek, a
belépési adatok, az adatok visszaállítása és a hibakeresés a lentebbi
szakaszokban, illetve a
[docs/02-arkitektura/02-docker-es-futtatas.md](docs/02-arkitektura/02-docker-es-futtatas.md)
fájlban vannak.

Csak a tracker (a `JGY` backlog) indítása:

```bash
docker compose up -d tracker-postgres tracker-minio tracker-minio-init \
  tracker-migrate tracker-seed tracker-api tracker-worker tracker-bot tracker-web
```

---

A **Jegyzo** egy fiktív, magyar online jegyértékesítő platform (koncert- és egyéb
események), amely kifejezetten **QA sandboxként** készül: a célja, hogy a
tesztelést tanuló / tesztelő kollégák egy **valósághű, elosztott rendszeren**
gyakorolhassák a manuális tesztelést, az automatizálást és az **agentic
tesztelést**.

A projekt két részből áll:

1. **Dokumentáció** – teljes termékspecifikáció, architektúra- és
   docker-szerződés, demo adatkészlet, valamint a fejlesztői backlog (Epic-ek és
   User Story-k) az It's a Plan trackerben (`JGY` projekt).
2. **Alkalmazás** – a NestJS + React + PostgreSQL rendszer (`backend/`,
   `frontend/`), amelyet egy AI coding agent implementált **kizárólag a User
   Story-k alapján**. A sandbox egyik lényeges jellemzője, hogy az így keletkező
   szoftver **szándékosan nem hibamentes**: a QA feladata éppen ezek felderítése.

> Az alkalmazás a `backend/` és `frontend/` könyvtárban van; a teljes stack a
> `docker compose up -d` paranccsal indul (lásd fentebb).

---

## Mi ez most?

| Szempont | Állapot |
| --- | --- |
| Termékspecifikáció | ✅ kész (`docs/01-specifikacio/`) |
| Architektúra + Docker szerződés | ✅ kész (`docs/02-architektura/`) |
| Demo adatkészlet specifikáció | ✅ kész (`docs/03-adatok/`) |
| **Agent projekt biblia** | ✅ kész (`AGENTS.md`) — ez az agentek belépési pontja |
| Részletes agent instrukciók | ✅ kész (`docs/04-ai-agent/`) |
| Epic / User Story backlog | ✅ vázlat a repóban, forrás: It's a Plan `JGY` |
| Alkalmazás kód | ✅ megvalósítva (`backend/`, `frontend/`) — a story-k alapján |

## Szolgáltatások és elérési címek

| Szolgáltatás | Cím | Megjegyzés |
| --- | --- | --- |
| Jegyzo webes felület | http://localhost:5173 | a vásárlói + admin UI |
| Jegyzo REST API | http://localhost:4000/api | OpenAPI: http://localhost:4000/api/docs |
| API health | http://localhost:4000/health | konténer healthcheck |
| PostgreSQL | localhost:5432 | `jegyzo` / `jegyzo` adatbázis |
| MailHog (kimenő e-mailek) | http://localhost:8025 | minden e-mail ide fut be |
| Kiwi TCMS (tesztmenedzsment) | https://localhost:8443 | önaláírt tanúsítvány, `ca.crt`: https://localhost:8443/static/ca.crt |

A pontos indítási/törlési/újratöltési lépések: [docs/02-architektura/02-docker-es-futtatas.md](docs/02-architektura/02-docker-es-futtatas.md).

## It's a Plan tracker (a `JGY` backlog)

A fejlesztői backlog egy **It's a Plan** példányban él. A tracker ugyanannak a
compose stacknek a része (`tracker-*` szolgáltatások), a `JGY` projekt teljes
adatkészlete pedig a repóban van (`tracker/seed/`), így egy friss klón
ugyanazokat a work item-eket kapja:

```bash
docker compose up -d          # a tracker is elindul (lásd fentebb)
```

| Szolgáltatás | Cím |
| --- | --- |
| Tracker webes felület | http://localhost:3001 |
| Tracker REST API | http://localhost:3000 (OpenAPI: http://localhost:3000/docs) |
| MCP végpont | http://localhost:3000/mcp (`x-api-key`) |

- Sandbox belépés: `admin@jegyzo.local` / `Jegyzo1234`; az API kulcs a
  `tracker/README.md`-ben (a repó gyökér `.env`-jébe `ITSAPLAN_API_KEY` néven
  előtöltve).
- A seed a `JGY` projektet tölti be (11 Epic + 88 User Story, AC/DoD
  checklistákkal), de **más projektet nem**.
- A tracker kiadás rögzítve van (`TRACKER_VERSION=1.1.0`), mert a seed ehhez a
  séma-sorrendhez illeszkedik; verziófrissítésnél a seedet újra kell generálni.
  Részletek, portok és a seed frissítése: [tracker/README.md](tracker/README.md).
- A tracker portjai a gyökér `.env`-ben: `TRACKER_API_PORT`, `TRACKER_WEB_PORT`.

## Dokumentumtérkép

```
AGENTS.md                            # agent belépési pont (projekt biblia)
CLAUDE.md / .github/copilot-instructions.md   # ugyanarra mutató jelzőfájlok
docs/
├── 01-specifikacio/                 # mit kell tudnia a rendszernek (termékszint)
│   ├── 01-latasmod-es-hatokor.md
│   ├── 02-domain-szotar-es-adatmodell.md
│   ├── 03-funkcionalis-kovetelmenyek.md
│   ├── 04-uzleti-szabalyok-es-hibakatalogus.md
│   └── 05-nemfunkcionalis-kovetelmenyek.md
├── 02-architektura/                 # hogyan fut, mi a szerződés
│   ├── 01-rendszerkep.md
│   └── 02-docker-es-futtatas.md
├── 03-adatok/
│   └── 01-demo-adatkeszlet.md       # determinisztikus seed adatok + elvárt értékek
├── 04-ai-agent/
│   └── 01-implementacios-instrukciok.md
└── 05-backlog/
    └── 00-epic-es-story-vazlat.md   # Epic/Story vázlat, It's a Plan JGY azonosítókkal

tracker/                             # It's a Plan tracker stack + JGY seed adatok
tools/itsaplan/                      # backlog import/export eszközök
```

## Konvenciók

- **Nyelv:** minden dokumentáció és minden felhasználói szöveg **magyar**; a
  kód (osztályok, változók, fájlok, commit üzenetek) **angol**. A felület
  magyar alapértelmezett, angolra váltható.
- **Követelmény-azonosítók:** `FR-xxx` (funkcionális), `BR-xx` (üzleti szabály),
  `NFR-xx` (nemfunkcionális), valamint a hibakatalógus szöveges kódjai
  (pl. `SEAT_TAKEN`, `PAYMENT_DECLINED`). A User Story-k ezekre
  hivatkoznak, így a specifikáció és a backlog összeköthető.
- **Munkakövetés:** It's a Plan, `JGY` projekt. A repó Markdown az elsődleges
  forrás a specifikációhoz; a tracker a work item-ekhez.
- **Agentek belépési pontja:** `AGENTS.md`. Az agentek nem kérdeznek
  eligazítást: a szerződés, a munkamódszer és a dokumentumtérkép ott van.

## Verziókezelés

- `.env` **soha** nem kerül a repóba (tartalmazza az It's a Plan API kulcsot).
- Titkot tartalmazó fájl csak `.env.example` formában, kitöltetlenül.
