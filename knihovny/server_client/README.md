# Knihovna `server_client`

Obecný klient pro odesílání normalizovaných JSON požadavků na zadanou URL adresu backendu doplňku.

## Použití v doplňku

V `manifest.json` doplňku uveďte:

```json
{
  "libs": ["server_client"]
}
```

V JS doplňku:

```js
const serverClient = Izomapa.getLib('server_client');
const api = serverClient.createClient(cfg.server_url);

const res = await api.call('ping', { text: 'Ahoj' });
if (res.ok) {
  console.log(res.data);
} else {
  console.warn(res.error, res.message);
}
```

Vlastní serverová strana (PHP, Python, Cloudflare Worker apod.) je součástí konkrétního doplňku, který si ji definuje.
