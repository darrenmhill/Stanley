# Stanley — ASIC Derivative Reporting Validator

## What This Project Does
A browser-based validation tool for ASIC (Australian Securities & Investments Commission) derivative trade reports. It parses ISO 20022 `auth.030.001.04` (DerivativesTradeReportV04) XML messages and validates them against the ASIC Derivative Transaction Rules (Reporting) 2024 — Schedule 1 Technical Guidance.

## Tech Stack
- **Frontend:** React 19 + TypeScript (strict mode), Vite 7
- **Deployment:** Docker (node:22-alpine), Railway
- **Static serving:** `serve` package for production builds

## Project Structure
```
src/
  App.tsx          — Main UI: XML input, file upload, validation results table with inline editing
  App.css          — All styles
  main.tsx         — React entry point
  engine/
    xmlParser.ts   — Parses auth.030 XML using DOMParser, extracts fields by namespace-aware traversal
    validationRules.ts — 50 validation rules (ASIC-001 to ASIC-050) covering counterparty, identifier, date, clearing, notional, price, collateral, valuation, and action/event checks
    sampleXml.ts   — Sample XML with intentional errors for demo purposes
```

## Key Commands
- `npm run dev` — Start dev server (Vite HMR)
- `npm run build` — TypeScript check + Vite build
- `npm run lint` — ESLint
- `npm start` — Serve production build on PORT (default 3000)

## Architecture Notes
- All parsing/validation runs client-side in the browser (no backend)
- XML namespace: `urn:iso:std:iso:20022:tech:xsd:auth.030.001.04`
- The parser detects action type from Level 3 wrapper elements (New, Mod, Crrctn, Termntn, ValtnUpd, Err, Rvv)
- Validation rules are action-type-aware — some rules are N/A for exit actions (TERM, EROR)
- Failed fields with known XML paths can be edited inline and re-validated
- `FIELD_PATHS` in xmlParser.ts maps field names to their XML element paths for the inline edit feature

## Conventions
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`
- ESM modules (`"type": "module"` in package.json)
- Rule IDs follow the pattern `ASIC-NNN` (e.g., ASIC-001, ASIC-050)
