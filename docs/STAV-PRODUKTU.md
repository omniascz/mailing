# Stav produktu

_Měřeno 9. 9. 2026 proti aktuálnímu masteru. Popisuje, co produkt umí dnes — ne co je naplánováno._

---

## Co je živé

Zákazník, který si dnes založí účet, dostane hotovou e-mailovou marketingovou
platformu. Živá je zhruba **900 endpointů**, které tvoří jádro:

- **E-mail** — kampaně, šablony, vizuální editor, A/B testy, plánované
  odesílání, transakční pošta. Vlastní odesílací engine s DKIM podpisem,
  zahříváním IP, správou reputace a zpracováním odhlášení a stížností.
- **Kontakty** — segmentace, vlastní pole, import, sloučení duplicit, souhlasy
  podle GDPR účelů, frekvenční stropy, tiché hodiny.
- **Automatizace** — workflow s vizuálním plátnem, spouštěče podle chování,
  vícekrokové sekvence.
- **Další kanály** — SMS přes vlastní SMPP bránu, WhatsApp, Viber. Hlasový
  robot funguje přes API, ne jako kampaňový kanál.
- **Analytika** — otevření, prokliky, doručitelnost, výnosy podle kampaně,
  reporty.
- **Integrace** — Shoptet, Upgates, FastCentrik, Raynet, Zapier, produktové
  feedy pro Heureku, Zboží a Google Shopping.
- **API a SDK** — veřejné REST API, webhooky, JavaScript SDK pro web, Python
  klient.

Vše výše je v provozu, chráněné přihlášením a oddělené mezi zákazníky.

**Co v jádru není v pořádku:** pět endpointů dnes vrací chybu serveru místo
odpovědi — dva analytické reporty (kohorty a srovnání období), externí feedy,
připojení Allegra a webový soket softphonu. Jsou to okrajové funkce, ale živé,
a jeden z nich navíc běží bez přihlášení. Je to jediná vada, kterou tento
dokument v živé ploše zaznamenává.

---

## Co je postavené a čeká na zapnutí

Kromě jádra existuje druhá plocha: **342 dalších adres, 437 operací,
rozdělených do 76 funkčních skupin.** Nejsou vypnuté omylem — je nad nimi
přepínač, který dovoluje zapínat je po jedné, a v produkci jich dnes běží
nula. Nikdo je nikdy neprovozoval.

Změřili jsme, co by se stalo, kdyby se zapnuly. Výsledek je lepší, než jsme
čekali: **ze 186 čtecích adres jich 170 odmítne nepřihlášeného návštěvníka,
ani jedna nespadne, a zbylých šestnáct je veřejných záměrně** — objednávková
stránka schůzky, vyplnění dotazníku, žádost o recenzi, veřejná nabídka,
sledovací pixel. Před rokem byla stejná plocha plná děr; dnes je uzavřená.

Skupiny připravené k zapnutí, seskupené podle toho, co dělají:

**Zákaznická zkušenost** — dotazníky a NPS, recenze (dvě generace),
věrnostní program s odměnami, pravidly a historií bodů, kupóny, hry o ceny.

**Podpora** — helpdesk s tikety, směrováním, předpřipravenými odpověďmi,
živým chatem a AI asistentem. Sjednocená schránka pro Instagram a Messenger.

**Obchod** — CRM s firmami, kontakty, obchodními případy, úkoly, poznámkami,
sekvencemi a reporty. Nabídky, faktury, předplatná, produktový katalog,
elektronický podpis.

**Marketing** — blog s revizemi a CTA prvky, SEO nástroje (mapa webu, klastry,
klíčová slova, audit, sledování pozic), správa sociálních sítí, reklamní účty
a synchronizace publik.

**Data** — zákaznická datová platforma s profily, událostmi, vlastnostmi
a aktivacemi, propojování identit, pokročilá analytika, doporučovací engine.

**Schůzky a kalendář** — rezervační stránky, synchronizace kalendáře.

Jediná skupina, která by se dnes zapnout **neměla**, je **analytika helpdesku** —
její přehledový report vrací chybu serveru. A jediná, která je zablokovaná
schválně, je **příjem reklamních formulářů z Facebooku**: má vlastní přepínač
a její ověřování podpisu se otevírá, když chybí tajný klíč, takže se smí zapnout
jen tím druhým přepínačem, ne tímto.

