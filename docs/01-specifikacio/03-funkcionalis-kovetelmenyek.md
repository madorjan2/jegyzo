# 03 — Funkcionális követelmények

> Minden követelmény azonosítóval (`FR-xxx`) rendelkezik. A User Story-k ezekre
> hivatkoznak. A részletes üzleti szabályokat (`BR-xx`) és a hibakódokat
> (pl. `SEAT_TAKEN`)
> a [04 — Üzleti szabályok és hibakatalógus](04-uzleti-szabalyok-es-hibakatalogus.md)
> tartalmazza.

---

## 1. Fiók és hitelesítés (FR-1xx)

| ID | Követelmény | Kulcsszabályok |
| --- | --- | --- |
| FR-101 | **Regisztráció.** E-mail, jelszó és teljes név megadásával új fiók hozható létre. A szerepkör mindig `VASARLO`. | `BR-16`, `BR-17` |
| FR-102 | **Bejelentkezés.** Helyes e-mail + jelszó esetén a rendszer hozzáférési (access) és megújító (refresh) tokent ad. | `AUTH_INVALID_CREDENTIALS`, `BR-21` |
| FR-103 | **Token megújítás.** A refresh tokennel új access token kérhető. | `AUTH_REFRESH_INVALID` |
| FR-104 | **Kijelentkezés.** A refresh token visszavonásra kerül, a további megújítás sikertelen. | |
| FR-105 | **Profil.** A bejelentkezett felhasználó megtekintheti és módosíthatja a nevét, telefonszámát és nyelvét. Az e-mail és a szerepkör nem módosítható. | |
| FR-106 | **Jelszócsere.** A régi jelszó megadása kötelező; az új jelszóra a `BR-17` vonatkozik. | `AUTH_WEAK_PASSWORD` |
| FR-107 | **Saját foglalások.** A felhasználó látja a saját foglalásait állapot szerint, és onnan megnyithatja a jegyeket. | `BR-20` |
| FR-108 | **Jogosultságkezelés.** Szerepkörhöz nem tartozó művelet `403` hibát ad, magyar/angol üzenettel. | `FORBIDDEN` |
| FR-109 | **Inaktív fiók.** Admin által deaktivált felhasználó nem tud bejelentkezni; a korábbi tokenjei érvénytelenek. | `BR-21`, `AUTH_USER_INACTIVE` |

## 2. Eseménykatalógus és keresés (FR-2xx)

| ID | Követelmény | Kulcsszabályok |
| --- | --- | --- |
| FR-201 | **Nyilvános lista.** A katalógus kizárólag `PUBLIKALT` állapotú, jövőbeli eseményeket listáz, bejelentkezés nélkül is. | `BR-27` |
| FR-202 | **Szöveges keresés.** Keresés eseménynévre, előadóra és helyszínnévre; **kis-nagybetűtől és ékezettől független** egyezés, részleges egyezés is találat. | |
| FR-203 | **Szűrés kategóriára, városra, helyszínre.** Több érték egyszerre is megadható (logikai VAGY azonos szűrőn belül). | |
| FR-204 | **Szűrés dátumtartományra.** `tól` / `ig` megadása; a határok inkluzívak. | |
| FR-205 | **Szűrés ártartományra.** Az esemény legkisebb aktív jegyára alapján. | |
| FR-206 | **Szűrés szabad helyre.** „Csak ahol van szabad hely” kapcsoló: ülőhelynél szabad szék, állóhelynél maradék kapacitás alapján. | `BR-03` |
| FR-207 | **Rendezés.** Kezdés szerint növekvő/csökkenő, legkisebb ár szerint, népszerűség (eladott jegyek száma) szerint. | |
| FR-208 | **Lapozás.** Alapértelmezés 12 elem/oldal, állítható 12/24/48. Érvénytelen oldalra üres lista, nem hiba. | |
| FR-209 | **Esemény részletei.** Név, kategória, helyszín, cím, kezdés, kapunyitás, leírás, plakát, jegytípusok áraikkal, szabad helyek száma. | |
| FR-210 | **Nem elérhető esemény.** Lemondott esemény a listában nem jelenik meg, de közvetlen linkkel megnyitva **jelöléssel** („Az eseményt lemondták”) megjelenik, vásárlási lehetőség nélkül. | `BR-06`, `EVENT_CANCELLED` |

