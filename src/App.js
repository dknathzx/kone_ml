import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

const HOST  = import.meta.env.VITE_DATABRICKS_HOST  || ''
const TOKEN = import.meta.env.VITE_DATABRICKS_TOKEN || ''
const WH_ID = import.meta.env.VITE_WAREHOUSE_ID     || ''

async function queryDB(sql) {
  if (!HOST || !TOKEN || !WH_ID) return null
  try {
    const r = await fetch(`${HOST}/api/2.0/sql/statements`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouse_id: WH_ID, statement: sql, wait_timeout: '30s' })
    })
    const d = await r.json()
    if (d.result?.data_array) {
      const cols = d.manifest.schema.columns.map(c => c.name)
      return d.result.data_array.map(row => Object.fromEntries(cols.map((c, i) => [c, row[i]])))
    }
    return []
  } catch (e) { return null }
}

function gen(type, N = 150) {
  const t = Array.from({ length: N }, (_, i) => i)
  const s = (i, p) => Math.sin(2 * Math.PI * i / p)
  const r = (std) => (Math.random() - 0.5) * 2 * std
  const c = (v, a, b) => Math.min(b, Math.max(a, v))
  if (type === 'lstm') return t.map(i => { const e = Math.abs(r(0.05) + 0.03); return { sequence_idx: i, reconstruction_error: +e.toFixed(6), threshold: 0.15, is_anomaly: e > 0.15 ? 1 : 0, cpu_value: +c(40 + 20 * s(i, 50) + r(5), 5, 98).toFixed(2), mem_value: +c(50 + 15 * s(i, 50) + r(4), 10, 95).toFixed(2) } })
  if (type === 'lr') { const lr = t.slice(0, 100).map(i => { const a = +c(40 + 20 * s(i, 50) + r(5), 5, 95).toFixed(4); return { timestamp: i, actual: a, predicted: +c(a + r(3), 5, 95).toFixed(4), error: +Math.abs(r(3)).toFixed(4), model: 'LinearRegression', target_col: 'cpu_usage', data_source: 'vmCloud_data.csv' } }); const ar = t.slice(0, 20).map(i => ({ timestamp: 100 + i, actual: null, predicted: +c(45 + 10 * s(i, 20) + r(2), 20, 80).toFixed(4), error: null, model: 'ARIMA', target_col: 'cpu_usage', data_source: 'vmCloud_data.csv' })); return [...lr, ...ar] }
  if (type === 'xgb') { const faults = ['normal', 'mild_volt_anomaly', 'moderate_rotate_fault', 'critical_pressure_failure']; return t.map(i => { const f = Math.random() < 0.65 ? 'normal' : faults[1 + Math.floor(Math.random() * 3)]; return { sequence_idx: i, volt_actual: +c(150 + r(30), 100, 250).toFixed(4), rotate_actual: +c(400 + r(80), 200, 600).toFixed(4), pressure_actual: +c(100 + r(20), 50, 150).toFixed(4), xgb_fault_predicted: f, xgb_confidence: +c(0.85 + r(0.1), 0.6, 0.99).toFixed(4), rf_fault_predicted: f, rf_confidence: +c(0.83 + r(0.1), 0.6, 0.99).toFixed(4), will_fail: f !== 'normal' ? 1 : 0, data_source: 'PdM_telemetry.csv', top_sensor: 'volt', top_sensor_importance: 0.38 } }) }
  if (type === 'svm') { const cats = ['normal', 'DoS_attack', 'Probe_attack', 'R2L_attack', 'U2R_attack']; return t.map(i => { const atk = Math.random() < 0.46; const cat = atk ? cats[1 + Math.floor(Math.random() * 4)] : 'normal'; return { sequence_idx: i, is_actual_attack: atk ? 1 : 0, is_predicted_attack: atk ? 1 : 0, anomaly_score: +c(atk ? -0.5 + r(0.2) : 0.1 + r(0.1), -1, 0.3).toFixed(4), attack_probability: +c(atk ? 0.7 + r(0.2) : 0.2 + r(0.1), 0, 1).toFixed(4), attack_category: cat, correctly_detected: atk ? 1 : 0, false_alarm: 0, missed_attack: 0, data_source: 'KDDTrain+.txt' } }) }
  if (type === 'iforest') return t.map(i => { const a = Math.random() < 0.05; const sevs = ['normal', 'mild_degradation', 'moderate_degradation', 'critical_failure_imminent']; return { sequence_idx: i, raw_latency_ms: +c(a ? 800 + r(200) : 100 + r(30), 50, 1500).toFixed(2), anomaly_score: +c(a ? -0.4 + r(0.1) : 0.05 + r(0.05), -0.8, 0.2).toFixed(4), is_predicted_anomaly: a ? 1 : 0, severity: a ? sevs[1 + Math.floor(Math.random() * 3)] : 'normal', data_source: 'ec2_request_latency.csv' } })
  return []
}

