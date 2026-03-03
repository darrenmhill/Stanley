/**
 * Sample XML generator for ASIC Derivative Reporting Validator.
 * Generates 100+ trades with real GLEIF LEIs and ~25% deliberate errors.
 */

// ─── Real GLEIF LEIs (verified Australian financial institutions) ────
const LEIS = {
  CBA: 'MSFSBD3QN1GSN7Q6C537',
  NAB: 'F8SB4JFBSYQFRQEH3Z21',
  ANZ: 'JHE42UYNWWTJB8YTTU19',
  WBC: 'EN5TNI6CI43VEPAMHL14',
  MQG: '4ZHCHI4KYZG2WVRT8631',
  CBA_SUPER: '549300WS5TTCM62AI332',
  CBA_COVERED: '549300GCIJ2OC9E1MF53',
  ANZ_NZ: 'HZSN7FQBPO5IEWYIGC72',
  MQG_SEC: '549300BIAWNNPUVFP581',
  ASX_CLEAR: '549300HL7SB4EJ2V3679',
};

const LEI_POOL = Object.values(LEIS);

// ─── Seeded PRNG (mulberry32) for deterministic output ──────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20240901);

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randDecimal(min: number, max: number, decimals = 2): string {
  const v = min + rand() * (max - min);
  return v.toFixed(decimals);
}

function padNum(n: number, w: number): string {
  return String(n).padStart(w, '0');
}

// ─── Lookup tables ──────────────────────────────────────────────────

const ACTION_CONFIGS = [
  { wrapper: 'New', code: 'NEWT', weight: 60 },
  { wrapper: 'Mod', code: 'MODI', weight: 15 },
  { wrapper: 'Crrctn', code: 'CORR', weight: 10 },
  { wrapper: 'Termntn', code: 'TERM', weight: 5 },
  { wrapper: 'ValtnUpd', code: 'VALU', weight: 5 },
  { wrapper: 'Err', code: 'EROR', weight: 3 },
  { wrapper: 'Rvv', code: 'REVI', weight: 2 },
] as const;

function pickWeighted(): (typeof ACTION_CONFIGS)[number] {
  const total = ACTION_CONFIGS.reduce((s, a) => s + a.weight, 0);
  let r = rand() * total;
  for (const a of ACTION_CONFIGS) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return ACTION_CONFIGS[0];
}

const ASSET_CLASSES = ['INTR', 'CRDT', 'EQUI', 'COMM', 'FREX'] as const;
const CONTRACT_TYPES = ['SWAP', 'OPTN', 'FUTR', 'FORW', 'FRAS', 'CFDS'] as const;
const CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'HKD'] as const;
const DIRECTIONS = ['BYER', 'SLLR'] as const;
const EVENT_TYPES_NEWT = ['TRAD', 'NOVA', 'COMP', 'CLRG', 'ALOC', 'INCP'] as const;
const EVENT_TYPES_OTHER = ['TRAD', 'NOVA', 'COMP', 'ETRM', 'EXER', 'UPDT', 'CORP'] as const;
const MASTER_AGREE = ['ISDA', 'CMOF', 'DERV', 'OTHR'] as const;
const EXERCISE_STYLES = ['AMER', 'EURO', 'BERM'] as const;
const DELIVERY_TYPES = ['CASH', 'PHYS', 'OPTL'] as const;
const MIC_CODES = ['XASX', 'XSFE', 'XCHI', 'XXXX'] as const;
const COUNTRIES = ['AU', 'US', 'GB', 'JP', 'SG', 'HK', 'NZ', 'DE'] as const;

// ─── Error injection schedule ───────────────────────────────────────
// Trade indices that will have specific errors injected
interface ErrorSpec {
  tradeIdx: number;
  type: string;
}