## 3. Helyszín és ülőhelytérkép (FR-3xx)

| ID | Követelmény | Kulcsszabályok |
| --- | --- | --- |
| FR-301 | **Helyszín kezelése.** Admin helyszínt hoz létre, szerkeszt és aktív/inaktív állapotba állít. | `BR-22` |
| FR-302 | **Szektor / sor / szék definiálása.** Ülőhelyes szektornál megadható a sorok száma és a soronkénti székek száma (vagy soronként eltérő darabszám), amiből a rendszer legenerálja a székeket. | |
| FR-303 | **Állóhely-kapacitás.** Állóhelyes szektorhoz fix kapacitás adható meg. | |
| FR-304 | **Ülőhelytérkép.** A vásárlói felületen az eseményhez tartozó ülőhelyes szektorok térképszerűen (szektoronként, soronként, székenként) megjelennek. | |
| FR-305 | **Szék állapotok.** A térkép jelöli a szabad, zárolt és eladott székeket; a zárolt és eladott szék nem választható. | `BR-01`, `SEAT_NOT_AVAILABLE` |
| FR-306 | **Székválasztás.** A vásárló több széket is kijelölhet, a kijelölés törölhető; a véglegesítés foglalást hoz létre. | `BR-29` |
| FR-307 | **Állapotfrissítés.** A térkép a foglalás/fizetés után (és oldal újratöltéskor) a friss állapotot mutatja. | |

## 4. Jegytípusok és árazás (FR-4xx)

| ID | Követelmény | Kulcsszabályok |
| --- | --- | --- |
| FR-401 | **Jegytípus létrehozása.** Eseményhez szektoronként egy jegytípus hozható létre. | `BR-24`, `SECTION_ALREADY_HAS_TICKET_TYPE` |
| FR-402 | **Ár és limit.** Ár (HUF, egész) és vásárlói limit (`maxPerUser`) megadása. | `BR-15`, `BR-04` |
| FR-403 | **Értékesítési ablak.** Jegytípus szintű értékesítési kezdet és vég adható meg. | `BR-05`, `BR-23` |
| FR-404 | **Aktiválás.** A jegytípus aktív/inaktív állapotba állítható; inaktív típus nem vásárolható. | `BR-25`, `TICKET_TYPE_INACTIVE` |
| FR-405 | **Ár megjelenítése.** A katalógusban és a részletek oldalon a legkisebb vásárolható ár („ettől: X Ft”) jelenik meg. | |

## 5. Foglalás (FR-5xx)

| ID | Követelmény | Kulcsszabályok |
| --- | --- | --- |
| FR-501 | **Foglalás ülőhelyre.** Kiválasztott székekhez foglalás jön létre, a székek `ZAROLT` állapotba kerülnek. | `BR-01`, `BR-02` |
| FR-502 | **Foglalás állóhelyre.** Darabszám megadásával foglalás jön létre, a darabszám a kapacitásból zárolásra kerül. | `BR-03` |
| FR-503 | **Zárolás.** A foglalás létrehozásakor 10 perces zár indul, amelyet a felület visszaszámlál. | `BR-02` |
| FR-504 | **Lejárat.** A zár lejártával a foglalás `LEJART`, a helyek felszabadulnak, és a felület erről tájékoztat. | `BR-02`, `BOOKING_EXPIRED` |
| FR-505 | **Összegzés.** A rendszer kiszámítja a részösszeget, a szolgáltatási díjat és a végösszeget. | `BR-07` |
| FR-506 | **Vásárlói limit.** A limit a meglévő (nem lejárt, nem lemondott) foglalásokkal együtt értendő. | `BR-04`, `TICKET_LIMIT_EXCEEDED` |
| FR-507 | **Kapacitás.** Kapacitást meghaladó foglalás nem hozható létre. | `BR-03`, `CAPACITY_EXCEEDED` |
| FR-508 | **Foglalás lemondása.** A vásárló fizetés előtt lemondhatja a foglalását; a helyek felszabadulnak. | |
| FR-509 | **Foglalás állapota.** A felület a foglalás aktuális állapotát és hátralévő záróidejét mutatja. | |
| FR-510 | **Egyidejű foglalás.** Ha két vásárló ugyanazt a széket választja, pontosan az egyik foglalás jöhet létre; a másik `SEAT_TAKEN` hibát kap. | `BR-01`, `SEAT_TAKEN` |

