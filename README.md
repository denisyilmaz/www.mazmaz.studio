# mazmaz.studio

Coming-soon vcard for the mazmaz studio. A full-screen pattern of the word "maz" set in ABC Schengen Variable; the pair of cells nearest the pointer is pushed to bold + extended with a radial falloff.

Stack: Angular 22 (zoneless, prerendered static output), Tailwind 4, motion.

## Develop

```sh
npm install
npm start        # http://localhost:4200
npm test
```

## Build & deploy

```sh
npm run build    # static site in dist/mazmaz/browser
```

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and publishes `dist/mazmaz/browser` to GitHub Pages at https://denisyilmaz.github.io/www.mazmaz.studio/ (the workflow passes `--base-href /www.mazmaz.studio/`).

## Going live on mazmaz.studio

Once the domain is registered:

1. Set these DNS records at the registrar:

   | Host | Type  | Value                    |
   | ---- | ----- | ------------------------ |
   | @    | A     | 185.199.108.153          |
   | @    | A     | 185.199.109.153          |
   | @    | A     | 185.199.110.153          |
   | @    | A     | 185.199.111.153          |
   | @    | AAAA  | 2606:50c0:8000::153      |
   | @    | AAAA  | 2606:50c0:8001::153      |
   | @    | AAAA  | 2606:50c0:8002::153      |
   | @    | AAAA  | 2606:50c0:8003::153      |
   | www  | CNAME | denisyilmaz.github.io    |

   The AAAA records are optional (IPv6). Remove any existing A/AAAA/CNAME records for @ and www first.

2. Add `public/CNAME` containing `mazmaz.studio` (one line).
3. Remove the `--base-href /www.mazmaz.studio/` flag from `.github/workflows/deploy.yml`.
4. Switch the absolute URLs in `src/index.html` (canonical, og:url, og:image, twitter:image) back to `https://mazmaz.studio/`.
5. Push. Then in the repo settings under Pages, confirm the custom domain shows `mazmaz.studio` with a green check and enable "Enforce HTTPS" (the certificate takes a few minutes after DNS resolves). `www.mazmaz.studio` will redirect to the apex automatically.

## Font

`public/fonts/ABCSchengenVariable-latin.woff2` is a basic-Latin subset of the ABC Schengen Variable **trial** font (axes: wght 200–1000, wdth 100–125, slnt -12–0). Replace it with the licensed file before launch.
