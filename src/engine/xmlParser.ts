/**
 * XML Parser for ISO 20022 auth.030 DerivativesTradeReportV04 messages.
 * Supports single and multi-trade parsing with field-level editing.
 *
 * Structure per ASIC ISO 20022 Mapping Document v1.1 (Feb 2025):
 *   DerivsTradRpt > TradData > Rpt > {Action} > {
 *     RptgTmStmp,
 *     CptrPtySpcfcData > CtrPty > { ... },
 *     CmonTradData > {
 *       CtrctData > { ... },
 *       TxData > { ... }
 *     }
 *   }
 */

export interface ParsedField {
  path: string;
  value: string | null;
  element: string;
}

export interface ParsedReport {
  raw: string;
  doc: Document;
  actionType: string | null;
  fields: Map<string, string | null>;
}

const NS = 'urn:iso:std:iso:20022:tech:xsd:auth.030.001.04';

const ACTION_MAP: Record<string, string> = {
  New: 'NEWT',
  Mod: 'MODI',
  Crrctn: 'CORR',
  Termntn: 'TERM',
  ValtnUpd: 'VALU',
  Err: 'EROR',
  PrtOut: 'POSC',
  Rvv: 'REVI',
};

const ACTION_WRAPPERS = Object.keys(ACTION_MAP);

/**
 * Find a direct child element by local name.
 * Prefers direct children (by localName) to avoid matching deeply nested descendants
 * when a tag name appears at multiple nesting levels (e.g., `Id > Lgl > Id > LEI`).
 * Falls back to namespace-qualified descendant search, then non-namespace descendant search.
 */
function findChild(parent: Element, tag: string): Element | undefined {
  // First: check direct children by localName (handles namespaced and non-namespaced)
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].localName === tag) {
      return parent.children[i];
    }
  }
  // Fallback: descendant search (for documents with unexpected nesting)
  return parent.getElementsByTagNameNS(NS, tag)[0] ?? parent.getElementsByTagName(tag)[0];
}

function getTextContent(parent: Element, ...tags: string[]): string | null {
  let current: Element | null = parent;
  for (const tag of tags) {
    if (!current) return null;
    current = findChild(current, tag) ?? null;
  }
  return current?.textContent?.trim() ?? null;
}

function getElement(parent: Element, ...tags: string[]): Element | null {
  let current: Element | null = parent;
  for (const tag of tags) {
    if (!current) return null;
    current = findChild(current, tag) ?? null;
  }
  return current;
}

function elementExists(parent: Element, ...tags: string[]): boolean {
  return getElement(parent, ...tags) !== null;
}

/**
 * Get an attribute value from an element found by path traversal.
 */
function getAttributeValue(parent: Element, attr: string, ...tags: string[]): string | null {
  const el = getElement(parent, ...tags);
  return el?.getAttribute(attr)?.trim() ?? null;
}

/**
 * Find the action container — supports Rpt wrapper (correct per spec) or direct fallback.
 */
function findActionContainer(tradData: Element): Element {
  const rpt = getElement(tradData, 'Rpt');
  if (rpt) return rpt;
  return tradData;
}

function detectActionType(container: Element): string | null {
  for (const [tag, code] of Object.entries(ACTION_MAP)) {
    if (elementExists(container, tag)) {
      return code;
    }
  }
  return null;
}

function findActionElement(container: Element): Element | null {
  for (const w of ACTION_WRAPPERS) {
    const el = getElement(container, w);
    if (el) return el;
  }
  return null;
}

/**
 * Extract all fields from a single TradData element using correct ASIC paths.
 */