## 6. Fizetés (FR-6xx)

| ID | Követelmény | Kulcsszabályok |
| --- | --- | --- |
| FR-601 | **Fizetés indítása.** A foglaláshoz kártyaadatok megadásával fizetés indítható; a foglalás `FIZETESRE_VAR` állapotba kerül. | |
| FR-602 | **Kártyaadatok validálása.** Kártyaszám (Luhn), lejárat és CVC ellenőrzése a fizetés megkezdése előtt. | `BR-12`, `CARD_INVALID_NUMBER`, `CARD_EXPIRED`, `CARD_CVC_INVALID` |
| FR-603 | **Mock PSP.** A kimenetel a kártyaszám alapján determinisztikus. Minden kimenetelnél jön válasz egyedi PSP hivatkozással. | `BR-13` |
| FR-604 | **Sikeres fizetés.** A foglalás `FIZETVE`, a helyek `ELADOTT`, jegyek kiállítva, napló bejegyzések létrejönnek. | `BR-09` |
| FR-605 | **Sikertelen fizetés.** Elutasítás vagy időtúllépés esetén a foglalás újrapróbálható marad a zár lejártáig; a hiba oka megjelenik. | `PAYMENT_DECLINED`, `PAYMENT_INSUFFICIENT_FUNDS`, `PAYMENT_TIMEOUT`, `PAYMENT_PROCESSING_ERROR` |
| FR-606 | **Idempotencia.** Ismételt kérés ugyanazzal az idempotencia kulccsal nem hoz létre új tranzakciót, hanem az első eredményét adja vissza. | `BR-08` |
| FR-607 | **Tranzakciós napló.** Minden fizetési kísérlet naplózódik sorszámmal, kártya utolsó 4 számjegyével és eredményével. | |
| FR-608 | **Hibamegjelenítés.** A felhasználó a fizetési hibát a saját nyelvén, érthető üzenetben látja; a foglalás nem veszik el. | `BR-14` |

## 7. Jegykibocsátás és értesítések (FR-7xx)

| ID | Követelmény | Kulcsszabályok |
| --- | --- | --- |
| FR-701 | **Jegykibocsátás.** Sikeres fizetés után minden megvásárolt jegyre külön jegy készül. | `BR-09` |
| FR-702 | **Egyedi kód.** Minden jegy egyedi, meg nem jósolható, legalább 12 karakteres kódot kap. | `BR-30` |
| FR-703 | **PDF jegy.** A jegy PDF formátumban letölthető; tartalmazza az esemény nevét, idejét, helyszínét, a helyet (szektor/sor/szék vagy állóhely), az árat és a jegykódot. | |
| FR-704 | **QR-kód.** A PDF-en és a felületen QR-kód jelenik meg, amely a jegykódot tartalmazza. | |
| FR-705 | **Letöltés.** A jegyet csak a foglalás tulajdonosa (vagy admin) töltheti le. | `BR-20`, `FORBIDDEN` |
| FR-706 | **Nyilvános ellenőrzés.** A jegykód alapján nyilvános végpont válaszol arra, hogy a jegy érvényes-e, és melyik eseményre szól. | `TICKET_REVOKED` |
| FR-707 | **E-mail.** Sikeres vásárlásnál a vásárló e-mailt kap a jegyekkel (vagy letöltési hivatkozással), MailHog-ra kézbesítve. | |
| FR-708 | **Újraküldés.** A vásárló kérheti a jegy e-mail újraküldését. | |
| FR-709 | **Jegyek listája.** A foglalás részleteinél a jegyek kóddal, állapottal és letöltési lehetőséggel látszanak. | |

## 8. Admin backoffice (FR-8xx)

