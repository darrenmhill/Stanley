/**
 * ASIC Derivative Transaction Rules (Reporting) 2024
 * Validation rules derived from Schedule 1 Technical Guidance (v1.1, Feb 2025)
 * and the ASIC ISO 20022 Mapping Document (v1.0, Aug 2024).
 *
 * Reference: auth.030.001.04 — DerivativesTradeReportV04
 */

import type { ParsedReport } from './xmlParser';

export type Severity = 'ERROR' | 'WARNING';
export type RuleCategory =
  | 'Counterparty'
  | 'Identifier'
  | 'Date & Timestamp'
  | 'Clearing & Trading'
  | 'Notional & Quantity'
  | 'Price'
  | 'Product'
  | 'Collateral'
  | 'Valuation'
  | 'Action & Event'
  | 'Format';

export interface ValidationResult {
  ruleId: string;
  field: string;
  category: RuleCategory;
  description: string;
  severity: Severity;
  status: 'PASS' | 'FAIL' | 'N/A';
  actual: string | null;
  expected: string;
}

type RuleFn = (report: ParsedReport) => ValidationResult;

// ─── Helpers ────────────────────────────────────────────────────────

const LEI_REGEX = /^[A-Z0-9]{18}[0-9]{2}$/;
const ISO_CURRENCY_REGEX = /^[A-Z]{3}$/;
const ISO_COUNTRY_REGEX = /^[A-Z]{2}$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const UTI_REGEX = /^[A-Z0-9]{20}[A-Za-z0-9]{1,32}$/;
const UPI_REGEX = /^[A-Z0-9]{12}$/;

function val(v: string | null | undefined): string | null {
  return v && v.trim() !== '' ? v.trim() : null;
}

function mandatory(
  ruleId: string,
  field: string,
  category: RuleCategory,
  description: string,
  value: string | null | undefined,
): ValidationResult {
  const v = val(value);
  return {
    ruleId,
    field,
    category,
    description,
    severity: 'ERROR',
    status: v ? 'PASS' : 'FAIL',
    actual: v,
    expected: 'Non-empty value required',
  };
}

function formatCheck(
  ruleId: string,
  field: string,
  category: RuleCategory,
  description: string,
  value: string | null | undefined,
  regex: RegExp,
  expectedDesc: string,
): ValidationResult {
  const v = val(value);
  if (!v) {
    return { ruleId, field, category, description, severity: 'WARNING', status: 'N/A', actual: null, expected: expectedDesc };
  }
  return {
    ruleId,
    field,
    category,
    description,
    severity: 'ERROR',
    status: regex.test(v) ? 'PASS' : 'FAIL',
    actual: v,
    expected: expectedDesc,
  };
}

function allowedValues(
  ruleId: string,
  field: string,
  category: RuleCategory,
  description: string,
  value: string | null | undefined,
  allowed: string[],
): ValidationResult {
  const v = val(value);
  if (!v) {
    return { ruleId, field, category, description, severity: 'WARNING', status: 'N/A', actual: null, expected: `One of: ${allowed.join(', ')}` };
  }
  return {
    ruleId,
    field,
    category,
    description,
    severity: 'ERROR',
    status: allowed.includes(v) ? 'PASS' : 'FAIL',
    actual: v,
    expected: `One of: ${allowed.join(', ')}`,
  };
}

// ─── Rule Definitions ───────────────────────────────────────────────

