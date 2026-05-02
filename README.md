# BulkyFi

BulkyFi is a local-first bulk certificate generator for creating professional certificates from templates and recipient spreadsheets. It runs in the browser, stores projects locally, and exports high-quality PDF or PNG certificates without requiring a backend.

Live app: https://bulkyfi.vercel.app/

## Features

- Create certificate projects with built-in templates or uploaded PNG, JPG, SVG, and PDF backgrounds.
- Add draggable text placeholders and logos or seals to the certificate canvas.
- Import recipient data from CSV files or maintain a smaller recipient list manually.
- Map spreadsheet columns to certificate placeholders.
- Upload custom fonts and apply typography across certificate fields.
- Preview individual recipients before export.
- Export a single preview certificate or a full ZIP batch as PDF or PNG.
- Keep project history and assets in browser storage for a local-first workflow.

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- jsPDF, JSZip, PapaParse, and PDF.js

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Run linting:

```bash
npm run lint
```

## Project Structure

```text
src/
  App.tsx              Main application UI and routing
  exporter.ts          Certificate rendering and PDF/ZIP export logic
  indexedDb.ts         Local asset persistence
  storage.ts           Project persistence helpers
  templateLibrary.ts   Built-in certificate templates
  types.ts             Shared TypeScript types
```

## Notes

BulkyFi is designed as a client-side application. Uploaded templates, fonts, logos, and projects stay in the user's browser storage unless the user exports or clears them.