function parseTradDataElement(tradData: Element, xml: string, doc: Document): ParsedReport {
  const actionContainer = findActionContainer(tradData);
  const actionType = detectActionType(actionContainer);
  const actionEl = findActionElement(actionContainer);

  if (!actionEl) {
    throw new Error('No action type wrapper element found (New, Mod, Crrctn, etc.)');
  }

  // === Establish four base elements ===
  // Support both ASIC abbreviation (CptrPtySpcfcData) and ISO 20022 XSD name (CtrPtySpcfcData)
  const cptrPtySpcfcData = getElement(actionEl, 'CptrPtySpcfcData')
    ?? getElement(actionEl, 'CtrPtySpcfcData');
  const ctrPty = cptrPtySpcfcData ? getElement(cptrPtySpcfcData, 'CtrPty') : null;

  const cmonTradData = getElement(actionEl, 'CmonTradData');
  const ctrctData = cmonTradData ? getElement(cmonTradData, 'CtrctData') : null;
  const txData = cmonTradData ? getElement(cmonTradData, 'TxData') : null;

  const fields = new Map<string, string | null>();

  // ═══════════════════════════════════════════════════════════════════
  // COUNTERPARTY DATA (from CtrPty element)
  // ═══════════════════════════════════════════════════════════════════

  fields.set('NttyRspnsblForRpt.LEI',
    ctrPty ? getTextContent(ctrPty, 'NttyRspnsblForRpt', 'LEI') : null);

  fields.set('RptgCtrPty.LEI',
    ctrPty ? getTextContent(ctrPty, 'RptgCtrPty', 'Id', 'Lgl', 'Id', 'LEI') : null);

  fields.set('RptgCtrPty.Ntr',
    ctrPty ? getTextContent(ctrPty, 'RptgCtrPty', 'Ntr') : null);

  fields.set('OthrCtrPty.LEI',
    ctrPty ? getTextContent(ctrPty, 'OthrCtrPty', 'IdTp', 'Lgl', 'Id', 'LEI') : null);

  fields.set('OthrCtrPty.PrtryId',
    ctrPty ? getTextContent(ctrPty, 'OthrCtrPty', 'IdTp', 'Prtry', 'Id') : null);

  fields.set('OthrCtrPty.Ctry',
    ctrPty ? getTextContent(ctrPty, 'OthrCtrPty', 'IdTp', 'Lgl', 'Ctry') : null);
  if (!fields.get('OthrCtrPty.Ctry') && ctrPty) {
    fields.set('OthrCtrPty.Ctry',
      getTextContent(ctrPty, 'OthrCtrPty', 'IdTp', 'Prtry', 'Ctry'));
  }

  fields.set('Bnfcry.LEI',
    ctrPty ? getTextContent(ctrPty, 'Bnfcry', 'Lgl', 'Id', 'LEI') : null);
  fields.set('Brkr.LEI',
    ctrPty ? getTextContent(ctrPty, 'Brkr', 'LEI') : null);
  fields.set('ExctnAgt.LEI',
    ctrPty ? getTextContent(ctrPty, 'ExctnAgt', 'LEI') : null);
  fields.set('ClrMmb.LEI',
    ctrPty ? getTextContent(ctrPty, 'ClrMmb', 'Lgl', 'Id', 'LEI') : null);
  fields.set('SubmitgAgt.LEI',
    ctrPty ? getTextContent(ctrPty, 'SubmitgAgt', 'LEI') : null);

  fields.set('CtrPtySd',
    ctrPty ? getTextContent(ctrPty, 'RptgCtrPty', 'DrctnOrSide', 'CtrPtySd') : null);
  fields.set('DrctnLeg1',
    ctrPty ? getTextContent(ctrPty, 'RptgCtrPty', 'DrctnOrSide', 'Drctn', 'DrctnOfTheFrstLeg') : null);
  fields.set('DrctnLeg2',
    ctrPty ? getTextContent(ctrPty, 'RptgCtrPty', 'DrctnOrSide', 'Drctn', 'DrctnOfTheScndLeg') : null);
  fields.set('RptgCtrPty.DrclyLkdActvty',
    ctrPty ? getTextContent(ctrPty, 'RptgCtrPty', 'DrclyLkdActvty') : null);

  // Valuation data (under CtrPty for VALU actions)
  fields.set('Valtn.Amt',
    ctrPty ? getTextContent(ctrPty, 'Valtn', 'CtrctVal', 'Amt') : null);
  fields.set('Valtn.Ccy',
    ctrPty ? getTextContent(ctrPty, 'Valtn', 'CtrctVal', 'Ccy') : null);
  fields.set('Valtn.TmStmp',
    ctrPty ? getTextContent(ctrPty, 'Valtn', 'TmStmp', 'DtTm') : null);
  fields.set('Valtn.Tp',
    ctrPty ? getTextContent(ctrPty, 'Valtn', 'Tp') : null);
  fields.set('Valtn.Dlt',
    ctrPty ? getTextContent(ctrPty, 'Valtn', 'Dlt') : null);

  // ═══════════════════════════════════════════════════════════════════
  // CONTRACT DATA (from CtrctData element)
  // ═══════════════════════════════════════════════════════════════════

  fields.set('UPI',
    ctrctData ? getTextContent(ctrctData, 'PdctId', 'UnqPdctIdr') : null);
  fields.set('PdctClssfctn',
    ctrctData ? getTextContent(ctrctData, 'PdctId', 'Clssfctn', 'Cd') : null);
  fields.set('CtrctTp',
    ctrctData ? getTextContent(ctrctData, 'CtrctTp') : null);
  fields.set('AsstClss',
    ctrctData ? getTextContent(ctrctData, 'AsstClss') : null);
  fields.set('SttlmCcy',
    ctrctData ? getTextContent(ctrctData, 'SttlmCcy', 'Ccy') : null);
  fields.set('UndrlygId',
    ctrctData ? getTextContent(ctrctData, 'Undrlyr', 'Id') : null);

  // ═══════════════════════════════════════════════════════════════════
  // TRANSACTION DATA (from TxData element)
  // ═══════════════════════════════════════════════════════════════════

  fields.set('UTI',
    txData ? getTextContent(txData, 'TxId', 'UnqTxIdr') : null);
  fields.set('PrrUTI',
    txData ? getTextContent(txData, 'PrrUnqTxIdr', 'UnqTxIdr') : null);
  fields.set('ScndryTxId',
    txData ? getTextContent(txData, 'ScndryTxId') : null);

  fields.set('ExctnTmStmp',
    txData ? getTextContent(txData, 'ExctnTmStmp') : null);
  fields.set('FctvDt',
    txData ? getTextContent(txData, 'FctvDt') : null);
  fields.set('XpryDt',
    txData ? getTextContent(txData, 'XprtnDt') : null);
  fields.set('MtrtyDt',
    txData ? getTextContent(txData, 'MtrtyDt') : null);
  fields.set('EarlyTermntnDt',
    txData ? getTextContent(txData, 'EarlyTermntnDt') : null);

  // Reporting Timestamp — direct child of action wrapper
  fields.set('RptgTmStmp', getTextContent(actionEl, 'RptgTmStmp'));

  // Event Data
  fields.set('EvtTp',
    txData ? getTextContent(txData, 'DerivEvt', 'Tp') : null);
  fields.set('EvtTmStmp',
    txData ? getTextContent(txData, 'DerivEvt', 'TmStmp', 'DtTm') : null);
  fields.set('EvtId',
    txData ? getTextContent(txData, 'DerivEvt', 'Id', 'EvtIdr') : null);

  // Clearing
  if (txData) {
    const clrd = getElement(txData, 'TradClr', 'ClrSts', 'Clrd');
    const intndToClr = getElement(txData, 'TradClr', 'ClrSts', 'IntndToClr');
    const nonClrd = getElement(txData, 'TradClr', 'ClrSts', 'NonClrd');
    if (clrd) fields.set('Clrd', 'Y');
    else if (intndToClr) fields.set('Clrd', 'I');
    else if (nonClrd) fields.set('Clrd', 'N');
    else fields.set('Clrd', null);
  } else {
    fields.set('Clrd', null);
  }

  fields.set('CCP.LEI',
    txData ? getTextContent(txData, 'TradClr', 'ClrSts', 'Clrd', 'CCP', 'LEI') : null);
  fields.set('NonClrdRsn',
    txData ? getTextContent(txData, 'TradClr', 'ClrSts', 'NonClrd') : null);
  fields.set('PltfmIdr',
    txData ? getTextContent(txData, 'PltfmIdr') : null);
  fields.set('MstrAgrmt.Tp',
    txData ? getTextContent(txData, 'MstrAgrmt', 'Tp', 'Cd') : null);

  // Notional Amounts
  fields.set('NtnlAmt1',
    txData ? getTextContent(txData, 'NtnlAmt', 'FrstLeg', 'Amt', 'Amt') : null);
  fields.set('NtnlCcy1',
    txData ? (getAttributeValue(txData, 'Ccy', 'NtnlAmt', 'FrstLeg', 'Amt', 'Amt') ??
              getTextContent(txData, 'NtnlAmt', 'FrstLeg', 'Amt', 'Ccy')) : null);
  fields.set('NtnlAmt2',
    txData ? getTextContent(txData, 'NtnlAmt', 'ScndLeg', 'Amt', 'Amt') : null);
  fields.set('NtnlCcy2',
    txData ? (getAttributeValue(txData, 'Ccy', 'NtnlAmt', 'ScndLeg', 'Amt', 'Amt') ??
              getTextContent(txData, 'NtnlAmt', 'ScndLeg', 'Amt', 'Ccy')) : null);
  fields.set('Qty1',
    txData ? getTextContent(txData, 'NtnlAmt', 'FrstLeg', 'NtnlQty', 'Qty') : null);
  fields.set('Qty2',
    txData ? getTextContent(txData, 'NtnlAmt', 'ScndLeg', 'NtnlQty', 'Qty') : null);

  // Price Data
  fields.set('Pric',
    txData ? (getTextContent(txData, 'TxPric', 'Pric', 'Dcml') ??
              getTextContent(txData, 'TxPric', 'Pric', 'MntryVal', 'Amt')) : null);
  fields.set('PricCcy',
    txData ? (getTextContent(txData, 'TxPric', 'Pric', 'MntryVal', 'Ccy') ??
              getAttributeValue(txData, 'Ccy', 'TxPric', 'Pric', 'MntryVal', 'Amt')) : null);
  fields.set('PricNtn',
    txData ? getTextContent(txData, 'TxPric', 'Pric', 'BsisPtSprd') : null);
  // Flag to indicate price was reported as monetary (not decimal rate)
  fields.set('PricIsMntry',
    txData && getElement(txData, 'TxPric', 'Pric', 'MntryVal') ? 'true' : null);

  // Interest Rates
  fields.set('FxdRate1',
    txData ? getTextContent(txData, 'IntrstRate', 'FrstLeg', 'Fxd', 'Rate', 'Dcml') : null);
  fields.set('FxdRate2',
    txData ? getTextContent(txData, 'IntrstRate', 'ScndLeg', 'Fxd', 'Rate', 'Dcml') : null);
  fields.set('Sprd1',
    txData ? getTextContent(txData, 'IntrstRate', 'FrstLeg', 'Fltg', 'Sprd', 'Dcml') : null);
  fields.set('Sprd2',
    txData ? getTextContent(txData, 'IntrstRate', 'ScndLeg', 'Fltg', 'Sprd', 'Dcml') : null);

  // Option fields
  fields.set('StrkPric',
    txData ? getTextContent(txData, 'Optn', 'StrkPric', 'Dcml') : null);
  fields.set('StrkPricCcy',
    txData ? getTextContent(txData, 'Optn', 'StrkPric', 'MntryVal', 'Ccy') : null);
  fields.set('OptnTp',
    txData ? getTextContent(txData, 'Optn', 'Tp') : null);
  fields.set('OptnExrcStyle',
    txData ? getTextContent(txData, 'Optn', 'ExrcStyle') : null);
  fields.set('OptnPrm',
    txData ? getTextContent(txData, 'Optn', 'Prmm', 'Amt') : null);
  fields.set('OptnPrmCcy',
    txData ? getTextContent(txData, 'Optn', 'Prmm', 'Ccy') : null);

  // Exchange Rate
  fields.set('XchgRate',
    txData ? getTextContent(txData, 'Ccy', 'XchgRate') : null);

  // Collateral Data
  const collData = getElement(actionEl, 'CollData');
  if (collData) {
    fields.set('Coll.PrtflCd', getTextContent(collData, 'PrtflCd', 'Id'));
    fields.set('Coll.InitlMrgnPstd', getTextContent(collData, 'InitlMrgnPstd', 'Amt'));
    fields.set('Coll.InitlMrgnRcvd', getTextContent(collData, 'InitlMrgnRcvd', 'Amt'));
    fields.set('Coll.VartnMrgnPstd', getTextContent(collData, 'VartnMrgnPstd', 'Amt'));
    fields.set('Coll.VartnMrgnRcvd', getTextContent(collData, 'VartnMrgnRcvd', 'Amt'));
  }

  // Package Data
  fields.set('PckgId',
    txData ? getTextContent(txData, 'Packg', 'CmplxTradId') : null);
  fields.set('PckgPric',
    txData ? getTextContent(txData, 'Packg', 'Pric', 'MntryVal', 'Amt') : null);
  fields.set('PckgSprd',
    txData ? getTextContent(txData, 'Packg', 'Sprd', 'Dcml') : null);

  return { raw: xml, doc, actionType, fields };
}

