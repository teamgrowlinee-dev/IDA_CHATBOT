# IDA Chatbot — Integreerimise juhend

**Versioon:** 1.0
**Kuupäev:** 2026-03-09

---

## Mis see on?

IDA Chatbot on teie veebisaidile lisatav abistaja, mis:
- Soovitab tooteid kliendi kirjelduse põhjal
- Koostab mööblikomplekte ruumi järgi
- Võimaldab avada 3D ruumi simulaatori
- Lisab tooted otse ostukorvi

---

## Nõuded

- WordPress + WooCommerce veebisait
- Ligipääs teema failidele (Dashboard → Välimus → Teema redaktor) **või** FTP/cPanel

---

## Integreerimine (2 sammu)

### Samm 1 — Lisa kood WordPressi

Ava WordPress Admin Dashboard ja mine:
**Välimus → Teema redaktor → functions.php** (soovitavalt lapseteema)

Lisa faili **lõppu** järgmine kood:

```php
/**
 * IDA Chatbot widget
 * Lisab vestlusnupu kõikidele lehtedele paremas alumises nurgas.
 */
add_action('wp_head', function() {
    ?>
    <script src="https://ida-chatbot.onrender.com/widget/loader.js" defer></script>
    <?php
});
```

Kliki **Uuenda fail**.

---

### Samm 2 — Kontrolli tulemust

Ava oma veebisait ja vaata — **paremas alumises nurgas** peaks ilmuma vestlusnupp.

Kliki sellel ja testi:
- Küsi tootesoovitust (nt „Otsin halli diivanit")
- Küsi ruumi planeerimist (nt „Aitan ruumi planeerida")

---

## Alternatiiv: kood otse `header.php` faili

Kui `functions.php` meetod ei sobi, saab koodi lisada otse teema `header.php` faili vahetult enne `</head>` sulgemis-silti:

```html
<script src="https://ida-chatbot.onrender.com/widget/loader.js" defer></script>
```

---

## Alternatiiv: WooCommerce kaudu (ilma teema muutmata)

Kui soovite vältida teema failide muutmist, saab kasutada **WooCommerce → Seaded → Täpsem → Konto lehed** sektsiooni all olevat kohandatud koodi võimalust, **või** paigaldada pistikprogrammi [WPCode](https://wordpress.org/plugins/insert-headers-and-footers/):

1. Paigalda WPCode (tasuta)
2. Mine **Kood → Päis ja jalus**
3. Lisa **Päis** sektsiooni:

```html
<script src="https://ida-chatbot.onrender.com/widget/loader.js" defer></script>
```

4. Salvesta

---

## Korduma kippuvad küsimused

**K: Kas see aeglustab saiti?**
V: Ei. Skript laeb `defer` atribuudiga — see tähendab, et see ei blokeeri lehe laadimist.

**K: Kas ostukorv töötab automaatselt?**
V: Jah. Kui klient lisab toote chatboti kaudu, lisandub see otse teie WooCommerce ostukorvi — täpselt nagu tavalise „Lisa korvi" nupu kaudu.

**K: Kas tooted uuenevad automaatselt?**
V: Jah. Chatbot loeb tooteid otse teie WooCommerce poe andmebaasist — uued tooted, hinnamuutused ja laoseis kajastuvad koheselt.

**K: Mis juhtub kui server on maas?**
V: Nupp ei ilmu. Veebisait ise töötab edasi normaalselt — chatbot on täiesti sõltumatu teie WordPress saidi tööst.

**K: Kas saab nupu värvi või asukohta muuta?**
V: Jah, võtke ühendust meie meeskonnaga.

---

## Kontakt

Küsimuste korral:
**Growlinee** — team.growlinee@gmail.com
