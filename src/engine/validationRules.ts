/**
 * ASIC Derivative Transaction Rules (Reporting) 2024
 * Validation rules derived from Schedule 1 Technical Guidance (v1.1, Feb 2025)
 * and the ASIC ISO 20022 Mapping Document (v1.1, Feb 2025).
 *
 * Reference: auth.030.001.04 — DerivativesTradeReportV04
 *
 * 130 rules covering:
 *  - Counterparty & Entity (ASIC-001 to ASIC-020)
 *  - Identifier (ASIC-021 to ASIC-030)
 *  - Product (ASIC-031 to ASIC-040)
 *  - Date & Timestamp (ASIC-041 to ASIC-055)
 *  - Clearing & Trading (ASIC-056 to ASIC-065)
 *  - Notional & Quantity (ASIC-066 to ASIC-078)
 *  - Price (ASIC-079 to ASIC-095)
 *  - Valuation (ASIC-096 to ASIC-105)
 *  - Action & Event (ASIC-106 to ASIC-118)
 *  - Collateral (ASIC-119 to ASIC-124)
 *  - Package (ASIC-125 to ASIC-130)
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
  | 'Package'
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
const MIC_REGEX = /^[A-Z0-9]{4}$/;

const EXIT_ACTIONS = ['TERM', 'EROR'];

// VALU actions require identifiers + valuation data but NOT full product/trade data.
// Per ASIC Mapping Document v1.1: product/trade fields are C (conditional) for VALU.
const REDUCED_DATA_ACTIONS = ['VALU'];

function val(v: string | null | undefined): string | null {
  return v && v.trim() !== '' ? v.trim() : null;
}

function isExitAction(actionType: string | null): boolean {
  return !!actionType && EXIT_ACTIONS.includes(actionType);
}

function isReducedAction(actionType: string | null): boolean {
  return !!actionType && REDUCED_DATA_ACTIONS.includes(actionType);
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

function conditionalMandatory(
  ruleId: string,
  field: string,
  category: RuleCategory,
  description: string,
  value: string | null | undefined,
  actionType: string | null,
  naMessage: string = 'N/A for exit actions',
): ValidationResult {
  if (isExitAction(actionType)) {
    return { ruleId, field, category, description,
      severity: 'WARNING', status: 'N/A', actual: val(value), expected: naMessage };
  }
  if (isReducedAction(actionType)) {
    const v = val(value);
    return { ruleId, field, category, description,
      severity: 'WARNING', status: v ? 'PASS' : 'N/A', actual: v,
      expected: 'Conditional for VALU actions' };
  }
  return mandatory(ruleId, field, category, description, value);
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

function numericCheck(
  ruleId: string,
  field: string,
  category: RuleCategory,
  description: string,
  value: string | null | undefined,
): ValidationResult {
  const v = val(value);
  if (!v) {
    return { ruleId, field, category, description, severity: 'WARNING', status: 'N/A', actual: null, expected: 'Decimal number' };
  }
  return {
    ruleId, field, category, description,
    severity: 'ERROR',
    status: !isNaN(parseFloat(v)) && isFinite(Number(v)) ? 'PASS' : 'FAIL',
    actual: v,
    expected: 'Valid decimal number',
  };
}

function na(
  ruleId: string,
  field: string,
  category: RuleCategory,
  description: string,
  actual: string | null,
  expected: string,
): ValidationResult {
  return { ruleId, field, category, description, severity: 'WARNING', status: 'N/A', actual, expected };
}

// ─── Category-based rule builders ───────────────────────────────────

function buildCounterpartyRules(): RuleFn[] {
  const rules: RuleFn[] = [];

  // ASIC-001: Reporting Entity LEI — Mandatory
  rules.push((r) =>
    mandatory('ASIC-001', 'NttyRspnsblForRpt.LEI', 'Counterparty',
      'Entity Responsible for Reporting LEI is mandatory per Rule S1.3.1(2)',
      r.fields.get('NttyRspnsblForRpt.LEI')));

  // ASIC-002: Reporting Entity LEI format
  rules.push((r) =>
    formatCheck('ASIC-002', 'NttyRspnsblForRpt.LEI', 'Counterparty',
      'Entity Responsible for Reporting LEI must conform to ISO 17442',
      r.fields.get('NttyRspnsblForRpt.LEI'), LEI_REGEX,
      'ISO 17442: 18 alphanumeric + 2 check digits'));

  // ASIC-003: Reporting Counterparty (CP1) LEI — Mandatory
  rules.push((r) =>
    mandatory('ASIC-003', 'RptgCtrPty.LEI', 'Counterparty',
      'Reporting Counterparty (CP1) LEI is mandatory',
      r.fields.get('RptgCtrPty.LEI')));

  // ASIC-004: CP1 LEI format
  rules.push((r) =>
    formatCheck('ASIC-004', 'RptgCtrPty.LEI', 'Counterparty',
      'Reporting Counterparty LEI must conform to ISO 17442 format',
      r.fields.get('RptgCtrPty.LEI'), LEI_REGEX,
      'ISO 17442: 18 alphanumeric + 2 check digits (e.g., 5493001KJTIIGC8Y1R12)'));

  // ASIC-005: CP2 Identifier — Mandatory (LEI or Proprietary)
  rules.push((r) => {
    const lei = val(r.fields.get('OthrCtrPty.LEI'));
    const prtry = val(r.fields.get('OthrCtrPty.PrtryId'));
    const hasId = !!lei || !!prtry;
    return {
      ruleId: 'ASIC-005', field: 'OthrCtrPty.Id', category: 'Counterparty',
      description: 'Counterparty 2 must be identified by LEI, Designated Business Identifier, or Client Code',
      severity: 'ERROR',
      status: hasId ? 'PASS' : 'FAIL',
      actual: lei ?? prtry ?? null,
      expected: 'LEI (ISO 17442) or Proprietary identifier',
    };
  });

  // ASIC-006: CP2 LEI format (if provided)
  rules.push((r) =>
    formatCheck('ASIC-006', 'OthrCtrPty.LEI', 'Counterparty',
      'Counterparty 2 LEI must conform to ISO 17442 if provided',
      r.fields.get('OthrCtrPty.LEI'), LEI_REGEX,
      'ISO 17442: 18 alphanumeric + 2 check digits'));

  // ASIC-007: Country of CP2 — Conditional (required when no LEI)
  rules.push((r) => {
    const lei = val(r.fields.get('OthrCtrPty.LEI'));
    const country = val(r.fields.get('OthrCtrPty.Ctry'));
    if (lei) {
      return na('ASIC-007', 'OthrCtrPty.Ctry', 'Counterparty',
        'Country of Counterparty 2 is required when CP2 has no LEI',
        country, 'ISO 3166-1 alpha-2 (conditional)');
    }
    return {
      ruleId: 'ASIC-007', field: 'OthrCtrPty.Ctry', category: 'Counterparty',
      description: 'Country of Counterparty 2 is required when CP2 has no LEI',
      severity: 'ERROR',
      status: country ? 'PASS' : 'FAIL',
      actual: country, expected: 'ISO 3166-1 alpha-2 country code (e.g., AU)',
    };
  });

  // ASIC-008: CP2 Country format
  rules.push((r) =>
    formatCheck('ASIC-008', 'OthrCtrPty.Ctry', 'Counterparty',
      'Country of Counterparty 2 must be ISO 3166-1 alpha-2',
      r.fields.get('OthrCtrPty.Ctry'), ISO_COUNTRY_REGEX,
      'ISO 3166-1 alpha-2 (e.g., AU, US, GB)'));

  // ASIC-009: CP1 != CP2
  rules.push((r) => {
    const cp1 = val(r.fields.get('RptgCtrPty.LEI'));
    const cp2 = val(r.fields.get('OthrCtrPty.LEI'));
    if (!cp1 || !cp2) {
      return na('ASIC-009', 'RptgCtrPty.LEI vs OthrCtrPty.LEI', 'Counterparty',
        'Reporting Counterparty and Counterparty 2 must not be the same entity',
        `CP1: ${cp1}, CP2: ${cp2}`, 'CP1 LEI != CP2 LEI');
    }
    return {
      ruleId: 'ASIC-009', field: 'RptgCtrPty.LEI vs OthrCtrPty.LEI', category: 'Counterparty',
      description: 'Reporting Counterparty and Counterparty 2 must not be the same entity',
      severity: 'ERROR',
      status: cp1 !== cp2 ? 'PASS' : 'FAIL',
      actual: `CP1: ${cp1}, CP2: ${cp2}`,
      expected: 'CP1 LEI != CP2 LEI',
    };
  });

  // ASIC-010: Beneficiary LEI format (if provided)
  rules.push((r) =>
    formatCheck('ASIC-010', 'Bnfcry.LEI', 'Counterparty',
      'Beneficiary LEI must conform to ISO 17442 if provided',
      r.fields.get('Bnfcry.LEI'), LEI_REGEX,
      'ISO 17442: 18 alphanumeric + 2 check digits'));

  // ASIC-011: Broker LEI format (if provided)
  rules.push((r) =>
    formatCheck('ASIC-011', 'Brkr.LEI', 'Counterparty',
      'Broker LEI must conform to ISO 17442 if provided',
      r.fields.get('Brkr.LEI'), LEI_REGEX,
      'ISO 17442: 18 alphanumeric + 2 check digits'));

  // ASIC-012: Execution Agent LEI format (if provided)
  rules.push((r) =>
    formatCheck('ASIC-012', 'ExctnAgt.LEI', 'Counterparty',
      'Execution Agent LEI must conform to ISO 17442 if provided',
      r.fields.get('ExctnAgt.LEI'), LEI_REGEX,
      'ISO 17442: 18 alphanumeric + 2 check digits'));

  // ASIC-013: Clearing Member LEI format (if provided)
  rules.push((r) =>
    formatCheck('ASIC-013', 'ClrMmb.LEI', 'Counterparty',
      'Clearing Member LEI must conform to ISO 17442 if provided',
      r.fields.get('ClrMmb.LEI'), LEI_REGEX,
      'ISO 17442: 18 alphanumeric + 2 check digits'));

  // ASIC-014: Submitting Agent LEI — Mandatory
  rules.push((r) =>
    mandatory('ASIC-014', 'SubmitgAgt.LEI', 'Counterparty',
      'Submitting Agent LEI is mandatory',
      r.fields.get('SubmitgAgt.LEI')));

  // ASIC-015: Submitting Agent LEI format
  rules.push((r) =>
    formatCheck('ASIC-015', 'SubmitgAgt.LEI', 'Counterparty',
      'Submitting Agent LEI must conform to ISO 17442',
      r.fields.get('SubmitgAgt.LEI'), LEI_REGEX,
      'ISO 17442: 18 alphanumeric + 2 check digits'));

  // ASIC-016: Direction — CtrPtySd allowable values
  rules.push((r) =>
    allowedValues('ASIC-016', 'CtrPtySd', 'Counterparty',
      'Counterparty Side must be BYER or SLLR if reported',
      r.fields.get('CtrPtySd'),
      ['BYER', 'SLLR']));

  // ASIC-017: Direction Leg 1 allowable values
  rules.push((r) =>
    allowedValues('ASIC-017', 'DrctnLeg1', 'Counterparty',
      'Direction of First Leg must be BYER, SLLR, MAKE, or TAKE if reported',
      r.fields.get('DrctnLeg1'),
      ['BYER', 'SLLR', 'MAKE', 'TAKE']));

  // ASIC-018: Direction Leg 2 allowable values
  rules.push((r) =>
    allowedValues('ASIC-018', 'DrctnLeg2', 'Counterparty',
      'Direction of Second Leg must be BYER, SLLR, MAKE, or TAKE if reported',
      r.fields.get('DrctnLeg2'),
      ['BYER', 'SLLR', 'MAKE', 'TAKE']));

  // ASIC-019: Nature of Reporting CP allowable values
  rules.push((r) =>
    allowedValues('ASIC-019', 'RptgCtrPty.Ntr', 'Counterparty',
      'Nature of Reporting Counterparty must be F (Financial) or N (Non-financial)',
      r.fields.get('RptgCtrPty.Ntr'),
      ['F', 'N']));

  // ASIC-020: Directly Linked to Commercial Activity — allowable values
  rules.push((r) =>
    allowedValues('ASIC-020', 'RptgCtrPty.DrclyLkdActvty', 'Counterparty',
      'Directly linked to commercial activity must be true or false',
      r.fields.get('RptgCtrPty.DrclyLkdActvty'),
      ['true', 'false']));

  return rules;
}

function buildIdentifierRules(): RuleFn[] {
  const rules: RuleFn[] = [];

  // ASIC-021: UTI is mandatory
  rules.push((r) =>
    mandatory('ASIC-021', 'UTI', 'Identifier',
      'Unique Transaction Identifier (UTI) is mandatory for all reports',
      r.fields.get('UTI')));

  // ASIC-022: UTI format
  rules.push((r) =>
    formatCheck('ASIC-022', 'UTI', 'Identifier',
      'UTI must consist of LEI prefix (20 chars) + unique trade ID (1-32 alphanum chars)',
      r.fields.get('UTI'), UTI_REGEX,
      'LEI prefix (20 chars) + trade suffix (1-32 alphanum), total 21-52 chars'));

  // ASIC-023: UTI prefix must be a valid LEI
  rules.push((r) => {
    const uti = val(r.fields.get('UTI'));
    if (!uti || uti.length < 20) {
      return na('ASIC-023', 'UTI', 'Identifier',
        'UTI prefix (first 20 characters) must be a valid LEI per ISO 17442',
        uti, 'Valid LEI as prefix');
    }
    const prefix = uti.substring(0, 20);
    return {
      ruleId: 'ASIC-023', field: 'UTI', category: 'Identifier',
      description: 'UTI prefix (first 20 characters) must be a valid LEI per ISO 17442',
      severity: 'ERROR',
      status: LEI_REGEX.test(prefix) ? 'PASS' : 'FAIL',
      actual: prefix,
      expected: 'Valid LEI (18 alphanumeric + 2 check digits)',
    };
  });

  // ASIC-024: UTI max length (52 characters)
  rules.push((r) => {
    const uti = val(r.fields.get('UTI'));
    if (!uti) {
      return na('ASIC-024', 'UTI', 'Identifier',
        'UTI must not exceed 52 characters (ISO 23897)', null, 'Max 52 characters');
    }
    return {
      ruleId: 'ASIC-024', field: 'UTI', category: 'Identifier',
      description: 'UTI must not exceed 52 characters (ISO 23897)',
      severity: 'ERROR',
      status: uti.length <= 52 ? 'PASS' : 'FAIL',
      actual: `${uti.length} characters`,
      expected: 'Max 52 characters',
    };
  });

  // ASIC-025: Prior UTI mandatory only for NEWT + ALOC (allocation)
  rules.push((r) => {
    if (r.actionType !== 'NEWT' || r.fields.get('EvtTp') !== 'ALOC') {
      return na('ASIC-025', 'PrrUTI', 'Identifier',
        'Prior UTI is mandatory when Action Type = NEWT and Event Type = ALOC',
        val(r.fields.get('PrrUTI')), 'Required only for NEWT + ALOC');
    }
    return mandatory('ASIC-025', 'PrrUTI', 'Identifier',
      'Prior UTI is mandatory when Action Type = NEWT and Event Type = ALOC',
      r.fields.get('PrrUTI'));
  });

  // ASIC-026: Prior UTI format
  rules.push((r) =>
    formatCheck('ASIC-026', 'PrrUTI', 'Identifier',
      'Prior UTI must follow the same format as UTI if provided',
      r.fields.get('PrrUTI'), UTI_REGEX,
      'LEI prefix (20 chars) + trade suffix (1-32 alphanum)'));

  // ASIC-027: UTI != Prior UTI
  rules.push((r) => {
    const uti = val(r.fields.get('UTI'));
    const prrUti = val(r.fields.get('PrrUTI'));
    if (!uti || !prrUti) {
      return na('ASIC-027', 'UTI vs PrrUTI', 'Identifier',
        'UTI and Prior UTI must be different',
        `UTI: ${uti}, Prior: ${prrUti}`, 'UTI != PrrUTI');
    }
    return {
      ruleId: 'ASIC-027', field: 'UTI vs PrrUTI', category: 'Identifier',
      description: 'UTI and Prior UTI must be different',
      severity: 'ERROR',
      status: uti !== prrUti ? 'PASS' : 'FAIL',
      actual: `UTI: ${uti}, Prior: ${prrUti}`,
      expected: 'UTI != Prior UTI',
    };
  });

  // ASIC-028: Event ID format check (if provided)
  rules.push((r) => {
    const evtId = val(r.fields.get('EvtId'));
    if (!evtId) {
      return na('ASIC-028', 'EvtId', 'Identifier',
        'Event Identifier must be non-empty if reported', null, 'Non-empty string');
    }
    return {
      ruleId: 'ASIC-028', field: 'EvtId', category: 'Identifier',
      description: 'Event Identifier must be non-empty if reported',
      severity: 'ERROR',
      status: evtId.length > 0 && evtId.length <= 52 ? 'PASS' : 'FAIL',
      actual: `${evtId.length} characters`,
      expected: 'Non-empty, max 52 characters',
    };
  });

  // ASIC-029: Secondary TX ID format (if provided)
  rules.push((r) => {
    const stxId = val(r.fields.get('ScndryTxId'));
    if (!stxId) {
      return na('ASIC-029', 'ScndryTxId', 'Identifier',
        'Secondary Transaction ID must not exceed 72 characters if provided',
        null, 'Max 72 characters');
    }
    return {
      ruleId: 'ASIC-029', field: 'ScndryTxId', category: 'Identifier',
      description: 'Secondary Transaction ID must not exceed 72 characters if provided',
      severity: 'ERROR',
      status: stxId.length <= 72 ? 'PASS' : 'FAIL',
      actual: `${stxId.length} characters`,
      expected: 'Max 72 characters',
    };
  });

  // ASIC-030: UTI must contain only allowed characters
  rules.push((r) => {
    const uti = val(r.fields.get('UTI'));
    if (!uti) {
      return na('ASIC-030', 'UTI', 'Identifier',
        'UTI must contain only uppercase letters, digits, and allowed special characters',
        null, 'Alphanumeric characters');
    }
    const validChars = /^[A-Za-z0-9]+$/;
    return {
      ruleId: 'ASIC-030', field: 'UTI', category: 'Identifier',
      description: 'UTI must contain only uppercase letters, digits, and allowed special characters',
      severity: 'ERROR',
      status: validChars.test(uti) ? 'PASS' : 'FAIL',
      actual: uti,
      expected: 'Alphanumeric characters only',
    };
  });

  return rules;
}

function buildProductRules(): RuleFn[] {
  const rules: RuleFn[] = [];

  // ASIC-031: UPI — Mandatory for non-exit actions
  rules.push((r) =>
    conditionalMandatory('ASIC-031', 'UPI', 'Product',
      'UPI (ISO 4914) is mandatory for New, Modification, Correction, and Revive actions',
      r.fields.get('UPI'), r.actionType));

  // ASIC-032: UPI format — ISO 4914 (12 chars)
  rules.push((r) =>
    formatCheck('ASIC-032', 'UPI', 'Product',
      'UPI must conform to ISO 4914 format (12 alphanumeric characters)',
      r.fields.get('UPI'), UPI_REGEX,
      'ISO 4914: exactly 12 alphanumeric characters'));

  // ASIC-033: Contract Type — mandatory for non-exit
  rules.push((r) =>
    conditionalMandatory('ASIC-033', 'CtrctTp', 'Product',
      'Contract Type is mandatory for non-exit action types',
      r.fields.get('CtrctTp'), r.actionType));

  // ASIC-034: Contract Type — allowable values
  rules.push((r) =>
    allowedValues('ASIC-034', 'CtrctTp', 'Product',
      'Contract Type must be a valid derivative contract type',
      r.fields.get('CtrctTp'),
      ['SWAP', 'OPTN', 'FUTR', 'FRAS', 'FORW', 'CFDS', 'OTHR', 'SWPT', 'SPRD']));

  // ASIC-035: Asset Class — mandatory for non-exit
  rules.push((r) =>
    conditionalMandatory('ASIC-035', 'AsstClss', 'Product',
      'Asset Class is mandatory for non-exit action types',
      r.fields.get('AsstClss'), r.actionType));

  // ASIC-036: Asset Class — allowable values (per ASIC mapping doc)
  rules.push((r) =>
    allowedValues('ASIC-036', 'AsstClss', 'Product',
      'Asset Class must be one of the allowed ISDA taxonomy values',
      r.fields.get('AsstClss'),
      ['CRDT', 'CURR', 'EQUI', 'INTR', 'COMM', 'OTHR']));

  // ASIC-037: Product Classification (CFI) format
  rules.push((r) =>
    formatCheck('ASIC-037', 'PdctClssfctn', 'Product',
      'Product Classification (CFI) must be 6 uppercase letters if provided',
      r.fields.get('PdctClssfctn'), /^[A-Z]{6}$/,
      '6 uppercase letters per ISO 10962'));

  // ASIC-038: Settlement Currency format (if provided)
  rules.push((r) =>
    formatCheck('ASIC-038', 'SttlmCcy', 'Product',
      'Settlement Currency must be a valid ISO 4217 currency code if provided',
      r.fields.get('SttlmCcy'), ISO_CURRENCY_REGEX,
      'ISO 4217: 3-letter currency code'));

  // ASIC-039: UPI mandatory when Asset Class provided
  rules.push((r) => {
    const asstClss = val(r.fields.get('AsstClss'));
    const upi = val(r.fields.get('UPI'));
    if (!asstClss) {
      return na('ASIC-039', 'UPI', 'Product',
        'UPI should be present when Asset Class is reported',
        upi, 'Required when Asset Class is reported');
    }
    return {
      ruleId: 'ASIC-039', field: 'UPI', category: 'Product',
      description: 'UPI should be present when Asset Class is reported',
      severity: 'WARNING',
      status: upi ? 'PASS' : 'FAIL',
      actual: upi,
      expected: 'UPI should accompany Asset Class',
    };
  });

  // ASIC-040: Underlier ID format check (if provided)
  rules.push((r) => {
    const uid = val(r.fields.get('UndrlygId'));
    if (!uid) {
      return na('ASIC-040', 'UndrlygId', 'Product',
        'Underlier ID must be non-empty if reported',
        null, 'Non-empty identifier');
    }
    return {
      ruleId: 'ASIC-040', field: 'UndrlygId', category: 'Product',
      description: 'Underlier ID must be non-empty if reported',
      severity: 'WARNING',
      status: uid.length > 0 ? 'PASS' : 'FAIL',
      actual: uid,
      expected: 'Valid underlier identifier (ISIN, etc.)',
    };
  });

  return rules;
}

function buildDateRules(): RuleFn[] {
  const rules: RuleFn[] = [];

  // ASIC-041: Execution Timestamp — Mandatory for non-exit
  rules.push((r) =>
    conditionalMandatory('ASIC-041', 'ExctnTmStmp', 'Date & Timestamp',
      'Execution Timestamp is mandatory for non-exit action types',
      r.fields.get('ExctnTmStmp'), r.actionType));

  // ASIC-042: Execution Timestamp format
  rules.push((r) =>
    formatCheck('ASIC-042', 'ExctnTmStmp', 'Date & Timestamp',
      'Execution Timestamp must be in ISO 8601 DateTime format',
      r.fields.get('ExctnTmStmp'), ISO_DATETIME_REGEX,
      'ISO 8601: YYYY-MM-DDThh:mm:ss (with optional timezone)'));

  // ASIC-043: Execution Timestamp must include timezone
  rules.push((r) => {
    const v = val(r.fields.get('ExctnTmStmp'));
    if (!v) {
      return na('ASIC-043', 'ExctnTmStmp', 'Date & Timestamp',
        'Execution Timestamp must include timezone offset or Z',
        null, 'Timezone offset required');
    }
    const hasTz = /[+-]\d{2}:\d{2}$/.test(v) || v.endsWith('Z');
    return {
      ruleId: 'ASIC-043', field: 'ExctnTmStmp', category: 'Date & Timestamp',
      description: 'Execution Timestamp must include timezone offset or Z',
      severity: 'ERROR',
      status: hasTz ? 'PASS' : 'FAIL',
      actual: v,
      expected: 'Timestamp with timezone (e.g., +11:00 or Z)',
    };
  });

  // ASIC-044: Effective Date — Mandatory for non-exit
  rules.push((r) =>
    conditionalMandatory('ASIC-044', 'FctvDt', 'Date & Timestamp',
      'Effective Date is mandatory for non-exit action types',
      r.fields.get('FctvDt'), r.actionType));

  // ASIC-045: Effective Date format
  rules.push((r) =>
    formatCheck('ASIC-045', 'FctvDt', 'Date & Timestamp',
      'Effective Date must be in ISO 8601 date format (YYYY-MM-DD)',
      r.fields.get('FctvDt'), ISO_DATE_REGEX,
      'ISO 8601: YYYY-MM-DD'));

  // ASIC-046: Expiration Date format
  rules.push((r) =>
    formatCheck('ASIC-046', 'XpryDt', 'Date & Timestamp',
      'Expiration Date must be in ISO 8601 date format if provided',
      r.fields.get('XpryDt'), ISO_DATE_REGEX,
      'ISO 8601: YYYY-MM-DD'));

  // ASIC-047: Maturity Date format
  rules.push((r) =>
    formatCheck('ASIC-047', 'MtrtyDt', 'Date & Timestamp',
      'Maturity Date must be in ISO 8601 date format if provided',
      r.fields.get('MtrtyDt'), ISO_DATE_REGEX,
      'ISO 8601: YYYY-MM-DD'));

  // ASIC-048: Reporting Timestamp — Mandatory
  rules.push((r) =>
    mandatory('ASIC-048', 'RptgTmStmp', 'Date & Timestamp',
      'Reporting Timestamp is mandatory for all action types',
      r.fields.get('RptgTmStmp')));

  // ASIC-049: Reporting Timestamp format
  rules.push((r) =>
    formatCheck('ASIC-049', 'RptgTmStmp', 'Date & Timestamp',
      'Reporting Timestamp must be in ISO 8601 DateTime format',
      r.fields.get('RptgTmStmp'), ISO_DATETIME_REGEX,
      'ISO 8601: YYYY-MM-DDThh:mm:ss'));

  // ASIC-050: Reporting Timestamp must include timezone
  rules.push((r) => {
    const v = val(r.fields.get('RptgTmStmp'));
    if (!v) {
      return na('ASIC-050', 'RptgTmStmp', 'Date & Timestamp',
        'Reporting Timestamp must include timezone offset or Z',
        null, 'Timezone offset required');
    }
    const hasTz = /[+-]\d{2}:\d{2}$/.test(v) || v.endsWith('Z');
    return {
      ruleId: 'ASIC-050', field: 'RptgTmStmp', category: 'Date & Timestamp',
      description: 'Reporting Timestamp must include timezone offset or Z',
      severity: 'ERROR',
      status: hasTz ? 'PASS' : 'FAIL',
      actual: v,
      expected: 'Timestamp with timezone (e.g., +11:00 or Z)',
    };
  });

  // ASIC-051: Maturity Date must be >= Effective Date
  rules.push((r) => {
    const eff = val(r.fields.get('FctvDt'));
    const mat = val(r.fields.get('MtrtyDt'));
    if (!eff || !mat) {
      return na('ASIC-051', 'MtrtyDt vs FctvDt', 'Date & Timestamp',
        'Maturity Date must be on or after Effective Date',
        `Eff: ${eff}, Mat: ${mat}`, 'MtrtyDt >= FctvDt');
    }
    return {
      ruleId: 'ASIC-051', field: 'MtrtyDt vs FctvDt', category: 'Date & Timestamp',
      description: 'Maturity Date must be on or after Effective Date',
      severity: 'ERROR',
      status: mat >= eff ? 'PASS' : 'FAIL',
      actual: `Effective: ${eff}, Maturity: ${mat}`,
      expected: 'Maturity Date >= Effective Date',
    };
  });

  // ASIC-052: Expiration Date must be >= Effective Date
  rules.push((r) => {
    const eff = val(r.fields.get('FctvDt'));
    const exp = val(r.fields.get('XpryDt'));
    if (!eff || !exp) {
      return na('ASIC-052', 'XpryDt vs FctvDt', 'Date & Timestamp',
        'Expiration Date must be on or after Effective Date',
        `Eff: ${eff}, Exp: ${exp}`, 'XpryDt >= FctvDt');
    }
    return {
      ruleId: 'ASIC-052', field: 'XpryDt vs FctvDt', category: 'Date & Timestamp',
      description: 'Expiration Date must be on or after Effective Date',
      severity: 'ERROR',
      status: exp >= eff ? 'PASS' : 'FAIL',
      actual: `Effective: ${eff}, Expiration: ${exp}`,
      expected: 'Expiration Date >= Effective Date',
    };
  });

  // ASIC-053: Reporting Timestamp must be >= Execution Timestamp
  rules.push((r) => {
    const exec = val(r.fields.get('ExctnTmStmp'));
    const rptg = val(r.fields.get('RptgTmStmp'));
    if (!exec || !rptg) {
      return na('ASIC-053', 'RptgTmStmp vs ExctnTmStmp', 'Date & Timestamp',
        'Reporting Timestamp must be on or after Execution Timestamp',
        `Exec: ${exec}, Rptg: ${rptg}`, 'RptgTmStmp >= ExctnTmStmp');
    }
    return {
      ruleId: 'ASIC-053', field: 'RptgTmStmp vs ExctnTmStmp', category: 'Date & Timestamp',
      description: 'Reporting Timestamp must be on or after Execution Timestamp',
      severity: 'ERROR',
      status: rptg >= exec ? 'PASS' : 'FAIL',
      actual: `Execution: ${exec}, Reporting: ${rptg}`,
      expected: 'Reporting Timestamp >= Execution Timestamp',
    };
  });

  // ASIC-054: Event Timestamp format
  rules.push((r) =>
    formatCheck('ASIC-054', 'EvtTmStmp', 'Date & Timestamp',
      'Event Timestamp must be in ISO 8601 DateTime format if provided',
      r.fields.get('EvtTmStmp'), ISO_DATETIME_REGEX,
      'ISO 8601: YYYY-MM-DDThh:mm:ss'));

  // ASIC-055: Event Timestamp timezone
  rules.push((r) => {
    const v = val(r.fields.get('EvtTmStmp'));
    if (!v) {
      return na('ASIC-055', 'EvtTmStmp', 'Date & Timestamp',
        'Event Timestamp must include timezone if provided',
        null, 'Timezone offset required');
    }
    const hasTz = /[+-]\d{2}:\d{2}$/.test(v) || v.endsWith('Z');
    return {
      ruleId: 'ASIC-055', field: 'EvtTmStmp', category: 'Date & Timestamp',
      description: 'Event Timestamp must include timezone if provided',
      severity: 'ERROR',
      status: hasTz ? 'PASS' : 'FAIL',
      actual: v,
      expected: 'Timestamp with timezone',
    };
  });

  return rules;
}

function buildClearingRules(): RuleFn[] {
  const rules: RuleFn[] = [];

  // ASIC-056: Cleared status — Mandatory for non-exit (conditional for VALU)
  rules.push((r) => {
    if (isExitAction(r.actionType)) {
      return na('ASIC-056', 'Clrd', 'Clearing & Trading',
        'Cleared status is mandatory for non-exit action types',
        r.fields.get('Clrd') ?? null, 'N/A for exit actions');
    }
    if (isReducedAction(r.actionType)) {
      const v = val(r.fields.get('Clrd'));
      if (!v) {
        return na('ASIC-056', 'Clrd', 'Clearing & Trading',
          'Cleared status is mandatory for non-exit action types',
          null, 'Conditional for VALU actions');
      }
      return allowedValues('ASIC-056', 'Clrd', 'Clearing & Trading',
        'Cleared status must be Y (Yes), N (No), or I (Intend to clear) if reported',
        v, ['Y', 'N', 'I']);
    }
    return allowedValues('ASIC-056', 'Clrd', 'Clearing & Trading',
      'Cleared status is mandatory: Y (Yes), N (No), or I (Intend to clear)',
      r.fields.get('Clrd'), ['Y', 'N', 'I']);
  });

  // ASIC-057: CCP LEI required when cleared = Y
  rules.push((r) => {
    const cleared = val(r.fields.get('Clrd'));
    const ccpLei = val(r.fields.get('CCP.LEI'));
    if (cleared !== 'Y') {
      return na('ASIC-057', 'CCP.LEI', 'Clearing & Trading',
        'CCP LEI is mandatory when Cleared = Y',
        ccpLei, 'Required only when Cleared = Y');
    }
    return {
      ruleId: 'ASIC-057', field: 'CCP.LEI', category: 'Clearing & Trading',
      description: 'CCP LEI is mandatory when Cleared = Y',
      severity: 'ERROR',
      status: ccpLei ? 'PASS' : 'FAIL',
      actual: ccpLei,
      expected: 'Valid CCP LEI (ISO 17442)',
    };
  });

  // ASIC-058: CCP LEI format
  rules.push((r) =>
    formatCheck('ASIC-058', 'CCP.LEI', 'Clearing & Trading',
      'CCP LEI must conform to ISO 17442 format',
      r.fields.get('CCP.LEI'), LEI_REGEX,
      'ISO 17442: 18 alphanumeric + 2 check digits'));

  // ASIC-059: Platform Identifier format (MIC)
  rules.push((r) =>
    formatCheck('ASIC-059', 'PltfmIdr', 'Clearing & Trading',
      'Platform Identifier must be a valid MIC (4 alphanumeric chars) or XOFF/XXXX',
      r.fields.get('PltfmIdr'), MIC_REGEX,
      'ISO 10383 MIC: 4 alphanumeric characters'));

  // ASIC-060: Clearing Member LEI required when cleared = Y
  rules.push((r) => {
    const cleared = val(r.fields.get('Clrd'));
    const clrMmb = val(r.fields.get('ClrMmb.LEI'));
    if (cleared !== 'Y') {
      return na('ASIC-060', 'ClrMmb.LEI', 'Clearing & Trading',
        'Clearing Member LEI is mandatory when Cleared = Y',
        clrMmb, 'Required only when Cleared = Y');
    }
    return {
      ruleId: 'ASIC-060', field: 'ClrMmb.LEI', category: 'Clearing & Trading',
      description: 'Clearing Member LEI is mandatory when Cleared = Y',
      severity: 'ERROR',
      status: clrMmb ? 'PASS' : 'FAIL',
      actual: clrMmb,
      expected: 'Valid Clearing Member LEI',
    };
  });

  // ASIC-061: Non-Cleared reason must be NORE
  rules.push((r) => {
    const cleared = val(r.fields.get('Clrd'));
    const rsn = val(r.fields.get('NonClrdRsn'));
    if (cleared !== 'N') {
      return na('ASIC-061', 'NonClrdRsn', 'Clearing & Trading',
        'Non-cleared reason should be NORE when Cleared = N',
        rsn, 'Applicable only when Cleared = N');
    }
    if (!rsn) {
      return na('ASIC-061', 'NonClrdRsn', 'Clearing & Trading',
        'Non-cleared reason should be NORE when Cleared = N',
        null, 'NORE (optional but recommended)');
    }
    return allowedValues('ASIC-061', 'NonClrdRsn', 'Clearing & Trading',
      'Non-cleared reason should be NORE when Cleared = N',
      rsn, ['NORE']);
  });

  // ASIC-062: Master Agreement Type allowable values
  rules.push((r) =>
    allowedValues('ASIC-062', 'MstrAgrmt.Tp', 'Clearing & Trading',
      'Master Agreement Type must be a recognized agreement code if provided',
      r.fields.get('MstrAgrmt.Tp'),
      ['ISDA', 'CMAM', 'DERV', 'FXAG', 'IDMA', 'EFMA', 'ISFA', 'OTHR']));

  // ASIC-063: Platform Identifier mandatory for non-exit (when not OTC)
  rules.push((r) =>
    conditionalMandatory('ASIC-063', 'PltfmIdr', 'Clearing & Trading',
      'Platform/Execution Venue is mandatory for non-exit actions',
      r.fields.get('PltfmIdr'), r.actionType));

  // ASIC-064: CCP LEI must not be same as CP1
  rules.push((r) => {
    const ccpLei = val(r.fields.get('CCP.LEI'));
    const cp1Lei = val(r.fields.get('RptgCtrPty.LEI'));
    if (!ccpLei || !cp1Lei) {
      return na('ASIC-064', 'CCP.LEI vs RptgCtrPty.LEI', 'Clearing & Trading',
        'CCP LEI must be different from Reporting Counterparty LEI',
        `CCP: ${ccpLei}, CP1: ${cp1Lei}`, 'CCP LEI != CP1 LEI');
    }
    return {
      ruleId: 'ASIC-064', field: 'CCP.LEI vs RptgCtrPty.LEI', category: 'Clearing & Trading',
      description: 'CCP LEI must be different from Reporting Counterparty LEI',
      severity: 'ERROR',
      status: ccpLei !== cp1Lei ? 'PASS' : 'FAIL',
      actual: `CCP: ${ccpLei}, CP1: ${cp1Lei}`,
      expected: 'CCP LEI != CP1 LEI',
    };
  });

  // ASIC-065: CCP should not be reported when Cleared = N
  rules.push((r) => {
    const cleared = val(r.fields.get('Clrd'));
    const ccpLei = val(r.fields.get('CCP.LEI'));
    if (cleared !== 'N') {
      return na('ASIC-065', 'CCP.LEI', 'Clearing & Trading',
        'CCP LEI should not be reported when Cleared = N',
        ccpLei, 'Applicable only when Cleared = N');
    }
    return {
      ruleId: 'ASIC-065', field: 'CCP.LEI', category: 'Clearing & Trading',
      description: 'CCP LEI should not be reported when Cleared = N',
      severity: 'WARNING',
      status: !ccpLei ? 'PASS' : 'FAIL',
      actual: ccpLei,
      expected: 'Empty/absent when Cleared = N',
    };
  });

  return rules;
}

function buildNotionalRules(): RuleFn[] {
  const rules: RuleFn[] = [];

  // ASIC-066: Notional Amount Leg 1 — Mandatory for non-exit
  rules.push((r) =>
    conditionalMandatory('ASIC-066', 'NtnlAmt1', 'Notional & Quantity',
      'Notional Amount (Leg 1) is mandatory for non-exit actions',
      r.fields.get('NtnlAmt1'), r.actionType));

  // ASIC-067: Notional Amount Leg 1 must be numeric
  rules.push((r) =>
    numericCheck('ASIC-067', 'NtnlAmt1', 'Notional & Quantity',
      'Notional Amount (Leg 1) must be a valid decimal number',
      r.fields.get('NtnlAmt1')));

  // ASIC-068: Notional Amount Leg 1 must be non-negative
  rules.push((r) => {
    const v = val(r.fields.get('NtnlAmt1'));
    if (!v) {
      return na('ASIC-068', 'NtnlAmt1', 'Notional & Quantity',
        'Notional Amount (Leg 1) must be non-negative',
        null, '>= 0');
    }
    const num = parseFloat(v);
    return {
      ruleId: 'ASIC-068', field: 'NtnlAmt1', category: 'Notional & Quantity',
      description: 'Notional Amount (Leg 1) must be non-negative (zero permitted for reduced-to-zero)',
      severity: 'ERROR',
      status: !isNaN(num) && num >= 0 ? 'PASS' : 'FAIL',
      actual: v, expected: 'Decimal >= 0',
    };
  });

  // ASIC-069: Notional Currency Leg 1 — Mandatory when notional provided
  rules.push((r) => {
    const amt = val(r.fields.get('NtnlAmt1'));
    const ccy = val(r.fields.get('NtnlCcy1'));
    if (!amt) {
      return na('ASIC-069', 'NtnlCcy1', 'Notional & Quantity',
        'Notional Currency (Leg 1) is mandatory when Notional Amount is reported',
        ccy, 'Required with notional amount');
    }
    return {
      ruleId: 'ASIC-069', field: 'NtnlCcy1', category: 'Notional & Quantity',
      description: 'Notional Currency (Leg 1) is mandatory when Notional Amount is reported',
      severity: 'ERROR',
      status: ccy ? 'PASS' : 'FAIL',
      actual: ccy,
      expected: 'ISO 4217 currency code (e.g., AUD, USD)',
    };
  });

  // ASIC-070: Notional Currency Leg 1 format
  rules.push((r) =>
    formatCheck('ASIC-070', 'NtnlCcy1', 'Notional & Quantity',
      'Notional Currency (Leg 1) must be a valid ISO 4217 currency code',
      r.fields.get('NtnlCcy1'), ISO_CURRENCY_REGEX,
      'ISO 4217: 3-letter currency code'));

  // ASIC-071: Notional Amount Leg 2 must be numeric (if provided)
  rules.push((r) =>
    numericCheck('ASIC-071', 'NtnlAmt2', 'Notional & Quantity',
      'Notional Amount (Leg 2) must be a valid decimal number if provided',
      r.fields.get('NtnlAmt2')));

  // ASIC-072: Notional Amount Leg 2 must be non-negative
  rules.push((r) => {
    const v = val(r.fields.get('NtnlAmt2'));
    if (!v) {
      return na('ASIC-072', 'NtnlAmt2', 'Notional & Quantity',
        'Notional Amount (Leg 2) must be non-negative if provided',
        null, '>= 0');
    }
    const num = parseFloat(v);
    return {
      ruleId: 'ASIC-072', field: 'NtnlAmt2', category: 'Notional & Quantity',
      description: 'Notional Amount (Leg 2) must be non-negative if provided',
      severity: 'ERROR',
      status: !isNaN(num) && num >= 0 ? 'PASS' : 'FAIL',
      actual: v, expected: 'Decimal >= 0',
    };
  });

  // ASIC-073: Notional Currency Leg 2 format (if provided)
  rules.push((r) =>
    formatCheck('ASIC-073', 'NtnlCcy2', 'Notional & Quantity',
      'Notional Currency (Leg 2) must be a valid ISO 4217 currency code if provided',
      r.fields.get('NtnlCcy2'), ISO_CURRENCY_REGEX,
      'ISO 4217: 3-letter currency code'));

  // ASIC-074: Notional Currency Leg 2 mandatory when Leg 2 amount provided
  rules.push((r) => {
    const amt2 = val(r.fields.get('NtnlAmt2'));
    const ccy2 = val(r.fields.get('NtnlCcy2'));
    if (!amt2) {
      return na('ASIC-074', 'NtnlCcy2', 'Notional & Quantity',
        'Notional Currency (Leg 2) is mandatory when Notional Amount Leg 2 is reported',
        ccy2, 'Required with Leg 2 amount');
    }
    return {
      ruleId: 'ASIC-074', field: 'NtnlCcy2', category: 'Notional & Quantity',
      description: 'Notional Currency (Leg 2) is mandatory when Notional Amount Leg 2 is reported',
      severity: 'ERROR',
      status: ccy2 ? 'PASS' : 'FAIL',
      actual: ccy2,
      expected: 'ISO 4217 currency code',
    };
  });

  // ASIC-075: Quantity Leg 1 must be numeric (if provided)
  rules.push((r) =>
    numericCheck('ASIC-075', 'Qty1', 'Notional & Quantity',
      'Quantity (Leg 1) must be a valid decimal number if provided',
      r.fields.get('Qty1')));

  // ASIC-076: Quantity Leg 2 must be numeric (if provided)
  rules.push((r) =>
    numericCheck('ASIC-076', 'Qty2', 'Notional & Quantity',
      'Quantity (Leg 2) must be a valid decimal number if provided',
      r.fields.get('Qty2')));

  // ASIC-077: Notional Amount Leg 1 mandatory for CURR asset class (FX)
  rules.push((r) => {
    const asstClss = val(r.fields.get('AsstClss'));
    const ntnl1 = val(r.fields.get('NtnlAmt1'));
    if (asstClss !== 'CURR') {
      return na('ASIC-077', 'NtnlAmt1', 'Notional & Quantity',
        'Notional Amount Leg 1 is always mandatory for FX (CURR) derivatives',
        ntnl1, 'Applicable only for CURR asset class');
    }
    if (isReducedAction(r.actionType)) {
      return na('ASIC-077', 'NtnlAmt1', 'Notional & Quantity',
        'Notional Amount Leg 1 is always mandatory for FX (CURR) derivatives',
        ntnl1, 'Conditional for VALU actions');
    }
    return {
      ruleId: 'ASIC-077', field: 'NtnlAmt1', category: 'Notional & Quantity',
      description: 'Notional Amount Leg 1 is always mandatory for FX (CURR) derivatives',
      severity: 'ERROR',
      status: ntnl1 ? 'PASS' : 'FAIL',
      actual: ntnl1, expected: 'Non-empty notional amount for FX',
    };
  });

  // ASIC-078: Notional Amount Leg 2 mandatory for CURR asset class (FX)
  rules.push((r) => {
    const asstClss = val(r.fields.get('AsstClss'));
    const ntnl2 = val(r.fields.get('NtnlAmt2'));
    if (asstClss !== 'CURR') {
      return na('ASIC-078', 'NtnlAmt2', 'Notional & Quantity',
        'Notional Amount Leg 2 is mandatory for FX (CURR) derivatives',
        ntnl2, 'Applicable only for CURR asset class');
    }
    if (isReducedAction(r.actionType)) {
      return na('ASIC-078', 'NtnlAmt2', 'Notional & Quantity',
        'Notional Amount Leg 2 is mandatory for FX (CURR) derivatives',
        ntnl2, 'Conditional for VALU actions');
    }
    return {
      ruleId: 'ASIC-078', field: 'NtnlAmt2', category: 'Notional & Quantity',
      description: 'Notional Amount Leg 2 is mandatory for FX (CURR) derivatives',
      severity: 'ERROR',
      status: ntnl2 ? 'PASS' : 'FAIL',
      actual: ntnl2, expected: 'Non-empty notional amount for FX Leg 2',
    };
  });

  return rules;
}

function buildPriceRules(): RuleFn[] {
  const rules: RuleFn[] = [];

  // ASIC-079: Price must be numeric (if provided)
  rules.push((r) =>
    numericCheck('ASIC-079', 'Pric', 'Price',
      'Price must be a valid decimal number if reported',
      r.fields.get('Pric')));

  // ASIC-080: Price Currency format
  rules.push((r) =>
    formatCheck('ASIC-080', 'PricCcy', 'Price',
      'Price Currency must be a valid ISO 4217 currency code if provided',
      r.fields.get('PricCcy'), ISO_CURRENCY_REGEX,
      'ISO 4217: 3-letter currency code'));

  // ASIC-081: Price currency mandatory when price is monetary
  rules.push((r) => {
    const pric = val(r.fields.get('Pric'));
    const pricCcy = val(r.fields.get('PricCcy'));
    const pricNtn = val(r.fields.get('PricNtn'));
    const isMntry = val(r.fields.get('PricIsMntry'));
    // Skip: no price, basis point spread, or decimal rate (not monetary)
    if (!pric || pricNtn || !isMntry) {
      return na('ASIC-081', 'PricCcy', 'Price',
        'Price Currency is mandatory when price is a monetary value',
        pricCcy, 'Required for monetary price (not decimal rates)');
    }
    return {
      ruleId: 'ASIC-081', field: 'PricCcy', category: 'Price',
      description: 'Price Currency is mandatory when price is a monetary value',
      severity: 'ERROR',
      status: pricCcy ? 'PASS' : 'FAIL',
      actual: pricCcy,
      expected: 'ISO 4217 currency code',
    };
  });

  // ASIC-082: Fixed Rate Leg 1 must be numeric (if provided)
  rules.push((r) =>
    numericCheck('ASIC-082', 'FxdRate1', 'Price',
      'Fixed Rate (Leg 1) must be a valid decimal number if reported',
      r.fields.get('FxdRate1')));

  // ASIC-083: Fixed Rate Leg 2 must be numeric (if provided)
  rules.push((r) =>
    numericCheck('ASIC-083', 'FxdRate2', 'Price',
      'Fixed Rate (Leg 2) must be a valid decimal number if reported',
      r.fields.get('FxdRate2')));

  // ASIC-084: Spread Leg 1 must be numeric (if provided)
  rules.push((r) =>
    numericCheck('ASIC-084', 'Sprd1', 'Price',
      'Spread (Leg 1) must be a valid decimal number if reported',
      r.fields.get('Sprd1')));

  // ASIC-085: Spread Leg 2 must be numeric (if provided)
  rules.push((r) =>
    numericCheck('ASIC-085', 'Sprd2', 'Price',
      'Spread (Leg 2) must be a valid decimal number if reported',
      r.fields.get('Sprd2')));

  // ASIC-086: Strike Price must be numeric (if provided)
  rules.push((r) =>
    numericCheck('ASIC-086', 'StrkPric', 'Price',
      'Strike Price must be a valid decimal number if reported (options)',
      r.fields.get('StrkPric')));

  // ASIC-087: Strike Price mandatory when Contract Type is OPTN
  rules.push((r) => {
    const ct = val(r.fields.get('CtrctTp'));
    const sp = val(r.fields.get('StrkPric'));
    if (ct !== 'OPTN') {
      return na('ASIC-087', 'StrkPric', 'Price',
        'Strike Price is mandatory when Contract Type is OPTN',
        sp, 'Applicable only when CtrctTp = OPTN');
    }
    if (isReducedAction(r.actionType)) {
      return na('ASIC-087', 'StrkPric', 'Price',
        'Strike Price is mandatory when Contract Type is OPTN',
        sp, 'Conditional for VALU actions');
    }
    return {
      ruleId: 'ASIC-087', field: 'StrkPric', category: 'Price',
      description: 'Strike Price is mandatory when Contract Type is OPTN',
      severity: 'ERROR',
      status: sp ? 'PASS' : 'FAIL',
      actual: sp, expected: 'Non-empty strike price',
    };
  });

  // ASIC-088: Option Type mandatory when Contract Type is OPTN
  rules.push((r) => {
    const ct = val(r.fields.get('CtrctTp'));
    const ot = val(r.fields.get('OptnTp'));
    if (ct !== 'OPTN') {
      return na('ASIC-088', 'OptnTp', 'Price',
        'Option Type (CALL/PUTO) is mandatory when Contract Type is OPTN',
        ot, 'Applicable only when CtrctTp = OPTN');
    }
    if (isReducedAction(r.actionType)) {
      return na('ASIC-088', 'OptnTp', 'Price',
        'Option Type (CALL/PUTO) is mandatory when Contract Type is OPTN',
        ot, 'Conditional for VALU actions');
    }
    return {
      ruleId: 'ASIC-088', field: 'OptnTp', category: 'Price',
      description: 'Option Type (CALL/PUTO) is mandatory when Contract Type is OPTN',
      severity: 'WARNING',
      status: ot ? 'PASS' : 'FAIL',
      actual: ot, expected: 'CALL or PUTO',
    };
  });

  // ASIC-089: Option Type allowable values
  rules.push((r) =>
    allowedValues('ASIC-089', 'OptnTp', 'Price',
      'Option Type must be CALL, PUTO, or OTHR if reported',
      r.fields.get('OptnTp'),
      ['CALL', 'PUTO', 'OTHR']));

  // ASIC-090: Option Exercise Style allowable values
  rules.push((r) =>
    allowedValues('ASIC-090', 'OptnExrcStyle', 'Price',
      'Option Exercise Style must be one of the allowed values if reported',
      r.fields.get('OptnExrcStyle'),
      ['AMER', 'EURO', 'BERM', 'ASIA']));

  // ASIC-091: Option Exercise Style mandatory when OPTN
  rules.push((r) => {
    const ct = val(r.fields.get('CtrctTp'));
    const es = val(r.fields.get('OptnExrcStyle'));
    if (ct !== 'OPTN') {
      return na('ASIC-091', 'OptnExrcStyle', 'Price',
        'Option Exercise Style is mandatory when Contract Type is OPTN',
        es, 'Applicable only when CtrctTp = OPTN');
    }
    if (isReducedAction(r.actionType)) {
      return na('ASIC-091', 'OptnExrcStyle', 'Price',
        'Option Exercise Style is mandatory when Contract Type is OPTN',
        es, 'Conditional for VALU actions');
    }
    return {
      ruleId: 'ASIC-091', field: 'OptnExrcStyle', category: 'Price',
      description: 'Option Exercise Style is mandatory when Contract Type is OPTN',
      severity: 'WARNING',
      status: es ? 'PASS' : 'FAIL',
      actual: es, expected: 'One of: AMER, EURO, BERM, ASIA',
    };
  });

  // ASIC-092: Option Premium must be numeric (if provided)
  rules.push((r) =>
    numericCheck('ASIC-092', 'OptnPrm', 'Price',
      'Option Premium must be a valid decimal number if reported',
      r.fields.get('OptnPrm')));

  // ASIC-093: Option Premium currency format
  rules.push((r) =>
    formatCheck('ASIC-093', 'OptnPrmCcy', 'Price',
      'Option Premium Currency must be ISO 4217 if reported',
      r.fields.get('OptnPrmCcy'), ISO_CURRENCY_REGEX,
      'ISO 4217: 3-letter currency code'));

  // ASIC-094: Exchange Rate must be numeric (if provided)
  rules.push((r) =>
    numericCheck('ASIC-094', 'XchgRate', 'Price',
      'Exchange Rate must be a valid decimal number if reported',
      r.fields.get('XchgRate')));

  // ASIC-095: Exchange Rate must be positive
  rules.push((r) => {
    const v = val(r.fields.get('XchgRate'));
    if (!v) {
      return na('ASIC-095', 'XchgRate', 'Price',
        'Exchange Rate must be positive if reported', null, '> 0');
    }
    const num = parseFloat(v);
    return {
      ruleId: 'ASIC-095', field: 'XchgRate', category: 'Price',
      description: 'Exchange Rate must be positive if reported',
      severity: 'ERROR',
      status: !isNaN(num) && num > 0 ? 'PASS' : 'FAIL',
      actual: v, expected: 'Positive decimal number',
    };
  });

  return rules;
}

function buildValuationRules(): RuleFn[] {
  const rules: RuleFn[] = [];

  // ASIC-096: Valuation amount numeric check
  rules.push((r) =>
    numericCheck('ASIC-096', 'Valtn.Amt', 'Valuation',
      'Valuation amount must be a valid decimal if reported',
      r.fields.get('Valtn.Amt')));

  // ASIC-097: Valuation currency format
  rules.push((r) =>
    formatCheck('ASIC-097', 'Valtn.Ccy', 'Valuation',
      'Valuation Currency must be a valid ISO 4217 currency code if reported',
      r.fields.get('Valtn.Ccy'), ISO_CURRENCY_REGEX,
      'ISO 4217: 3-letter currency code'));

  // ASIC-098: Valuation currency mandatory when amount provided
  rules.push((r) => {
    const amt = val(r.fields.get('Valtn.Amt'));
    const ccy = val(r.fields.get('Valtn.Ccy'));
    if (!amt) {
      return na('ASIC-098', 'Valtn.Ccy', 'Valuation',
        'Valuation Currency is mandatory when valuation amount is reported',
        ccy, 'Required with valuation amount');
    }
    return {
      ruleId: 'ASIC-098', field: 'Valtn.Ccy', category: 'Valuation',
      description: 'Valuation Currency is mandatory when valuation amount is reported',
      severity: 'ERROR',
      status: ccy ? 'PASS' : 'FAIL',
      actual: ccy,
      expected: 'ISO 4217 currency code',
    };
  });

  // ASIC-099: Valuation timestamp format
  rules.push((r) =>
    formatCheck('ASIC-099', 'Valtn.TmStmp', 'Valuation',
      'Valuation Timestamp must be ISO 8601 DateTime format if reported',
      r.fields.get('Valtn.TmStmp'), ISO_DATETIME_REGEX,
      'ISO 8601: YYYY-MM-DDThh:mm:ss'));

  // ASIC-100: Valuation timestamp mandatory when amount provided
  rules.push((r) => {
    const amt = val(r.fields.get('Valtn.Amt'));
    const ts = val(r.fields.get('Valtn.TmStmp'));
    if (!amt) {
      return na('ASIC-100', 'Valtn.TmStmp', 'Valuation',
        'Valuation Timestamp is mandatory when valuation amount is reported',
        ts, 'Required with valuation amount');
    }
    return {
      ruleId: 'ASIC-100', field: 'Valtn.TmStmp', category: 'Valuation',
      description: 'Valuation Timestamp is mandatory when valuation amount is reported',
      severity: 'ERROR',
      status: ts ? 'PASS' : 'FAIL',
      actual: ts,
      expected: 'ISO 8601 DateTime',
    };
  });

  // ASIC-101: Delta must be between -1 and 1
  rules.push((r) => {
    const v = val(r.fields.get('Valtn.Dlt'));
    if (!v) {
      return na('ASIC-101', 'Valtn.Dlt', 'Valuation',
        'Delta must be a decimal between -1 and 1 if reported (for option derivatives)',
        null, 'Decimal -1 to 1');
    }
    const num = parseFloat(v);
    return {
      ruleId: 'ASIC-101', field: 'Valtn.Dlt', category: 'Valuation',
      description: 'Delta must be a decimal between -1 and 1 if reported (for option derivatives)',
      severity: 'ERROR',
      status: !isNaN(num) && num >= -1 && num <= 1 ? 'PASS' : 'FAIL',
      actual: v,
      expected: 'Decimal value between -1.0 and 1.0',
    };
  });

  // ASIC-102: Valuation mandatory for VALU action
  rules.push((r) => {
    if (r.actionType !== 'VALU') {
      return na('ASIC-102', 'Valtn.Amt', 'Valuation',
        'Valuation amount is mandatory for ValtnUpd (VALU) action type',
        val(r.fields.get('Valtn.Amt')), 'Applicable only for VALU action');
    }
    return mandatory('ASIC-102', 'Valtn.Amt', 'Valuation',
      'Valuation amount is mandatory for ValtnUpd (VALU) action type',
      r.fields.get('Valtn.Amt'));
  });

  // ASIC-103: Valuation Type allowable values
  rules.push((r) =>
    allowedValues('ASIC-103', 'Valtn.Tp', 'Valuation',
      'Valuation Type must be MTOM (Mark-to-Market) or MTMD (Mark-to-Model) if reported',
      r.fields.get('Valtn.Tp'),
      ['MTOM', 'MTMD']));

  // ASIC-104: Valuation Type mandatory for VALU action
  rules.push((r) => {
    if (r.actionType !== 'VALU') {
      return na('ASIC-104', 'Valtn.Tp', 'Valuation',
        'Valuation Type is mandatory for VALU action type',
        val(r.fields.get('Valtn.Tp')), 'Applicable only for VALU action');
    }
    return mandatory('ASIC-104', 'Valtn.Tp', 'Valuation',
      'Valuation Type is mandatory for VALU action type',
      r.fields.get('Valtn.Tp'));
  });

  // ASIC-105: Delta mandatory for OPTN when VALU action
  rules.push((r) => {
    const ct = val(r.fields.get('CtrctTp'));
    const dlt = val(r.fields.get('Valtn.Dlt'));
    if (r.actionType !== 'VALU' || ct !== 'OPTN') {
      return na('ASIC-105', 'Valtn.Dlt', 'Valuation',
        'Delta is mandatory for option derivatives in VALU action',
        dlt, 'Applicable only for OPTN + VALU');
    }
    return {
      ruleId: 'ASIC-105', field: 'Valtn.Dlt', category: 'Valuation',
      description: 'Delta is mandatory for option derivatives in VALU action',
      severity: 'ERROR',
      status: dlt ? 'PASS' : 'FAIL',
      actual: dlt, expected: 'Decimal between -1 and 1',
    };
  });

  return rules;
}

function buildActionEventRules(): RuleFn[] {
  const rules: RuleFn[] = [];

  // ASIC-106: Action Type must be detected
  rules.push((r) => ({
    ruleId: 'ASIC-106',
    field: 'ActionType',
    category: 'Action & Event',
    description: 'Action type must be present as a Level 3 wrapper element (New, Mod, Crrctn, etc.)',
    severity: 'ERROR',
    status: r.actionType ? 'PASS' : 'FAIL',
    actual: r.actionType,
    expected: 'One of: NEWT, MODI, CORR, TERM, VALU, EROR, REVI',
  }));

  // ASIC-107: Event Type — allowable values (if provided)
  rules.push((r) => {
    const et = val(r.fields.get('EvtTp'));
    if (!et) {
      return na('ASIC-107', 'EvtTp', 'Action & Event',
        'Event Type provides further detail on what triggered the action',
        null, 'Optional: TRAD, NOVA, COMP, etc.');
    }
    const allowed = ['TRAD', 'NOVA', 'COMP', 'ETRM', 'EXER', 'ALOC', 'CLRG',
      'CLAL', 'CREV', 'PTNG', 'UPDT', 'CPUP', 'INCP', 'CORP', 'OTHR'];
    return allowedValues('ASIC-107', 'EvtTp', 'Action & Event',
      'Event Type must be a valid CDE event type code',
      et, allowed);
  });

  // ASIC-108: NEWT allowed event types
  rules.push((r) => {
    const at = r.actionType;
    const et = val(r.fields.get('EvtTp'));
    if (!et || at !== 'NEWT') {
      return na('ASIC-108', 'EvtTp vs ActionType', 'Action & Event',
        'When Action Type is NEWT, Event Type must be one of: TRAD, NOVA, COMP, CLRG, ALOC, INCP, UPDT',
        `Action: ${at}, Event: ${et}`, 'Applicable only to NEWT');
    }
    const allowed = ['TRAD', 'NOVA', 'COMP', 'CLRG', 'ALOC', 'INCP', 'UPDT'];
    return {
      ruleId: 'ASIC-108', field: 'EvtTp vs ActionType', category: 'Action & Event',
      description: 'When Action Type is NEWT, Event Type must be one of: TRAD, NOVA, COMP, CLRG, ALOC, INCP, UPDT',
      severity: 'ERROR',
      status: allowed.includes(et) ? 'PASS' : 'FAIL',
      actual: `Action: ${at}, Event: ${et}`,
      expected: `One of: ${allowed.join(', ')}`,
    };
  });

  // ASIC-109: MODI allowed event types
  rules.push((r) => {
    const at = r.actionType;
    const et = val(r.fields.get('EvtTp'));
    if (!et || at !== 'MODI') {
      return na('ASIC-109', 'EvtTp vs ActionType', 'Action & Event',
        'When Action Type is MODI, Event Type must be one of: TRAD, NOVA, COMP, UPDT, CPUP, CORP',
        `Action: ${at}, Event: ${et}`, 'Applicable only to MODI');
    }
    const allowed = ['TRAD', 'NOVA', 'COMP', 'UPDT', 'CPUP', 'CORP'];
    return {
      ruleId: 'ASIC-109', field: 'EvtTp vs ActionType', category: 'Action & Event',
      description: 'When Action Type is MODI, Event Type must be one of: TRAD, NOVA, COMP, UPDT, CPUP, CORP',
      severity: 'ERROR',
      status: allowed.includes(et) ? 'PASS' : 'FAIL',
      actual: `Action: ${at}, Event: ${et}`,
      expected: `One of: ${allowed.join(', ')}`,
    };
  });

  // ASIC-110: TERM allowed event types
  rules.push((r) => {
    const at = r.actionType;
    const et = val(r.fields.get('EvtTp'));
    if (!et || at !== 'TERM') {
      return na('ASIC-110', 'EvtTp vs ActionType', 'Action & Event',
        'When Action Type is TERM, Event Type must be one of: ETRM, EXER, COMP, CLRG, CORP',
        `Action: ${at}, Event: ${et}`, 'Applicable only to TERM');
    }
    const allowed = ['ETRM', 'EXER', 'COMP', 'CLRG', 'CORP'];
    return {
      ruleId: 'ASIC-110', field: 'EvtTp vs ActionType', category: 'Action & Event',
      description: 'When Action Type is TERM, Event Type must be one of: ETRM, EXER, COMP, CLRG, CORP',
      severity: 'ERROR',
      status: allowed.includes(et) ? 'PASS' : 'FAIL',
      actual: `Action: ${at}, Event: ${et}`,
      expected: `One of: ${allowed.join(', ')}`,
    };
  });

  // ASIC-111: CORR allowed event types
  rules.push((r) => {
    const at = r.actionType;
    const et = val(r.fields.get('EvtTp'));
    if (!et || at !== 'CORR') {
      return na('ASIC-111', 'EvtTp vs ActionType', 'Action & Event',
        'When Action Type is CORR, Event Type must be one of: TRAD, NOVA, COMP, CLRG, ALOC, INCP, UPDT, CPUP, CORP',
        `Action: ${at}, Event: ${et}`, 'Applicable only to CORR');
    }
    const allowed = ['TRAD', 'NOVA', 'COMP', 'CLRG', 'ALOC', 'INCP', 'UPDT', 'CPUP', 'CORP'];
    return {
      ruleId: 'ASIC-111', field: 'EvtTp vs ActionType', category: 'Action & Event',
      description: 'When Action Type is CORR, Event Type must be one of: TRAD, NOVA, COMP, CLRG, ALOC, INCP, UPDT, CPUP, CORP',
      severity: 'ERROR',
      status: allowed.includes(et) ? 'PASS' : 'FAIL',
      actual: `Action: ${at}, Event: ${et}`,
      expected: `One of: ${allowed.join(', ')}`,
    };
  });

  // ASIC-112: Event Type mandatory for NEWT
  rules.push((r) => {
    if (r.actionType !== 'NEWT') {
      return na('ASIC-112', 'EvtTp', 'Action & Event',
        'Event Type is mandatory for NEWT action type',
        val(r.fields.get('EvtTp')), 'Applicable only for NEWT');
    }
    return mandatory('ASIC-112', 'EvtTp', 'Action & Event',
      'Event Type is mandatory for NEWT action type',
      r.fields.get('EvtTp'));
  });

  // ASIC-113: Event Type mandatory for TERM
  rules.push((r) => {
    if (r.actionType !== 'TERM') {
      return na('ASIC-113', 'EvtTp', 'Action & Event',
        'Event Type is mandatory for TERM action type',
        val(r.fields.get('EvtTp')), 'Applicable only for TERM');
    }
    return mandatory('ASIC-113', 'EvtTp', 'Action & Event',
      'Event Type is mandatory for TERM action type',
      r.fields.get('EvtTp'));
  });

  // ASIC-114: Event Timestamp mandatory when Event Type provided
  rules.push((r) => {
    const et = val(r.fields.get('EvtTp'));
    const ets = val(r.fields.get('EvtTmStmp'));
    if (!et) {
      return na('ASIC-114', 'EvtTmStmp', 'Action & Event',
        'Event Timestamp should accompany Event Type',
        ets, 'Required when Event Type is reported');
    }
    return {
      ruleId: 'ASIC-114', field: 'EvtTmStmp', category: 'Action & Event',
      description: 'Event Timestamp should accompany Event Type',
      severity: 'WARNING',
      status: ets ? 'PASS' : 'FAIL',
      actual: ets,
      expected: 'ISO 8601 DateTime',
    };
  });

  // ASIC-115: EROR action should not have product data
  rules.push((r) => {
    if (r.actionType !== 'EROR') {
      return na('ASIC-115', 'UPI (EROR check)', 'Action & Event',
        'Error (EROR) action type should not carry product data',
        null, 'Applicable only for EROR');
    }
    const upi = val(r.fields.get('UPI'));
    return {
      ruleId: 'ASIC-115', field: 'UPI (EROR check)', category: 'Action & Event',
      description: 'Error (EROR) action type should not carry product data',
      severity: 'WARNING',
      status: !upi ? 'PASS' : 'FAIL',
      actual: upi,
      expected: 'No UPI for EROR action',
    };
  });

  // ASIC-118: VALU action should have valuation data
  rules.push((r) => {
    if (r.actionType !== 'VALU') {
      return na('ASIC-118', 'Valtn (VALU check)', 'Action & Event',
        'Valuation Update (VALU) action should contain valuation data',
        null, 'Applicable only for VALU');
    }
    const valAmt = val(r.fields.get('Valtn.Amt'));
    return {
      ruleId: 'ASIC-118', field: 'Valtn (VALU check)', category: 'Action & Event',
      description: 'Valuation Update (VALU) action should contain valuation data',
      severity: 'ERROR',
      status: valAmt ? 'PASS' : 'FAIL',
      actual: valAmt,
      expected: 'Valuation amount required for VALU',
    };
  });

  return rules;
}

function buildCollateralRules(): RuleFn[] {
  const rules: RuleFn[] = [];

  // ASIC-119: Initial Margin Posted must be numeric
  rules.push((r) =>
    numericCheck('ASIC-119', 'Coll.InitlMrgnPstd', 'Collateral',
      'Initial Margin Posted must be a valid decimal number if reported',
      r.fields.get('Coll.InitlMrgnPstd')));

  // ASIC-120: Initial Margin Posted must be non-negative
  rules.push((r) => {
    const v = val(r.fields.get('Coll.InitlMrgnPstd'));
    if (!v) {
      return na('ASIC-120', 'Coll.InitlMrgnPstd', 'Collateral',
        'Initial Margin Posted must be non-negative', null, '>= 0');
    }
    const num = parseFloat(v);
    return {
      ruleId: 'ASIC-120', field: 'Coll.InitlMrgnPstd', category: 'Collateral',
      description: 'Initial Margin Posted must be non-negative',
      severity: 'ERROR',
      status: !isNaN(num) && num >= 0 ? 'PASS' : 'FAIL',
      actual: v, expected: 'Decimal >= 0',
    };
  });

  // ASIC-121: Variation Margin Posted must be numeric
  rules.push((r) =>
    numericCheck('ASIC-121', 'Coll.VartnMrgnPstd', 'Collateral',
      'Variation Margin Posted must be a valid decimal number if reported',
      r.fields.get('Coll.VartnMrgnPstd')));

  // ASIC-122: Initial Margin Received must be numeric
  rules.push((r) =>
    numericCheck('ASIC-122', 'Coll.InitlMrgnRcvd', 'Collateral',
      'Initial Margin Received must be a valid decimal number if reported',
      r.fields.get('Coll.InitlMrgnRcvd')));

  // ASIC-123: Variation Margin Received must be numeric
  rules.push((r) =>
    numericCheck('ASIC-123', 'Coll.VartnMrgnRcvd', 'Collateral',
      'Variation Margin Received must be a valid decimal number if reported',
      r.fields.get('Coll.VartnMrgnRcvd')));

  // ASIC-124: Portfolio Code format check
  rules.push((r) => {
    const v = val(r.fields.get('Coll.PrtflCd'));
    if (!v) {
      return na('ASIC-124', 'Coll.PrtflCd', 'Collateral',
        'Collateral Portfolio Code must be non-empty if reported',
        null, 'Non-empty string');
    }
    return {
      ruleId: 'ASIC-124', field: 'Coll.PrtflCd', category: 'Collateral',
      description: 'Collateral Portfolio Code must be non-empty if reported',
      severity: 'WARNING',
      status: v.length > 0 && v.length <= 52 ? 'PASS' : 'FAIL',
      actual: v,
      expected: 'Non-empty, max 52 characters',
    };
  });

  return rules;
}

function buildPackageRules(): RuleFn[] {
  const rules: RuleFn[] = [];

  // ASIC-125: Package ID format check
  rules.push((r) => {
    const v = val(r.fields.get('PckgId'));
    if (!v) {
      return na('ASIC-125', 'PckgId', 'Package',
        'Package (Complex Trade) ID must be non-empty if reported',
        null, 'Non-empty identifier');
    }
    return {
      ruleId: 'ASIC-125', field: 'PckgId', category: 'Package',
      description: 'Package (Complex Trade) ID must be non-empty if reported',
      severity: 'WARNING',
      status: v.length > 0 && v.length <= 35 ? 'PASS' : 'FAIL',
      actual: v,
      expected: 'Non-empty, max 35 characters',
    };
  });

  // ASIC-126: Package Price must be numeric (if provided)
  rules.push((r) =>
    numericCheck('ASIC-126', 'PckgPric', 'Package',
      'Package Price must be a valid decimal number if reported',
      r.fields.get('PckgPric')));

  // ASIC-127: Package Spread must be numeric (if provided)
  rules.push((r) =>
    numericCheck('ASIC-127', 'PckgSprd', 'Package',
      'Package Spread must be a valid decimal number if reported',
      r.fields.get('PckgSprd')));

  // ASIC-128: Fixed Rate Leg 1 mandatory for INTR + SWAP
  rules.push((r) => {
    const asstClss = val(r.fields.get('AsstClss'));
    const ctrctTp = val(r.fields.get('CtrctTp'));
    const fxdRate = val(r.fields.get('FxdRate1'));
    if (asstClss !== 'INTR' || ctrctTp !== 'SWAP') {
      return na('ASIC-128', 'FxdRate1', 'Package',
        'Fixed Rate Leg 1 should be reported for Interest Rate Swaps',
        fxdRate, 'Applicable only for INTR SWAP');
    }
    return {
      ruleId: 'ASIC-128', field: 'FxdRate1', category: 'Package',
      description: 'Fixed Rate Leg 1 should be reported for Interest Rate Swaps',
      severity: 'WARNING',
      status: fxdRate ? 'PASS' : 'FAIL',
      actual: fxdRate,
      expected: 'Fixed rate for IRS',
    };
  });

  // ASIC-129: Spread should be reported for floating legs
  rules.push((r) => {
    const asstClss = val(r.fields.get('AsstClss'));
    const ctrctTp = val(r.fields.get('CtrctTp'));
    const sprd = val(r.fields.get('Sprd1')) ?? val(r.fields.get('Sprd2'));
    if (asstClss !== 'INTR' || ctrctTp !== 'SWAP') {
      return na('ASIC-129', 'Sprd1/Sprd2', 'Package',
        'Spread should be reported for floating legs on Interest Rate Swaps',
        sprd, 'Applicable only for INTR SWAP');
    }
    return {
      ruleId: 'ASIC-129', field: 'Sprd1/Sprd2', category: 'Package',
      description: 'Spread should be reported for floating legs on Interest Rate Swaps',
      severity: 'WARNING',
      status: sprd ? 'PASS' : 'FAIL',
      actual: sprd,
      expected: 'Spread value for floating leg',
    };
  });

  // ASIC-130: Exchange Rate mandatory for CURR (FX) asset class
  rules.push((r) => {
    const asstClss = val(r.fields.get('AsstClss'));
    const xchgRate = val(r.fields.get('XchgRate'));
    if (asstClss !== 'CURR') {
      return na('ASIC-130', 'XchgRate', 'Package',
        'Exchange Rate should be reported for FX (CURR) derivatives',
        xchgRate, 'Applicable only for CURR asset class');
    }
    return {
      ruleId: 'ASIC-130', field: 'XchgRate', category: 'Package',
      description: 'Exchange Rate should be reported for FX (CURR) derivatives',
      severity: 'WARNING',
      status: xchgRate ? 'PASS' : 'FAIL',
      actual: xchgRate,
      expected: 'Exchange rate for FX transaction',
    };
  });

  return rules;
}

// ─── Main build & validate ──────────────────────────────────────────

function buildRules(): RuleFn[] {
  return [
    ...buildCounterpartyRules(),
    ...buildIdentifierRules(),
    ...buildProductRules(),
    ...buildDateRules(),
    ...buildClearingRules(),
    ...buildNotionalRules(),
    ...buildPriceRules(),
    ...buildValuationRules(),
    ...buildActionEventRules(),
    ...buildCollateralRules(),
    ...buildPackageRules(),
  ];
}

/**
 * Run all ASIC validation rules against a parsed derivative trade report.
 */
export function validateReport(report: ParsedReport): ValidationResult[] {
  const rules = buildRules();
  return rules.map((fn) => fn(report));
}