/**
 * Parse a single-trade XML (backward compatible).
 */
export function parseDerivativesTradeReport(xml: string): ParsedReport {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`XML Parse Error: ${parseError.textContent}`);
  }

  const root =
    doc.getElementsByTagNameNS(NS, 'DerivsTradRpt')[0] ??
    doc.getElementsByTagName('DerivsTradRpt')[0] ??
    doc.documentElement;

  const tradData =
    root.getElementsByTagNameNS(NS, 'TradData')[0] ??
    root.getElementsByTagName('TradData')[0];

  if (!tradData) {
    throw new Error('Missing <TradData> element in the XML document.');
  }

  return parseTradDataElement(tradData, xml, doc);
}

/**
 * Parse all TradData elements from a multi-trade XML document.
 * Returns an array of {index, report} objects. Validation is done by the caller.
 */
export function parseAllTradeReports(xml: string): { index: number; report: ParsedReport }[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`XML Parse Error: ${parseError.textContent}`);
  }

  const reportElements = getAllReportElements(doc);

  if (reportElements.length === 0) {
    throw new Error('No <TradData> elements found in the XML document.');
  }

  return reportElements.map((el, index) => {
    try {
      return { index, report: parseTradDataElement(el, xml, doc) };
    } catch {
      // Return a minimal report for malformed trade elements so other trades still display
      return { index, report: { raw: xml, doc, actionType: null, fields: new Map<string, string | null>() } as ParsedReport };
    }
  });
}

