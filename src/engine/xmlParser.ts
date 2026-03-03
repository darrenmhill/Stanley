/**
 * XML Parser for ISO 20022 auth.030 DerivativesTradeReport messages.
 * Supports single and multi-trade parsing with field-level editing.
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

const ACTION_WRAPPERS = ['New', 'Mod', 'Crrctn', 'Termntn', 'ValtnUpd', 'Err', 'PrtOut', 'Rvv'];

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
 * Extract all fields from a single TradData element.
 */
function parseTradDataElement(tradData: Element, xml: string, doc: Document): ParsedReport {
  const actionType = detectActionType(tradData);

  let actionEl: Element | null = null;
  for (const w of ACTION_WRAPPERS) {
    actionEl = getElement(tradData, w);
    if (actionEl) break;
  }

  if (!actionEl) {
    throw new Error('No action type wrapper element found (New, Mod, Crrctn, etc.)');
  }

  const fields = new Map<string, string | null>();

  // === Counterparty Data ===
  fields.set('RptgCtrPty.LEI', getTextContent(actionEl, 'CtrPtySpcfcData', 'RptgCtrPty', 'Id', 'Lgl', 'LEI'));
  fields.set('OthrCtrPty.LEI', getTextContent(actionEl, 'CtrPtySpcfcData', 'OthrCtrPty', 'Id', 'Lgl', 'LEI'));
  fields.set('OthrCtrPty.PrtryId', getTextContent(actionEl, 'CtrPtySpcfcData', 'OthrCtrPty', 'Id', 'Lgl', 'Prtry', 'Id'));
  fields.set('OthrCtrPty.Ctry', getTextContent(actionEl, 'CtrPtySpcfcData', 'OthrCtrPty', 'Ctry'));
  fields.set('Bnfcry.LEI', getTextContent(actionEl, 'CtrPtySpcfcData', 'Bnfcry', 'Id', 'Lgl', 'LEI'));
  fields.set('CtrPty1.Drctn', getTextContent(actionEl, 'CtrPtySpcfcData', 'RptgCtrPty', 'Drctn', 'DrctnOfTheFrstLeg'));
  fields.set('CtrPty2.Drctn', getTextContent(actionEl, 'CtrPtySpcfcData', 'OthrCtrPty', 'Drctn', 'DrctnOfTheFrstLeg'));
  fields.set('RptgCtrPty.DrclyLkdActvty', getTextContent(actionEl, 'CtrPtySpcfcData', 'RptgCtrPty', 'DrclyLkdActvty'));

  // === Common Trade Data ===
  const cmonTradData = getElement(actionEl, 'CmonTradData');

  // UTI
  fields.set('UTI', getTextContent(actionEl, 'TxId', 'UnqTradIdr'));
  if (!fields.get('UTI') && cmonTradData) {
    fields.set('UTI', getTextContent(cmonTradData, 'TxId', 'UnqTradIdr'));
  }

  // Prior UTI
  fields.set('PrrUTI', getTextContent(actionEl, 'TxId', 'PrrUnqTradIdr'));

  if (cmonTradData) {
    // Product Data
    fields.set('UPI', getTextContent(cmonTradData, 'PdctData', 'UPI'));
    fields.set('PdctClssfctn', getTextContent(cmonTradData, 'PdctData', 'Clssfctn', 'Cd'));
    fields.set('CtrctTp', getTextContent(cmonTradData, 'PdctData', 'CtrctTp'));
    fields.set('AsstClss', getTextContent(cmonTradData, 'PdctData', 'AsstClss'));

    // Dates and Timestamps
    fields.set('ExctnTmStmp', getTextContent(cmonTradData, 'ExctnDtTm'));
    fields.set('FctvDt', getTextContent(cmonTradData, 'FctvDt'));
    fields.set('XpryDt', getTextContent(cmonTradData, 'XpryDt'));
    fields.set('MtrtyDt', getTextContent(cmonTradData, 'MtrtyDt'));
    fields.set('EarlyTermntnDt', getTextContent(cmonTradData, 'EarlyTermntnDt'));
    fields.set('RptgTmStmp', getTextContent(cmonTradData, 'RptgDtTm'));

    // Clearing
    const clrd = getElement(cmonTradData, 'TradClr', 'ClrSts', 'Clrd');
    const intndToClr = getElement(cmonTradData, 'TradClr', 'ClrSts', 'IntndToClr');
    const nonClrd = getElement(cmonTradData, 'TradClr', 'ClrSts', 'NonClrd');
    if (clrd) fields.set('Clrd', 'Y');
    else if (intndToClr) fields.set('Clrd', 'I');
    else if (nonClrd) fields.set('Clrd', 'N');
    else fields.set('Clrd', null);

    fields.set('CCP.LEI', getTextContent(cmonTradData, 'TradClr', 'ClrSts', 'Clrd', 'Dtls', 'CCP', 'LEI'));
    fields.set('ExctnVn', getTextContent(cmonTradData, 'TradgVn', 'Id'));
    fields.set('MstrAgrmt.Tp', getTextContent(cmonTradData, 'MstrAgrmt', 'Tp', 'Cd'));

    // Notional Amounts
    fields.set('NtnlAmt1', getTextContent(cmonTradData, 'NtnlAmt', 'Amt', 'FrstLeg'));
    fields.set('NtnlCcy1', getTextContent(cmonTradData, 'NtnlAmt', 'Ccy', 'FrstLeg'));
    fields.set('NtnlAmt2', getTextContent(cmonTradData, 'NtnlAmt', 'Amt', 'ScndLeg'));
    fields.set('NtnlCcy2', getTextContent(cmonTradData, 'NtnlAmt', 'Ccy', 'ScndLeg'));

    // Price Data
    fields.set('Pric', getTextContent(cmonTradData, 'Pric', 'Dcml'));
    if (!fields.get('Pric')) {
      fields.set('Pric', getTextContent(cmonTradData, 'Pric', 'FxdRate'));
    }
    fields.set('PricCcy', getTextContent(cmonTradData, 'Pric', 'Ccy'));
    fields.set('Sprd1', getTextContent(cmonTradData, 'Sprd', 'FrstLeg'));
    fields.set('Sprd2', getTextContent(cmonTradData, 'Sprd', 'ScndLeg'));

    // Strike Price
    fields.set('StrkPric', getTextContent(cmonTradData, 'StrkPric', 'Dcml'));
    fields.set('StrkPricCcy', getTextContent(cmonTradData, 'StrkPric', 'Ccy'));

    // Options
    fields.set('OptnTp', getTextContent(cmonTradData, 'OptnTp'));
    fields.set('OptnExrcStyle', getTextContent(cmonTradData, 'OptnExrcStyle'));

    // Delivery Type
    fields.set('DlvryTp', getTextContent(cmonTradData, 'DlvryTp'));

    // Package
    fields.set('PckgId', getTextContent(cmonTradData, 'PckgData', 'Id'));
  }

  // Collateral Data
  const collData = getElement(actionEl, 'CollData');
  if (collData) {
    fields.set('Coll.PrtflCd', getTextContent(collData, 'PrtflCd', 'Id'));
    fields.set('Coll.InitlMrgnPstd', getTextContent(collData, 'InitlMrgnPstd', 'Amt'));
    fields.set('Coll.InitlMrgnRcvd', getTextContent(collData, 'InitlMrgnRcvd', 'Amt'));
    fields.set('Coll.VartnMrgnPstd', getTextContent(collData, 'VartnMrgnPstd', 'Amt'));
    fields.set('Coll.VartnMrgnRcvd', getTextContent(collData, 'VartnMrgnRcvd', 'Amt'));
  }

  // Valuation Data
  const valData = getElement(actionEl, 'ValtnData');
  if (valData) {
    fields.set('Valtn.Amt', getTextContent(valData, 'MrkToMktVal', 'Amt'));
    fields.set('Valtn.Ccy', getTextContent(valData, 'MrkToMktVal', 'Ccy'));
    fields.set('Valtn.TmStmp', getTextContent(valData, 'ValtnDtTm'));
    fields.set('Valtn.Dlt', getTextContent(valData, 'Dlt'));
    fields.set('Valtn.Mthd', getTextContent(valData, 'ValtnMthdlgy'));
  }

  // Event Type
  fields.set('EvtTp', getTextContent(actionEl, 'TechAttrbts', 'EvtTp'));

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

  const root =
    doc.getElementsByTagNameNS(NS, 'DerivsTradRpt')[0] ??
    doc.getElementsByTagName('DerivsTradRpt')[0] ??
    doc.documentElement;

  const tradDataElements = [
    ...Array.from(root.getElementsByTagNameNS(NS, 'TradData')),
    ...(root.getElementsByTagNameNS(NS, 'TradData').length === 0
      ? Array.from(root.getElementsByTagName('TradData'))
      : []),
  ];

  if (tradDataElements.length === 0) {
    throw new Error('No <TradData> elements found in the XML document.');
  }

  return tradDataElements.map((tradDataEl, index) => ({
    index,
    report: parseTradDataElement(tradDataEl, xml, doc),
  }));
}

/**
 * Maps validation field names to their XML element paths.
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
 * Collect all TradData elements from parsed XML, respecting namespaces.
 */
function getAllTradDataElements(doc: Document): Element[] {
  const root =
    doc.getElementsByTagNameNS(NS, 'DerivsTradRpt')[0] ??
    doc.getElementsByTagName('DerivsTradRpt')[0] ??
    doc.documentElement;

  const nsElements = Array.from(root.getElementsByTagNameNS(NS, 'TradData'));
  return nsElements.length > 0 ? nsElements : Array.from(root.getElementsByTagName('TradData'));
}

/**
 * Update a field value in the raw XML string.
 * tradeIndex specifies which TradData element to target (default 0).
 */
export function updateFieldInXml(xml: string, fieldName: string, newValue: string, tradeIndex: number = 0): string {
  const pathDef = FIELD_PATHS[fieldName];
  if (!pathDef) return xml;

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const tradDataElements = getAllTradDataElements(doc);
  const tradData = tradDataElements[tradeIndex];
  if (!tradData) return xml;

  let actionEl: Element | null = null;
  for (const w of ACTION_WRAPPERS) {
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