const ERROR_SCHEDULE: ErrorSpec[] = [
  // Invalid LEI format (4 trades)
  { tradeIdx: 3, type: 'bad_lei' },
  { tradeIdx: 17, type: 'bad_lei' },
  { tradeIdx: 41, type: 'bad_lei' },
  { tradeIdx: 78, type: 'bad_lei' },
  // Maturity before effective (4 trades)
  { tradeIdx: 7, type: 'mat_before_eff' },
  { tradeIdx: 29, type: 'mat_before_eff' },
  { tradeIdx: 55, type: 'mat_before_eff' },
  { tradeIdx: 88, type: 'mat_before_eff' },
  // Non-numeric notional (3 trades)
  { tradeIdx: 11, type: 'bad_notional' },
  { tradeIdx: 45, type: 'bad_notional' },
  { tradeIdx: 72, type: 'bad_notional' },
  // Delta out of range (3 trades)
  { tradeIdx: 15, type: 'bad_delta' },
  { tradeIdx: 52, type: 'bad_delta' },
  { tradeIdx: 91, type: 'bad_delta' },
  // Missing CCP LEI when Clrd=Y (3 trades)
  { tradeIdx: 20, type: 'missing_ccp' },
  { tradeIdx: 60, type: 'missing_ccp' },
  { tradeIdx: 85, type: 'missing_ccp' },
  // Invalid UTI format (2 trades)
  { tradeIdx: 25, type: 'bad_uti' },
  { tradeIdx: 68, type: 'bad_uti' },
  // Invalid currency code (2 trades)
  { tradeIdx: 33, type: 'bad_currency' },
  { tradeIdx: 76, type: 'bad_currency' },
  // Invalid country code (2 trades)
  { tradeIdx: 37, type: 'bad_country' },
  { tradeIdx: 82, type: 'bad_country' },
  // Missing mandatory UPI on NEWT (1 trade)
  { tradeIdx: 48, type: 'missing_upi' },
  // Invalid contract type (1 trade)
  { tradeIdx: 95, type: 'bad_contract' },
];

function getErrorsForTrade(idx: number): Set<string> {
  const errors = new Set<string>();
  for (const e of ERROR_SCHEDULE) {
    if (e.tradeIdx === idx) errors.add(e.type);
  }
  return errors;
}

// ─── Trade XML generation ───────────────────────────────────────────

function generateDate(year: number, monthMin = 1, monthMax = 12): string {
  const m = randInt(monthMin, monthMax);
  const d = randInt(1, 28);
  return `${year}-${padNum(m, 2)}-${padNum(d, 2)}`;
}

function generateTimestamp(date: string, hourMin = 8, hourMax = 17): string {
  const h = randInt(hourMin, hourMax);
  const min = randInt(0, 59);
  const sec = randInt(0, 59);
  return `${date}T${padNum(h, 2)}:${padNum(min, 2)}:${padNum(sec, 2)}+11:00`;
}

function generateUPI(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) result += chars[Math.floor(rand() * chars.length)];
  return result;
}

function generateTradeId(lei: string, idx: number): string {
  const suffix = `TRD${padNum(idx + 1, 4)}${String.fromCharCode(65 + randInt(0, 25))}`;
  return `${lei}${suffix}`;
}

function generateCFI(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 6; i++) result += chars[Math.floor(rand() * chars.length)];
  return result;
}

