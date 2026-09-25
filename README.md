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

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and publishes `dist/mazmaz/browser` to GitHub Pages at https://mazmaz.studio/. The custom domain lives in `public/CNAME`; Pages source is "GitHub Actions".

## DNS

The domain points at GitHub Pages with these records:

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


To move the site elsewhere temporarily, pass `--base-href /<folder>/` to the build in the workflow and point the absolute URLs in `src/index.html` (canonical, og:url, og:image, twitter:image) at the new address.

## Font

`public/fonts/ABCSchengenVariable-latin.woff2` is a basic-Latin subset of the ABC Schengen Variable **trial** font (axes: wght 200–1000, wdth 100–125, slnt -12–0). Replace it with the licensed file before launch.
