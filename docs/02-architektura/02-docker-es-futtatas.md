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
docker compose up -d          # minden szolgáltatás (api, web, postgres, mailhog, kiwi)
docker compose ps             # állapot és healthcheck
```

Ha csak az infrastruktúrát (adatbázis, MailHog, Kiwi) akarod indítani:

```bash
docker compose up -d postgres mailhog kiwi-db kiwi-init kiwi
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

### 3.1 Kiwi TCMS

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

> A `down -v` a Kiwi TCMS adatait is törli; utána a `kiwi-init` újra lefut.

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