---

## Co je postavené a nemá příjemce

Zapnout skupinu neznamená, že ji někdo použije. U velké části té plochy platí,
že **kód funguje, ale nevede k němu cesta** — administrace pro ni nemá
obrazovku, nebo jí nikdo nedodává data.

- **CRM, obchodní dokumenty, SEO nástroje, správa sociálních sítí, reklamní
  publika, věrnostní pravidla, datová platforma** — API je hotové a otestované,
  ale v administraci pro ně není žádná obrazovka. Zákazník by je mohl používat
  jen přes API, což u nástroje pro marketéra znamená, že je používat nebude.
- **Přidělování kupónů po dávkách** — vnitřní endpoint existuje a nikdo ho
  nevolá. Není naplánovaný, není nikde v kódu zavolán.
- **Sledování opuštěného prohlížení, rozesílání příspěvků na sítě, upomínky
  faktur, generování opakovaných plateb, měření pozic ve vyhledávání** — tyhle
  naopak příjemce mají: volá je plánovač na pozadí. Chybí jim jen obrazovka pro
  nastavení.
- **Doporučovací engine** — jeden endpoint bez volajícího z administrace
  i z SDK.

Rozdíl mezi „čeká na zapnutí" a „nemá příjemce" je praktický: první skupina
přinese hodnotu ve chvíli, kdy se přepne přepínač; druhá až po tom, co k ní
někdo postaví obrazovku.

---

## Co blokuje spuštění

**Doména.** Systémová pošta — potvrzení registrace, obnova hesla, ověřovací
maily — odchází z naší vlastní domény, ale pod identitou zákazníkovy
organizace. Vyhledávání podpisového klíče je vázané na organizaci, takže pro
naši doménu klíč nemá odkud vzniknout: tahle pošta **nejde podepsat**. Dokud
doména nebude vyřešená a zavedená, odcházejí tyto zprávy nepodepsané a
odesílací engine to hlásí jako úspěch.

Na téže doméně visí: nastavení SPF a DMARC, adresa pro zpracování vrácených
zpráv, odkazy v odhlašovacím centru a odkazy pro sledování prokliků.

Vedle toho čeká rozhodnutí o **cenách a limitech plánů** — kód pro vynucování
kvót existuje ve dvou různých podobách, které by daly různé odpovědi, a než se
rozhodne, která platí, nedá se ceník uzavřít.

---

## Co vědomě nestavíme

- **Mobilní SDK.** Serverová strana pro mobilní notifikace je hotová, ale
  chybí per-zákazníka uložené klíče k Apple a Google — dnes je má systém
  globální, takže do zákazníkovy aplikace fyzicky nelze doručit. Navíc na
  českém trhu jde 63 % nákupů z mobilu, ale skoro všechny přes prohlížeč:
  vlastní aplikaci má jen zlomek e-shopů. Je to samostatný produkt se čtyřmi
  platformami, ne položka ve frontě.
- **Zákaznický portál (Customer Hub).** Předpokládá, že koncový zákazník
  e-shopu se u nás přihlašuje. Nemáme pro něj přihlášení ani identitu a
  zavedení by znamenalo druhý autentizační systém vedle toho pro marketéry.
- **Zákaznický AI agent.** Má odpovídat návštěvníkům jménem značky bez dozoru.
  Nemáme zavedený způsob, jak omezit, co smí říct, a chyba je vidět zákazníkovi
  značky okamžitě — riziko je nesouměrné s přínosem, dokud nebude helpdesk
  v ostrém provozu.
- **Srovnání s konkurencí v oboru (peer benchmarky).** Vyžaduje agregovaná data
  napříč zákazníky. Máme jednoho zákazníka na každém segmentu, takže by
  „průměr oboru" byl ve skutečnosti jeden konkrétní e-shop — to je únik dat,
  ne funkce.

---

## Shrnutí jednou větou

Produkt je hotová e-mailová platforma s velkým, uzavřeným a nepoužívaným
druhým patrem: **74 ze 76 skupin je technicky zapnutelných**, ale u většiny
z nich by zapnutí samo o sobě nic nezměnilo, protože k nim nevede obrazovka —
a nezávisle na tom čeká spuštění na doménu.
