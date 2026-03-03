/**
 * XML Parser for ISO 20022 auth.030 DerivativesTradeReport messages.
 * Extracts field values from the XML using XPath-like path traversal.
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

function findChild(parent: Element, tag: string): Element | undefined {
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
 * Detect the action type from the Level 3 wrapper element.
 * Action type is implicit in the XML structure — it's the element name
 * that wraps the trade data (New, Mod, Crrctn, Termntn, etc.)
 */
function detectActionType(tradData: Element): string | null {
  const actionMap: Record<string, string> = {
    New: 'NEWT',
    Mod: 'MODI',
    Crrctn: 'CORR',
    Termntn: 'TERM',
    ValtnUpd: 'VALU',
    Err: 'EROR',
    PrtOut: 'POSC',
    Rvv: 'REVI',
  };
  for (const [tag, code] of Object.entries(actionMap)) {
    if (elementExists(tradData, tag)) {
      return code;
    }
  }
  return null;
}

/**
 * Parse an ISO 20022 auth.030 DerivativesTradeReport XML string
 * and extract all reportable data elements.
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

  const actionType = detectActionType(tradData);

  // Find the action wrapper (New, Mod, etc.)
  const actionWrappers = ['New', 'Mod', 'Crrctn', 'Termntn', 'ValtnUpd', 'Err', 'PrtOut', 'Rvv'];
  let actionEl: Element | null = null;
  for (const w of actionWrappers) {
    actionEl = getElement(tradData, w);
    if (actionEl) break;
  }

  if (!actionEl) {
    throw new Error('No action type wrapper element found (New, Mod, Crrctn, etc.)');
  }

  const fields = new Map<string, string | null>();

  // === Counterparty Data ===
  // S1.3 Item 1 — Reporting Entity (Counterparty 1) LEI
  fields.set('RptgCtrPty.LEI', getTextContent(actionEl, 'CtrPtySpcfcData', 'RptgCtrPty', 'Id', 'Lgl', 'LEI'));

  // S1.3 Item 4 — Counterparty 2 Identifier
  fields.set('OthrCtrPty.LEI', getTextContent(actionEl, 'CtrPtySpcfcData', 'OthrCtrPty', 'Id', 'Lgl', 'LEI'));
  fields.set('OthrCtrPty.PrtryId', getTextContent(actionEl, 'CtrPtySpcfcData', 'OthrCtrPty', 'Id', 'Lgl', 'Prtry', 'Id'));

  // S1.3 Item 5 — Country of Counterparty 2
  fields.set('OthrCtrPty.Ctry', getTextContent(actionEl, 'CtrPtySpcfcData', 'OthrCtrPty', 'Ctry'));

  // S1.3 Item 6 — Beneficiary 1
  fields.set('Bnfcry.LEI', getTextContent(actionEl, 'CtrPtySpcfcData', 'Bnfcry', 'Id', 'Lgl', 'LEI'));

  // S1.3 Item 9 — Direction (Counterparty 1)
  fields.set('CtrPty1.Drctn', getTextContent(actionEl, 'CtrPtySpcfcData', 'RptgCtrPty', 'Drctn', 'DrctnOfTheFrstLeg'));

  // S1.3 Item 10 — Direction (Counterparty 2)
  const drctnCtrPty2 = getTextContent(actionEl, 'CtrPtySpcfcData', 'OthrCtrPty', 'Drctn', 'DrctnOfTheFrstLeg');
  fields.set('CtrPty2.Drctn', drctnCtrPty2);

  // S1.3 Item 11 — Directly linked to commercial activity (Counterparty 1)
  fields.set('RptgCtrPty.DrclyLkdActvty', getTextContent(actionEl, 'CtrPtySpcfcData', 'RptgCtrPty', 'DrclyLkdActvty'));

  // === Common Trade Data ===
  const cmonTradData = getElement(actionEl, 'CmonTradData');

  // S1.3 Item 12 — UTI
  fields.set('UTI', getTextContent(actionEl, 'TxId', 'UnqTradIdr'));
  // Also try under common data
  if (!fields.get('UTI')) {
    fields.set('UTI', getTextContent(cmonTradData!, 'TxId', 'UnqTradIdr'));
  }

  // S1.3 Item 13 — Prior UTI
  fields.set('PrrUTI', getTextContent(actionEl, 'TxId', 'PrrUnqTradIdr'));

  // S1.3 Item 14 — UPI (Unique Product Identifier)
  fields.set('UPI', getTextContent(cmonTradData!, 'PdctData', 'UPI'));

  // S1.3 Item 15 — Product Classification (CFI)
  fields.set('PdctClssfctn', getTextContent(cmonTradData!, 'PdctData', 'Clssfctn', 'Cd'));

  // S1.3 Item 16 — Contract Type
  fields.set('CtrctTp', getTextContent(cmonTradData!, 'PdctData', 'CtrctTp'));

  // S1.3 Item 17 — Asset Class
  fields.set('AsstClss', getTextContent(cmonTradData!, 'PdctData', 'AsstClss'));

  // === Dates and Timestamps ===
  // S1.3 Item 20 — Execution Timestamp
  fields.set('ExctnTmStmp', getTextContent(cmonTradData!, 'ExctnDtTm'));

  // S1.3 Item 21 — Effective Date
  fields.set('FctvDt', getTextContent(cmonTradData!, 'FctvDt'));

  // S1.3 Item 22 — Expiry Date
  fields.set('XpryDt', getTextContent(cmonTradData!, 'XpryDt'));

  // S1.3 Item 23 — Maturity Date
  fields.set('MtrtyDt', getTextContent(cmonTradData!, 'MtrtyDt'));

  // S1.3 Item 24 — Early Termination Date
  fields.set('EarlyTermntnDt', getTextContent(cmonTradData!, 'EarlyTermntnDt'));

  // S1.3 Item 25 — Reporting Timestamp
  fields.set('RptgTmStmp', getTextContent(cmonTradData!, 'RptgDtTm'));

  // === Clearing and Trading ===
  // S1.3 Item 30 — Cleared
  const clrd = getElement(cmonTradData!, 'TradClr', 'ClrSts', 'Clrd');
  const intndToClr = getElement(cmonTradData!, 'TradClr', 'ClrSts', 'IntndToClr');
  const nonClrd = getElement(cmonTradData!, 'TradClr', 'ClrSts', 'NonClrd');
  if (clrd) fields.set('Clrd', 'Y');
  else if (intndToClr) fields.set('Clrd', 'I');
  else if (nonClrd) fields.set('Clrd', 'N');
  else fields.set('Clrd', null);

  // S1.3 Item 31 — CCP LEI (if cleared)
  fields.set('CCP.LEI', getTextContent(cmonTradData!, 'TradClr', 'ClrSts', 'Clrd', 'Dtls', 'CCP', 'LEI'));

  // S1.3 Item 35 — Platform / Execution Venue
  fields.set('ExctnVn', getTextContent(cmonTradData!, 'TradgVn', 'Id'));

  // S1.3 Item 36 — Master Agreement Type
  fields.set('MstrAgrmt.Tp', getTextContent(cmonTradData!, 'MstrAgrmt', 'Tp', 'Cd'));

  // === Notional Amounts and Quantities ===
  // S1.3 Item 40 — Notional Amount Leg 1
  fields.set('NtnlAmt1', getTextContent(cmonTradData!, 'NtnlAmt', 'Amt', 'FrstLeg'));

  // S1.3 Item 41 — Notional Currency Leg 1
  fields.set('NtnlCcy1', getTextContent(cmonTradData!, 'NtnlAmt', 'Ccy', 'FrstLeg'));

  // S1.3 Item 42 — Notional Amount Leg 2
  fields.set('NtnlAmt2', getTextContent(cmonTradData!, 'NtnlAmt', 'Amt', 'ScndLeg'));

  // S1.3 Item 43 — Notional Currency Leg 2
  fields.set('NtnlCcy2', getTextContent(cmonTradData!, 'NtnlAmt', 'Ccy', 'ScndLeg'));

  // === Price Data ===
  // S1.3 Item 50 — Price
  fields.set('Pric', getTextContent(cmonTradData!, 'Pric', 'Dcml'));
  if (!fields.get('Pric')) {
    fields.set('Pric', getTextContent(cmonTradData!, 'Pric', 'FxdRate'));
  }

  // S1.3 Item 51 — Price Currency
  fields.set('PricCcy', getTextContent(cmonTradData!, 'Pric', 'Ccy'));

  // S1.3 Item 55 — Spread Leg 1
  fields.set('Sprd1', getTextContent(cmonTradData!, 'Sprd', 'FrstLeg'));

  // S1.3 Item 56 — Spread Leg 2
  fields.set('Sprd2', getTextContent(cmonTradData!, 'Sprd', 'ScndLeg'));

  // S1.3 Item 60 — Strike Price
  fields.set('StrkPric', getTextContent(cmonTradData!, 'StrkPric', 'Dcml'));
  fields.set('StrkPricCcy', getTextContent(cmonTradData!, 'StrkPric', 'Ccy'));

  // S1.3 Item 65 — Option Type
  fields.set('OptnTp', getTextContent(cmonTradData!, 'OptnTp'));

  // S1.3 Item 66 — Option Exercise Style
  fields.set('OptnExrcStyle', getTextContent(cmonTradData!, 'OptnExrcStyle'));

  // === Collateral Data ===
  const collData = getElement(actionEl, 'CollData');
  if (collData) {
    fields.set('Coll.PrtflCd', getTextContent(collData, 'PrtflCd', 'Id'));
    fields.set('Coll.InitlMrgnPstd', getTextContent(collData, 'InitlMrgnPstd', 'Amt'));
    fields.set('Coll.InitlMrgnRcvd', getTextContent(collData, 'InitlMrgnRcvd', 'Amt'));
    fields.set('Coll.VartnMrgnPstd', getTextContent(collData, 'VartnMrgnPstd', 'Amt'));
    fields.set('Coll.VartnMrgnRcvd', getTextContent(collData, 'VartnMrgnRcvd', 'Amt'));
  }

  // === Valuation Data ===
  const valData = getElement(actionEl, 'ValtnData');
  if (valData) {
    fields.set('Valtn.Amt', getTextContent(valData, 'MrkToMktVal', 'Amt'));
    fields.set('Valtn.Ccy', getTextContent(valData, 'MrkToMktVal', 'Ccy'));
    fields.set('Valtn.TmStmp', getTextContent(valData, 'ValtnDtTm'));
    fields.set('Valtn.Dlt', getTextContent(valData, 'Dlt'));
  }

  // === Event Type ===
  fields.set('EvtTp', getTextContent(actionEl, 'TechAttrbts', 'EvtTp'));

  // === Package ===
  fields.set('PckgId', getTextContent(cmonTradData!, 'PckgData', 'Id'));

  return {
    raw: xml,
    doc,
    actionType,
    fields,
  };
}

/**
 * Maps validation field names to their XML element paths.
 * base: 'action' = relative to action wrapper (New/Mod/etc.)
 * base: 'common' = relative to CmonTradData
 */