/**
 * Maps validation field names to their XML element paths.
 * base: 'action' = relative to action wrapper (New/Mod/etc.)
 * base: 'counterparty' = relative to CptrPtySpcfcData > CtrPty
 * base: 'contract' = relative to CmonTradData > CtrctData
 * base: 'transaction' = relative to CmonTradData > TxData
 */
export const FIELD_PATHS: Record<string, { base: 'action' | 'counterparty' | 'contract' | 'transaction'; tags: string[] }> = {
  // Counterparty fields
  'NttyRspnsblForRpt.LEI': { base: 'counterparty', tags: ['NttyRspnsblForRpt', 'LEI'] },
  'RptgCtrPty.LEI': { base: 'counterparty', tags: ['RptgCtrPty', 'Id', 'Lgl', 'Id', 'LEI'] },
  'OthrCtrPty.LEI': { base: 'counterparty', tags: ['OthrCtrPty', 'IdTp', 'Lgl', 'Id', 'LEI'] },
  'OthrCtrPty.Ctry': { base: 'counterparty', tags: ['OthrCtrPty', 'IdTp', 'Lgl', 'Ctry'] },
  'Bnfcry.LEI': { base: 'counterparty', tags: ['Bnfcry', 'Lgl', 'Id', 'LEI'] },
  'Brkr.LEI': { base: 'counterparty', tags: ['Brkr', 'LEI'] },
  'ExctnAgt.LEI': { base: 'counterparty', tags: ['ExctnAgt', 'LEI'] },
  'ClrMmb.LEI': { base: 'counterparty', tags: ['ClrMmb', 'Lgl', 'Id', 'LEI'] },
  'SubmitgAgt.LEI': { base: 'counterparty', tags: ['SubmitgAgt', 'LEI'] },
  'CtrPtySd': { base: 'counterparty', tags: ['RptgCtrPty', 'DrctnOrSide', 'CtrPtySd'] },
  'DrctnLeg1': { base: 'counterparty', tags: ['RptgCtrPty', 'DrctnOrSide', 'Drctn', 'DrctnOfTheFrstLeg'] },
  'DrctnLeg2': { base: 'counterparty', tags: ['RptgCtrPty', 'DrctnOrSide', 'Drctn', 'DrctnOfTheScndLeg'] },
  'Valtn.Amt': { base: 'counterparty', tags: ['Valtn', 'CtrctVal', 'Amt'] },
  'Valtn.Ccy': { base: 'counterparty', tags: ['Valtn', 'CtrctVal', 'Ccy'] },
  'Valtn.TmStmp': { base: 'counterparty', tags: ['Valtn', 'TmStmp', 'DtTm'] },
  'Valtn.Tp': { base: 'counterparty', tags: ['Valtn', 'Tp'] },
  'Valtn.Dlt': { base: 'counterparty', tags: ['Valtn', 'Dlt'] },

  // Contract fields
  'UPI': { base: 'contract', tags: ['PdctId', 'UnqPdctIdr'] },
  'PdctClssfctn': { base: 'contract', tags: ['PdctId', 'Clssfctn', 'Cd'] },
  'CtrctTp': { base: 'contract', tags: ['CtrctTp'] },
  'AsstClss': { base: 'contract', tags: ['AsstClss'] },
  'SttlmCcy': { base: 'contract', tags: ['SttlmCcy', 'Ccy'] },

  // Transaction fields
  'UTI': { base: 'transaction', tags: ['TxId', 'UnqTxIdr'] },
  'PrrUTI': { base: 'transaction', tags: ['PrrUnqTxIdr', 'UnqTxIdr'] },
  'ExctnTmStmp': { base: 'transaction', tags: ['ExctnTmStmp'] },
  'FctvDt': { base: 'transaction', tags: ['FctvDt'] },
  'XpryDt': { base: 'transaction', tags: ['XprtnDt'] },
  'MtrtyDt': { base: 'transaction', tags: ['MtrtyDt'] },
  'RptgTmStmp': { base: 'action', tags: ['RptgTmStmp'] },
  'CCP.LEI': { base: 'transaction', tags: ['TradClr', 'ClrSts', 'Clrd', 'CCP', 'LEI'] },
  'PltfmIdr': { base: 'transaction', tags: ['PltfmIdr'] },
  'NtnlAmt1': { base: 'transaction', tags: ['NtnlAmt', 'FrstLeg', 'Amt', 'Amt'] },
  'NtnlCcy1': { base: 'transaction', tags: ['NtnlAmt', 'FrstLeg', 'Amt', 'Ccy'] },
  'NtnlAmt2': { base: 'transaction', tags: ['NtnlAmt', 'ScndLeg', 'Amt', 'Amt'] },
  'NtnlCcy2': { base: 'transaction', tags: ['NtnlAmt', 'ScndLeg', 'Amt', 'Ccy'] },
  'Pric': { base: 'transaction', tags: ['TxPric', 'Pric', 'Dcml'] },
  'PricCcy': { base: 'transaction', tags: ['TxPric', 'Pric', 'MntryVal', 'Ccy'] },
  'FxdRate1': { base: 'transaction', tags: ['IntrstRate', 'FrstLeg', 'Fxd', 'Rate', 'Dcml'] },
  'FxdRate2': { base: 'transaction', tags: ['IntrstRate', 'ScndLeg', 'Fxd', 'Rate', 'Dcml'] },
  'Sprd1': { base: 'transaction', tags: ['IntrstRate', 'FrstLeg', 'Fltg', 'Sprd', 'Dcml'] },
  'Sprd2': { base: 'transaction', tags: ['IntrstRate', 'ScndLeg', 'Fltg', 'Sprd', 'Dcml'] },
  'StrkPric': { base: 'transaction', tags: ['Optn', 'StrkPric', 'Dcml'] },
  'OptnTp': { base: 'transaction', tags: ['Optn', 'Tp'] },
  'OptnExrcStyle': { base: 'transaction', tags: ['Optn', 'ExrcStyle'] },
  'EvtTp': { base: 'transaction', tags: ['DerivEvt', 'Tp'] },
  'EvtTmStmp': { base: 'transaction', tags: ['DerivEvt', 'TmStmp', 'DtTm'] },
  'XchgRate': { base: 'transaction', tags: ['Ccy', 'XchgRate'] },
  'PckgId': { base: 'transaction', tags: ['Packg', 'CmplxTradId'] },
  'Coll.InitlMrgnPstd': { base: 'action', tags: ['CollData', 'InitlMrgnPstd', 'Amt'] },
  'Coll.VartnMrgnPstd': { base: 'action', tags: ['CollData', 'VartnMrgnPstd', 'Amt'] },
};