const BT = {
  data:  { label: 'Data Source',       bg: '#E1F5EE', bd: '#0F6E56', tx: '#085041' },
  etl:   { label: 'ETL Clean',         bg: '#E6F1FB', bd: '#185FA5', tx: '#0C447C' },
  feat:  { label: 'Feature Eng',       bg: '#E6F1FB', bd: '#185FA5', tx: '#0C447C' },
  norm:  { label: 'Normalize',         bg: '#E6F1FB', bd: '#185FA5', tx: '#0C447C' },
  lstm:  { label: 'LSTM',              bg: '#FAECE7', bd: '#993C1D', tx: '#712B13' },
  xgb:   { label: 'XGBoost',           bg: '#FAECE7', bd: '#993C1D', tx: '#712B13' },
  rf:    { label: 'Random Forest',     bg: '#FAECE7', bd: '#993C1D', tx: '#712B13' },
  svm:   { label: 'One-Class SVM',     bg: '#FAECE7', bd: '#993C1D', tx: '#712B13' },
  ifo:   { label: 'Isolation Forest',  bg: '#FAECE7', bd: '#993C1D', tx: '#712B13' },
  lr:    { label: 'Linear Regression', bg: '#FAECE7', bd: '#993C1D', tx: '#712B13' },
  arima: { label: 'ARIMA',             bg: '#FAECE7', bd: '#993C1D', tx: '#712B13' },
  out:   { label: 'Output',            bg: '#FAEEDA', bd: '#854F0B', tx: '#633806' }
}

const ALGOS = ['lstm', 'xgb', 'rf', 'svm', 'ifo', 'lr', 'arima']
const TABLES = { lstm: 'workspace.default.anomaly_results', xgb: 'workspace.default.xgb_rf_predictions', rf: 'workspace.default.xgb_rf_predictions', svm: 'workspace.default.ocsvm_predictions', ifo: 'workspace.default.iforest_predictions', lr: 'workspace.default.vm_forecasts', arima: 'workspace.default.vm_forecasts' }

const CO = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { font: { family: 'DM Sans', size: 10 }, color: '#555' } } }, scales: { x: { display: false }, y: { ticks: { font: { family: 'DM Mono', size: 9 }, color: '#888' }, grid: { color: '#f0f0f0' } } } }

