import { useState, useCallback, useMemo } from 'react';
import { parseAllTradeReports, updateFieldInXml, FIELD_PATHS, type ParsedReport } from './engine/xmlParser';
import { validateReport, type ValidationResult, type RuleCategory } from './engine/validationRules';
import { SAMPLE_XML } from './engine/sampleXml';
import './App.css';

interface TradeEntry {
  index: number;
  report: ParsedReport;
  validation: ValidationResult[];
  failCount: number;
}

type FilterStatus = 'ALL' | 'PASS' | 'FAIL' | 'N/A';

// Grid columns shown in the trades list
const GRID_FIELDS = [
  { key: 'UTI', label: 'UTI', truncate: 24 },
  { key: 'AsstClss', label: 'Asset' },
  { key: 'CtrctTp', label: 'Contract' },
  { key: 'DrctnLeg1', label: 'Dir' },
  { key: 'NtnlAmt1', label: 'Notional', numeric: true },
  { key: 'NtnlCcy1', label: 'Ccy' },
  { key: 'FctvDt', label: 'Eff. Date' },
  { key: 'MtrtyDt', label: 'Mat. Date' },
] as const;

function formatNotional(v: string | null | undefined): string {
  if (!v) return '';
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(2);
}

// Rule category definitions for the rules reference section
const RULE_CATEGORIES: { category: RuleCategory; range: string; description: string }[] = [
  { category: 'Counterparty', range: 'ASIC-001 to ASIC-020', description: 'Reporting entity, CP1/CP2 LEI, beneficiary, broker, execution agent, clearing member, submitting agent, direction, nature' },
  { category: 'Identifier', range: 'ASIC-021 to ASIC-030', description: 'UTI format/length/characters, prior UTI, UTI != Prior UTI, event ID, secondary TX ID' },
  { category: 'Product', range: 'ASIC-031 to ASIC-040', description: 'UPI (ISO 4914), contract type, asset class, CFI, settlement currency, underlier' },
  { category: 'Date & Timestamp', range: 'ASIC-041 to ASIC-055', description: 'Execution/effective/expiration/maturity/reporting timestamps, timezone checks, cross-field date validations' },
  { category: 'Clearing & Trading', range: 'ASIC-056 to ASIC-065', description: 'Cleared status, CCP LEI, platform identifier (MIC), clearing member, non-cleared reason, master agreement' },
  { category: 'Notional & Quantity', range: 'ASIC-066 to ASIC-078', description: 'Notional amounts/currencies for both legs, numeric/non-negative checks, FX-specific requirements' },
  { category: 'Price', range: 'ASIC-079 to ASIC-095', description: 'Price, fixed rates, spreads, strike price, option type/exercise style/premium, exchange rate' },
  { category: 'Valuation', range: 'ASIC-096 to ASIC-105', description: 'Valuation amount/currency/timestamp, delta range, VALU action mandates, valuation type' },
  { category: 'Action & Event', range: 'ASIC-106 to ASIC-118', description: 'Action type detection, event type per-action cross-validation, EROR/POSC/REVI checks' },
  { category: 'Collateral', range: 'ASIC-119 to ASIC-124', description: 'Initial/variation margin posted/received, portfolio code' },
  { category: 'Package', range: 'ASIC-125 to ASIC-130', description: 'Package ID, package price/spread, IRS fixed rate/spread checks, FX exchange rate' },
];

