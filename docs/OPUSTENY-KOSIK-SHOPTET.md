# Opuštěný košík na Shoptetu

Návod pro majitele e-shopu. Vložíte do šablony jeden skript a flow „Opuštěný
košík" začne chodit. Zabere to asi deset minut.

## Proč to nejde bez skriptu

Shoptet neposílá webhook o košíku — v číselníku webhooků jsou objednávky,
zákazníci, produkty a sklady, košík ne. Jediný, kdo o rozdělaném košíku ví, je
stránka e-shopu. Proto ten skript.

## Co budete potřebovat

- **Publikovatelný klíč** (začíná `fm_pub_`). Najdete ho v administraci
  ForgeMsg v **Nastavení → API klíče**. Je určený do stránky a smí se v ní
  objevit; tajný klíč (`fm_sk_`) do šablony **nepatří**.
- Aktivní flow **„Opuštěný košík — 3 doteky"**. Najdete ho ve **Workflow →
  Galerie šablon**, kliknete na _Použít_ a pak na _Aktivovat_.

## Krok 1 — vložení skriptu

V administraci Shoptetu jděte do **Nastavení → HTML kódy a vlastní scripty**
a vložte tenhle kód do pole pro **patičku (před `</body>`)**:

```html
<script>
  (function () {
    // Běží jen na stránce košíku.
    if (!location.pathname.match(/kosik|cart/i)) return;

    var dl = (window.dataLayer && window.dataLayer[0] && window.dataLayer[0].shoptet) || {};
    var email = (dl.customer && dl.customer.email) || '';

    // Bez e-mailu není komu připomínku poslat. Shoptet e-mail zná jen
    // u přihlášeného zákazníka — to je v pořádku, nepřihlášené přeskočíme.
    if (!email) return;

    var items = dl.cart || [];
    var count = items.reduce(function (n, i) {
      return n + (i.quantity || 1);
    }, 0);

    fetch('https://api.forgemsg.com/api/v1/checkout-started', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'fm_pub_SEM_VLOZTE_SVUJ_KLIC',
      },
      body: JSON.stringify({
        email: email,
        itemCount: count,
        recoveryUrl: location.href,
      }),
      keepalive: true,
    }).catch(function () {});
  })();
</script>
```

Za `fm_pub_SEM_VLOZTE_SVUJ_KLIC` dosaďte svůj publikovatelný klíč.

## Krok 2 — kontrola

1. Přihlaste se do svého e-shopu jako zákazník (ne do administrace).
2. Vložte něco do košíku a otevřete stránku košíku.
3. V ForgeMsg otevřete **Workflow → Opuštěný košík — 3 doteky → Běhy**.
   Do minuty by tam měl přibýt jeden běh.

Když se běh neobjeví, otevřete v prohlížeči vývojářskou konzoli (F12), záložku
**Síť**, a načtěte košík znovu. Požadavek na `checkout-started` musí odpovědět
**202**. Odpověď `{"started": false, "reason": "duplicate"}` je v pořádku — viz
níže.

## Co se stane dál

První připomínka odejde **za hodinu**, druhá za den, třetí za tři dny. Kdo mezi
tím objednávku dokončí, **žádnou další připomínku nedostane** — ForgeMsg to
kontroluje až v okamžiku odeslání, ne při zařazení.

## Na co si dát pozor

- **Jen přihlášení zákazníci.** Shoptet dává e-mail do stránky pouze
  přihlášenému zákazníkovi. Nepřihlášeného nemáme jak oslovit, takže se
  přeskočí. (Kdybyste e-mail sbírali vlastním formulářem dřív, můžete ho do
  skriptu dosadit sami.)
- **Opakované načtení nevadí.** Jeden košík jednoho zákazníka se zařadí
  **nejvýš jednou za třicet minut**, i kdyby stránku načetl desetkrát.
  Rozhodnutí dělá server, ne prohlížeč — na paměť prohlížeče se spolehnout nedá.
- **Hodnota košíku.** Pokud vaše šablona vystavuje i cenu, přidejte do těla
  požadavku `amount` (číslo) a `currency` (`"CZK"`). E-mail ji pak umí zmínit.
  Bez toho se pošle jen počet položek.
- **Klíč ve stránce je v pořádku.** Publikovatelný klíč umí jen tohle: ohlásit
  košík a přihlásit k hlídání dostupnosti. Číst kontakty ani rozesílat z něj
  nejde.

## Co skript posílá

| Pole          | Povinné | Co to je                                     |
| ------------- | ------- | -------------------------------------------- |
| `email`       | ano     | e-mail zákazníka; jinak není koho oslovit    |
| `itemCount`   | ne      | počet kusů v košíku                          |
| `amount`      | ne      | hodnota košíku jako číslo                    |
| `currency`    | ne      | měna, tři písmena (`CZK`)                    |
| `recoveryUrl` | ne      | adresa košíku, kam se zákazník vrátí         |
| `cartId`      | ne      | vaše vlastní označení košíku, máte-li nějaké |

Nic jiného se neposílá a obsah košíku (jaké zboží) ForgeMsg touhle cestou
nedostane.