function generateSingleTrade(idx: number): string {
  const errors = getErrorsForTrade(idx);
  const action = pickWeighted();
  const isExit = ['TERM', 'EROR', 'POSC'].includes(action.code);

  const rptgLei = pick(LEI_POOL);
  let othrLei = pick(LEI_POOL);
  while (othrLei === rptgLei) othrLei = pick(LEI_POOL);

  // Apply errors
  const displayOthrLei = errors.has('bad_lei') ? 'INVALIDLEI12345' : othrLei;
  const othrCtry = errors.has('bad_country') ? '1A' : pick(COUNTRIES);
  const direction1 = pick(DIRECTIONS);
  const direction2 = direction1 === 'BYER' ? 'SLLR' : 'BYER';

  const uti = errors.has('bad_uti')
    ? 'SHORTUTI'
    : generateTradeId(rptgLei, idx);

  const assetClass = pick(ASSET_CLASSES);
  const contractType = errors.has('bad_contract') ? 'BADTYPE' : pick(CONTRACT_TYPES);
  const isOption = contractType === 'OPTN';

  const upi = errors.has('missing_upi') ? '' : generateUPI();
  const cfi = generateCFI();

  // Dates
  const effYear = randInt(2024, 2026);
  const effDate = generateDate(effYear, 1, 12);
  const execDate = effDate;
  const execTimestamp = generateTimestamp(execDate, 8, 12);
  const rptgTimestamp = generateTimestamp(execDate, 13, 17);

  let mtrtyDate: string;
  if (errors.has('mat_before_eff')) {
    // Maturity BEFORE effective
    const badYear = effYear - 1;
    mtrtyDate = generateDate(badYear, 1, 12);
  } else {
    const matYear = effYear + randInt(1, 6);
    mtrtyDate = generateDate(matYear, 1, 12);
  }
  const xpryDate = mtrtyDate;

  // Notional
  const ccy1 = errors.has('bad_currency') ? 'ZZZ' : pick(CURRENCIES);
  const ccy2 = pick(CURRENCIES);
  const notional1 = errors.has('bad_notional') ? 'notanumber' : randDecimal(100000, 500000000, 2);
  const notional2 = rand() > 0.5 ? randDecimal(100000, 500000000, 2) : null;

  // Price
  const price = randDecimal(0.001, 5.0, 6);
  const priceCcy = pick(CURRENCIES);

  // Clearing
  const cleared = rand() > 0.3 ? 'Y' : (rand() > 0.5 ? 'N' : 'I');
  const ccpLei = errors.has('missing_ccp') ? '' : LEIS.ASX_CLEAR;

  // Execution venue
  const venue = pick(MIC_CODES);
  const masterAgrmt = pick(MASTER_AGREE);
  const deliveryType = pick(DELIVERY_TYPES);

  // Event type
  const eventType = action.code === 'NEWT'
    ? pick(EVENT_TYPES_NEWT)
    : pick(EVENT_TYPES_OTHER);

  // Valuation
  const valAmt = randDecimal(-5000000, 5000000, 2);
  const valCcy = pick(CURRENCIES);
  let delta = '';
  if (isOption) {
    delta = errors.has('bad_delta')
      ? randDecimal(1.1, 2.5, 4)
      : randDecimal(-1.0, 1.0, 4);
  }

  // Collateral
  const hasCollateral = rand() > 0.3;
  const initMrgnPstd = hasCollateral ? randDecimal(10000, 2000000, 2) : null;
  const varMrgnPstd = hasCollateral ? randDecimal(5000, 1000000, 2) : null;

  // Option fields
  const optnTp = isOption ? (rand() > 0.5 ? 'CALL' : 'PUTO') : null;
  const optnExrcStyle = isOption ? pick(EXERCISE_STYLES) : null;
  const strkPric = isOption ? randDecimal(0.5, 200, 4) : null;
  const strkPricCcy = isOption ? pick(CURRENCIES) : null;

  // Spread (for swaps)
  const hasSpread = assetClass === 'INTR' && contractType === 'SWAP' && rand() > 0.5;
  const sprd1 = hasSpread ? randDecimal(-0.01, 0.05, 6) : null;
  const sprd2 = hasSpread ? randDecimal(-0.01, 0.05, 6) : null;

  // Beneficiary (sometimes)
  const hasBeneficiary = rand() > 0.6;
  const bnfcryLei = hasBeneficiary ? pick(LEI_POOL) : null;

  // Package (sometimes)
  const hasPackage = rand() > 0.8;
  const pkgId = hasPackage ? `PKG-${effYear}-${padNum(randInt(1, 999), 3)}` : null;

  // Build XML
  let xml = `  <TradData>\n    <${action.wrapper}>\n`;

  // Transaction ID
  xml += `      <TxId>\n        <UnqTradIdr>${uti}</UnqTradIdr>\n      </TxId>\n`;

  // Counterparty Specific Data
  xml += `      <CtrPtySpcfcData>\n`;
  xml += `        <RptgCtrPty>\n`;
  xml += `          <Id><Lgl><LEI>${rptgLei}</LEI></Lgl></Id>\n`;
  xml += `          <Drctn><DrctnOfTheFrstLeg>${direction1}</DrctnOfTheFrstLeg></Drctn>\n`;
  xml += `          <DrclyLkdActvty>false</DrclyLkdActvty>\n`;
  xml += `        </RptgCtrPty>\n`;
  xml += `        <OthrCtrPty>\n`;
  xml += `          <Id><Lgl><LEI>${displayOthrLei}</LEI></Lgl></Id>\n`;
  xml += `          <Ctry>${othrCtry}</Ctry>\n`;
  xml += `          <Drctn><DrctnOfTheFrstLeg>${direction2}</DrctnOfTheFrstLeg></Drctn>\n`;
  xml += `        </OthrCtrPty>\n`;
  if (bnfcryLei) {
    xml += `        <Bnfcry><Id><Lgl><LEI>${bnfcryLei}</LEI></Lgl></Id></Bnfcry>\n`;
  }
  xml += `      </CtrPtySpcfcData>\n`;

  // Common Trade Data
  xml += `      <CmonTradData>\n`;

  // Product Data
  xml += `        <PdctData>\n`;
  if (upi) xml += `          <UPI>${upi}</UPI>\n`;
  xml += `          <Clssfctn><Cd>${cfi}</Cd></Clssfctn>\n`;
  xml += `          <CtrctTp>${contractType}</CtrctTp>\n`;
  xml += `          <AsstClss>${assetClass}</AsstClss>\n`;
  xml += `        </PdctData>\n`;

  // Dates
  xml += `        <ExctnDtTm>${execTimestamp}</ExctnDtTm>\n`;
  if (!isExit) {
    xml += `        <FctvDt>${effDate}</FctvDt>\n`;
    xml += `        <XpryDt>${xpryDate}</XpryDt>\n`;
    xml += `        <MtrtyDt>${mtrtyDate}</MtrtyDt>\n`;
  }
  xml += `        <RptgDtTm>${rptgTimestamp}</RptgDtTm>\n`;

  // Clearing
  xml += `        <TradClr><ClrSts>\n`;
  if (cleared === 'Y') {
    xml += `          <Clrd><Dtls><CCP><LEI>${ccpLei}</LEI></CCP></Dtls></Clrd>\n`;
  } else if (cleared === 'I') {
    xml += `          <IntndToClr/>\n`;
  } else {
    xml += `          <NonClrd/>\n`;
  }
  xml += `        </ClrSts></TradClr>\n`;

  // Venue & Master Agreement
  xml += `        <TradgVn><Id>${venue}</Id></TradgVn>\n`;
  xml += `        <MstrAgrmt><Tp><Cd>${masterAgrmt}</Cd></Tp></MstrAgrmt>\n`;

  // Delivery Type
  xml += `        <DlvryTp>${deliveryType}</DlvryTp>\n`;

  // Notional Amounts
  xml += `        <NtnlAmt>\n`;
  xml += `          <Amt><FrstLeg>${notional1}</FrstLeg>`;
  if (notional2) xml += `<ScndLeg>${notional2}</ScndLeg>`;
  xml += `</Amt>\n`;
  xml += `          <Ccy><FrstLeg>${ccy1}</FrstLeg>`;
  if (notional2) xml += `<ScndLeg>${ccy2}</ScndLeg>`;
  xml += `</Ccy>\n`;
  xml += `        </NtnlAmt>\n`;

  // Price
  xml += `        <Pric><Dcml>${price}</Dcml><Ccy>${priceCcy}</Ccy></Pric>\n`;

  // Spread
  if (sprd1 !== null) {
    xml += `        <Sprd><FrstLeg>${sprd1}</FrstLeg>`;
    if (sprd2 !== null) xml += `<ScndLeg>${sprd2}</ScndLeg>`;
    xml += `</Sprd>\n`;
  }

  // Strike Price (options)
  if (strkPric !== null) {
    xml += `        <StrkPric><Dcml>${strkPric}</Dcml>`;
    if (strkPricCcy) xml += `<Ccy>${strkPricCcy}</Ccy>`;
    xml += `</StrkPric>\n`;
  }

  // Option fields
  if (optnTp) xml += `        <OptnTp>${optnTp}</OptnTp>\n`;
  if (optnExrcStyle) xml += `        <OptnExrcStyle>${optnExrcStyle}</OptnExrcStyle>\n`;

  // Package
  if (pkgId) {
    xml += `        <PckgData><Id>${pkgId}</Id></PckgData>\n`;
  }

  xml += `      </CmonTradData>\n`;

  // Technical Attributes
  xml += `      <TechAttrbts><EvtTp>${eventType}</EvtTp></TechAttrbts>\n`;

  // Collateral Data
  if (hasCollateral) {
    xml += `      <CollData>\n`;
    xml += `        <PrtflCd><Id>COLL-PTF-${padNum(idx + 1, 3)}</Id></PrtflCd>\n`;
    if (initMrgnPstd) xml += `        <InitlMrgnPstd><Amt>${initMrgnPstd}</Amt></InitlMrgnPstd>\n`;
    if (varMrgnPstd) xml += `        <VartnMrgnPstd><Amt>${varMrgnPstd}</Amt></VartnMrgnPstd>\n`;
    xml += `      </CollData>\n`;
  }

  // Valuation Data
  xml += `      <ValtnData>\n`;
  xml += `        <MrkToMktVal><Amt>${valAmt}</Amt><Ccy>${valCcy}</Ccy></MrkToMktVal>\n`;
  xml += `        <ValtnDtTm>${generateTimestamp(execDate, 15, 17)}</ValtnDtTm>\n`;
  if (delta) xml += `        <Dlt>${delta}</Dlt>\n`;
  xml += `      </ValtnData>\n`;

  xml += `    </${action.wrapper}>\n  </TradData>`;
  return xml;
}

/**
 * Generate sample XML with multiple trades.
 */
export function generateSampleXml(count = 100): string {
  const trades: string[] = [];
  for (let i = 0; i < count; i++) {
    trades.push(generateSingleTrade(i));
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<DerivsTradRpt xmlns="urn:iso:std:iso:20022:tech:xsd:auth.030.001.04">
  <RptHdr>
    <RptgDtTm>2025-01-15T10:30:00+11:00</RptgDtTm>
  </RptHdr>
${trades.join('\n')}
</DerivsTradRpt>`;
}

export const SAMPLE_XML = generateSampleXml(100);
