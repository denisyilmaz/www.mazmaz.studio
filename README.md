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

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and publishes `dist/mazmaz/browser` to GitHub Pages. The custom domain lives in `public/CNAME`. In the repo settings, set Pages → Source to "GitHub Actions".

## Font

`public/fonts/ABCSchengenVariable-latin.woff2` is a basic-Latin subset of the ABC Schengen Variable **trial** font (axes: wght 200–1000, wdth 100–125, slnt -12–0). Replace it with the licensed file before launch.
