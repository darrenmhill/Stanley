import { useState, useCallback } from 'react';
import { parseAllTradeReports, updateFieldInXml, FIELD_PATHS, type ParsedReport } from './engine/xmlParser';
import { validateReport, type ValidationResult } from './engine/validationRules';
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
  { key: 'CtrPty1.Drctn', label: 'Dir' },
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

function App() {
  const [xml, setXml] = useState('');
  const [trades, setTrades] = useState<TradeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTradeIdx, setSelectedTradeIdx] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('ALL');
  const [showXml, setShowXml] = useState(false);
  const [validationKey, setValidationKey] = useState(0);

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
                {trades.map((trade) => (
                  <tr
                    key={trade.index}
                    className={[
                      trade.failCount > 0 ? 'trade-row-error' : 'trade-row-valid',
                      selectedTradeIdx === trade.index ? 'trade-row-selected' : '',
                    ].join(' ')}
                    onClick={() => {
                      setSelectedTradeIdx(trade.index);
                      setFilter('ALL');
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
                          className={`mono ${editable ? 'grid-cell-editable' : ''}`}
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
                ))}
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
