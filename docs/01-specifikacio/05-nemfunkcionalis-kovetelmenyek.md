# 05 — Nemfunkcionális követelmények

> Az `NFR-xx` követelmények a rendszer **minőségi** jellemzőit írják le. Minden
> követelménynél szerepel, hogyan ellenőrizhető.

---

| ID | Követelmény | Ellenőrzés |
| --- | --- | --- |
| NFR-01 | **Determinisztikus adatkezelés.** A demo adatkészlet betöltése minden alkalommal pontosan ugyanazt az állapotot eredményezi (azonos azonosítók, azonos összegek, azonos állapotok). | Kétszeri újratöltés után az eseménylista és a foglalások összevetése. |
| NFR-02 | **Egyidejűség.** Két párhuzamos kérés ugyanarra a székre nem eredményezhet két sikeres foglalást; állóhelynél a kapacitás nem léphető túl párhuzamos vásárlás esetén sem. | Párhuzamos kérések futtatása (pl. 20 egyidejű foglalás ugyanarra a székre / az utolsó szabad helyre). |
| NFR-03 | **Idempotencia.** Fizetési kérés azonos idempotencia kulccsal egyszer dolgozódik fel. | Ugyanazon kérés kétszeri elküldése, a tranzakciók számának ellenőrzése. |
| NFR-04 | **Teljesítmény.** 500 esemény és 100 000 szék mellett a katalóguslista és az ülőhelytérkép válaszideje **p95 < 800 ms**. Egy székes foglalás létrehozása < 1 s. | Terheléses mérés a demo adatkészleten és egy generált nagy adathalmazon. |
| NFR-05 | **Konténeres futtatás.** A rendszer a `docker compose` fájlból, egyetlen parancsból elindul; az adatok névvel ellátott kötetben (volume) maradnak meg a konténerek újraindítása között. | `docker compose restart` után a korábbi foglalások megvannak. |
| NFR-06 | **Jelszókezelés.** A jelszavak bcrypt-tel (legalább 10 rounds) hashelve tárolódnak; a jelszó vagy hash semmilyen API válaszban nem jelenhet meg. | Adatbázis-ellenőrzés és API válaszok átvizsgálása. |
| NFR-07 | **Egységes hibaválasz.** Minden hibaválasz a 04. dokumentum 2.1 pontja szerinti szerkezetű; stack trace vagy belső elérési út nem szivároghat ki. | Hibás kérések sorozatának futtatása, a válaszok szerkezetének ellenőrzése. |
| NFR-08 | **Naplózás.** Az API strukturált (JSON) kéréseket naplóz: időpont, útvonal, státusz, válaszidő, felhasználó. A napló nem tartalmaz jelszót, tokent vagy teljes kártyaszámot. | Konténer-napló átvizsgálása. |
| NFR-09 | **Nemzetköziesítés.** A felület minden szövege nyelvi erőforrásból származik; nincs beégetett magyar szöveg a komponensekben. Magyar és angol nyelven is teljes a felület (nincs hiányzó fordítás). | Nyelvváltás végigvitele minden képernyőn; hiányzó kulcs keresése. |
| NFR-10 | **Csak tesztadat.** A rendszer nem tartalmaz valós személyes adatot és nem kommunikál külső szolgáltatással (fizetés, e-mail mind lokális szimuláció). | Hálózati kapcsolatok és adatkészlet ellenőrzése. |
| NFR-11 | **API dokumentáció.** Az API OpenAPI leírást szolgál ki interaktív felülettel (`/api/docs`), amely lefedi az összes végpontot. | A dokumentáció megnyitása, végpontok összevetése a tényleges API-val. |
| NFR-12 | **Visszaállítás.** A teljes adatbázis kiürítése és újratöltése (**reset / reseed**) legfeljebb **60 másodpercet** vegyen igénybe, és dokumentált, egyetlen paranccsal indítható legyen. | A reset parancs időmérése és utána az adatok ellenőrzése. |
| NFR-13 | **Böngészőtámogatás.** A felület a Chrome, Firefox és Edge legutóbbi két főverziójában működik, 1280×720 és 1920×1080 felbontásban. | Manuális ellenőrzés a megadott böngészőkben. |
| NFR-14 | **Alap akadálymentesítés.** Az űrlapmezők címkével rendelkeznek, a fókusz látható, a színen kívül más jelzés is mutatja a szék állapotát (minta/minta-szöveg), a felület billentyűzettel bejárható. | Billentyűzetes bejárás és színvak szimuláció. |
| NFR-15 | **Adatkonzisztencia.** Az összegek, a helyek állapota és a napló bejegyzések tranzakcióban, egymással összhangban változnak; részleges mentés nem maradhat. | Szándékosan megszakított folyamatok után a konzisztencia ellenőrzése. |
| NFR-16 | **Biztonsági alapok.** A tokenek lejárnak (access 15 perc, refresh 7 nap); a bejelentkezési kísérletek száma korlátozott; a szerepkör-ellenőrzés szerveroldali, nem csak a felületen elrejtett gomb. | Lejárt tokennel való hívás; védett végpont közvetlen hívása vásárlói tokennel. |
| NFR-17 | **Újraindíthatóság.** Minden szolgáltatás rendelkezik healthcheck-kel, és a `docker compose ps` alapján az állapot egyértelműen megállapítható. | `docker compose ps` és a health végpontok ellenőrzése. |