/**
 * Collect all individual report elements from parsed XML.
 * Per the ISO 20022 XSD, a TradData can contain multiple Rpt elements
 * (maxOccurs=unbounded). This function expands them so every Rpt is
 * returned as a separate entry, ensuring all trades in the file are processed.
 *
 * Returns TradData when it contains zero or one Rpt (backward compatible),
 * and individual Rpt elements when a TradData contains multiple Rpt children.
 */
function getAllReportElements(doc: Document): Element[] {
  const root =
    doc.getElementsByTagNameNS(NS, 'DerivsTradRpt')[0] ??
    doc.getElementsByTagName('DerivsTradRpt')[0] ??
    doc.documentElement;

  const nsElements = Array.from(root.getElementsByTagNameNS(NS, 'TradData'));
  const tradDataElements = nsElements.length > 0
    ? nsElements
    : Array.from(root.getElementsByTagName('TradData'));

  const reportElements: Element[] = [];
  for (const tradDataEl of tradDataElements) {
    const rptChildren = Array.from(tradDataEl.children).filter(
      (child) => child.localName === 'Rpt',
    );
    if (rptChildren.length <= 1) {
      // Zero or one Rpt — process TradData as a single report (original behavior)
      reportElements.push(tradDataEl);
    } else {
      // Multiple Rpt elements under one TradData — expand to individual reports
      for (const rpt of rptChildren) {
        reportElements.push(rpt);
      }
    }
  }
  return reportElements;
}