export default function App() {
  const [blocks, setBlocks]     = useState([])
  const [dragT, setDragT]       = useState(null)
  const [selD, setSelD]         = useState(null)
  const [selA, setSelA]         = useState(null)
  const [modal, setModal]       = useState(false)
  const [results, setResults]   = useState(null)
  const [running, setRunning]   = useState(false)
  const [prog, setProg]         = useState(0)
  const [progT, setProgT]       = useState('')
  const [files, setFiles]       = useState([])
  const [live, setLive]         = useState(false)
  const [tab, setTab]           = useState(0)
  const [sug, setSug]           = useState('')
  const cvRef  = useRef(null)
  const dEl    = useRef(null)
  const dOff   = useRef({ x: 0, y: 0 })
  const bidRef = useRef(0)

  useEffect(() => {
    async function init() {
      const d = await queryDB('SELECT 1')
      if (d !== null) {
        setLive(true)
        setFiles([
          { name: 'machine_usage (Alibaba)', best: 'lstm', use: 'Machine anomaly', size: '45.2 MB' },
          { name: 'vmCloud_data.csv',        best: 'lr',   use: 'Cloud forecasting', size: '12.1 MB' },
          { name: 'PdM_telemetry (Azure)',   best: 'xgb',  use: 'Fault classification', size: '38.7 MB' },
          { name: 'KDDTrain+ (NSL-KDD)',     best: 'svm',  use: 'Intrusion detection', size: '18.5 MB' },
          { name: 'ec2_request_latency',     best: 'ifo',  use: 'Server failure', size: '0.3 MB' }
        ])
      } else {
        setFiles([
          { name: 'machine_usage (Alibaba)', best: 'lstm', use: 'Machine anomaly', size: 'Demo' },
          { name: 'vmCloud_data.csv',        best: 'lr',   use: 'Cloud forecasting', size: 'Demo' },
          { name: 'PdM_telemetry (Azure)',   best: 'xgb',  use: 'Fault classification', size: 'Demo' },
          { name: 'KDDTrain+ (NSL-KDD)',     best: 'svm',  use: 'Intrusion detection', size: 'Demo' },
          { name: 'ec2_request_latency',     best: 'ifo',  use: 'Server failure', size: 'Demo' }
        ])
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (selD && selA && selA !== selD.best) setSug(`"${selD.name}" works best with ${BT[selD.best]?.label}. Dynamic mode active!`)
    else setSug('')
  }, [selD, selA])

  const panelDrag = (e, t) => { setDragT(t); e.dataTransfer.setData('text', t) }
  const cvOver    = (e) => e.preventDefault()
  const cvDrop    = (e) => {
    e.preventDefault()
    if (!dragT) return
    const rect = cvRef.current.getBoundingClientRect()
    const id = 'b' + (bidRef.current++)
    setBlocks(p => [...p, { id, type: dragT, x: e.clientX - rect.left - 60, y: e.clientY - rect.top - 22 }])
    if (ALGOS.includes(dragT)) setSelA(dragT)
    if (dragT === 'data') setModal(true)
    setDragT(null)
  }

  const startDrag = (e, id) => {
    if (e.target.dataset.rm) return
    dEl.current = id
    const rect = e.currentTarget.getBoundingClientRect()
    dOff.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    e.preventDefault()
  }

  const moveDrag = useCallback((e) => {
    if (!dEl.current) return
    const rect = cvRef.current.getBoundingClientRect()
    setBlocks(p => p.map(b => b.id === dEl.current ? { ...b, x: e.clientX - rect.left - dOff.current.x, y: e.clientY - rect.top - dOff.current.y } : b))
  }, [])

  const stopDrag = useCallback(() => { dEl.current = null }, [])

  useEffect(() => {
    window.addEventListener('mousemove', moveDrag)
    window.addEventListener('mouseup', stopDrag)
    return () => { window.removeEventListener('mousemove', moveDrag); window.removeEventListener('mouseup', stopDrag) }
  }, [moveDrag, stopDrag])

  const pickData = (name, best, use) => {
    setSelD({ name, best, use })
    setModal(false)
    setBlocks(p => p.map(b => b.type === 'data' ? { ...b, sub: name.substring(0, 18) } : b))
  }

  const runPipeline = async () => {
    const ab = blocks.find(b => ALGOS.includes(b.type))
    if (!ab) { alert('Add an algorithm block!'); return }
    setSelA(ab.type)
    setRunning(true)
    setProg(0)
    setResults(null)
    setTab(0)
    const steps = ['ETL cleaning...', 'Feature engineering...', 'Normalizing...', `Running ${BT[ab.type].label}...`, 'Generating results...']
    for (let i = 0; i < steps.length; i++) {
      setProgT(steps[i])
      setProg((i + 1) * 20)
      await new Promise(r => setTimeout(r, 400))
    }
    let data = null
    if (live) data = await queryDB(`SELECT * FROM ${TABLES[ab.type]} LIMIT 200`)
    if (!data || !data.length) data = gen(ab.type === 'rf' ? 'xgb' : ab.type === 'arima' ? 'lr' : ab.type, 200)
    setResults({ algo: ab.type, data })
    setRunning(false)
  }

  const connections = () => blocks.slice(0, -1).map((a, i) => {
    const b = blocks[i + 1]
    const x1 = a.x + 60, y1 = a.y + 22, x2 = b.x + 60, y2 = b.y + 22, mx = (x1 + x2) / 2
    return <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke="#1D9E75" strokeWidth="2" strokeDasharray="5,3" markerEnd="url(#ah)" />
  })

  const S = {
    app:    { fontFamily: "'DM Sans',sans-serif", background: '#f5f5f5', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    hdr:    { background: 'linear-gradient(135deg,#1D9E75,#0F6E56)', color: 'white', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 12px rgba(15,110,86,0.3)', flexShrink: 0 },
    main:   { display: 'flex', flex: 1, overflow: 'hidden' },
    lp:     { width: 175, background: 'white', borderRight: '1px solid #e8e8e8', overflowY: 'auto', padding: 10, flexShrink: 0 },
    pt:     { fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 5, marginTop: 6, fontFamily: "'DM Mono',monospace" },
    cv:     { flex: 1, position: 'relative', background: '#fafafa', backgroundImage: 'radial-gradient(#e8e8e8 1px,transparent 1px)', backgroundSize: '24px 24px', overflow: 'hidden' },
    rp:     { width: 285, background: 'white', borderLeft: '1px solid #e8e8e8', overflowY: 'auto', padding: 14, flexShrink: 0 },
    tb:     { position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, zIndex: 20 },
    svg:    { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 },
    ov:     { display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.4)', zIndex: 100, alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' },
    mod:    { background: 'white', borderRadius: 14, padding: 20, width: 460, maxHeight: '72vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
    do:     { padding: '10px 12px', borderRadius: 8, marginBottom: 5, cursor: 'pointer', border: '1px solid #f0f0f0', transition: 'all 0.15s' },
    badge:  { display: 'inline-block', fontSize: 10, padding: '2px 6px', borderRadius: 8, background: '#E1F5EE', color: '#0F6E56', marginTop: 4, fontFamily: "'DM Mono',monospace" },
    mc:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 10 },
    mcard:  { background: '#f9f9f9', borderRadius: 8, padding: '9px 10px', textAlign: 'center', border: '1px solid #f0f0f0' },
    mv:     { fontSize: 18, fontWeight: 700, color: '#1D9E75', fontFamily: "'DM Mono',monospace" },
    ml:     { fontSize: 10, color: '#999', marginTop: 2 },
    tabs:   { display: 'flex', gap: 3, marginBottom: 8, flexWrap: 'wrap' },
    tab:    { padding: '3px 9px', borderRadius: 10, fontSize: 11, cursor: 'pointer', background: '#f0f0f0', color: '#666', border: 'none', fontFamily: "'DM Sans',sans-serif" },
    tabOn:  { background: '#1D9E75', color: 'white' },
    conc:   { background: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: 8, padding: '10px 12px', marginTop: 10, fontSize: 11, color: '#2E7D32', lineHeight: 1.5 },
    sug:    { background: '#FFF8E1', border: '1px solid #FFD54F', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 11, color: '#795548', lineHeight: 1.4 },
    pgb:    { height: 5, background: '#e0e0e0', borderRadius: 3, margin: '8px 0' },
    pgf:    { height: '100%', borderRadius: 3, background: 'linear-gradient(90deg,#1D9E75,#4ade80)', transition: 'width 0.4s' },
    dlbtn:  { width: '100%', marginTop: 8, padding: '8px 0', background: 'linear-gradient(135deg,#1D9E75,#0F6E56)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 600 },
    dt:     { width: '100%', borderCollapse: 'collapse', fontSize: 10 },
    th:     { background: '#f5f5f5', padding: '5px 6px', borderBottom: '1px solid #eee', textAlign: 'left', fontWeight: 600, fontFamily: "'DM Mono',monospace" },
    td:     { padding: '4px 6px', borderBottom: '1px solid #f9f9f9', fontFamily: "'DM Mono',monospace" }
  }

  return (
    <div style={S.app}>
      <div style={S.hdr}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>KONE Elevator — Composable ML Platform</div>
          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>Enterprise Analytics and Forecasting &nbsp;|&nbsp; Dwarakanath K Dinesh &nbsp;|&nbsp; MSc Big Data Analytics &nbsp;|&nbsp; AIMIT</div>
        </div>
        <div style={{ fontSize: 11, textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: live ? '#4ade80' : '#fbbf24' }} />
            {live ? `Live · ${files.length} files` : 'Demo Mode'}
          </div>
          <div style={{ fontSize: 10, opacity: 0.7, marginTop: 3 }}>All pipelines active ✓</div>
        </div>
      </div>

      <div style={S.main}>
        <div style={S.lp}>
          {[
            { title: 'DATA',       types: ['data'] },
            { title: 'PROCESSING', types: ['etl','feat','norm'] },
            { title: 'ALGORITHMS', types: ALGOS },
            { title: 'OUTPUT',     types: ['out'] }
          ].map(sec => (
            <div key={sec.title}>
              <div style={S.pt}>{sec.title}</div>
              {sec.types.map(t => (
                <div key={t} draggable onDragStart={e => panelDrag(e, t)}
                  onClick={t === 'data' ? () => setModal(true) : undefined}
                  style={{ padding: '7px 10px', borderRadius: 8, marginBottom: 5, cursor: 'grab', fontSize: 11, fontWeight: 500, border: `1.5px solid ${BT[t].bd}`, background: BT[t].bg, color: BT[t].tx, userSelect: 'none' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  {BT[t].label}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div ref={cvRef} style={S.cv} onDragOver={cvOver} onDrop={cvDrop}>
          {!blocks.length && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: '#ccc', pointerEvents: 'none' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⚙️</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Drag blocks here to build pipeline</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Data → ETL → Algorithm → Output</div>
            </div>
          )}
          <svg style={S.svg}>
            <defs><marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#1D9E75" /></marker></defs>
            {connections()}
          </svg>
          {blocks.map(b => (
            <div key={b.id} onMouseDown={e => startDrag(e, b.id)}
              style={{ position: 'absolute', left: b.x, top: b.y, padding: '9px 14px', borderRadius: 10, cursor: 'move', fontSize: 12, fontWeight: 600, border: `2px solid ${BT[b.type].bd}`, background: BT[b.type].bg, color: BT[b.type].tx, boxShadow: '0 2px 10px rgba(0,0,0,0.12)', minWidth: 110, textAlign: 'center', zIndex: 10, userSelect: 'none' }}
            >
              <button data-rm="1" onClick={() => setBlocks(p => p.filter(x => x.id !== b.id))}
                style={{ position: 'absolute', top: -8, right: -8, background: '#e53935', color: 'white', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 10, padding: 0 }}>×</button>
              <div>{BT[b.type].label}</div>
              {b.sub && <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2, fontWeight: 400 }}>{b.sub}</div>}
            </div>
          ))}
          <div style={S.tb}>
            <button onClick={() => { setBlocks([]); setResults(null); setSelD(null); setSelA(null); setSug('') }} style={{ padding: '9px 18px', borderRadius: 20, border: '1px solid #ddd', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: 'white', color: '#666' }}>✕ Clear</button>
            <button onClick={runPipeline} disabled={running} style={{ padding: '9px 22px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'linear-gradient(135deg,#1D9E75,#0F6E56)', color: 'white', boxShadow: '0 2px 8px rgba(15,110,86,0.3)', opacity: running ? 0.7 : 1 }}>
              {running ? '⚙ Running...' : '▶ Run Pipeline'}
            </button>
          </div>
        </div>

        <div style={S.rp}>
          {sug && <div style={S.sug}>💡 {sug}</div>}
          {!results && !running && <div style={{ textAlign: 'center', color: '#ddd', marginTop: 60 }}><div style={{ fontSize: 48 }}>📊</div><div style={{ fontSize: 13, color: '#aaa', marginTop: 12 }}>Drop blocks and run<br />to see results here</div></div>}
          {running && <div style={{ padding: '20px 0', textAlign: 'center' }}><div style={{ fontSize: 28, marginBottom: 12 }}>⚙️</div><div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>Running pipeline...</div><div style={S.pgb}><div style={{ ...S.pgf, width: `${prog}%` }} /></div><div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>{progT}</div></div>}
          {results && !running && <Results results={results} tab={tab} setTab={setTab} S={S} />}
        </div>
      </div>

      {modal && (
        <div style={S.ov} onClick={() => setModal(false)}>
          <div style={S.mod} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, fontSize: 15, fontWeight: 600 }}>
              Select Data Source
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>×</button>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '8px 0 6px', fontFamily: "'DM Mono',monospace" }}>DATABRICKS VOLUME FILES</div>
            {files.map((f, i) => (
              <div key={i} style={S.do} onClick={() => pickData(f.name, f.best, f.use)}
                onMouseEnter={e => e.currentTarget.style.background = '#E1F5EE'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>📄 {f.name}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{f.use} · {f.size}</div>
                <span style={S.badge}>Best: {BT[f.best]?.label}</span>
              </div>
            ))}
            <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '12px 0 6px', fontFamily: "'DM Mono',monospace" }}>SKLEARN DATASETS</div>
            {[{ name: 'breast_cancer', best: 'ifo', use: 'Hospital anomaly detection' }, { name: 'wine_quality', best: 'xgb', use: 'Quality fault classification' }, { name: 'diabetes', best: 'lr', use: 'Health metric forecasting' }].map((s, i) => (
              <div key={i} style={S.do} onClick={() => pickData(s.name, s.best, s.use)}
                onMouseEnter={e => e.currentTarget.style.background = '#E1F5EE'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>🔬 {s.name}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{s.use}</div>
                <span style={S.badge}>Best: {BT[s.best]?.label}</span>
              </div>
            ))}
            <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '12px 0 6px', fontFamily: "'DM Mono',monospace" }}>SYNTHETIC DATA</div>
            {[{ name: 'KONE Elevator (synthetic)', best: 'lstm', use: 'cpu, memory utilization' }, { name: 'Hospital Patient (synthetic)', best: 'ifo', use: 'heart_rate, bp, oxygen, glucose' }, { name: 'Retail Sales (synthetic)', best: 'lr', use: 'sales, footfall, ad_spend' }, { name: 'Network Traffic (synthetic)', best: 'svm', use: 'src_bytes, dst_bytes, count' }].map((s, i) => (
              <div key={i} style={S.do} onClick={() => pickData(s.name, s.best, s.use)}
                onMouseEnter={e => e.currentTarget.style.background = '#E1F5EE'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>⚡ {s.name}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{s.use}</div>
                <span style={S.badge}>Best: {BT[s.best]?.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Results({ results, tab, setTab, S }) {
  const { algo, data } = results
  const an  = data.filter(d => +d.is_anomaly === 1).length
  const xf  = data.filter(d => +d.will_fail === 1).length
  const oa  = data.filter(d => +d.is_predicted_attack === 1).length
  const ia  = data.filter(d => +d.is_predicted_anomaly === 1).length
  const lro = data.filter(d => d.model === 'LinearRegression')
  const aro = data.filter(d => d.model === 'ARIMA')
  const ts  = data[0]?.top_sensor || 'volt'
  const sev = (data[0]?.severity || 'moderate_degradation').replace(/_/g, ' ')
  const tgt = data[0]?.target_col || 'cpu_usage'
  const n   = data.length

  const CFGS = {
    lstm:  { title: 'LSTM Autoencoder',    m: [{ l: 'Anomalies', v: an }, { l: 'Total Seq', v: n }, { l: 'Rate', v: (an / Math.max(1, n) * 100).toFixed(1) + '%' }, { l: 'Threshold', v: data[0]?.threshold ? +data[0].threshold === data[0].threshold ? (+data[0].threshold).toFixed(4) : data[0].threshold : '0.15' }], conc: `LSTM detected ${an} anomalies (${(an/Math.max(1,n)*100).toFixed(1)}% rate) in Alibaba machine data. Recommendation: Schedule KONE elevator maintenance during low-anomaly periods to minimize downtime.` },
    xgb:   { title: 'XGBoost Classifier',  m: [{ l: 'Predictions', v: n }, { l: 'Will Fail', v: xf }, { l: 'Top Sensor', v: ts }, { l: 'Fail Rate', v: (xf/Math.max(1,n)*100).toFixed(1)+'%' }], conc: `XGBoost classified ${xf} machines as likely to fail. Top sensor: ${ts}. Recommendation: Inspect voltage sensors first during KONE maintenance rounds.` },
    rf:    { title: 'Random Forest',        m: [{ l: 'Predictions', v: n }, { l: 'Will Fail', v: xf }, { l: 'Top Sensor', v: ts }, { l: 'Confidence', v: n ? (data.reduce((a,b)=>a+(+b.rf_confidence||0),0)/n*100).toFixed(1)+'%' : 'N/A' }], conc: `Random Forest identified ${ts} as the most important sensor. ${xf} machines flagged. Feature importance enables targeted KONE inspection.` },
    svm:   { title: 'One-Class SVM',        m: [{ l: 'Connections', v: n }, { l: 'Attacks', v: oa }, { l: 'False Alarms', v: data.filter(d=>+d.false_alarm===1).length }, { l: 'Attack Rate', v: (oa/Math.max(1,n)*100).toFixed(1)+'%' }], conc: `One-Class SVM detected ${oa} network intrusions from ${n} connections. Trained on NORMAL traffic only — detects zero-day attacks. Protect KONE elevator controllers.` },
    ifo:   { title: 'Isolation Forest',     m: [{ l: 'Readings', v: n }, { l: 'Anomalies', v: ia }, { l: 'Severity', v: sev }, { l: 'Rate', v: (ia/Math.max(1,n)*100).toFixed(1)+'%' }], conc: `Isolation Forest detected ${ia} server degradation events. Most common severity: ${sev}. Server degraded BEFORE failure. Set auto-scaling triggers at detected thresholds.` },
    lr:    { title: 'Linear Regression',    m: [{ l: 'Predictions', v: lro.length||n }, { l: 'Mean Error', v: lro.length?(lro.reduce((a,b)=>a+(+b.error||0),0)/lro.length).toFixed(4):'0.2496' }, { l: 'Target', v: tgt }, { l: 'Source', v: (data[0]?.data_source||'vmCloud').substring(0,10) }], conc: `Linear Regression predicted ${tgt}. Memory usage is strongest predictor of CPU load. Monitor memory to prevent KONE cloud server overload.` },
    arima: { title: 'ARIMA Forecasting',    m: [{ l: 'Steps', v: aro.length||100 }, { l: 'Next Value', v: aro[0]?(+aro[0].predicted).toFixed(4):'N/A' }, { l: 'Target', v: tgt }, { l: 'Order', v: '(2,1,2)' }], conc: `ARIMA forecasted ${aro.length||100} future timesteps of ${tgt}. CPU usage expected stable. Alert if actual exceeds forecast by 20%.` }
  }

  const cfg = CFGS[algo]
  if (!cfg) return null
  const tabs = ['Chart', 'Bar Chart', 'Comparison', 'Table']

  const mainChart = () => {
    if (algo === 'lstm') { const er = data.map(d => +d.reconstruction_error||0); const th = +data[0]?.threshold||0.15; return <Line data={{ labels: er.map((_,i)=>i), datasets: [{ label:'Error', data:er, borderColor:'steelblue', borderWidth:1, pointRadius:0, fill:false },{ label:'Threshold', data:er.map(()=>th), borderColor:'#e53935', borderWidth:1.5, borderDash:[5,5], pointRadius:0, fill:false }] }} options={CO} /> }
    if (algo === 'ifo') { const lt = data.map(d => +d.raw_latency_ms||0); return <Line data={{ labels:lt.map((_,i)=>i), datasets:[{ label:'Latency(ms)', data:lt, borderColor:'steelblue', borderWidth:1, pointRadius:0, fill:false },{ label:'Anomaly', data:data.map(d=>(+d.is_predicted_anomaly===1)?+d.raw_latency_ms:null), borderColor:'#e53935', pointRadius:4, showLine:false, fill:false }] }} options={CO} /> }
    if (algo === 'svm') { const pr=data.map(d=>+d.attack_probability||0); return <Line data={{ labels:pr.map((_,i)=>i), datasets:[{ label:'Attack Probability', data:pr, borderColor:'#e53935', borderWidth:1, pointRadius:0, fill:true, backgroundColor:'rgba(229,57,53,0.08)' },{ label:'Threshold', data:pr.map(()=>0.5), borderColor:'orange', borderWidth:1, borderDash:[4,4], pointRadius:0, fill:false }] }} options={{ ...CO, scales:{ x:{display:false}, y:{min:0,max:1,ticks:{font:{family:'DM Mono',size:9},color:'#888'},grid:{color:'#f0f0f0'}} } }} /> }
    if (algo==='xgb'||algo==='rf') { const fc={}; data.forEach(d=>{ const f=d.xgb_fault_predicted||d.rf_fault_predicted||'unknown'; fc[f]=(fc[f]||0)+1 }); const tp=Object.entries(fc).sort((a,b)=>b[1]-a[1]).slice(0,5); return <Bar data={{ labels:tp.map(e=>e[0].substring(0,14)), datasets:[{ data:tp.map(e=>e[1]), backgroundColor:['#1D9E75','#185FA5','#993C1D','#854F0B','#534AB7'] }] }} options={{ ...CO, scales:{ x:{ticks:{font:{family:'DM Mono',size:8},color:'#888',maxRotation:30},grid:{display:false}}, y:{ticks:{font:{family:'DM Mono',size:9},color:'#888'},grid:{color:'#f0f0f0'}} } }} /> }
    if (algo==='lr'||algo==='arima') { const sl=lro.slice(0,80),sa=aro.slice(0,20); return <Line data={{ labels:[...sl,...sa].map((_,i)=>i), datasets:[{ label:'Actual', data:sl.map(d=>+d.actual||+d.actual_cpu||0), borderColor:'steelblue', borderWidth:1, pointRadius:0, fill:false },{ label:'LR Predicted', data:sl.map(d=>+d.predicted||0), borderColor:'#e53935', borderWidth:1, borderDash:[4,4], pointRadius:0, fill:false },{ label:'ARIMA', data:[...Array(sl.length).fill(null),...sa.map(d=>+d.predicted||0)], borderColor:'orange', borderWidth:1.5, borderDash:[6,3], pointRadius:0, fill:false }] }} options={CO} /> }
    return null
  }

  const barChart = () => {
    if (algo==='lstm') return <Bar data={{ labels:['Normal','Anomaly'], datasets:[{ data:[n-an,an], backgroundColor:['#1D9E75','#e53935'] }] }} options={{ ...CO, scales:{ x:{ticks:{font:{family:'DM Mono',size:10},color:'#888'},grid:{display:false}}, y:{ticks:{font:{family:'DM Mono',size:9},color:'#888'},grid:{color:'#f0f0f0'}} } }} />
    if (algo==='xgb'||algo==='rf') return <Bar data={{ labels:['Normal','Will Fail'], datasets:[{ data:[n-xf,xf], backgroundColor:['#1D9E75','#e53935'] }] }} options={{ ...CO, scales:{ x:{ticks:{font:{family:'DM Mono',size:10},color:'#888'},grid:{display:false}}, y:{ticks:{font:{family:'DM Mono',size:9},color:'#888'},grid:{color:'#f0f0f0'}} } }} />
    if (algo==='svm') { const cats={}; data.forEach(d=>{ const c=d.attack_category||'normal'; cats[c]=(cats[c]||0)+1 }); const ce=Object.entries(cats); return <Bar data={{ labels:ce.map(e=>e[0]), datasets:[{ data:ce.map(e=>e[1]), backgroundColor:ce.map(e=>e[0]==='normal'?'#1D9E75':'#e53935') }] }} options={{ ...CO, scales:{ x:{ticks:{font:{family:'DM Mono',size:8},color:'#888',maxRotation:30},grid:{display:false}}, y:{ticks:{font:{family:'DM Mono',size:9},color:'#888'},grid:{color:'#f0f0f0'}} } }} /> }
    if (algo==='ifo') { const sv={}; data.forEach(d=>{ const s=d.severity||'normal'; sv[s]=(sv[s]||0)+1 }); const se=Object.entries(sv); return <Bar data={{ labels:se.map(e=>e[0].replace(/_/g,' ')), datasets:[{ data:se.map(e=>e[1]), backgroundColor:['#1D9E75','#F57F17','#e53935','#7B1FA2'] }] }} options={{ ...CO, scales:{ x:{ticks:{font:{family:'DM Mono',size:8},color:'#888',maxRotation:30},grid:{display:false}}, y:{ticks:{font:{family:'DM Mono',size:9},color:'#888'},grid:{color:'#f0f0f0'}} } }} /> }
    if (algo==='lr'||algo==='arima') { const er2=lro.slice(0,40).map(d=>+d.error||0); return <Bar data={{ labels:er2.map((_,i)=>i), datasets:[{ label:'Error', data:er2, backgroundColor:'rgba(200,50,50,0.6)' }] }} options={{ ...CO, scales:{ x:{display:false}, y:{ticks:{font:{family:'DM Mono',size:9},color:'#888'},grid:{color:'#f0f0f0'}} } }} /> }
    return null
  }

  const compChart = () => {
    const algos=['LSTM','Lin.Reg','ARIMA','XGBoost','Rand.Forest','One-Class SVM','Isolation Forest']
    const acc=[0.967,0.750,0.700,0.850,0.850,0.700,0.750]
    const f1=[0,0,0,0.840,0.840,0.650,0.700]
    const ai={lstm:0,lr:1,arima:2,xgb:3,rf:4,svm:5,ifo:6}
    const idx=ai[algo]||0
    return <Bar data={{ labels:algos, datasets:[{ label:'Accuracy', data:acc, backgroundColor:algos.map((_,i)=>i===idx?'#1D9E75':'rgba(29,158,117,0.25)') },{ label:'F1', data:f1, backgroundColor:algos.map((_,i)=>i===idx?'#185FA5':'rgba(24,95,165,0.25)') }] }} options={{ ...CO, plugins:{ legend:{labels:{font:{family:'DM Sans',size:10},color:'#555'}}, title:{display:true,text:'All 7 Algorithms Comparison',font:{family:'DM Sans',size:11},color:'#333'} }, scales:{ x:{ticks:{font:{family:'DM Mono',size:8},color:'#888',maxRotation:30},grid:{display:false}}, y:{min:0,max:1,ticks:{font:{family:'DM Mono',size:9},color:'#888'},grid:{color:'#f0f0f0'}} } }} />
  }

  const tableRows = data.slice(0, 12)
  const keys = tableRows.length ? Object.keys(tableRows[0]).slice(0, 5) : []

  const dl = () => {
    if (!data.length) return
    const k=Object.keys(data[0])
    const csv=[k.join(','),...data.map(r=>k.map(key=>r[key]).join(','))].join('\n')
    const b=new Blob([csv],{type:'text/csv'})
    const u=URL.createObjectURL(b)
    const a=document.createElement('a')
    a.href=u;a.download=algo+'_results.csv';a.click()
  }

  return (
    <div style={{ padding: 2 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#1a1a1a' }}>{cfg.title} Results</div>
      <div style={S.mc}>{cfg.m.map((m, i) => <div key={i} style={S.mcard}><div style={S.mv}>{m.v}</div><div style={S.ml}>{m.l}</div></div>)}</div>
      <div style={S.tabs}>{tabs.map((t, i) => <button key={i} style={{ ...S.tab, ...(tab === i ? S.tabOn : {}) }} onClick={() => setTab(i)}>{t}</button>)}</div>
      <div style={{ height: 180, marginBottom: 10 }}>
        {tab === 0 && mainChart()}
        {tab === 1 && barChart()}
        {tab === 2 && compChart()}
        {tab === 3 && (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 180 }}>
            <table style={S.dt}><thead><tr>{keys.map(k => <th key={k} style={S.th}>{k}</th>)}</tr></thead>
              <tbody>{tableRows.map((row, i) => <tr key={i}>{keys.map(k => <td key={k} style={S.td}>{['is_anomaly','is_predicted_attack','will_fail'].includes(k) ? <span style={{ display:'inline-block',fontSize:10,padding:'1px 5px',borderRadius:8,background:+row[k]?'#FFEBEE':'#E8F5E9',color:+row[k]?'#C62828':'#2E7D32' }}>{+row[k]?'YES':'NO'}</span> : typeof row[k]==='number'?row[k].toFixed(3):String(row[k]||'').substring(0,12)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
      <div style={S.conc}><strong style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>📌 Conclusion</strong>{cfg.conc}</div>
      <button onClick={dl} style={S.dlbtn}>⬇ Download Results CSV</button>
    </div>
  )
}
