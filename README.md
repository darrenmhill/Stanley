# Stanley — ASIC Derivative Reporting Validator

A browser-based validation tool for ASIC (Australian Securities & Investments Commission) derivative trade reports. It parses ISO 20022 `auth.030.001.04` (DerivativesTradeReportV04) XML messages and validates them against the ASIC Derivative Transaction Rules (Reporting) 2024 — Schedule 1 Technical Guidance.

## Features

- **XML Parsing** — Parses `auth.030.001.04` messages with full namespace-aware traversal following the ASIC ISO 20022 Mapping Document v1.1 (Feb 2025)
- **130 Validation Rules** — Comprehensive rule coverage across 11 categories
- **Action-Type Awareness** — Rules are conditional on action type (NEWT, MODI, CORR, TERM, VALU, EROR, REVI)
- **Inline Fix Editing** — Failed fields with known XML paths can be edited inline and re-validated
- **Sample XML** — Built-in sample with deliberate errors for demonstration
- **File Upload** — Upload `.xml` files directly for validation
- **Filtering** — Filter results by PASS, FAIL, or N/A status

## Validation Rule Coverage

| Category | Rules | Description |
|----------|-------|-------------|
| Counterparty | ASIC-001 to ASIC-020 | Reporting entity, CP1/CP2 LEI, beneficiary, broker, execution agent, clearing member, submitting agent, direction, nature |
| Identifier | ASIC-021 to ASIC-030 | UTI format/length/characters, prior UTI, UTI != Prior UTI, event ID, secondary TX ID |
| Product | ASIC-031 to ASIC-040 | UPI (ISO 4914), contract type, asset class, CFI, settlement currency, underlier |
| Date & Timestamp | ASIC-041 to ASIC-055 | Execution/effective/expiration/maturity/reporting timestamps, timezone checks, cross-field date validations |
| Clearing & Trading | ASIC-056 to ASIC-065 | Cleared status, CCP LEI, platform identifier (MIC), clearing member, non-cleared reason, master agreement |
| Notional & Quantity | ASIC-066 to ASIC-078 | Notional amounts/currencies for both legs, numeric/non-negative checks, FX-specific requirements |
| Price | ASIC-079 to ASIC-095 | Price, fixed rates, spreads, strike price, option type/exercise style/premium, exchange rate |
| Valuation | ASIC-096 to ASIC-105 | Valuation amount/currency/timestamp, delta range, VALU action mandates, valuation type |
| Action & Event | ASIC-106 to ASIC-118 | Action type detection, event type per-action cross-validation, EROR/REVI checks |
| Collateral | ASIC-119 to ASIC-124 | Initial/variation margin posted/received, portfolio code |
| Package | ASIC-125 to ASIC-130 | Package ID, package price/spread, IRS fixed rate/spread checks, FX exchange rate |

## XML Structure

The parser expects the correct ISO 20022 hierarchy per the ASIC mapping document:

```
DerivsTradRpt
  TradData
    Rpt
      {Action}                          (New, Mod, Crrctn, Termntn, ValtnUpd, Err, Rvv)
        RptgTmStmp
        CptrPtySpcfcData
          CtrPty
            NttyRspnsblForRpt
            RptgCtrPty
            OthrCtrPty
            SubmitgAgt
            Bnfcry
            Valtn                       (for VALU action)
        CmonTradData
          CtrctData
            PdctId > UnqPdctIdr         (UPI)
            AsstClss
            CtrctTp
            SttlmCcy
          TxData
            TxId > UnqTxIdr             (UTI)
            ExctnTmStmp
            FctvDt
            XprtnDt
            MtrtyDt
            DerivEvt
            TradClr
            PltfmIdr
            NtnlAmt
            TxPric
            IntrstRate
            Optn
            Packg
        CollData
```

## Tech Stack

- **Frontend:** React 19 + TypeScript (strict mode), Vite 7
- **Deployment:** Docker (node:22-alpine), Railway
- **Static serving:** `serve` package for production builds
- **No backend** — all parsing and validation runs client-side in the browser

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Serve production build
npm start
```

## Key Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Vite HMR) |
| `npm run build` | TypeScript check + Vite build |
| `npm run lint` | ESLint |
| `npm start` | Serve production build on PORT (default 3000) |

## Project Structure

```
src/
  App.tsx                — Main UI: XML input, file upload, validation results table with inline editing
  App.css                — All styles
  main.tsx               — React entry point
  engine/
    xmlParser.ts         — Parses auth.030 XML using DOMParser with four base elements
                           (action, counterparty, contract, transaction)
    validationRules.ts   — 130 validation rules (ASIC-001 to ASIC-130) split into
                           category-based builders
    sampleXml.ts         — Sample XML with deliberate errors for demo
docs/
  mapping-v1.1.pdf       — ASIC ISO 20022 Mapping Document (reference)
```

## References

- [ASIC Derivative Transaction Rules (Reporting) 2024](https://www.legislation.gov.au/Series/F2024L00590)
- [ISO 20022 auth.030.001.04 — DerivativesTradeReportV04](https://www.iso20022.org/catalogue-messages/additional-content-messages/derivatives-messages)
- ASIC ISO 20022 Mapping Document v1.1 (Feb 2025)