/**
 * Update a field value in the raw XML string.
 * tradeIndex specifies which report element to target (default 0).
 */
export function updateFieldInXml(xml: string, fieldName: string, newValue: string, tradeIndex: number = 0): string {
  const pathDef = FIELD_PATHS[fieldName];
  if (!pathDef) return xml;

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const reportElements = getAllReportElements(doc);
  const reportEl = reportElements[tradeIndex];
  if (!reportEl) return xml;

  const actionContainer = findActionContainer(reportEl);
  const actionEl = findActionElement(actionContainer);
  if (!actionEl) return xml;

  let baseEl: Element | null;
  switch (pathDef.base) {
    case 'action':
      baseEl = actionEl;
      break;
    case 'counterparty': {
      const cptrPty = getElement(actionEl, 'CptrPtySpcfcData')
        ?? getElement(actionEl, 'CtrPtySpcfcData');
      baseEl = cptrPty ? getElement(cptrPty, 'CtrPty') : null;
      break;
    }
    case 'contract': {
      const cmon = getElement(actionEl, 'CmonTradData');
      baseEl = cmon ? getElement(cmon, 'CtrctData') : null;
      break;
    }
    case 'transaction': {
      const cmon = getElement(actionEl, 'CmonTradData');
      baseEl = cmon ? getElement(cmon, 'TxData') : null;
      break;
    }
  }

  if (!baseEl) return xml;

  // Navigate to target element, creating missing elements along the way
  let current: Element = baseEl;
  for (const tag of pathDef.tags) {
    let child = findChild(current, tag);
    if (!child) {
      child = current.namespaceURI
        ? doc.createElementNS(current.namespaceURI, tag)
        : doc.createElement(tag);
      current.appendChild(child);
    }
    current = child;
  }

  current.textContent = newValue;
  return new XMLSerializer().serializeToString(doc);
}
