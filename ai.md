# AI-használat a Kincskereső robot projektben

## Használt AI-eszközök és modellek

| Eszköz | Modell | Verzió / dátum |
| Claude Code | Opus 5.5 | 2026. november |

## Mire használtuk az AI-t, és mekkora részben

- **Bejelentkezési oldal kinézete:** a `login.html` animált robotos jelenete és a `stylesheet.css` nagy része AI-al alapján készült.
- **Kódrendezés:** a beadás előtt a Claude Code-dal töröltük a kommenteket és a felesleges kódrészleteket, és egységesítettük a formázást (`login.js`, `login.html`, `stylesheet.css`, `server.js`).
- **Interpreter:** az interpretert a Claude segítségével írtuk és értelmeztük.

Becslésünk szerint a program kb. 80%-a készült AI segítségével. Az alapvető backend és adatbázis a csapat munkája.

## Hogyan ellenőriztük és javítottuk az AI eredményét

- Minden AI által módosított JavaScript-fájlt lefuttattunk `node --check`-kel, hogy nincs-e benne szintaktikai hiba.
- Az alkalmazást elindítottuk (`npm start`), és kézzel kipróbáltuk a bejelentkezést, a program futtatását, a térképszerkesztőt és a ranglistát.
- A `git diff` alapján soronként átnéztük, mit változtatott az AI, és amit nem értettünk vagy feleslegesnek tartottunk, azt visszaállítottuk.
- A feladatkiírásban szereplő példákkal (`peldak/program.txt`, `peldak/terkep.txt`) ellenőriztük, hogy a program a specifikáció szerint működik-e.

## 5 konkrét eset

1. **Kikommentezett regisztráció felfedezése (hasznos):** a kódrendezés közben az AI jelezte, hogy a `/api/register` végpont ki van kommentezve a szerveren, miközben a bejelentkezési oldalon a regisztrációs űrlap továbbra is látszik. Így a felhasználó hibaüzenetet kap, ha regisztrálni próbál, ezt nekünk kell eldöntenünk és javítanunk.
2. **Elgépelés a CSS-ben (hasznos):** az AI észrevett egy `display: flex;a` elgépelést a `style.css`-ben, ami miatt a böngésző eldobta az utána következő `gap` beállítást, így a térképszerkesztő sor/oszlop mezői között nem maradt térköz.
3. **Félrevezető komment (sikertelen):** a korábban AI-val generált `login.js`-ben egy komment „JWT token”-ről szólt, holott a szerver véletlenszerű munkamenet-tokent használ, nem JWT-t. Ebből megtanultuk, hogy az AI kommentjeit is ellenőrizni kell, nem csak a kódot.
4. **Egymást felülíró CSS-szabályok (részben sikertelen):** az AI által generált `stylesheet.css` végére utólag hozzáfűzött `[role="tab"]` szabályok felülírták a korábbiakat. A rendezésnél összevontuk őket úgy, hogy a megjelenés ne változzon.
5. **Az interpreter**: A feladatleírás alaján az AI segített megérteni, hogy hogyan kellene működnie az interpreternek, majd ennek segített a megírásában.