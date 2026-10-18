# 02 — Docker és futtatás

> Cél: a QA kolléga **egyetlen paranccsal** elindíthasson mindent, amire a
> teszteléshez szüksége van – az alkalmazást, az adatbázist, a levélfogadót és a
> tesztmenedzsment rendszert is.

---

## 1. Előfeltételek

- Docker Desktop (Windows / macOS) vagy Docker Engine + Compose v2.
- Legalább 6 GB szabad memória.
- A `.env` fájl létrehozása a mintából:

```bash
copy .env.example .env     # Windows
cp .env.example .env       # Linux / macOS
```

## 2. Indítás

```bash
docker compose up -d          # minden szolgáltatás (api, web, postgres, mailhog, kiwi, tracker-*)
docker compose ps             # állapot és healthcheck
```

Ha csak az infrastruktúrát (adatbázis, MailHog, Kiwi) akarod indítani:

```bash
docker compose up -d postgres mailhog kiwi-db kiwi-init kiwi
```

Ha csak a trackert (az It's a Plan `JGY` backlogot):

```bash
docker compose up -d tracker-postgres tracker-minio tracker-minio-init \
  tracker-migrate tracker-seed tracker-api tracker-worker tracker-bot tracker-web
```

## 3. Szolgáltatások

| Szolgáltatás | Konténer | Elérés | Belépés |
| --- | --- | --- | --- |
| Webes felület | `jegyzo-web` | http://localhost:5173 | demo felhasználók (lásd [demo adatkészlet](../03-adatok/01-demo-adatkeszlet.md)) |
| REST API | `jegyzo-api` | http://localhost:4000/api | Bearer token |
| API dokumentáció | `jegyzo-api` | http://localhost:4000/api/docs | – |
| Health | `jegyzo-api` | http://localhost:4000/health | – |
| PostgreSQL | `jegyzo-postgres` | localhost:5432 | `jegyzo` / `jegyzo_dev_pw` |
| MailHog | `jegyzo-mailhog` | http://localhost:8025 | – |
| Kiwi TCMS | `jegyzo-kiwi` | **https://localhost:8443** | `KIWI_ADMIN_USER` / `KIWI_ADMIN_PASSWORD` (alapból `admin` / `kiwiadmin123`) |
| It's a Plan felület | `jegyzo-tracker-web` | http://localhost:3001 | `admin@jegyzo.local` / `Jegyzo1234` |
| It's a Plan API / MCP | `jegyzo-tracker-api` | http://localhost:3000 (`/docs`, `/mcp`) | `x-api-key` (`ITSAPLAN_API_KEY`) |
| Tracker PostgreSQL | `jegyzo-tracker-postgres` | csak belső hálózat | `TRACKER_POSTGRES_*` |

> Az It's a Plan tracker a `JGY` backlog forrása (`tracker-*` szolgáltatások,
> seed: `tracker/seed/jgy-seed.sql`). A `TRACKER_VERSION` rögzített kiadás, mert
> a seed ehhez a séma-sorrendhez illeszkedik — lásd
> [tracker/README.md](../../tracker/README.md).

### 3.1 Kiwi TCMS

- A belépés: **https://localhost:8443/accounts/login/** — a gyökér (`/`) ide
  irányít, a `/login/` útvonal viszont 404. Az alapértelmezett admin fiók:
  `admin` / `kiwiadmin123` (a `.env.example`-ben `KIWI_ADMIN_USER` /
  `KIWI_ADMIN_PASSWORD`), a `https://localhost:8443/admin/` a Django admin.
- A Kiwi TCMS **HTTPS-t kényszerít**: a `http://localhost:8080` cím átirányít a
  biztonságos címre. Használd közvetlenül a **https://localhost:8443** címet.
- A tanúsítvány önaláírt, ezért a böngésző figyelmeztet. A tanúsítvány
  letölthető és megbízhatóként importálható innen: https://localhost:8443/static/ca.crt
- Az első indításkor a `kiwi-init` konténer automatikusan elvégzi az
  inicializálást (séma, admin felhasználó, domain, jogosultságok). Ha ez
  sikertelen, újrafuttatható:

```bash
docker compose run --rm kiwi-init
```

- **A `KIWI_ADMIN_PASSWORD` csak az első inicializáláskor számít.** A `kiwi-init`
  a `createsuperuser` paranccsal hozza létre a fiókot; ha az már létezik, nem
  nyúl hozzá (`That username is already taken` a naplóban), így a `.env`-ben
  átírt jelszó önmagában nem érvényesül. Meglévő fiók jelszava, aktiválása és
  adminná tétele az adatbázisban állítható:

