# nt.xdan.cc

A clean, customisable Material 3 Expressive new tab page, served at [nt.xdan.cc](https://nt.xdan.cc).

- A clock (digital or analogue) inside a morphing shape, with a greeting and the date
- Search with Google, DuckDuckGo, Bing or Brave, plus optional suggestions and voice input
- Shortcuts with favicons, an edit mode and drag to reorder
- A "Make it yours" sheet for colour, colour style, theme, font, wallpaper, page elements and motion
- Settings export, import and reset

Settings and the wallpaper stay in the browser's `localStorage`. Search suggestions are off by default; when on, what you type goes to Google's suggestion service. Shortcut icons load from DuckDuckGo's icon service.

## Development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

Cloudflare Pages settings:

```text
Build command: npm run build
Build output directory: dist
Production branch: main
```

## Notes

- Built with [M3E](https://github.com/matraic/m3e) web components. `m3e-theme` 2.5.14 ignores its `variant` when building palettes, so `src/main.js` generates the Calm / Vibrant / Expressive schemes itself with `@material/material-color-utilities` (2025 spec) and sets the colour roles on the theme element.
- Outfit is self-hosted from `public/fonts/` under the SIL Open Font License (`Outfit-OFL.txt`). Other fonts load from Google Fonts only when chosen or when the settings sheet is opened.