// Instrument-to-XML-path reference data
const INSTRUMENT_PATH_MAPPINGS: { instrument: string; description: string; fields: { field: string; xmlPath: string; mandatory: string }[] }[] = [
  {
    instrument: 'All Instruments',
    description: 'Common fields applicable to all derivative instrument types',
    fields: [
      { field: 'UTI', xmlPath: 'CmonTradData/TxData/TxId/UnqTxIdr', mandatory: 'Yes' },
      { field: 'PrrUTI', xmlPath: 'CmonTradData/TxData/PrrUnqTxIdr/UnqTxIdr', mandatory: 'Non-NEWT' },
      { field: 'UPI', xmlPath: 'CmonTradData/CtrctData/PdctId/UnqPdctIdr', mandatory: 'Yes' },
      { field: 'CtrctTp', xmlPath: 'CmonTradData/CtrctData/CtrctTp', mandatory: 'Yes' },
      { field: 'AsstClss', xmlPath: 'CmonTradData/CtrctData/AsstClss', mandatory: 'Yes' },
      { field: 'SttlmCcy', xmlPath: 'CmonTradData/CtrctData/SttlmCcy/Ccy', mandatory: 'No' },
      { field: 'ExctnTmStmp', xmlPath: 'CmonTradData/TxData/ExctnTmStmp', mandatory: 'Yes' },
      { field: 'FctvDt', xmlPath: 'CmonTradData/TxData/FctvDt', mandatory: 'Non-exit' },
      { field: 'XpryDt', xmlPath: 'CmonTradData/TxData/XprtnDt', mandatory: 'No' },
      { field: 'MtrtyDt', xmlPath: 'CmonTradData/TxData/MtrtyDt', mandatory: 'No' },
      { field: 'NtnlAmt1', xmlPath: 'CmonTradData/TxData/NtnlAmt/FrstLeg/Amt/Amt', mandatory: 'Non-exit' },
      { field: 'NtnlCcy1', xmlPath: 'CmonTradData/TxData/NtnlAmt/FrstLeg/Amt/Ccy', mandatory: 'With amount' },
      { field: 'Pric', xmlPath: 'CmonTradData/TxData/TxPric/Pric/Dcml', mandatory: 'No' },
      { field: 'PricCcy', xmlPath: 'CmonTradData/TxData/TxPric/Pric/MntryVal/Ccy', mandatory: 'Monetary price' },
      { field: 'RptgTmStmp', xmlPath: '{Action}/RptgTmStmp', mandatory: 'Yes' },
      { field: 'DrctnLeg1', xmlPath: 'CptrPtySpcfcData/CtrPty/RptgCtrPty/DrctnOrSide/Drctn/DrctnOfTheFrstLeg', mandatory: 'No' },
      { field: 'DrctnLeg2', xmlPath: 'CptrPtySpcfcData/CtrPty/RptgCtrPty/DrctnOrSide/Drctn/DrctnOfTheScndLeg', mandatory: 'Two-legged' },
      { field: 'Clrd', xmlPath: 'CmonTradData/TxData/TradClr/ClrSts/{Clrd|IntndToClr|NonClrd}', mandatory: 'Yes' },
      { field: 'PltfmIdr', xmlPath: 'CmonTradData/TxData/PltfmIdr', mandatory: 'Non-exit' },
      { field: 'MstrAgrmt.Tp', xmlPath: 'CmonTradData/TxData/MstrAgrmt/Tp/Cd', mandatory: 'No' },
    ],
  },
  {
    instrument: 'CURR (Currency/FX)',
    description: 'Additional fields for FX derivatives — asset class CURR (swaps, forwards, options)',
    fields: [
      { field: 'NtnlAmt1', xmlPath: 'CmonTradData/TxData/NtnlAmt/FrstLeg/Amt/Amt', mandatory: 'Yes (CURR)' },
      { field: 'NtnlCcy1', xmlPath: 'CmonTradData/TxData/NtnlAmt/FrstLeg/Amt/Ccy', mandatory: 'Yes (CURR)' },
      { field: 'NtnlAmt2', xmlPath: 'CmonTradData/TxData/NtnlAmt/ScndLeg/Amt/Amt', mandatory: 'Yes (CURR)' },
      { field: 'NtnlCcy2', xmlPath: 'CmonTradData/TxData/NtnlAmt/ScndLeg/Amt/Ccy', mandatory: 'Yes (CURR)' },
      { field: 'XchgRate', xmlPath: 'CmonTradData/TxData/Ccy/XchgRate', mandatory: 'Yes (CURR)' },
    ],
  },
  {
    instrument: 'INTR + SWAP (Interest Rate Swap)',
    description: 'Additional fields for IRS — asset class INTR with contract type SWAP',
    fields: [
      { field: 'FxdRate1', xmlPath: 'CmonTradData/TxData/IntrstRate/FrstLeg/Fxd/Rate/Dcml', mandatory: 'Yes (IRS)' },
      { field: 'FxdRate2', xmlPath: 'CmonTradData/TxData/IntrstRate/ScndLeg/Fxd/Rate/Dcml', mandatory: 'No' },
      { field: 'Sprd1', xmlPath: 'CmonTradData/TxData/IntrstRate/FrstLeg/Fltg/Sprd/Dcml', mandatory: 'No' },
      { field: 'Sprd2', xmlPath: 'CmonTradData/TxData/IntrstRate/ScndLeg/Fltg/Sprd/Dcml', mandatory: 'Yes (IRS floating)' },
      { field: 'NtnlAmt2', xmlPath: 'CmonTradData/TxData/NtnlAmt/ScndLeg/Amt/Amt', mandatory: 'No' },
      { field: 'NtnlCcy2', xmlPath: 'CmonTradData/TxData/NtnlAmt/ScndLeg/Amt/Ccy', mandatory: 'With amount' },
    ],
  },
  {
    instrument: 'OPTN (Options)',
    description: 'Additional fields for options — contract type OPTN across all asset classes',
    fields: [
      { field: 'StrkPric', xmlPath: 'CmonTradData/TxData/Optn/StrkPric/Dcml', mandatory: 'Yes (OPTN)' },
      { field: 'OptnTp', xmlPath: 'CmonTradData/TxData/Optn/Tp', mandatory: 'Yes (OPTN)' },
      { field: 'OptnExrcStyle', xmlPath: 'CmonTradData/TxData/Optn/ExrcStyle', mandatory: 'Yes (OPTN)' },
      { field: 'OptnPrm', xmlPath: 'CmonTradData/TxData/Optn/Prmm/Amt', mandatory: 'No' },
      { field: 'OptnPrmCcy', xmlPath: 'CmonTradData/TxData/Optn/Prmm/Ccy', mandatory: 'With premium' },
    ],
  },
  {
    instrument: 'Valuation (VALU action)',
    description: 'Valuation fields under counterparty data — primarily for ValtnUpd actions',
    fields: [
      { field: 'Valtn.Amt', xmlPath: 'CptrPtySpcfcData/CtrPty/Valtn/CtrctVal/Amt', mandatory: 'Yes (VALU)' },
      { field: 'Valtn.Ccy', xmlPath: 'CptrPtySpcfcData/CtrPty/Valtn/CtrctVal/Ccy', mandatory: 'Yes (VALU)' },
      { field: 'Valtn.TmStmp', xmlPath: 'CptrPtySpcfcData/CtrPty/Valtn/TmStmp/DtTm', mandatory: 'Yes (VALU)' },
      { field: 'Valtn.Tp', xmlPath: 'CptrPtySpcfcData/CtrPty/Valtn/Tp', mandatory: 'Yes (VALU)' },
      { field: 'Valtn.Dlt', xmlPath: 'CptrPtySpcfcData/CtrPty/Valtn/Dlt', mandatory: 'OPTN only' },
    ],
  },
  {
    instrument: 'Collateral',
    description: 'Collateral data fields — direct child of the action wrapper element',
    fields: [
      { field: 'Coll.PrtflCd', xmlPath: '{Action}/CollData/PrtflCd/Id', mandatory: 'No' },
      { field: 'Coll.InitlMrgnPstd', xmlPath: '{Action}/CollData/InitlMrgnPstd/Amt', mandatory: 'No' },
      { field: 'Coll.InitlMrgnRcvd', xmlPath: '{Action}/CollData/InitlMrgnRcvd/Amt', mandatory: 'No' },
      { field: 'Coll.VartnMrgnPstd', xmlPath: '{Action}/CollData/VartnMrgnPstd/Amt', mandatory: 'No' },
      { field: 'Coll.VartnMrgnRcvd', xmlPath: '{Action}/CollData/VartnMrgnRcvd/Amt', mandatory: 'No' },
    ],
  },
];