| ID | Követelmény | Kulcsszabályok |
| --- | --- | --- |
| FR-801 | **Esemény létrehozása.** Admin/szervező új eseményt hoz létre `PISZKOZAT` állapotban. | |
| FR-802 | **Esemény szerkesztése.** A `PISZKOZAT`, `PUBLIKALT` és `ERTEKESITES_SZUNETELT` állapotú esemény adatai szerkeszthetők; `LEZAJLT` és `LEMONDVA` nem. | `BR-11`, `BR-27`, `EVENT_INVALID_STATE` |
| FR-803 | **Publikálás.** Az esemény publikálható, ha minden publikálási feltétel teljesül. | `BR-19` |
| FR-804 | **Értékesítés szüneteltetése / folytatása.** Az értékesítés szüneteltethető, majd folytatható. | |
| FR-805 | **Törlés.** Csak `PISZKOZAT` állapotú esemény törölhető. | `EVENT_INVALID_STATE` |
| FR-806 | **Eseménylista.** Szűrés állapotra, helyszínre, szervezőre, dátumra; szervező csak a saját eseményeit látja. | `BR-20` |
| FR-807 | **Felhasználók listája.** Admin listázhat, kereshet e-mail vagy név szerint. | |
| FR-808 | **Szerepkör módosítása.** Admin módosíthatja a felhasználó szerepkörét. Önmagát nem minősítheti le, ha ő az egyetlen admin. | |
| FR-809 | **Aktiválás / deaktiválás.** Admin felhasználót deaktiválhat és újra aktiválhat. | `BR-21` |
| FR-810 | **Foglalások listája.** Szűrés eseményre, állapotra, dátomtartományra; szervező csak a saját eseményeihez tartozó foglalásokat látja. | |
| FR-811 | **Foglalás részletei.** Tételek, összegek, fizetési kísérletek, jegyek, visszatérítés állapota. | |
| FR-812 | **Statisztika.** Eseményenként eladott jegyszám, bevétel, kihasználtság százalék. | |
| FR-813 | **Szervezői korlát.** Szervező más szervező eseményét nem szerkesztheti, nem publikálhatja és nem törölheti. | `FORBIDDEN` |
| FR-814 | **Visszatérítések listája.** Admin látja a visszatérítéseket állapot, esemény és dátum szerint. | |

## 9. Lemondás és visszatérítés (FR-9xx)

| ID | Követelmény | Kulcsszabályok |
| --- | --- | --- |
| FR-901 | **Esemény lemondása.** Admin a `PUBLIKALT` vagy `ERTEKESITES_SZUNETELT` eseményt lemondhatja. | `EVENT_INVALID_STATE` |
| FR-902 | **Automatikus visszatérítés.** Minden `FIZETVE` foglalásra teljes összegű visszatérítés készül. | `BR-10` |
| FR-903 | **Függő foglalások.** A `ZAROLT`/`FIZETESRE_VAR` foglalások lezárásra kerülnek, a helyek felszabadulnak. | |
| FR-904 | **Jegyek visszavonása.** Minden jegy `VISSZAVONT` állapotba kerül, a QR-ellenőrzés érvénytelen eredményt ad. | `BR-18` |
| FR-905 | **Értesítés.** Minden érintett vásárló e-mailt kap a lemondásról és a visszatérítésről. | |
| FR-906 | **Pénzügyi napló.** Bevétel és visszatérítés bejegyzések készülnek; az egyenleg eseményenként követhető. | |
| FR-907 | **Ismételt lemondás.** Már lemondott esemény újra nem mondható le; egy foglalásra nem készül két visszatérítés. | `REFUND_ALREADY_ISSUED` |
| FR-908 | **Katalógus.** Lemondott eseményre nem lehet foglalást létrehozni, és a katalógusból eltűnik. | `BR-06` |

## 10. Nyelv és megjelenítés (FR-10xx)

| ID | Követelmény | Kulcsszabályok |
| --- | --- | --- |
| FR-1001 | **Nyelvváltás.** A felületen magyar és angol nyelv választható; a választás megmarad a bejelentkezett felhasználónak. | `BR-14` |
| FR-1002 | **API üzenetek.** Az API hibaüzenetei az `Accept-Language` fejléc szerint magyarul vagy angolul érkeznek; a hibakód mindig azonos. | `BR-14` |
| FR-1003 | **Formázás.** A dátum és pénzösszeg a nyelvnek megfelelően formázódik (magyar: `2026. november 14. 19:00`, `12 500 Ft`). | `BR-15` |
| FR-1004 | **E-mail nyelve.** Az értesítő e-mailek a címzett nyelvi beállítása szerint készülnek. | |