export const FIELD_PATHS: Record<string, { base: 'action' | 'common'; tags: string[] }> = {
  'RptgCtrPty.LEI': { base: 'action', tags: ['CtrPtySpcfcData', 'RptgCtrPty', 'Id', 'Lgl', 'LEI'] },
  'OthrCtrPty.LEI': { base: 'action', tags: ['CtrPtySpcfcData', 'OthrCtrPty', 'Id', 'Lgl', 'LEI'] },
  'OthrCtrPty.Ctry': { base: 'action', tags: ['CtrPtySpcfcData', 'OthrCtrPty', 'Ctry'] },
  'CtrPty1.Drctn': { base: 'action', tags: ['CtrPtySpcfcData', 'RptgCtrPty', 'Drctn', 'DrctnOfTheFrstLeg'] },
  'UTI': { base: 'action', tags: ['TxId', 'UnqTradIdr'] },
  'UPI': { base: 'common', tags: ['PdctData', 'UPI'] },
  'CtrctTp': { base: 'common', tags: ['PdctData', 'CtrctTp'] },
  'AsstClss': { base: 'common', tags: ['PdctData', 'AsstClss'] },
  'ExctnTmStmp': { base: 'common', tags: ['ExctnDtTm'] },
  'FctvDt': { base: 'common', tags: ['FctvDt'] },
  'XpryDt': { base: 'common', tags: ['XpryDt'] },
  'MtrtyDt': { base: 'common', tags: ['MtrtyDt'] },
  'RptgTmStmp': { base: 'common', tags: ['RptgDtTm'] },
  'CCP.LEI': { base: 'common', tags: ['TradClr', 'ClrSts', 'Clrd', 'Dtls', 'CCP', 'LEI'] },
  'NtnlAmt1': { base: 'common', tags: ['NtnlAmt', 'Amt', 'FrstLeg'] },
  'NtnlCcy1': { base: 'common', tags: ['NtnlAmt', 'Ccy', 'FrstLeg'] },
  'NtnlAmt2': { base: 'common', tags: ['NtnlAmt', 'Amt', 'ScndLeg'] },
  'NtnlCcy2': { base: 'common', tags: ['NtnlAmt', 'Ccy', 'ScndLeg'] },
  'Pric': { base: 'common', tags: ['Pric', 'Dcml'] },
  'PricCcy': { base: 'common', tags: ['Pric', 'Ccy'] },
  'StrkPric': { base: 'common', tags: ['StrkPric', 'Dcml'] },
  'OptnTp': { base: 'common', tags: ['OptnTp'] },
  'OptnExrcStyle': { base: 'common', tags: ['OptnExrcStyle'] },
  'Coll.InitlMrgnPstd': { base: 'action', tags: ['CollData', 'InitlMrgnPstd', 'Amt'] },
  'Coll.VartnMrgnPstd': { base: 'action', tags: ['CollData', 'VartnMrgnPstd', 'Amt'] },
  'Valtn.Amt': { base: 'action', tags: ['ValtnData', 'MrkToMktVal', 'Amt'] },
  'Valtn.Ccy': { base: 'action', tags: ['ValtnData', 'MrkToMktVal', 'Ccy'] },
  'Valtn.TmStmp': { base: 'action', tags: ['ValtnData', 'ValtnDtTm'] },
  'Valtn.Dlt': { base: 'action', tags: ['ValtnData', 'Dlt'] },
  'EvtTp': { base: 'action', tags: ['TechAttrbts', 'EvtTp'] },
};

/**
 * Update a field value in the raw XML string.
 * Navigates to the target element (creating missing elements along the path)
 * and sets its text content to the new value.
 */
export function updateFieldInXml(xml: string, fieldName: string, newValue: string): string {
  const pathDef = FIELD_PATHS[fieldName];
  if (!pathDef) return xml;

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const root =
    doc.getElementsByTagNameNS(NS, 'DerivsTradRpt')[0] ??
    doc.getElementsByTagName('DerivsTradRpt')[0] ??
    doc.documentElement;

  const tradData =
    root.getElementsByTagNameNS(NS, 'TradData')[0] ??
    root.getElementsByTagName('TradData')[0];
  if (!tradData) return xml;

  const actionWrappers = ['New', 'Mod', 'Crrctn', 'Termntn', 'ValtnUpd', 'Err', 'PrtOut', 'Rvv'];
  let actionEl: Element | null = null;
  for (const w of actionWrappers) {
    actionEl = getElement(tradData, w);
    if (actionEl) break;
  }
  if (!actionEl) return xml;

  let baseEl: Element;
  if (pathDef.base === 'common') {
    const common = getElement(actionEl, 'CmonTradData');
    if (!common) return xml;
    baseEl = common;
  } else {
    baseEl = actionEl;
  }

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
