# Jegyzo – jegyértékesítő sandbox (QA / agentic testing)

A **Jegyzo** egy fiktív, magyar online jegyértékesítő platform (koncert- és egyéb
események), amely kifejezetten **QA sandboxként** készül: a célja, hogy a
tesztelést tanuló / tesztelő kollégák egy **valósághű, elosztott rendszeren**
gyakorolhassák a manuális tesztelést, az automatizálást és az **agentic
tesztelést**.

A projekt két részből áll:

1. **Dokumentáció (ez a repó jelenlegi állapota)** – teljes termékspecifikáció,
   architektúra- és docker-szerződés, demo adatkészlet, valamint a fejlesztői
   backlog (Epic-ek és User Story-k) az It's a Plan trackerben (`JGY` projekt).
2. **Alkalmazás** – a NestJS + React + PostgreSQL rendszer, amelyet később egy
   AI coding agent implementál **kizárólag a User Story-k alapján**. A sandbox
   egyik lényeges jellemzője, hogy az így keletkező szoftver **szándékosan nem
   hibamentes**: a QA feladata éppen ezek felderítése.

> Az alkalmazás kódja **még nem létezik**. Ez a repó a szerződés, amit az
> implementáló agentnek teljesítenie kell.

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
| Alkalmazás kód | ❌ nincs (a coding agent készíti a story-kból) |

## Gyors indítás (QA kollégáknak)

```bash
# 1) környezeti változók
copy .env.example .env        # Windows
cp .env.example .env          # Linux / macOS

# 2) minden szolgáltatás indítása
docker compose up -d

# 3) állapot
docker compose ps
```

### Szolgáltatások és elérési címek

| Szolgáltatás | Cím | Megjegyzés |
| --- | --- | --- |
| Jegyzo webes felület | http://localhost:5173 | a vásárlói + admin UI |
| Jegyzo REST API | http://localhost:4000/api | OpenAPI: http://localhost:4000/api/docs |
| API health | http://localhost:4000/health | konténer healthcheck |
| PostgreSQL | localhost:5432 | `jegyzo` / `jegyzo` adatbázis |
| MailHog (kimenő e-mailek) | http://localhost:8025 | minden e-mail ide fut be |
| Kiwi TCMS (tesztmenedzsment) | https://localhost:8443 | önaláírt tanúsítvány, `ca.crt`: https://localhost:8443/static/ca.crt |

A pontos indítási/törlési/újratöltési lépések: [docs/02-architektura/02-docker-es-futtatas.md](docs/02-architektura/02-docker-es-futtatas.md).

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
```

## Konvenciók

- **Nyelv:** minden dokumentáció és minden felhasználói szöveg **magyar**; a
  kód (osztályok, változók, fájlok, commit üzenetek) **angol**. A felület
  magyar alapértelmezett, angolra váltható.
- **Követelmény-azonosítók:** `FR-xxx` (funkcionális), `BR-xx` (üzleti szabály),
  `NFR-xx` (nemfunkcionális), `EC-xxx` (hibakód). A User Story-k ezekre
  hivatkoznak, így a specifikáció és a backlog összeköthető.
- **Munkakövetés:** It's a Plan, `JGY` projekt. A repó Markdown az elsődleges
  forrás a specifikációhoz; a tracker a work item-ekhez.
- **Agentek belépési pontja:** `AGENTS.md`. Az agentek nem kérdeznek
  eligazítást: a szerződés, a munkamódszer és a dokumentumtérkép ott van.

## Verziókezelés

- `.env` **soha** nem kerül a repóba (tartalmazza az It's a Plan API kulcsot).
- Titkot tartalmazó fájl csak `.env.example` formában, kitöltetlenül.