function App() {
  const [xml, setXml] = useState('');
  const [trades, setTrades] = useState<TradeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTradeIdx, setSelectedTradeIdx] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('ALL');
  const [showXml, setShowXml] = useState(false);
  const [validationKey, setValidationKey] = useState(0);
  const [showRulesRef, setShowRulesRef] = useState(false);
  const [showPathsRef, setShowPathsRef] = useState(false);

  // Grid inline editing state
  const [gridEditCell, setGridEditCell] = useState<{ row: number; field: string } | null>(null);
  const [gridEditValue, setGridEditValue] = useState('');

  // Validation detail inline editing state
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const runValidation = useCallback((input: string) => {
    setError(null);
    setTrades(null);
    setSelectedTradeIdx(null);
    setEditingRuleId(null);
    setGridEditCell(null);
    setFilter('ALL');

    if (!input.trim()) {
      setError('Please paste an XML message or load the sample.');
      return;
    }

    // Use requestAnimationFrame to ensure the UI shows a brief "Validating..." state
    setValidationKey((k) => k + 1);
    requestAnimationFrame(() => {
      try {
        const parsed = parseAllTradeReports(input);
        const entries: TradeEntry[] = parsed.map(({ index, report }) => {
          const validation = validateReport(report);
          const failCount = validation.filter((v) => v.status === 'FAIL').length;
          return { index, report, validation, failCount };
        });
        setTrades(entries);
        // Auto-select first trade with errors, or first trade
        const firstError = entries.find((t) => t.failCount > 0);
        setSelectedTradeIdx(firstError ? firstError.index : 0);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }, []);

  const handleLoadSample = () => {
    setXml(SAMPLE_XML);
    runValidation(SAMPLE_XML);
  };

  const handleValidate = () => {
    runValidation(xml);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setXml(text);
      runValidation(text);
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    if (!xml) return;
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'asic-trades-export.xml';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Grid cell editing ──────────────────────────────────
  const isGridCellEditable = (field: string) => !!FIELD_PATHS[field];

  const startGridEdit = (row: number, field: string, currentValue: string | null) => {
    setGridEditCell({ row, field });
    setGridEditValue(currentValue ?? '');
  };

  const saveGridEdit = () => {
    if (!gridEditCell) return;
    const newXml = updateFieldInXml(xml, gridEditCell.field, gridEditValue, gridEditCell.row);
    setXml(newXml);
    setGridEditCell(null);
    runValidation(newXml);
  };

  const cancelGridEdit = () => {
    setGridEditCell(null);
  };

  // ─── Validation detail editing ──────────────────────────
  const isEditable = (r: ValidationResult) =>
    r.status === 'FAIL' && !!FIELD_PATHS[r.field];

  const startEdit = (r: ValidationResult) => {
    setEditingRuleId(r.ruleId);
    setEditValue(r.actual ?? '');
  };

  const handleSaveEdit = (fieldName: string) => {
    if (selectedTradeIdx === null) return;
    const newXml = updateFieldInXml(xml, fieldName, editValue, selectedTradeIdx);
    setXml(newXml);
    setEditingRuleId(null);
    runValidation(newXml);
  };

  // ─── Derived data ──────────────────────────────────────
  const selectedTrade = trades && selectedTradeIdx !== null
    ? trades.find((t) => t.index === selectedTradeIdx) ?? null
    : null;

  const filteredResults = selectedTrade
    ? filter === 'ALL'
      ? selectedTrade.validation
      : selectedTrade.validation.filter((r) => r.status === filter)
    : null;

  const counts = selectedTrade
    ? {
        total: selectedTrade.validation.length,
        pass: selectedTrade.validation.filter((r) => r.status === 'PASS').length,
        fail: selectedTrade.validation.filter((r) => r.status === 'FAIL').length,
        na: selectedTrade.validation.filter((r) => r.status === 'N/A').length,
      }
    : null;

  const tradeSummary = trades
    ? {
        total: trades.length,
        valid: trades.filter((t) => t.failCount === 0).length,
        withErrors: trades.filter((t) => t.failCount > 0).length,
      }
    : null;

  // ─── Aggregate statistics across all trades ─────────────
  const aggregateStats = useMemo(() => {
    if (!trades) return null;
    let totalRules = 0;
    let totalPass = 0;
    let totalFail = 0;
    let totalNa = 0;
    const categoryBreakdown = new Map<RuleCategory, { pass: number; fail: number; na: number }>();

    for (const trade of trades) {
      for (const r of trade.validation) {
        totalRules++;
        if (r.status === 'PASS') totalPass++;
        else if (r.status === 'FAIL') totalFail++;
        else totalNa++;

        if (!categoryBreakdown.has(r.category)) {
          categoryBreakdown.set(r.category, { pass: 0, fail: 0, na: 0 });
        }
        const cat = categoryBreakdown.get(r.category)!;
        if (r.status === 'PASS') cat.pass++;
        else if (r.status === 'FAIL') cat.fail++;
        else cat.na++;
      }
    }

    const passRate = totalRules > 0 ? ((totalPass / (totalPass + totalFail)) * 100).toFixed(1) : '0';

    return { totalRules, totalPass, totalFail, totalNa, passRate, categoryBreakdown };
  }, [trades]);

  // ─── Rules by category (from actual validation results) ──
  const rulesByCategory = useMemo(() => {
    if (!trades || trades.length === 0) return null;
    // Use the first trade to get the full rule list structure
    const firstTrade = trades[0];
    const grouped = new Map<RuleCategory, ValidationResult[]>();
    for (const r of firstTrade.validation) {
      if (!grouped.has(r.category)) {
        grouped.set(r.category, []);
      }
      grouped.get(r.category)!.push(r);
    }
    return grouped;
  }, [trades]);

  return (
    <div className="app">
      <header className="header">
        <h1>ASIC Derivative Reporting Validator</h1>
        <p className="subtitle">
          ISO 20022 auth.030.001.04 — DerivativesTradeReportV04 — Schedule 1 Technical Guidance (2024 Rules)
        </p>
      </header>

      <section className="input-section">
        <div className="input-controls">
          <button className="btn btn-sample" onClick={handleLoadSample}>
            Load Sample XML
          </button>
          <label className="btn btn-upload">
            Upload XML File
            <input type="file" accept=".xml,.txt" onChange={handleFileUpload} hidden />
          </label>
          <button className="btn btn-validate" onClick={handleValidate} disabled={!xml.trim()} key={validationKey}>
            Validate
          </button>
          {trades && (
            <button className="btn btn-export" onClick={handleExport}>
              Export XML
            </button>
          )}
          <button className="btn btn-toggle-xml" onClick={() => setShowXml(!showXml)}>
            {showXml ? 'Hide XML' : 'Show XML'}
          </button>
          <button className="btn btn-rules-ref" onClick={() => setShowRulesRef(!showRulesRef)}>
            {showRulesRef ? 'Hide Rules' : 'Rules Reference'}
          </button>
          <button className="btn btn-paths-ref" onClick={() => setShowPathsRef(!showPathsRef)}>
            {showPathsRef ? 'Hide Paths' : 'XML Path Reference'}
          </button>
        </div>
        {showXml && (
          <textarea
            className="xml-input"
            value={xml}
            onChange={(e) => setXml(e.target.value)}
            placeholder="Paste your ISO 20022 auth.030 XML message here..."
            spellCheck={false}
          />
        )}
      </section>

      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* ─── Top-Level Aggregate Statistics ────────────────── */}
      {trades && tradeSummary && aggregateStats && (
        <section className="aggregate-section">
          <div className="aggregate-header">
            <h2>File Summary</h2>
          </div>
          <div className="aggregate-cards">
            <div className="agg-card">
              <span className="agg-num">{tradeSummary.total}</span>
              <span className="agg-label">Total Trades</span>
            </div>
            <div className="agg-card agg-card-valid">
              <span className="agg-num">{tradeSummary.valid}</span>
              <span className="agg-label">Valid</span>
            </div>
            <div className="agg-card agg-card-errors">
              <span className="agg-num">{tradeSummary.withErrors}</span>
              <span className="agg-label">With Errors</span>
            </div>
            <div className="agg-card">
              <span className="agg-num">{aggregateStats.totalRules.toLocaleString()}</span>
              <span className="agg-label">Rules Checked</span>
            </div>
            <div className="agg-card agg-card-valid">
              <span className="agg-num">{aggregateStats.totalPass.toLocaleString()}</span>
              <span className="agg-label">Passed</span>
            </div>
            <div className="agg-card agg-card-errors">
              <span className="agg-num">{aggregateStats.totalFail.toLocaleString()}</span>
              <span className="agg-label">Failed</span>
            </div>
            <div className="agg-card">
              <span className="agg-num">{aggregateStats.totalNa.toLocaleString()}</span>
              <span className="agg-label">N/A</span>
            </div>
            <div className="agg-card agg-card-rate">
              <span className="agg-num">{aggregateStats.passRate}%</span>
              <span className="agg-label">Pass Rate</span>
            </div>
          </div>
          <div className="category-breakdown">
            <h3>Results by Category</h3>
            <table className="category-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Passed</th>
                  <th>Failed</th>
                  <th>N/A</th>
                  <th>Pass Rate</th>
                </tr>
              </thead>
              <tbody>
                {RULE_CATEGORIES.map(({ category }) => {
                  const stats = aggregateStats.categoryBreakdown.get(category);
                  if (!stats) return null;
                  const catTotal = stats.pass + stats.fail;
                  const rate = catTotal > 0 ? ((stats.pass / catTotal) * 100).toFixed(1) : '—';
                  return (
                    <tr key={category}>
                      <td>{category}</td>
                      <td className="mono stat-valid">{stats.pass.toLocaleString()}</td>
                      <td className="mono stat-errors">{stats.fail.toLocaleString()}</td>
                      <td className="mono">{stats.na.toLocaleString()}</td>
                      <td className="mono">{rate}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─── Rules Reference Section ──────────────────────── */}
      {showRulesRef && (
        <section className="rules-ref-section">
          <h2>Validation Rules Reference</h2>
          <p className="rules-ref-subtitle">130 rules across 11 categories — ASIC Schedule 1 Technical Guidance (2024)</p>
          {rulesByCategory ? (
            // Show actual rules from validation results
            Array.from(rulesByCategory.entries()).map(([category, rules]) => (
              <div key={category} className="rules-ref-category">
                <h3>{category} <span className="rules-ref-count">({rules.length} rules)</span></h3>
                <table className="rules-ref-table">
                  <thead>
                    <tr>
                      <th>Rule ID</th>
                      <th>Field</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.ruleId}>
                        <td className="mono">{r.ruleId}</td>
                        <td className="mono">{r.field}</td>
                        <td>{r.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          ) : (
            // Show category summary when no data is loaded
            <table className="rules-ref-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Rules</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {RULE_CATEGORIES.map(({ category, range, description }) => (
                  <tr key={category}>
                    <td>{category}</td>
                    <td className="mono">{range}</td>
                    <td>{description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* ─── Instrument to XML Path Reference ─────────────── */}
      {showPathsRef && (
        <section className="paths-ref-section">
          <h2>Instrument to XML Path Reference</h2>
          <p className="paths-ref-subtitle">
            XML element paths per instrument type — relative to TradData/Rpt/{'{'}Action{'}'} wrapper
          </p>
          {INSTRUMENT_PATH_MAPPINGS.map((group) => (
            <div key={group.instrument} className="paths-ref-group">
              <h3>{group.instrument} <span className="paths-ref-desc">— {group.description}</span></h3>
              <table className="paths-ref-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>XML Path</th>
                    <th>Mandatory</th>
                  </tr>
                </thead>
                <tbody>
                  {group.fields.map((f) => (
                    <tr key={`${group.instrument}-${f.field}`}>
                      <td className="mono">{f.field}</td>
                      <td className="mono paths-ref-path">{f.xmlPath}</td>
                      <td>{f.mandatory}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}

      {/* ─── Trades Grid ────────────────────────────────────── */}
      {trades && tradeSummary && (
        <section className="trades-section">
          <div className="trades-header">
            <h2>Trades</h2>
            <span className="trades-stats">
              {tradeSummary.total} trades: <span className="stat-valid">{tradeSummary.valid} valid</span>,{' '}
              <span className="stat-errors">{tradeSummary.withErrors} with errors</span>
            </span>
          </div>
          <div className="trades-grid-wrapper">
            <table className="trades-grid">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Status</th>
                  <th>Action</th>
                  {GRID_FIELDS.map((f) => (
                    <th key={f.key}>{f.label}</th>
                  ))}
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => {
                  // Collect grid field keys that have at least one FAIL rule
                  const failedGridKeys = new Set<string>();
                  for (const r of trade.validation) {
                    if (r.status === 'FAIL') {
                      for (const gf of GRID_FIELDS) {
                        if (r.field === gf.key || r.field.startsWith(gf.key + ' ') || r.field.includes(' ' + gf.key)) {
                          failedGridKeys.add(gf.key);
                        }
                      }
                    }
                  }

                  return (
                  <tr
                    key={trade.index}
                    className={[
                      trade.failCount > 0 ? 'trade-row-error' : 'trade-row-valid',
                      selectedTradeIdx === trade.index ? 'trade-row-selected' : '',
                    ].join(' ')}
                    onClick={() => {
                      setSelectedTradeIdx(trade.index);
                      setEditingRuleId(null);
                    }}
                  >
                    <td className="mono">{trade.index + 1}</td>
                    <td>
                      <span className={`badge-sm ${trade.failCount > 0 ? 'badge-sm-fail' : 'badge-sm-pass'}`}>
                        {trade.failCount > 0 ? 'FAIL' : 'PASS'}
                      </span>
                    </td>
                    <td className="mono">{trade.report.actionType ?? '—'}</td>
                    {GRID_FIELDS.map((f) => {
                      const val = trade.report.fields.get(f.key) ?? '';
                      const isEditing = gridEditCell?.row === trade.index && gridEditCell?.field === f.key;
                      const editable = isGridCellEditable(f.key);
                      const hasError = failedGridKeys.has(f.key);

                      if (isEditing) {
                        return (
                          <td key={f.key} className="grid-edit-td">
                            <input
                              className="grid-edit-input"
                              value={gridEditValue}
                              onChange={(e) => setGridEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveGridEdit();
                                if (e.key === 'Escape') cancelGridEdit();
                              }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                          </td>
                        );
                      }

                      const displayVal = 'numeric' in f && f.numeric
                        ? formatNotional(val)
                        : 'truncate' in f && f.truncate && val.length > f.truncate
                          ? val.substring(0, f.truncate) + '...'
                          : val || '—';

                      return (
                        <td
                          key={f.key}
                          className={`mono ${editable ? 'grid-cell-editable' : ''}${hasError ? ' grid-cell-error' : ''}`}
                          onDoubleClick={(e) => {
                            if (editable) {
                              e.stopPropagation();
                              startGridEdit(trade.index, f.key, val);
                            }
                          }}
                          title={editable ? 'Double-click to edit' : val}
                        >
                          {displayVal}
                        </td>
                      );
                    })}
                    <td className={`mono ${trade.failCount > 0 ? 'error-count' : ''}`}>
                      {trade.failCount}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─── Validation Detail ──────────────────────────────── */}
      {selectedTrade && counts && (
        <section className="results-section">
          <div className="results-header">
            <h2>Validation: Trade #{selectedTrade.index + 1}</h2>
            {selectedTrade.report.actionType && (
              <span className="action-badge">Action: {selectedTrade.report.actionType}</span>
            )}
          </div>

          <div className="summary-cards">
            <button
              className={`card card-total ${filter === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilter('ALL')}
            >
              <span className="card-num">{counts.total}</span>
              <span className="card-label">Total Rules</span>
            </button>
            <button
              className={`card card-pass ${filter === 'PASS' ? 'active' : ''}`}
              onClick={() => setFilter('PASS')}
            >
              <span className="card-num">{counts.pass}</span>
              <span className="card-label">Passed</span>
            </button>
            <button
              className={`card card-fail ${filter === 'FAIL' ? 'active' : ''}`}
              onClick={() => setFilter('FAIL')}
            >
              <span className="card-num">{counts.fail}</span>
              <span className="card-label">Failed</span>
            </button>
            <button
              className={`card card-na ${filter === 'N/A' ? 'active' : ''}`}
              onClick={() => setFilter('N/A')}
            >
              <span className="card-num">{counts.na}</span>
              <span className="card-label">N/A</span>
            </button>
          </div>

          <div className="table-wrapper">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Rule ID</th>
                  <th>Category</th>
                  <th>Field</th>
                  <th>Description</th>
                  <th>Actual Value</th>
                  <th>Expected</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults && filteredResults.length > 0 ? (
                  filteredResults.map((r, i) => (
                    <tr key={i} className={`row-${r.status.toLowerCase().replace('/', '')}`}>
                      <td>
                        <span className={`badge badge-${r.status.toLowerCase().replace('/', '')}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="mono">{r.ruleId}</td>
                      <td>{r.category}</td>
                      <td className="mono">{r.field}</td>
                      <td className="desc-cell">{r.description}</td>
                      <td className="mono">
                        {editingRuleId === r.ruleId ? (
                          <div className="edit-cell">
                            <input
                              className="edit-input"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit(r.field);
                                if (e.key === 'Escape') setEditingRuleId(null);
                              }}
                              autoFocus
                            />
                            <div className="edit-actions">
                              <button className="btn-inline btn-save" onClick={() => handleSaveEdit(r.field)}>Save</button>
                              <button className="btn-inline btn-cancel" onClick={() => setEditingRuleId(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {r.actual ?? <span className="null-val">(empty)</span>}
                            {isEditable(r) && (
                              <button className="btn-fix" onClick={() => startEdit(r)} title="Fix this value">
                                Fix
                              </button>
                            )}
                          </>
                        )}
                      </td>
                      <td className="expected-cell">{r.expected}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="no-results">
                      No results match the selected filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <footer className="footer">
        <p>
          Based on ASIC Derivative Transaction Rules (Reporting) 2024 — Schedule 1 Technical Guidance v1.1
          &nbsp;|&nbsp; ISO 20022 auth.030.001.04
        </p>
      </footer>
    </div>
  );
}

export default App;
