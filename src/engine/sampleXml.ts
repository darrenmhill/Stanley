/**
 * Sample XML generator for ASIC Derivative Reporting Validator.
 * Generates 100 trades: 75 fully valid + 25 with deliberate errors for testing.
 *
 * Structure per ASIC ISO 20022 Mapping Document v1.1 (Feb 2025):
 *   DerivsTradRpt > TradData > Rpt > {Action} > {
 *     RptgTmStmp,
 *     CptrPtySpcfcData > CtrPty > { ... },
 *     CmonTradData > { CtrctData > { ... }, TxData > { ... } }
 *   }
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

const ASSET_CLASSES = ['INTR', 'CRDT', 'EQUI', 'COMM', 'CURR'] as const;
const CONTRACT_TYPES = ['SWAP', 'OPTN', 'FUTR', 'FORW', 'FRAS', 'CFDS'] as const;
const CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'HKD'] as const;
const DIRECTIONS = ['BYER', 'SLLR'] as const;
const MASTER_AGREE = ['ISDA', 'CMAM', 'DERV', 'OTHR'] as const;
const EXERCISE_STYLES = ['AMER', 'EURO', 'BERM'] as const;
const MIC_CODES = ['XASX', 'XSFE', 'XCHI', 'XXXX'] as const;
const COUNTRIES = ['AU', 'US', 'GB', 'JP', 'SG', 'HK', 'NZ', 'DE'] as const;

// Correct event types per action type per ASIC mapping
const EVENT_TYPES_BY_ACTION: Record<string, readonly string[]> = {
  NEWT: ['TRAD', 'NOVA', 'COMP', 'CLRG', 'ALOC', 'INCP', 'UPDT'],
  MODI: ['TRAD', 'NOVA', 'COMP', 'UPDT', 'CPUP', 'CORP'],
  CORR: ['TRAD', 'NOVA', 'COMP', 'CLRG', 'ALOC', 'INCP', 'UPDT', 'CPUP', 'CORP'],
  TERM: ['ETRM', 'EXER', 'COMP', 'CLRG', 'CORP'],
  VALU: ['TRAD'],
  EROR: ['TRAD'],
  REVI: ['TRAD', 'NOVA', 'COMP', 'UPDT', 'CPUP', 'CORP'],
};

// ─── Error injection schedule ───────────────────────────────────────
// Trades 0-74: valid, Trades 75-99: deliberate errors
interface ErrorSpec {
  tradeIdx: number;
  type: string;
}

const ERROR_SCHEDULE: ErrorSpec[] = [
  // Single errors (trades 75-94)
  { tradeIdx: 75, type: 'bad_lei' },
  { tradeIdx: 76, type: 'mat_before_eff' },
  { tradeIdx: 77, type: 'bad_notional' },
  { tradeIdx: 78, type: 'bad_delta' },
  { tradeIdx: 79, type: 'missing_ccp' },
  { tradeIdx: 80, type: 'bad_uti' },
  { tradeIdx: 81, type: 'bad_currency' },
  { tradeIdx: 82, type: 'bad_country' },
  { tradeIdx: 83, type: 'missing_upi' },
  { tradeIdx: 84, type: 'bad_contract' },
  { tradeIdx: 85, type: 'bad_lei' },
  { tradeIdx: 86, type: 'mat_before_eff' },
  { tradeIdx: 87, type: 'bad_notional' },
  { tradeIdx: 88, type: 'bad_delta' },
  { tradeIdx: 89, type: 'missing_ccp' },
  { tradeIdx: 90, type: 'bad_uti' },
  { tradeIdx: 91, type: 'bad_currency' },
  { tradeIdx: 92, type: 'bad_country' },
  { tradeIdx: 93, type: 'missing_upi' },
  { tradeIdx: 94, type: 'bad_contract' },
  // Multiple errors (trades 95-99)
  { tradeIdx: 95, type: 'bad_lei' },
  { tradeIdx: 95, type: 'mat_before_eff' },
  { tradeIdx: 96, type: 'bad_notional' },
  { tradeIdx: 96, type: 'bad_currency' },
  { tradeIdx: 97, type: 'bad_delta' },
  { tradeIdx: 97, type: 'missing_ccp' },
  { tradeIdx: 98, type: 'bad_uti' },
  { tradeIdx: 98, type: 'bad_country' },
  { tradeIdx: 99, type: 'bad_lei' },
  { tradeIdx: 99, type: 'bad_notional' },
  { tradeIdx: 99, type: 'bad_delta' },
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
  const isError = action.code === 'EROR';
  const isNonNewt = action.code !== 'NEWT';

  const rptgLei = pick(LEI_POOL);
  let othrLei = pick(LEI_POOL);
  while (othrLei === rptgLei) othrLei = pick(LEI_POOL);

  const displayOthrLei = errors.has('bad_lei') ? 'INVALIDLEI12345' : othrLei;
  const othrCtry = errors.has('bad_country') ? '1A' : pick(COUNTRIES);
  const direction1 = pick(DIRECTIONS);
  const direction2 = direction1 === 'BYER' ? 'SLLR' : 'BYER';

  const uti = errors.has('bad_uti') ? 'SHORTUTI' : generateTradeId(rptgLei, idx);
  const assetClass = pick(ASSET_CLASSES);
  const contractType = errors.has('bad_contract') ? 'BADTYPE' : pick(CONTRACT_TYPES);
  const isOption = contractType === 'OPTN';
  const isFx = assetClass === 'CURR';
  const isIrsSwap = assetClass === 'INTR' && contractType === 'SWAP';
  const upi = (errors.has('missing_upi') || isError) ? '' : generateUPI();
  const cfi = generateCFI();

  // Dates
  const effYear = randInt(2024, 2026);
  const effDate = generateDate(effYear, 1, 12);
  const execDate = effDate;
  const execTimestamp = generateTimestamp(execDate, 8, 12);
  const rptgTimestamp = generateTimestamp(execDate, 13, 17);

  let mtrtyDate: string;
  if (errors.has('mat_before_eff')) {
    mtrtyDate = generateDate(effYear - 1, 1, 12);
  } else {
    mtrtyDate = generateDate(effYear + randInt(1, 6), 1, 12);
  }
  const xpryDate = mtrtyDate;

  // Notional
  const ccy1 = errors.has('bad_currency') ? 'ZZZ' : pick(CURRENCIES);
  const ccy2 = pick(CURRENCIES);
  const notional1 = errors.has('bad_notional') ? 'notanumber' : randDecimal(100000, 500000000, 2);
  // Leg 2 always for FX, otherwise 50% chance
  const notional2 = isFx ? randDecimal(100000, 500000000, 2) : (rand() > 0.5 ? randDecimal(100000, 500000000, 2) : null);

  // Price
  const price = randDecimal(0.001, 5.0, 6);

  // Clearing
  const cleared = rand() > 0.3 ? 'Y' : (rand() > 0.5 ? 'N' : 'I');
  const ccpLei = errors.has('missing_ccp') ? '' : LEIS.ASX_CLEAR;
  // Clearing member LEI when cleared = Y
  const clrMmbLei = cleared === 'Y' ? LEIS.MQG_SEC : null;

  const venue = pick(MIC_CODES);
  const masterAgrmt = pick(MASTER_AGREE);

  // Event type — correct per action type
  const eventTypes = EVENT_TYPES_BY_ACTION[action.code] ?? ['TRAD'];
  const eventType = pick(eventTypes);

  // Prior UTI for non-NEWT actions
  const priorUti = isNonNewt ? generateTradeId(rptgLei, idx + 1000) : null;

  // Valuation
  const valAmt = randDecimal(-5000000, 5000000, 2);
  const valCcy = pick(CURRENCIES);
  let delta = '';
  if (isOption) {
    delta = errors.has('bad_delta') ? randDecimal(1.1, 2.5, 4) : randDecimal(-1.0, 1.0, 4);
  }

  // Collateral
  const hasCollateral = rand() > 0.3;
  const initMrgnPstd = hasCollateral ? randDecimal(10000, 2000000, 2) : null;
  const varMrgnPstd = hasCollateral ? randDecimal(5000, 1000000, 2) : null;

  // Options
  const optnTp = isOption ? (rand() > 0.5 ? 'CALL' : 'PUTO') : null;
  const optnExrcStyle = isOption ? pick(EXERCISE_STYLES) : null;
  const strkPric = isOption ? randDecimal(0.5, 200, 4) : null;

  // Interest Rate (always for IRS, sometimes for other INTR)
  const hasFixedRate = isIrsSwap || (assetClass === 'INTR' && rand() > 0.5);
  const hasSpread = isIrsSwap || (assetClass === 'INTR' && rand() > 0.5);
  const fxdRate1 = hasFixedRate ? randDecimal(0.01, 0.08, 6) : null;
  const sprd2 = hasSpread ? randDecimal(-0.01, 0.05, 6) : null;

  // Exchange Rate (always for FX)
  const xchgRate = isFx ? randDecimal(0.5, 1.8, 6) : null;

  // Beneficiary
  const hasBeneficiary = rand() > 0.6;
  const bnfcryLei = hasBeneficiary ? pick(LEI_POOL) : null;

  // Package
  const hasPackage = rand() > 0.8;
  const pkgId = hasPackage ? `PKG-${effYear}-${padNum(randInt(1, 999), 3)}` : null;

  // ═══ Build XML with CORRECT ASIC structure ═══
  let xml = `  <TradData>\n    <Rpt>\n      <${action.wrapper}>\n`;

  // RptgTmStmp — direct child of action wrapper
  xml += `        <RptgTmStmp>${rptgTimestamp}</RptgTmStmp>\n`;

  // CptrPtySpcfcData > CtrPty
  xml += `        <CptrPtySpcfcData>\n          <CtrPty>\n`;
  // Reporting Entity
  xml += `            <NttyRspnsblForRpt><LEI>${rptgLei}</LEI></NttyRspnsblForRpt>\n`;
  // CP1
  xml += `            <RptgCtrPty>\n`;
  xml += `              <Id><Lgl><Id><LEI>${rptgLei}</LEI></Id></Lgl></Id>\n`;
  xml += `              <Ntr>${rand() > 0.5 ? 'F' : 'N'}</Ntr>\n`;
  xml += `              <DrctnOrSide><Drctn>\n`;
  xml += `                <DrctnOfTheFrstLeg>${direction1}</DrctnOfTheFrstLeg>\n`;
  xml += `                <DrctnOfTheScndLeg>${direction2}</DrctnOfTheScndLeg>\n`;
  xml += `              </Drctn></DrctnOrSide>\n`;
  xml += `              <DrclyLkdActvty>false</DrclyLkdActvty>\n`;
  xml += `            </RptgCtrPty>\n`;
  // CP2
  xml += `            <OthrCtrPty><IdTp><Lgl>\n`;
  xml += `              <Id><LEI>${displayOthrLei}</LEI></Id>\n`;
  xml += `              <Ctry>${othrCtry}</Ctry>\n`;
  xml += `            </Lgl></IdTp></OthrCtrPty>\n`;
  // Submitting Agent
  xml += `            <SubmitgAgt><LEI>${rptgLei}</LEI></SubmitgAgt>\n`;
  // Clearing Member (when cleared = Y)
  if (clrMmbLei) {
    xml += `            <ClrMmb><Lgl><Id><LEI>${clrMmbLei}</LEI></Id></Lgl></ClrMmb>\n`;
  }
  // Beneficiary
  if (bnfcryLei) {
    xml += `            <Bnfcry><Lgl><Id><LEI>${bnfcryLei}</LEI></Id></Lgl></Bnfcry>\n`;
  }
  // Valuation (under CtrPty)
  xml += `            <Valtn>\n`;
  xml += `              <CtrctVal><Amt>${valAmt}</Amt><Ccy>${valCcy}</Ccy></CtrctVal>\n`;
  xml += `              <TmStmp><DtTm>${generateTimestamp(execDate, 15, 17)}</DtTm></TmStmp>\n`;
  xml += `              <Tp>MTOM</Tp>\n`;
  if (delta) xml += `              <Dlt>${delta}</Dlt>\n`;
  xml += `            </Valtn>\n`;
  xml += `          </CtrPty>\n        </CptrPtySpcfcData>\n`;

  // CmonTradData
  xml += `        <CmonTradData>\n`;

  // CtrctData
  xml += `          <CtrctData>\n`;
  xml += `            <PdctId>\n`;
  if (upi) xml += `              <UnqPdctIdr>${upi}</UnqPdctIdr>\n`;
  xml += `              <Clssfctn><Cd>${cfi}</Cd></Clssfctn>\n`;
  xml += `            </PdctId>\n`;
  xml += `            <CtrctTp>${contractType}</CtrctTp>\n`;
  xml += `            <AsstClss>${assetClass}</AsstClss>\n`;
  xml += `            <SttlmCcy><Ccy>${pick(CURRENCIES)}</Ccy></SttlmCcy>\n`;
  xml += `          </CtrctData>\n`;

  // TxData
  xml += `          <TxData>\n`;
  // UTI
  xml += `            <TxId><UnqTxIdr>${uti}</UnqTxIdr></TxId>\n`;
  // Prior UTI (for non-NEWT actions)
  if (priorUti) {
    xml += `            <PrrUnqTxIdr><UnqTxIdr>${priorUti}</UnqTxIdr></PrrUnqTxIdr>\n`;
  }
  // Dates
  xml += `            <ExctnTmStmp>${execTimestamp}</ExctnTmStmp>\n`;
  if (!isExit) {
    xml += `            <FctvDt>${effDate}</FctvDt>\n`;
    xml += `            <XprtnDt>${xpryDate}</XprtnDt>\n`;
    xml += `            <MtrtyDt>${mtrtyDate}</MtrtyDt>\n`;
  }
  // Derivative Event
  xml += `            <DerivEvt>\n`;
  xml += `              <Tp>${eventType}</Tp>\n`;
  xml += `              <TmStmp><DtTm>${execTimestamp}</DtTm></TmStmp>\n`;
  xml += `            </DerivEvt>\n`;
  // Clearing
  xml += `            <TradClr><ClrSts>\n`;
  if (cleared === 'Y') {
    xml += `              <Clrd><CCP><LEI>${ccpLei}</LEI></CCP></Clrd>\n`;
  } else if (cleared === 'I') {
    xml += `              <IntndToClr/>\n`;
  } else {
    xml += `              <NonClrd/>\n`;
  }
  xml += `            </ClrSts></TradClr>\n`;
  // Platform
  xml += `            <PltfmIdr>${venue}</PltfmIdr>\n`;
  // Master Agreement
  xml += `            <MstrAgrmt><Tp><Cd>${masterAgrmt}</Cd></Tp></MstrAgrmt>\n`;
  // Notional Amounts
  xml += `            <NtnlAmt>\n`;
  xml += `              <FrstLeg><Amt><Amt>${notional1}</Amt><Ccy>${ccy1}</Ccy></Amt></FrstLeg>\n`;
  if (notional2) {
    xml += `              <ScndLeg><Amt><Amt>${notional2}</Amt><Ccy>${ccy2}</Ccy></Amt></ScndLeg>\n`;
  }
  xml += `            </NtnlAmt>\n`;
  // Price
  xml += `            <TxPric><Pric><Dcml>${price}</Dcml></Pric></TxPric>\n`;
  // Interest Rate
  if (fxdRate1 !== null || sprd2 !== null) {
    xml += `            <IntrstRate>\n`;
    if (fxdRate1 !== null) {
      xml += `              <FrstLeg><Fxd><Rate><Dcml>${fxdRate1}</Dcml></Rate></Fxd></FrstLeg>\n`;
    }
    if (sprd2 !== null) {
      xml += `              <ScndLeg><Fltg><Sprd><Dcml>${sprd2}</Dcml></Sprd></Fltg></ScndLeg>\n`;
    }
    xml += `            </IntrstRate>\n`;
  }
  // Options
  if (isOption) {
    xml += `            <Optn>\n`;
    if (strkPric !== null) xml += `              <StrkPric><Dcml>${strkPric}</Dcml></StrkPric>\n`;
    if (optnTp) xml += `              <Tp>${optnTp}</Tp>\n`;
    if (optnExrcStyle) xml += `              <ExrcStyle>${optnExrcStyle}</ExrcStyle>\n`;
    xml += `            </Optn>\n`;
  }
  // Exchange Rate (for FX)
  if (xchgRate !== null) {
    xml += `            <XchgRate><Rate>${xchgRate}</Rate></XchgRate>\n`;
  }
  // Package
  if (pkgId) {
    xml += `            <Packg><CmplxTradId>${pkgId}</CmplxTradId></Packg>\n`;
  }
  xml += `          </TxData>\n`;
  xml += `        </CmonTradData>\n`;

  // Collateral Data (direct child of action)
  if (hasCollateral) {
    xml += `        <CollData>\n`;
    xml += `          <PrtflCd><Id>COLL-PTF-${padNum(idx + 1, 3)}</Id></PrtflCd>\n`;
    if (initMrgnPstd) xml += `          <InitlMrgnPstd><Amt>${initMrgnPstd}</Amt></InitlMrgnPstd>\n`;
    if (varMrgnPstd) xml += `          <VartnMrgnPstd><Amt>${varMrgnPstd}</Amt></VartnMrgnPstd>\n`;
    xml += `        </CollData>\n`;
  }

  xml += `      </${action.wrapper}>\n    </Rpt>\n  </TradData>`;
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
