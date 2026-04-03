# YAML / JSON Converter

Convert, validate and prettify YAML and JSON instantly. Everything runs client-side — no data is sent to any server.

**Live demo:** https://gmowses.github.io/yaml-json-converter

## Features

- YAML to JSON and JSON to YAML conversion
- Real-time validation with error messages and line numbers
- Syntax highlighting (keys, strings, numbers, booleans, nulls)
- Format / prettify button for both sides
- Copy button on both panels
- Stats: key count and nesting depth
- Dark / Light mode (follows system preference)
- i18n: English and Portuguese (BR)
- Zero backend — pure client-side, works offline

## Stack

React 19 + TypeScript + Tailwind CSS v4 + Vite 8 + [yaml](https://github.com/eemeli/yaml) npm package.

## Getting Started

```bash
git clone https://github.com/gmowses/yaml-json-converter.git
cd yaml-json-converter
npm install
npm run dev
```

Open `http://localhost:5173/yaml-json-converter/` in your browser.

## Build

```bash
npm run build
```

Static files are generated in `dist/`.

## License

[MIT](LICENSE) — Gabriel Mowses
