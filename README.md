# IDASTUUDIO_CHATBOT

IDA Stuudio WordPress/WooCommerce chatbot.

## Mida see teeb
- Säilitab sama vestlusloogika nagu varasem chatbot (intent -> FAQ/smalltalk/tootesoovitused)
- Tooteotsing töötab läbi WooCommerce Store API (`/wp-json/wc/store/v1/products`)
- Klienditoe vastused on kohandatud `idastuudio.ee` tingimuste ja kontakti järgi
- Widgeti "Lisa ostukorvi" kasutab WordPressi `/?wc-ajax=add_to_cart`

## Eeldused
- Node.js 18+

## Seadistus
1. Paigalda paketid:
```bash
npm install
```

2. `.env` minimaalsed väljad:
```bash
PORT=8787
STORE_BASE_URL=https://idastuudio.ee
USE_OPENAI=true
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

## Käivitamine
Arendus:
```bash
npm run dev
```

Ainult backend:
```bash
npm --workspace app run dev
```

Build:
```bash
npm run build
```

## Test
- Backend health: `http://localhost:8787/health`
- Chat health: `http://localhost:8787/api/chat/health`
- Widget test: `http://localhost:8787/test`

## WordPressi lisamine
Lisa WordPressi (nt footeri custom script) järgmine:

```html
<script>
  window.__idastuudioWidgetConfig = {
    apiBase: "https://SINU-CHAT-SERVERI-DOMEEN",
    brandName: "IDA SISUSTUSPOOD & STUUDIO",
    storeOrigin: window.location.origin
  };
</script>
<script src="https://SINU-CHAT-SERVERI-DOMEEN/widget/embed.js" defer></script>
```

Märkus: `apiBase` peab osutama serverile, kus jookseb `app`.