```bash
docker compose exec kiwi python /Kiwi/manage.py shell -c "
from django.contrib.auth import get_user_model
U = get_user_model()
u = U.objects.get(username='admin')
u.set_password('kiwiadmin123'); u.is_active = True; u.is_superuser = True; u.is_staff = True; u.save()
print('ok')"
```

  Ugyanígy aktiválható egy korábban létrehozott, de inaktív fiók is
  (`u.is_active = True`): az inaktív felhasználót a Kiwi TCMS a bejelentkezésnél
  egyszerűen elutasítja, vagyis helyes jelszóval is sikertelennek tűnik.

## 4. Adatok visszaállítása (reset / reseed)

A sandbox lényeges képessége, hogy a tesztelő bármikor **tiszta állapotba**
tudja visszaállítani a rendszert.

```bash
# 1) csak az alkalmazás adatai (a leggyorsabb, NFR-12: ≤ 60 s)
docker compose exec api npm run db:reset

# 2) teljes újraindítás, az adatok megőrzésével
docker compose restart

# 3) minden adat törlése (adatbázis + feltöltések) és elölről
docker compose down -v
docker compose up -d
```

> A `down -v` a Kiwi TCMS és az It's a Plan tracker adatait is törli; utána a
> `kiwi-init` és a `tracker-seed` újra lefut (a seed visszaállítja a `JGY`
> projektet és a 99 work itemet).

## 5. Naplók és hibakeresés

```bash
docker compose logs -f api          # API napló
docker compose logs -f web          # felület napló
docker compose logs kiwi-init       # Kiwi inicializálás kimenetele
```

| Tünet | Ok / megoldás |
| --- | --- |
| `api` nem indul | Nézd meg a naplót: `docker compose logs api`. Ha a `./backend` könyvtár nem található, az alkalmazás kódja nincs a helyén. |
| `api` healthcheck „unhealthy” | Az API induláskor migrációt és seedet futtat; 90 s után érdemes a naplót nézni. |
| Port ütközés (`bind: address already in use`) | Állítsd át a portot a `.env`-ben (`WEB_PORT`, `API_PORT`, `POSTGRES_PORT`, `MAILHOG_UI_PORT`, `KIWI_PORT`, `KIWI_HTTPS_PORT`), és indítsd újra. |
| Kiwi TCMS „502 / nem tölt be” | A `kiwi-init` még fut, vagy hibával leállt: `docker compose logs kiwi-init`. |
| Nem jön e-mail | Minden levél a MailHog-ban van: http://localhost:8025 – ellenőrizd, hogy az API a `mailhog:1025` címet használja. |
| A felület nem éri el az API-t | CORS: az API-nak engedélyeznie kell a `CORS_ORIGIN` origint. Böngésző konzol ellenőrzése. |
| `jegyzo-tracker-seed` hibával áll le (`missing data for column ...`) | A `TRACKER_VERSION` és a seed szétcsúszott: a seed a forrás kiadás oszlopsorrendjét követi. Állítsd vissza a `TRACKER_VERSION`-t a seedhez illő kiadásra (`1.1.0`), vagy generáld újra a seedet (`python tools/itsaplan/export_tracker_seed.py`, lásd [tracker/README.md](../../tracker/README.md)). |
| A tracker felülete nem tölt be | A `tracker-migrate` és `tracker-seed` egyszer lefutó konténer: `docker compose logs tracker-migrate tracker-seed`. |
| Mindent elölről | `docker compose down -v && docker compose up -d` |

### 5.1 Kiwi TCMS és a 8080-as port

A Kiwi TCMS alapértelmezés szerint a **8080**-as portot használja
(`KIWI_PORT`). Ha ezt a portot a gépen más szolgáltatás foglalja, a konténer
nem indul el, és a hibaüzenet ez lesz:

```
failed to set up container networking: ... Bind for 127.0.0.1:8080 failed: port is already allocated
```

Megoldás: írd át a `KIWI_PORT` értékét a `.env` fájlban (pl. `8081`), és
indítsd újra:

```bash
docker compose up -d kiwi
```

A Kiwi TCMS elérési címe ilyenkor `https://localhost:<KIWI_HTTPS_PORT>` marad.

## 6. Ismert korlátok

- Az `api` és `web` szolgáltatás csak akkor indul, ha a `backend/` és `frontend/`
  könyvtár és a bennük lévő `Dockerfile` elkészült (lásd a
  [rendszerkép](01-rendszerkep.md) 4. pontját).
- A Kiwi TCMS **nem része** a Jegyzo sandboxnak: nincs előre feltöltött termék,
  tesztterv vagy teszteset – a tesztelő kollégák építik fel a saját struktúrájukat.
- A `mailhog/mailhog:v1.0.1` image már nem fejlesztett, de stabil és megfelel a
  célnak (minden levél helyben marad).