function buildRules(): RuleFn[] {
  const rules: RuleFn[] = [];

  // ═══════════════════════════════════════════════════════════════════
  // COUNTERPARTY & ENTITY RULES (S1.3 Items 1–11)
  // ═══════════════════════════════════════════════════════════════════

  // Rule 1: Reporting Counterparty LEI — Mandatory
  rules.push((r) =>
    mandatory('ASIC-001', 'RptgCtrPty.LEI', 'Counterparty',
      'Reporting Entity (Counterparty 1) LEI is mandatory per Rule S1.3.1(2)',
      r.fields.get('RptgCtrPty.LEI')));

  // Rule 2: Reporting Counterparty LEI format — ISO 17442
  rules.push((r) =>
    formatCheck('ASIC-002', 'RptgCtrPty.LEI', 'Counterparty',
      'Reporting Entity LEI must conform to ISO 17442 format (20 alphanumeric characters)',
      r.fields.get('RptgCtrPty.LEI'), LEI_REGEX,
      'ISO 17442: 18 alphanumeric + 2 check digits (e.g., 5493001KJTIIGC8Y1R12)'));

  // Rule 3: Counterparty 2 Identifier — Mandatory (LEI or Proprietary)
  rules.push((r) => {
    const lei = val(r.fields.get('OthrCtrPty.LEI'));
    const prtry = val(r.fields.get('OthrCtrPty.PrtryId'));
    const hasId = !!lei || !!prtry;
    return {
      ruleId: 'ASIC-003',
      field: 'OthrCtrPty.Id',
      category: 'Counterparty',
      description: 'Counterparty 2 must be identified by LEI, Designated Business Identifier, or Client Code',
      severity: 'ERROR',
      status: hasId ? 'PASS' : 'FAIL',
      actual: lei ?? prtry ?? null,
      expected: 'LEI (ISO 17442) or Proprietary identifier',
    };
  });

  // Rule 4: Counterparty 2 LEI format (if provided)
  rules.push((r) =>
    formatCheck('ASIC-004', 'OthrCtrPty.LEI', 'Counterparty',
      'Counterparty 2 LEI must conform to ISO 17442 if provided',
      r.fields.get('OthrCtrPty.LEI'), LEI_REGEX,
      'ISO 17442: 18 alphanumeric + 2 check digits'));

  // Rule 5: Country of Counterparty 2 — Conditional (required when no LEI)
  rules.push((r) => {
    const lei = val(r.fields.get('OthrCtrPty.LEI'));
    const country = val(r.fields.get('OthrCtrPty.Ctry'));
    if (lei) {
      return { ruleId: 'ASIC-005', field: 'OthrCtrPty.Ctry', category: 'Counterparty',
        description: 'Country of Counterparty 2 is required when CDE-Counterparty 2 identifier type is FALSE (no LEI)',
        severity: 'WARNING', status: 'N/A', actual: country, expected: 'ISO 3166-1 alpha-2 (conditional when no LEI)' };
    }
    return {
      ruleId: 'ASIC-005',
      field: 'OthrCtrPty.Ctry',
      category: 'Counterparty',
      description: 'Country of Counterparty 2 is required when CDE-Counterparty 2 identifier type is FALSE (no LEI)',
      severity: 'ERROR',
      status: country ? 'PASS' : 'FAIL',
      actual: country,
      expected: 'ISO 3166-1 alpha-2 country code (e.g., AU)',
    };
  });

  // Rule 6: Country format check
  rules.push((r) =>
    formatCheck('ASIC-006', 'OthrCtrPty.Ctry', 'Counterparty',
      'Country of Counterparty 2 must be ISO 3166-1 alpha-2',
      r.fields.get('OthrCtrPty.Ctry'), ISO_COUNTRY_REGEX,
      'ISO 3166-1 alpha-2 (e.g., AU, US, GB)'));

  // Rule 7: Direction of Counterparty 1
  rules.push((r) =>
    allowedValues('ASIC-007', 'CtrPty1.Drctn', 'Counterparty',
      'Direction of Counterparty 1 must be BYER, SLLR, or not reported for basis products',
      r.fields.get('CtrPty1.Drctn'),
      ['BYER', 'SLLR']));

  // ═══════════════════════════════════════════════════════════════════
  // IDENTIFIER RULES (S1.3 Items 12–13 — UTI)
  // ═══════════════════════════════════════════════════════════════════

  // Rule 8: UTI is mandatory
  rules.push((r) =>
    mandatory('ASIC-008', 'UTI', 'Identifier',
      'Unique Transaction Identifier (UTI) is mandatory for all reports',
      r.fields.get('UTI')));

  // Rule 9: UTI format — LEI prefix (20 chars) + trade ID (up to 32 chars)
  rules.push((r) =>
    formatCheck('ASIC-009', 'UTI', 'Identifier',
      'UTI must consist of the LEI of the generating entity (20 chars) + unique trade ID (1-32 alphanumeric chars)',
      r.fields.get('UTI'), UTI_REGEX,
      'LEI prefix (20 chars) + trade suffix (1-32 alphanum), total 21-52 chars'));

  // Rule 10: UTI prefix must be a valid LEI
  rules.push((r) => {
    const uti = val(r.fields.get('UTI'));
    if (!uti || uti.length < 20) {
      return { ruleId: 'ASIC-010', field: 'UTI', category: 'Identifier',
        description: 'UTI prefix (first 20 characters) must be a valid LEI per ISO 17442',
        severity: 'WARNING', status: 'N/A', actual: uti, expected: 'Valid LEI as prefix' };
    }
    const prefix = uti.substring(0, 20);
    return {
      ruleId: 'ASIC-010',
      field: 'UTI',
      category: 'Identifier',
      description: 'UTI prefix (first 20 characters) must be a valid LEI per ISO 17442',
      severity: 'ERROR',
      status: LEI_REGEX.test(prefix) ? 'PASS' : 'FAIL',
      actual: prefix,
      expected: 'Valid LEI (18 alphanumeric + 2 check digits)',
    };
  });

  // ═══════════════════════════════════════════════════════════════════
  // PRODUCT RULES (S1.3 Items 14–19)
  // ═══════════════════════════════════════════════════════════════════

  // Rule 11: UPI — Mandatory for new trades
  rules.push((r) => {
    if (r.actionType && ['TERM', 'EROR', 'POSC'].includes(r.actionType)) {
      return { ruleId: 'ASIC-011', field: 'UPI', category: 'Product',
        description: 'UPI (ISO 4914) is mandatory for New, Modification, Correction, and Revive actions',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'N/A for exit actions' };
    }
    return mandatory('ASIC-011', 'UPI', 'Product',
      'UPI (ISO 4914) is mandatory for New, Modification, Correction, and Revive actions',
      r.fields.get('UPI'));
  });

  // Rule 12: UPI format — ISO 4914 (12 chars)
  rules.push((r) =>
    formatCheck('ASIC-012', 'UPI', 'Product',
      'UPI must conform to ISO 4914 format (12 alphanumeric characters)',
      r.fields.get('UPI'), UPI_REGEX,
      'ISO 4914: exactly 12 alphanumeric characters'));

  // Rule 13: Contract Type — allowable values
  rules.push((r) =>
    allowedValues('ASIC-013', 'CtrctTp', 'Product',
      'Contract Type must be a valid derivative contract type',
      r.fields.get('CtrctTp'),
      ['SWAP', 'OPTN', 'FUTR', 'FRAS', 'FORW', 'CFDS', 'OTHR', 'SWPT', 'SPRD']));

  // Rule 14: Asset Class — allowable values
  rules.push((r) =>
    allowedValues('ASIC-014', 'AsstClss', 'Product',
      'Asset Class must be one of the allowed ISDA taxonomy values',
      r.fields.get('AsstClss'),
      ['INTR', 'CRDT', 'EQUI', 'COMM', 'FREX', 'FORX', 'OTHR']));

  // ═══════════════════════════════════════════════════════════════════
  // DATE & TIMESTAMP RULES (S1.3 Items 20–29)
  // ═══════════════════════════════════════════════════════════════════

  // Rule 15: Execution Timestamp — Mandatory
  rules.push((r) => {
    if (r.actionType && ['TERM', 'EROR', 'POSC'].includes(r.actionType)) {
      return { ruleId: 'ASIC-015', field: 'ExctnTmStmp', category: 'Date & Timestamp',
        description: 'Execution Timestamp is mandatory for non-exit action types',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'N/A for exit actions' };
    }
    return mandatory('ASIC-015', 'ExctnTmStmp', 'Date & Timestamp',
      'Execution Timestamp is mandatory for non-exit action types',
      r.fields.get('ExctnTmStmp'));
  });

  // Rule 16: Execution Timestamp format — ISO 8601 DateTime
  rules.push((r) =>
    formatCheck('ASIC-016', 'ExctnTmStmp', 'Date & Timestamp',
      'Execution Timestamp must be in ISO 8601 DateTime format',
      r.fields.get('ExctnTmStmp'), ISO_DATETIME_REGEX,
      'ISO 8601: YYYY-MM-DDThh:mm:ss (with optional timezone)'));

  // Rule 17: Effective Date — Mandatory for non-exit actions
  rules.push((r) => {
    if (r.actionType && ['TERM', 'EROR', 'POSC'].includes(r.actionType)) {
      return { ruleId: 'ASIC-017', field: 'FctvDt', category: 'Date & Timestamp',
        description: 'Effective Date is mandatory for non-exit action types',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'N/A for exit actions' };
    }
    return mandatory('ASIC-017', 'FctvDt', 'Date & Timestamp',
      'Effective Date is mandatory for non-exit action types',
      r.fields.get('FctvDt'));
  });

  // Rule 18: Effective Date format
  rules.push((r) =>
    formatCheck('ASIC-018', 'FctvDt', 'Date & Timestamp',
      'Effective Date must be in ISO 8601 date format (YYYY-MM-DD)',
      r.fields.get('FctvDt'), ISO_DATE_REGEX,
      'ISO 8601: YYYY-MM-DD'));

  // Rule 19: Expiry Date format
  rules.push((r) =>
    formatCheck('ASIC-019', 'XpryDt', 'Date & Timestamp',
      'Expiry Date must be in ISO 8601 date format if provided',
      r.fields.get('XpryDt'), ISO_DATE_REGEX,
      'ISO 8601: YYYY-MM-DD'));

  // Rule 20: Maturity Date format
  rules.push((r) =>
    formatCheck('ASIC-020', 'MtrtyDt', 'Date & Timestamp',
      'Maturity Date must be in ISO 8601 date format if provided',
      r.fields.get('MtrtyDt'), ISO_DATE_REGEX,
      'ISO 8601: YYYY-MM-DD'));

  // Rule 21: Reporting Timestamp format
  rules.push((r) =>
    formatCheck('ASIC-021', 'RptgTmStmp', 'Date & Timestamp',
      'Reporting Timestamp must be in ISO 8601 DateTime format',
      r.fields.get('RptgTmStmp'), ISO_DATETIME_REGEX,
      'ISO 8601: YYYY-MM-DDThh:mm:ss'));

  // Rule 22: Maturity Date must be >= Effective Date
  rules.push((r) => {
    const eff = val(r.fields.get('FctvDt'));
    const mat = val(r.fields.get('MtrtyDt'));
    if (!eff || !mat) {
      return { ruleId: 'ASIC-022', field: 'MtrtyDt vs FctvDt', category: 'Date & Timestamp',
        description: 'Maturity Date must be on or after Effective Date',
        severity: 'WARNING', status: 'N/A', actual: `Eff: ${eff}, Mat: ${mat}`, expected: 'MtrtyDt >= FctvDt' };
    }
    return {
      ruleId: 'ASIC-022',
      field: 'MtrtyDt vs FctvDt',
      category: 'Date & Timestamp',
      description: 'Maturity Date must be on or after Effective Date',
      severity: 'ERROR',
      status: mat >= eff ? 'PASS' : 'FAIL',
      actual: `Effective: ${eff}, Maturity: ${mat}`,
      expected: 'Maturity Date >= Effective Date',
    };
  });

  // Rule 23: Expiry Date must be >= Effective Date
  rules.push((r) => {
    const eff = val(r.fields.get('FctvDt'));
    const exp = val(r.fields.get('XpryDt'));
    if (!eff || !exp) {
      return { ruleId: 'ASIC-023', field: 'XpryDt vs FctvDt', category: 'Date & Timestamp',
        description: 'Expiry Date must be on or after Effective Date',
        severity: 'WARNING', status: 'N/A', actual: `Eff: ${eff}, Exp: ${exp}`, expected: 'XpryDt >= FctvDt' };
    }
    return {
      ruleId: 'ASIC-023',
      field: 'XpryDt vs FctvDt',
      category: 'Date & Timestamp',
      description: 'Expiry Date must be on or after Effective Date',
      severity: 'ERROR',
      status: exp >= eff ? 'PASS' : 'FAIL',
      actual: `Effective: ${eff}, Expiry: ${exp}`,
      expected: 'Expiry Date >= Effective Date',
    };
  });

  // ═══════════════════════════════════════════════════════════════════
  // CLEARING & TRADING RULES (S1.3 Items 30–39)
  // ═══════════════════════════════════════════════════════════════════

  // Rule 24: Cleared status — Mandatory
  rules.push((r) => {
    if (r.actionType && ['TERM', 'EROR', 'POSC'].includes(r.actionType)) {
      return { ruleId: 'ASIC-024', field: 'Clrd', category: 'Clearing & Trading',
        description: 'Cleared status is mandatory for non-exit action types',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'N/A for exit actions' };
    }
    return allowedValues('ASIC-024', 'Clrd', 'Clearing & Trading',
      'Cleared status is mandatory: Y (Yes), N (No), or I (Intend to clear)',
      r.fields.get('Clrd'), ['Y', 'N', 'I']);
  });

  // Rule 25: CCP LEI required when cleared = Y
  rules.push((r) => {
    const cleared = val(r.fields.get('Clrd'));
    const ccpLei = val(r.fields.get('CCP.LEI'));
    if (cleared !== 'Y') {
      return { ruleId: 'ASIC-025', field: 'CCP.LEI', category: 'Clearing & Trading',
        description: 'CCP LEI is mandatory when Cleared = Y',
        severity: 'WARNING', status: 'N/A', actual: ccpLei, expected: 'Required only when Cleared = Y' };
    }
    return {
      ruleId: 'ASIC-025',
      field: 'CCP.LEI',
      category: 'Clearing & Trading',
      description: 'CCP LEI is mandatory when Cleared = Y',
      severity: 'ERROR',
      status: ccpLei ? 'PASS' : 'FAIL',
      actual: ccpLei,
      expected: 'Valid CCP LEI (ISO 17442)',
    };
  });

  // Rule 26: CCP LEI format
  rules.push((r) =>
    formatCheck('ASIC-026', 'CCP.LEI', 'Clearing & Trading',
      'CCP LEI must conform to ISO 17442 format',
      r.fields.get('CCP.LEI'), LEI_REGEX,
      'ISO 17442: 18 alphanumeric + 2 check digits'));

  // ═══════════════════════════════════════════════════════════════════
  // NOTIONAL AMOUNT RULES (S1.3 Items 40–49)
  // ═══════════════════════════════════════════════════════════════════

  // Rule 27: Notional Amount Leg 1 — Mandatory for non-exit
  rules.push((r) => {
    if (r.actionType && ['TERM', 'EROR', 'POSC'].includes(r.actionType)) {
      return { ruleId: 'ASIC-027', field: 'NtnlAmt1', category: 'Notional & Quantity',
        description: 'Notional Amount (Leg 1) is mandatory for non-exit actions',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'N/A for exit actions' };
    }
    return mandatory('ASIC-027', 'NtnlAmt1', 'Notional & Quantity',
      'Notional Amount (Leg 1) is mandatory for non-exit actions',
      r.fields.get('NtnlAmt1'));
  });

  // Rule 28: Notional Amount must be numeric
  rules.push((r) => {
    const v = val(r.fields.get('NtnlAmt1'));
    if (!v) {
      return { ruleId: 'ASIC-028', field: 'NtnlAmt1', category: 'Notional & Quantity',
        description: 'Notional Amount (Leg 1) must be a valid decimal number',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'Decimal number' };
    }
    return {
      ruleId: 'ASIC-028',
      field: 'NtnlAmt1',
      category: 'Notional & Quantity',
      description: 'Notional Amount (Leg 1) must be a valid decimal number',
      severity: 'ERROR',
      status: !isNaN(parseFloat(v)) ? 'PASS' : 'FAIL',
      actual: v,
      expected: 'Valid decimal number (e.g., 1000000.00)',
    };
  });

  // Rule 29: Notional Currency Leg 1 — Mandatory when notional provided
  rules.push((r) => {
    const amt = val(r.fields.get('NtnlAmt1'));
    const ccy = val(r.fields.get('NtnlCcy1'));
    if (!amt) {
      return { ruleId: 'ASIC-029', field: 'NtnlCcy1', category: 'Notional & Quantity',
        description: 'Notional Currency (Leg 1) is mandatory when Notional Amount is reported',
        severity: 'WARNING', status: 'N/A', actual: ccy, expected: 'Required with notional amount' };
    }
    return {
      ruleId: 'ASIC-029',
      field: 'NtnlCcy1',
      category: 'Notional & Quantity',
      description: 'Notional Currency (Leg 1) is mandatory when Notional Amount is reported',
      severity: 'ERROR',
      status: ccy ? 'PASS' : 'FAIL',
      actual: ccy,
      expected: 'ISO 4217 currency code (e.g., AUD, USD)',
    };
  });

  // Rule 30: Notional Currency format
  rules.push((r) =>
    formatCheck('ASIC-030', 'NtnlCcy1', 'Notional & Quantity',
      'Notional Currency (Leg 1) must be a valid ISO 4217 currency code',
      r.fields.get('NtnlCcy1'), ISO_CURRENCY_REGEX,
      'ISO 4217: 3-letter currency code'));

  // Rule 31: Notional Currency Leg 2 format (if provided)
  rules.push((r) =>
    formatCheck('ASIC-031', 'NtnlCcy2', 'Notional & Quantity',
      'Notional Currency (Leg 2) must be a valid ISO 4217 currency code if provided',
      r.fields.get('NtnlCcy2'), ISO_CURRENCY_REGEX,
      'ISO 4217: 3-letter currency code'));

  // Rule 32: Notional Amount Leg 2 must be numeric (if provided)
  rules.push((r) => {
    const v = val(r.fields.get('NtnlAmt2'));
    if (!v) {
      return { ruleId: 'ASIC-032', field: 'NtnlAmt2', category: 'Notional & Quantity',
        description: 'Notional Amount (Leg 2) must be a valid decimal number if provided',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'Decimal number' };
    }
    return {
      ruleId: 'ASIC-032',
      field: 'NtnlAmt2',
      category: 'Notional & Quantity',
      description: 'Notional Amount (Leg 2) must be a valid decimal number if provided',
      severity: 'ERROR',
      status: !isNaN(parseFloat(v)) ? 'PASS' : 'FAIL',
      actual: v,
      expected: 'Valid decimal number',
    };
  });

  // ═══════════════════════════════════════════════════════════════════
  // PRICE RULES (S1.3 Items 50–69)
  // ═══════════════════════════════════════════════════════════════════

  // Rule 33: Price must be numeric (if provided)
  rules.push((r) => {
    const v = val(r.fields.get('Pric'));
    if (!v) {
      return { ruleId: 'ASIC-033', field: 'Pric', category: 'Price',
        description: 'Price must be a valid decimal number if reported',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'Decimal number' };
    }
    return {
      ruleId: 'ASIC-033',
      field: 'Pric',
      category: 'Price',
      description: 'Price must be a valid decimal number if reported',
      severity: 'ERROR',
      status: !isNaN(parseFloat(v)) ? 'PASS' : 'FAIL',
      actual: v,
      expected: 'Valid decimal number',
    };
  });

  // Rule 34: Price Currency format
  rules.push((r) =>
    formatCheck('ASIC-034', 'PricCcy', 'Price',
      'Price Currency must be a valid ISO 4217 currency code if provided',
      r.fields.get('PricCcy'), ISO_CURRENCY_REGEX,
      'ISO 4217: 3-letter currency code'));

  // Rule 35: Strike Price must be numeric (if provided — options)
  rules.push((r) => {
    const v = val(r.fields.get('StrkPric'));
    if (!v) {
      return { ruleId: 'ASIC-035', field: 'StrkPric', category: 'Price',
        description: 'Strike Price must be a valid decimal number if reported (options)',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'Decimal number' };
    }
    return {
      ruleId: 'ASIC-035',
      field: 'StrkPric',
      category: 'Price',
      description: 'Strike Price must be a valid decimal number if reported (options)',
      severity: 'ERROR',
      status: !isNaN(parseFloat(v)) ? 'PASS' : 'FAIL',
      actual: v,
      expected: 'Valid decimal number',
    };
  });

  // Rule 36: Option Type allowable values
  rules.push((r) =>
    allowedValues('ASIC-036', 'OptnTp', 'Price',
      'Option Type must be CALL or PUTO if reported',
      r.fields.get('OptnTp'),
      ['CALL', 'PUTO', 'OTHR']));

  // Rule 37: Option Exercise Style allowable values
  rules.push((r) =>
    allowedValues('ASIC-037', 'OptnExrcStyle', 'Price',
      'Option Exercise Style must be one of the allowed values if reported',
      r.fields.get('OptnExrcStyle'),
      ['AMER', 'EURO', 'BERM', 'ASIA']));

  // ═══════════════════════════════════════════════════════════════════
  // ACTION & EVENT RULES
  // ═══════════════════════════════════════════════════════════════════

  // Rule 38: Action Type must be detected
  rules.push((r) => ({
    ruleId: 'ASIC-038',
    field: 'ActionType',
    category: 'Action & Event',
    description: 'Action type must be present as a Level 3 wrapper element (New, Mod, Crrctn, Termntn, ValtnUpd, Err, PrtOut, Rvv)',
    severity: 'ERROR',
    status: r.actionType ? 'PASS' : 'FAIL',
    actual: r.actionType,
    expected: 'One of: NEWT, MODI, CORR, TERM, VALU, EROR, POSC, REVI',
  }));

  // Rule 39: Event Type — allowable values (if provided)
  rules.push((r) => {
    const et = val(r.fields.get('EvtTp'));
    if (!et) {
      return { ruleId: 'ASIC-039', field: 'EvtTp', category: 'Action & Event',
        description: 'Event Type provides further detail on what triggered the action',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'Optional: TRAD, NOVA, COMP, ETRM, etc.' };
    }
    const allowed = ['TRAD', 'NOVA', 'COMP', 'ETRM', 'EXER', 'ALOC', 'CLRG',
      'CLAL', 'CREV', 'PTNG', 'UPDT', 'CPUP', 'INCP', 'CORP', 'OTHR'];
    return allowedValues('ASIC-039', 'EvtTp', 'Action & Event',
      'Event Type must be a valid CDE event type code',
      et, allowed);
  });

  // Rule 46: Action/Event cross-validation — NEWT allowed event types
  rules.push((r) => {
    const at = r.actionType;
    const et = val(r.fields.get('EvtTp'));
    if (!et || at !== 'NEWT') {
      return { ruleId: 'ASIC-046', field: 'EvtTp vs ActionType', category: 'Action & Event',
        description: 'When Action Type is NEWT, Event Type must be one of: TRAD, NOVA, COMP, CLRG, ALOC, INCP, UPDT',
        severity: 'WARNING', status: 'N/A', actual: `Action: ${at}, Event: ${et}`, expected: 'Applicable only to NEWT' };
    }
    const allowed = ['TRAD', 'NOVA', 'COMP', 'CLRG', 'ALOC', 'INCP', 'UPDT'];
    return {
      ruleId: 'ASIC-046',
      field: 'EvtTp vs ActionType',
      category: 'Action & Event',
      description: 'When Action Type is NEWT, Event Type must be one of: TRAD, NOVA, COMP, CLRG, ALOC, INCP, UPDT',
      severity: 'ERROR',
      status: allowed.includes(et) ? 'PASS' : 'FAIL',
      actual: `Action: ${at}, Event: ${et}`,
      expected: `One of: ${allowed.join(', ')}`,
    };
  });

  // Rule 47: UTI max length (52 characters)
  rules.push((r) => {
    const uti = val(r.fields.get('UTI'));
    if (!uti) {
      return { ruleId: 'ASIC-047', field: 'UTI', category: 'Identifier',
        description: 'UTI must not exceed 52 characters (ISO 23897)',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'Max 52 characters' };
    }
    return {
      ruleId: 'ASIC-047',
      field: 'UTI',
      category: 'Identifier',
      description: 'UTI must not exceed 52 characters (ISO 23897)',
      severity: 'ERROR',
      status: uti.length <= 52 ? 'PASS' : 'FAIL',
      actual: `${uti.length} characters`,
      expected: 'Max 52 characters',
    };
  });

  // Rule 48: Notional Amount Leg 1 must be non-negative
  rules.push((r) => {
    const v = val(r.fields.get('NtnlAmt1'));
    if (!v) {
      return { ruleId: 'ASIC-048', field: 'NtnlAmt1', category: 'Notional & Quantity',
        description: 'Notional Amount (Leg 1) must be non-negative (zero is permitted for reduced-to-zero contracts)',
        severity: 'WARNING', status: 'N/A', actual: null, expected: '>= 0' };
    }
    const num = parseFloat(v);
    return {
      ruleId: 'ASIC-048',
      field: 'NtnlAmt1',
      category: 'Notional & Quantity',
      description: 'Notional Amount (Leg 1) must be non-negative (zero is permitted for reduced-to-zero contracts)',
      severity: 'ERROR',
      status: !isNaN(num) && num >= 0 ? 'PASS' : 'FAIL',
      actual: v,
      expected: 'Decimal >= 0',
    };
  });

  // Rule 49: Reporting Timestamp must be >= Execution Timestamp
  rules.push((r) => {
    const exec = val(r.fields.get('ExctnTmStmp'));
    const rptg = val(r.fields.get('RptgTmStmp'));
    if (!exec || !rptg) {
      return { ruleId: 'ASIC-049', field: 'RptgTmStmp vs ExctnTmStmp', category: 'Date & Timestamp',
        description: 'Reporting Timestamp must be on or after Execution Timestamp',
        severity: 'WARNING', status: 'N/A', actual: `Exec: ${exec}, Rptg: ${rptg}`, expected: 'RptgTmStmp >= ExctnTmStmp' };
    }
    return {
      ruleId: 'ASIC-049',
      field: 'RptgTmStmp vs ExctnTmStmp',
      category: 'Date & Timestamp',
      description: 'Reporting Timestamp must be on or after Execution Timestamp',
      severity: 'ERROR',
      status: rptg >= exec ? 'PASS' : 'FAIL',
      actual: `Execution: ${exec}, Reporting: ${rptg}`,
      expected: 'Reporting Timestamp >= Execution Timestamp',
    };
  });

  // Rule 50: Option type is mandatory when contract type is OPTN
  rules.push((r) => {
    const ct = val(r.fields.get('CtrctTp'));
    const ot = val(r.fields.get('OptnTp'));
    if (ct !== 'OPTN') {
      return { ruleId: 'ASIC-050', field: 'OptnTp', category: 'Price',
        description: 'Option Type (CALL/PUTO) is mandatory when Contract Type is OPTN',
        severity: 'WARNING', status: 'N/A', actual: ot, expected: 'Applicable only when CtrctTp = OPTN' };
    }
    return {
      ruleId: 'ASIC-050',
      field: 'OptnTp',
      category: 'Price',
      description: 'Option Type (CALL/PUTO) is mandatory when Contract Type is OPTN',
      severity: 'ERROR',
      status: ot ? 'PASS' : 'FAIL',
      actual: ot,
      expected: 'CALL or PUTO',
    };
  });

  // ═══════════════════════════════════════════════════════════════════
  // COLLATERAL RULES (S1.3 Table S1.1(3))
  // ═══════════════════════════════════════════════════════════════════

  // Rule 40: Collateral amounts must be numeric
  rules.push((r) => {
    const v = val(r.fields.get('Coll.InitlMrgnPstd'));
    if (!v) {
      return { ruleId: 'ASIC-040', field: 'Coll.InitlMrgnPstd', category: 'Collateral',
        description: 'Initial Margin Posted must be a valid decimal number if reported',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'Decimal number' };
    }
    return {
      ruleId: 'ASIC-040',
      field: 'Coll.InitlMrgnPstd',
      category: 'Collateral',
      description: 'Initial Margin Posted must be a valid decimal number if reported',
      severity: 'ERROR',
      status: !isNaN(parseFloat(v)) ? 'PASS' : 'FAIL',
      actual: v,
      expected: 'Valid decimal number',
    };
  });

  // Rule 41: Variation Margin numeric check
  rules.push((r) => {
    const v = val(r.fields.get('Coll.VartnMrgnPstd'));
    if (!v) {
      return { ruleId: 'ASIC-041', field: 'Coll.VartnMrgnPstd', category: 'Collateral',
        description: 'Variation Margin Posted must be a valid decimal number if reported',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'Decimal number' };
    }
    return {
      ruleId: 'ASIC-041',
      field: 'Coll.VartnMrgnPstd',
      category: 'Collateral',
      description: 'Variation Margin Posted must be a valid decimal number if reported',
      severity: 'ERROR',
      status: !isNaN(parseFloat(v)) ? 'PASS' : 'FAIL',
      actual: v,
      expected: 'Valid decimal number',
    };
  });

  // ═══════════════════════════════════════════════════════════════════
  // VALUATION RULES (S1.3 Table S1.1(2))
  // ═══════════════════════════════════════════════════════════════════

  // Rule 42: Valuation amount numeric check
  rules.push((r) => {
    const v = val(r.fields.get('Valtn.Amt'));
    if (!v) {
      return { ruleId: 'ASIC-042', field: 'Valtn.Amt', category: 'Valuation',
        description: 'Mark-to-Market valuation amount must be a valid decimal if reported',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'Decimal number' };
    }
    return {
      ruleId: 'ASIC-042',
      field: 'Valtn.Amt',
      category: 'Valuation',
      description: 'Mark-to-Market valuation amount must be a valid decimal if reported',
      severity: 'ERROR',
      status: !isNaN(parseFloat(v)) ? 'PASS' : 'FAIL',
      actual: v,
      expected: 'Valid decimal number',
    };
  });

  // Rule 43: Valuation currency format
  rules.push((r) =>
    formatCheck('ASIC-043', 'Valtn.Ccy', 'Valuation',
      'Valuation Currency must be a valid ISO 4217 currency code if reported',
      r.fields.get('Valtn.Ccy'), ISO_CURRENCY_REGEX,
      'ISO 4217: 3-letter currency code'));

  // Rule 44: Valuation timestamp format
  rules.push((r) =>
    formatCheck('ASIC-044', 'Valtn.TmStmp', 'Valuation',
      'Valuation Timestamp must be ISO 8601 DateTime format if reported',
      r.fields.get('Valtn.TmStmp'), ISO_DATETIME_REGEX,
      'ISO 8601: YYYY-MM-DDThh:mm:ss'));

  // Rule 45: Delta must be between -1 and 1 (if provided)
  rules.push((r) => {
    const v = val(r.fields.get('Valtn.Dlt'));
    if (!v) {
      return { ruleId: 'ASIC-045', field: 'Valtn.Dlt', category: 'Valuation',
        description: 'Delta must be a decimal between -1 and 1 if reported (for option derivatives)',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'Decimal -1 to 1' };
    }
    const num = parseFloat(v);
    return {
      ruleId: 'ASIC-045',
      field: 'Valtn.Dlt',
      category: 'Valuation',
      description: 'Delta must be a decimal between -1 and 1 if reported (for option derivatives)',
      severity: 'ERROR',
      status: !isNaN(num) && num >= -1 && num <= 1 ? 'PASS' : 'FAIL',
      actual: v,
      expected: 'Decimal value between -1.0 and 1.0',
    };
  });

  // ═══════════════════════════════════════════════════════════════════
  // ADDITIONAL RULES (Gap analysis — ASIC Schedule 1 coverage)
  // ═══════════════════════════════════════════════════════════════════

  // Rule 51: Prior UTI format (if provided)
  rules.push((r) => {
    const v = val(r.fields.get('PrrUTI'));
    if (!v) {
      return { ruleId: 'ASIC-051', field: 'PrrUTI', category: 'Identifier',
        description: 'Prior UTI must conform to UTI format if provided (LEI prefix + suffix)',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'UTI format if provided' };
    }
    return {
      ruleId: 'ASIC-051', field: 'PrrUTI', category: 'Identifier',
      description: 'Prior UTI must conform to UTI format if provided (LEI prefix + suffix)',
      severity: 'ERROR',
      status: UTI_REGEX.test(v) ? 'PASS' : 'FAIL',
      actual: v,
      expected: 'LEI prefix (20 chars) + trade suffix (1-32 alphanum)',
    };
  });

  // Rule 52: Execution Venue — MIC code format (ISO 10383)
  const MIC_REGEX = /^[A-Z0-9]{4}$/;
  rules.push((r) =>
    formatCheck('ASIC-052', 'ExctnVn', 'Clearing & Trading',
      'Execution Venue must be a valid MIC code (ISO 10383) if reported',
      r.fields.get('ExctnVn'), MIC_REGEX,
      'ISO 10383: 4-character MIC code (e.g., XASX)'));

  // Rule 53: Master Agreement Type — allowable values
  rules.push((r) =>
    allowedValues('ASIC-053', 'MstrAgrmt.Tp', 'Clearing & Trading',
      'Master Agreement Type must be a recognised agreement type if reported',
      r.fields.get('MstrAgrmt.Tp'),
      ['ISDA', 'CMOF', 'DERV', 'CNMA', 'GMRA', 'GMSLA', 'OTHR']));

  // Rule 54: Notional Amount required when Currency is reported
  rules.push((r) => {
    const amt = val(r.fields.get('NtnlAmt1'));
    const ccy = val(r.fields.get('NtnlCcy1'));
    if (!ccy) {
      return { ruleId: 'ASIC-054', field: 'NtnlAmt1 vs NtnlCcy1', category: 'Notional & Quantity',
        description: 'Notional Amount and Currency must be reported together',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'Both or neither' };
    }
    return {
      ruleId: 'ASIC-054', field: 'NtnlAmt1 vs NtnlCcy1', category: 'Notional & Quantity',
      description: 'Notional Amount and Currency must be reported together',
      severity: 'ERROR',
      status: amt ? 'PASS' : 'FAIL',
      actual: `Amount: ${amt}, Currency: ${ccy}`,
      expected: 'Both notional amount and currency must be present',
    };
  });

  // Rule 55: Strike Price Currency — ISO 4217
  rules.push((r) =>
    formatCheck('ASIC-055', 'StrkPricCcy', 'Price',
      'Strike Price Currency must be a valid ISO 4217 currency code if reported',
      r.fields.get('StrkPricCcy'), ISO_CURRENCY_REGEX,
      'ISO 4217: 3-letter currency code'));

  // Rule 56: Product Classification (CFI) — 6-character format
  const CFI_REGEX = /^[A-Z]{6}$/;
  rules.push((r) =>
    formatCheck('ASIC-056', 'PdctClssfctn', 'Product',
      'Product Classification (CFI code) must be 6 alphabetic characters if reported',
      r.fields.get('PdctClssfctn'), CFI_REGEX,
      'ISO 10962: 6 uppercase letters (e.g., SRACSP)'));

  // Rule 57: Beneficiary LEI — ISO 17442 format
  rules.push((r) =>
    formatCheck('ASIC-057', 'Bnfcry.LEI', 'Counterparty',
      'Beneficiary LEI must conform to ISO 17442 format if reported',
      r.fields.get('Bnfcry.LEI'), LEI_REGEX,
      'ISO 17442: 18 alphanumeric + 2 check digits'));

  // Rule 58: Counterparty 2 Direction — allowable values
  rules.push((r) =>
    allowedValues('ASIC-058', 'CtrPty2.Drctn', 'Counterparty',
      'Direction of Counterparty 2 must be BYER or SLLR if reported',
      r.fields.get('CtrPty2.Drctn'),
      ['BYER', 'SLLR']));

  // Rule 59: Delivery Type — allowable values
  rules.push((r) =>
    allowedValues('ASIC-059', 'DlvryTp', 'Clearing & Trading',
      'Delivery Type must be CASH, PHYS, or OPTL if reported',
      r.fields.get('DlvryTp'),
      ['CASH', 'PHYS', 'OPTL']));

  // Rule 60: Initial Margin Received — numeric check
  rules.push((r) => {
    const v = val(r.fields.get('Coll.InitlMrgnRcvd'));
    if (!v) {
      return { ruleId: 'ASIC-060', field: 'Coll.InitlMrgnRcvd', category: 'Collateral',
        description: 'Initial Margin Received must be a valid decimal number if reported',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'Decimal number' };
    }
    return {
      ruleId: 'ASIC-060', field: 'Coll.InitlMrgnRcvd', category: 'Collateral',
      description: 'Initial Margin Received must be a valid decimal number if reported',
      severity: 'ERROR',
      status: !isNaN(parseFloat(v)) ? 'PASS' : 'FAIL',
      actual: v, expected: 'Valid decimal number',
    };
  });

  // Rule 61: Variation Margin Received — numeric check
  rules.push((r) => {
    const v = val(r.fields.get('Coll.VartnMrgnRcvd'));
    if (!v) {
      return { ruleId: 'ASIC-061', field: 'Coll.VartnMrgnRcvd', category: 'Collateral',
        description: 'Variation Margin Received must be a valid decimal number if reported',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'Decimal number' };
    }
    return {
      ruleId: 'ASIC-061', field: 'Coll.VartnMrgnRcvd', category: 'Collateral',
      description: 'Variation Margin Received must be a valid decimal number if reported',
      severity: 'ERROR',
      status: !isNaN(parseFloat(v)) ? 'PASS' : 'FAIL',
      actual: v, expected: 'Valid decimal number',
    };
  });

  // Rule 62: Valuation Method — allowable values
  rules.push((r) =>
    allowedValues('ASIC-062', 'Valtn.Mthd', 'Valuation',
      'Valuation Method must be MTOM (mark-to-market), MTMD (mark-to-model), or CCPV (CCP valuation) if reported',
      r.fields.get('Valtn.Mthd'),
      ['MTOM', 'MTMD', 'CCPV']));

  // Rule 63: Package Identifier — non-empty if element present
  rules.push((r) => {
    const v = r.fields.get('PckgId');
    if (v === null || v === undefined) {
      return { ruleId: 'ASIC-063', field: 'PckgId', category: 'Action & Event',
        description: 'Package Identifier must be non-empty if the element is present',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'Non-empty if present' };
    }
    return {
      ruleId: 'ASIC-063', field: 'PckgId', category: 'Action & Event',
      description: 'Package Identifier must be non-empty if the element is present',
      severity: 'ERROR',
      status: v.trim() !== '' ? 'PASS' : 'FAIL',
      actual: v || null, expected: 'Non-empty string',
    };
  });

  // Rule 64: Option Exercise Style mandatory when Contract Type is OPTN
  rules.push((r) => {
    const ct = val(r.fields.get('CtrctTp'));
    const es = val(r.fields.get('OptnExrcStyle'));
    if (ct !== 'OPTN') {
      return { ruleId: 'ASIC-064', field: 'OptnExrcStyle', category: 'Price',
        description: 'Option Exercise Style is mandatory when Contract Type is OPTN',
        severity: 'WARNING', status: 'N/A', actual: es, expected: 'Applicable only when CtrctTp = OPTN' };
    }
    return {
      ruleId: 'ASIC-064', field: 'OptnExrcStyle', category: 'Price',
      description: 'Option Exercise Style is mandatory when Contract Type is OPTN',
      severity: 'ERROR',
      status: es ? 'PASS' : 'FAIL',
      actual: es, expected: 'AMER, EURO, BERM, or ASIA',
    };
  });

  // Rule 65: Spread Leg 1 — numeric check
  rules.push((r) => {
    const v = val(r.fields.get('Sprd1'));
    if (!v) {
      return { ruleId: 'ASIC-065', field: 'Sprd1', category: 'Price',
        description: 'Spread (Leg 1) must be a valid decimal number if reported',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'Decimal number' };
    }
    return {
      ruleId: 'ASIC-065', field: 'Sprd1', category: 'Price',
      description: 'Spread (Leg 1) must be a valid decimal number if reported',
      severity: 'ERROR',
      status: !isNaN(parseFloat(v)) ? 'PASS' : 'FAIL',
      actual: v, expected: 'Valid decimal number',
    };
  });

  // Rule 66: Spread Leg 2 — numeric check
  rules.push((r) => {
    const v = val(r.fields.get('Sprd2'));
    if (!v) {
      return { ruleId: 'ASIC-066', field: 'Sprd2', category: 'Price',
        description: 'Spread (Leg 2) must be a valid decimal number if reported',
        severity: 'WARNING', status: 'N/A', actual: null, expected: 'Decimal number' };
    }
    return {
      ruleId: 'ASIC-066', field: 'Sprd2', category: 'Price',
      description: 'Spread (Leg 2) must be a valid decimal number if reported',
      severity: 'ERROR',
      status: !isNaN(parseFloat(v)) ? 'PASS' : 'FAIL',
      actual: v, expected: 'Valid decimal number',
    };
  });

  return rules;
}

/**
 * Run all ASIC validation rules against a parsed derivative trade report.
 */
export function validateReport(report: ParsedReport): ValidationResult[] {
  const rules = buildRules();
  return rules.map((fn) => fn(report));
}
