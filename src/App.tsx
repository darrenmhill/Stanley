import { useState, useCallback } from 'react';
import { parseDerivativesTradeReport } from './engine/xmlParser';
import { validateReport, type ValidationResult } from './engine/validationRules';
import { SAMPLE_XML } from './engine/sampleXml';
import './App.css';

type FilterStatus = 'ALL' | 'PASS' | 'FAIL' | 'N/A';

function App() {
  const [xml, setXml] = useState('');
  const [results, setResults] = useState<ValidationResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('ALL');
  const [actionType, setActionType] = useState<string | null>(null);

  const runValidation = useCallback((input: string) => {
    setError(null);
    setResults(null);
    setActionType(null);
    if (!input.trim()) {
      setError('Please paste an XML message or load the sample.');
      return;
    }
    try {
      const report = parseDerivativesTradeReport(input);
      setActionType(report.actionType);
      const validationResults = validateReport(report);
      setResults(validationResults);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
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

  const filtered = results
    ? filter === 'ALL'
      ? results
      : results.filter((r) => r.status === filter)
    : null;

  const counts = results
    ? {
        total: results.length,
        pass: results.filter((r) => r.status === 'PASS').length,
        fail: results.filter((r) => r.status === 'FAIL').length,
        na: results.filter((r) => r.status === 'N/A').length,
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
          <button className="btn btn-validate" onClick={handleValidate} disabled={!xml.trim()}>
            Validate
          </button>
        </div>
        <textarea
          className="xml-input"
          value={xml}
          onChange={(e) => setXml(e.target.value)}
          placeholder="Paste your ISO 20022 auth.030 XML message here..."
          spellCheck={false}
        />
      </section>

      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      {results && counts && (
        <section className="results-section">
          <div className="results-header">
            <h2>Validation Results</h2>
            {actionType && <span className="action-badge">Action: {actionType}</span>}
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
                {filtered && filtered.length > 0 ? (
                  filtered.map((r, i) => (
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
                      <td className="mono">{r.actual ?? <span className="null-val">(empty)</span>}</td>
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
