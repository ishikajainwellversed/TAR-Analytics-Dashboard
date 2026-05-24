// ════════════════════════════════════════════════════════════
//  CONFIG
//
//  Defaults below. Overridable at runtime from ./config.json — see
//  loadConfig() near the bottom of this file. We declare with `let` so
//  the config loader can replace them before init() runs.
// ════════════════════════════════════════════════════════════
let SHEET_ID = '17hXqO2NePcOJIs08PkEh1wndDIhE4hlzmD0Lhfbxx1k';
let DRIVE_TOOL = 'mcp__2438036f-6e75-4ad0-b86a-9e8ede271c1d__read_file_content';
let STORE_KEY = 'tar_live_dashboard_v2';
// Google Apps Script web app endpoint — primary data source.
// Override via config.json `appsScriptUrl`.
let APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyE2Cp4L8a95rq5-bD5RtHq_9_WioM2To0LDSVmVrFcCZU5Q-9WuSo7KqiVwvuSgn6-/exec';


// Corporate roles (Active Funnel + Funnel Performance)
let CORP_ROLES = ['Brand School','Brand Events','Pharma R&D','Ecommerce'];
// Industrial roles (Funnel Performance)
let IND_ROLES = ['Packaging','Data Entry','Loading/Unloading','Other'];

// ── Unified role color palette — used by FP donuts, FP role rows, AND Hiring tracker
const ROLE_COLORS = {
  // Corporate (FP)
  'Brand School':       '#7c3aed', // purple
  'Brand Events':       '#C48A1E', // gold
  'Pharma R&D':         '#16a34a', // green
  'Ecommerce':          '#2563eb', // blue
  // Hiring tracker corporate job titles (mapped to nearest FP role colour)
  'Ecommerce Marketing':'#2563eb', // blue (same as Ecommerce)
  'Brand Marketing':    '#db2777', // pink — distinct from Brand Events/School
  // Industrial (FP)
  'Packaging':          '#0F9D94', // teal
  'Data Entry':         '#06b6d4', // cyan
  'Loading/Unloading':  '#ea580c', // orange
  'Other':              '#9333ea', // violet
  // Hiring tracker industrial job titles
  'Packaging Helper':   '#0F9D94', // teal
  'Gardener':           '#10b981', // emerald
  'FAM Trainee':        '#f59e0b', // amber
  'Housekeeping':       '#a855f7', // light purple
};
// Aliases (back-compat)
const CORP_COLORS = ROLE_COLORS;
const IND_COLORS = ROLE_COLORS;
function colorFor(role){ return ROLE_COLORS[role] || '#9ca3af'; }

// ── Source palette (for Hired-by-Source donut)
const SOURCE_COLORS = {
  'Easy Apply':              '#2563eb',
  'Fillout Form':            '#0F9D94',
  'Referral':                '#16a34a',
  'WhatsApp Messages':       '#22c55e',
  'Walk In (Word of Mouth)': '#ea580c',
  'Job Hai':                 '#db2777',
  'LinkedIn':                '#0a66c2',
  'Other':                   '#9ca3af',
};
function colorForSource(s){ return SOURCE_COLORS[s] || '#9ca3af'; }

// Active Funnel rows in display order
const AFS_ROWS = [
  'Total Unactioned Applicants',
  'Qualified HRS Available',
  'Qualified CFA Available',
  'Total CFAs Scheduled',
  'CFAs Scheduled For Today',
  'Qualified Domain-I Available',
  'Total Domain-I Scheduled',
  'Domain-I Scheduled For Today',
  'Qualified Domain-II Available',
  'Qualified Domain-III Available',
];

// Corporate Funnel Performance stages (with full labels + tile colors)
const CORP_STAGES = [
  ['Form+EA Applications Recieved',      'Applications Received', 'orange'],
  ['Applications Screenings Undertaken', 'Application Screening', 'blue'],
  ['Pipeline Screenings Undertaken',     'Pipeline Screening',    'purple'],
  ['HRS Undertaken',                     'HR Screening',          'cyan'],
  ['CFAs Scheduling Undertaken',         'CFA Scheduling',        'gold'],
  ['CFAs Undertaken',                    'Culture Fit',           'green'],
  ['Domain-I Undertaken',                'Domain-I',              'blue'],
  ['Domain-II Undertaken',               'Domain-II',             'purple'],
  ['Domain-III Undertaken',              'Domain-III',            'pink'],
];

// Industrial Funnel Performance stages
const IND_STAGES = [
  ['Show-Ups',                  'Show-Ups',           'orange'],
  ['HRS Undertaken',            'HR Screening',       'cyan'],
  ['Shortlist for Culture Fit', 'Shortlist CF',       'blue'],
  ['CFAs Undertaken',           'Culture Fit',        'green'],
  ['Shortlist Trial',           'Shortlist Trial',    'gold'],
  ['Trail Undertaken (Day-I)',  'Trial Day-I',        'purple'],
  ['Trail Undertaken (Day-II)', 'Trial Day-II',       'pink'],
  ['Hired',                     'Hired',              'green'],
  ['Joined',                    'Joined',             'cyan'],
];

// ════════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════════
let DB = { snapshots: {}, currentDate: null };
let chartInst = {};
let fpView = 'day';                   // 'day' | 'month'
let fpType = 'corp';                  // 'corp' | 'ind' | 'all'
let fpSelectedDate = null;            // ISO date
let fpSelectedRoles = new Set([...CORP_ROLES, ...IND_ROLES]); // multi-select role chips
let activeRoleTile = null;
let agentSelectedDate = null;         // ISO date of currently-selected Agent Performance section
let agentView = 'day';                // 'day' | 'week' | 'month'
// Map stage raw label → agent perf key for clickable tiles
const STAGE_TO_AGENT = {
  'HRS Undertaken':                     'hrs',
  'Applications Screenings Undertaken': 'lis',
  'CFAs Undertaken':                    'cfa',
  'Pipeline Screenings Undertaken':     'pipe',
};
// Map stage raw label → friendly "stage" for allocation matching
const STAGE_FRIENDLY = {
  'HRS Undertaken':                     'HRS',
  'Applications Screenings Undertaken': 'Application Screening',
  'CFAs Undertaken':                    'CFA',
  'Pipeline Screenings Undertaken':     'Pipeline Screening',
};

// ── Manual allocation overrides per the user spec (Agent → { Role → [Stages] })
// Stage values are matched case-insensitively against STAGE_FRIENDLY values.
// Overridable from config.json at runtime.
let MANUAL_ALLOCATIONS = {
  // Pharma R&D · Application Screening + HRS
  'Aditi Chaudhary': { 'Pharma R&D': ['Application Screening', 'HRS'] },
  'Nibedita':        { 'Pharma R&D': ['Application Screening', 'HRS'] },
  'Saina':           { 'Pharma R&D': ['Application Screening', 'HRS'] },
  // Brand Events · Application Screening + HRS
  'Shoaib':          { 'Brand Events': ['Application Screening', 'HRS'] },
  'Manvi':           { 'Brand Events': ['Application Screening', 'HRS'] },
  'Shivanjali':      { 'Brand Events': ['Application Screening', 'HRS'] },
  'Prateek Wangnoo': { 'Brand Events': ['Application Screening', 'HRS'] },
  // Data Entry · Pipeline Screening
  'Hunny Dhall':     { 'Data Entry':   ['Pipeline Screening'] },
};

// Returns the list of agents allocated to (role, stage)
function getAllocatedAgentsForRoleStage(role, stageRaw){
  const friendlyStage = (STAGE_FRIENDLY[stageRaw] || '').toLowerCase();
  if (!friendlyStage) return [];
  const matches = [];
  Object.entries(MANUAL_ALLOCATIONS).forEach(([agent, mapping]) => {
    const stages = mapping[role];
    if (stages && stages.some(s => s.toLowerCase() === friendlyStage)) matches.push(agent);
  });
  return matches;
}

// ════════════════════════════════════════════════════════════
//  STORAGE
// ════════════════════════════════════════════════════════════
function loadStore(){
  try{ const raw = localStorage.getItem(STORE_KEY); if (raw) DB = JSON.parse(raw); if (!DB.snapshots) DB.snapshots = {}; }
  catch(e){ DB = {snapshots:{}, currentDate:null}; }
}
function saveStore(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }catch(e){} }

// ════════════════════════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════════════════════════
const fmt = n => (n===null||n===undefined||isNaN(n)) ? '—' : Math.abs(n)>=1000 ? (n/1000).toFixed(1).replace(/\.0$/,'')+'K' : String(Math.round(n));
function todayISO(){ return new Date().toISOString().slice(0,10); }
function fmtDate(iso){
  if (!iso) return '—';
  const d = new Date(iso+'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}
function fmtShortDate(iso){
  if (!iso) return '—';
  const d = new Date(iso+'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
}
// Parse a sheet-cell date string → ISO "YYYY-MM-DD". Accepts both
// "19 May 2026" (spelled-out month) and "19/05/2026" / "19-05-2026" (numeric).
// Returns null if neither format matches.
const MONTHS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
function parseDateStr(s){
  if (!s) return null;
  const txt = String(s).trim();
  // "19 May 2026"
  let m = txt.match(/^(\d{1,2})\s+(\w{3,})\s+(\d{4})/i);
  if (m) {
    const day = parseInt(m[1],10);
    const mon = MONTHS[m[2].slice(0,3).toLowerCase()];
    const yr  = parseInt(m[3],10);
    if (!mon) return null;
    return `${yr}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  // "19/05/2026" or "19-05-2026" (numeric DD/MM/YYYY)
  m = txt.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const day = parseInt(m[1],10);
    const mon = parseInt(m[2],10);
    const yr  = parseInt(m[3],10);
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
    return `${yr}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  return null;
}

// ════════════════════════════════════════════════════════════
//  MARKDOWN TABLE PARSER
// ════════════════════════════════════════════════════════════
function parseTables(md){
  const lines = md.split('\n');
  const tables = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    const isRow = line.startsWith('|') && line.endsWith('|');
    if (isRow) {
      const cells = line.slice(1,-1).split('|').map(c => c.trim());
      if (cells.every(c => /^:?-+:?$/.test(c))) continue;
      if (!cur) cur = { headers: cells, rows: [] };
      else cur.rows.push(cells);
    } else {
      if (cur) { tables.push(cur); cur = null; }
    }
  }
  if (cur) tables.push(cur);
  return tables;
}
function cleanNum(s){
  if (s == null) return 0;
  s = String(s).replace(/\\/g,'').trim();
  if (!s || s==='—' || s==='-' || s==='NA') return 0;
  const isNeg = s.startsWith('(') && s.endsWith(')');
  s = s.replace(/[()]/g,'').replace(/,/g,'').replace(/%/g,'');
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return isNeg ? -n : n;
}
function cleanText(s){ return String(s||'').replace(/\\([&%])/g,'$1').replace(/&#9;/g,'').trim(); }
function findTable(tables, headerContains){
  for (const t of tables) {
    if (!t.headers) continue;
    for (const h of t.headers) {
      if (h && h.toLowerCase().includes(headerContains.toLowerCase())) return t;
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════
//  PARSER: Active Funnel Status (current state, top block)
// ════════════════════════════════════════════════════════════
function parseActiveFunnel(tables){
  const t = findTable(tables, 'Active Funnel Status');
  if (!t) return null;
  // Map columns to corporate roles based on headers
  const colMap = {};
  t.headers.forEach((h, i) => {
    const c = cleanText(h);
    CORP_ROLES.forEach(r => { if (c.toLowerCase() === r.toLowerCase()) colMap[r] = i; });
  });
  // Walk only the first block — stop at the first row that is a date divider
  const out = {};
  CORP_ROLES.forEach(r => { out[r] = {}; AFS_ROWS.forEach(rl => out[r][rl] = 0); });
  for (const row of t.rows) {
    const lbl = cleanText(row[0]);
    if (parseDateStr(lbl)) break; // hit the second block divider
    if (AFS_ROWS.includes(lbl)) {
      CORP_ROLES.forEach(r => {
        const ci = colMap[r];
        if (ci != null) out[r][lbl] = cleanNum(row[ci]);
      });
    }
  }
  return out;
}

// ════════════════════════════════════════════════════════════
//  PARSER: Funnel Performance (multi-day, Corp + Ind side by side)
// ════════════════════════════════════════════════════════════
function parseFunnelPerformance(tables){
  // Find the FP table. We accept two layouts:
  //   (a) Old layout where header[0] combined date + label → "23 May 2026/Funnel Performance"
  //   (b) New layout where header[0] is just the date ("23/05/2026") and a sibling
  //       header in the same row contains "Funnel Performance" (or row 1 carries it).
  // To handle both we look for ANY header cell that has "funnel performance",
  // OR a header where header[0] is a date AND any other header contains a CORP_ROLE name.
  let t = null;
  for (const tbl of tables) {
    if (!tbl.headers) continue;
    const h0 = cleanText(tbl.headers[0]);
    const anyFP   = tbl.headers.some(h => /funnel performance/i.test(cleanText(h||'')));
    const h0Date  = !!parseDateStr(h0);
    const anyRole = tbl.headers.some(h => {
      const c = cleanText(h||'').toLowerCase();
      return CORP_ROLES.some(r => c === r.toLowerCase() || c.endsWith('/' + r.toLowerCase())) ||
             IND_ROLES.some(r =>  c === r.toLowerCase() || c.endsWith('/' + r.toLowerCase()));
    });
    if ((anyFP && (h0Date || parseDateStr(cleanText(tbl.headers.slice(-1)[0]||'')))) ||
        (h0Date && anyRole)) {
      t = tbl; break;
    }
  }
  if (!t) return null;

  // Column layout: 0=corp stage label | 1-4 corp roles | 5=ind stage label | 6-9 ind roles
  // Resolve corp/ind columns from headers
  function resolveCols(headers){
    const cols = { corpStageCol: 0, corp: {}, indStageCol: -1, ind: {} };
    for (let i = 0; i < headers.length; i++) {
      const h = cleanText(headers[i]);
      // Extract trailing role: "Corporate/Brand School" → "Brand School"
      const m = h.match(/(?:Corporate|Industrial)\/(.+)$/i);
      const tail = m ? m[1].trim() : h;
      const cleanTail = tail.toLowerCase();
      CORP_ROLES.forEach(r => { if (cleanTail === r.toLowerCase()) cols.corp[r] = i; });
      IND_ROLES.forEach(r => { if (cleanTail === r.toLowerCase()) cols.ind[r] = i; });
      // Find the second "Funnel Performance" label column → industrial stage column
      if (/funnel performance/i.test(h) && i !== 0) cols.indStageCol = i;
    }
    return cols;
  }

  // Initial layout from headers (matches Day 1)
  let cols = resolveCols(t.headers);
  // Determine first date from headers[0]
  let curDate = parseDateStr(cleanText(t.headers[0]));
  const byDate = {};
  function ensureDate(d){
    if (!byDate[d]) {
      byDate[d] = { corp:{}, ind:{} };
      CORP_STAGES.forEach(([raw]) => { byDate[d].corp[raw] = {}; CORP_ROLES.forEach(r => byDate[d].corp[raw][r]=0); });
      IND_STAGES.forEach(([raw]) => { byDate[d].ind[raw] = {}; IND_ROLES.forEach(r => byDate[d].ind[raw][r]=0); });
    }
  }
  if (curDate) ensureDate(curDate);

  // Walk rows
  for (let i = 0; i < t.rows.length; i++) {
    const row = t.rows[i];
    const corpLbl = cleanText(row[0]);
    const indLbl = cols.indStageCol >= 0 ? cleanText(row[cols.indStageCol]) : '';
    // Date-divider row?
    const newDate = parseDateStr(corpLbl);
    if (newDate) {
      curDate = newDate;
      ensureDate(curDate);
      continue;
    }
    // Setup row (column headers for next day)?
    if (/^funnel performance$/i.test(corpLbl)) {
      // Re-resolve columns from this row (treating it as a sub-header)
      cols = resolveCols(row);
      continue;
    }
    if (!curDate) continue;
    // Corporate data
    const corpStage = CORP_STAGES.find(s => s[0].toLowerCase() === corpLbl.toLowerCase());
    if (corpStage) {
      CORP_ROLES.forEach(r => {
        const ci = cols.corp[r];
        if (ci != null) byDate[curDate].corp[corpStage[0]][r] = cleanNum(row[ci]);
      });
    }
    // Industrial data
    const indStage = IND_STAGES.find(s => s[0].toLowerCase() === indLbl.toLowerCase());
    if (indStage) {
      IND_ROLES.forEach(r => {
        const ci = cols.ind[r];
        if (ci != null) byDate[curDate].ind[indStage[0]][r] = cleanNum(row[ci]);
      });
    }
  }
  return byDate;
}

// ════════════════════════════════════════════════════════════
//  PARSER: Hired roster (combined Corp + Ind)
// ════════════════════════════════════════════════════════════
function parseHired(tables){
  // Find table whose headers start with "Corporate - Hired" or "Candidate Name"
  let t = null;
  for (const tbl of tables) {
    if (!tbl.headers) continue;
    const h0 = cleanText(tbl.headers[0]);
    if (/corporate.*hired|^candidate name/i.test(h0)) { t = tbl; break; }
  }
  if (!t) return { corp: [], ind: [] };

  // Try to detect corp/ind layout from headers
  // Pattern: ['Corporate - Hired/Candidate Name', .., 'Industrial - Hired/Candidate Name', ..]
  const idxs = { corpStart: 0, indStart: -1 };
  t.headers.forEach((h, i) => {
    const c = cleanText(h);
    if (/industrial.*hired/i.test(c) || /industrial.*candidate/i.test(c)) idxs.indStart = i;
  });
  // Fallback: split by halves if not detected
  if (idxs.indStart < 0) idxs.indStart = 7;

  const corp = [];
  const ind = [];
  for (const row of t.rows) {
    // Corporate side: 7 columns starting at 0
    const cName = cleanText(row[idxs.corpStart]);
    if (cName) {
      corp.push({
        name: cName,
        job: cleanText(row[idxs.corpStart+1]),
        status: cleanText(row[idxs.corpStart+2]),
        date: cleanText(row[idxs.corpStart+3]),
        lisOwner: cleanText(row[idxs.corpStart+4]),
        hrsOwner: cleanText(row[idxs.corpStart+5]),
        source: cleanText(row[idxs.corpStart+6]),
      });
    }
    // Industrial side: 5 columns starting at indStart
    const iName = cleanText(row[idxs.indStart]);
    if (iName) {
      ind.push({
        name: iName,
        job: cleanText(row[idxs.indStart+1]),
        status: cleanText(row[idxs.indStart+2]),
        date: cleanText(row[idxs.indStart+3]),
        source: cleanText(row[idxs.indStart+4]),
      });
    }
  }
  return { corp, ind };
}

// ════════════════════════════════════════════════════════════
//  PARSER: Agent hourly tables
//
//  Sheet layout:
//    The "Agent Performance" section has 3 date sub-sections.
//    Each date has exactly 4 agent tables, one per block:
//        HR Screening (TU=6),  LI Screening (TU=2),
//        Pipeline Screening (TU=2),  Culture Fit Interview (TU=45)
//    Tables appear top-down in the sheet with most-recent date first.
//
//  Strategy:
//    1. Find all "agent" tables (12 expected).
//    2. Split into groups of 4 in document order.
//    3. Inside each group, classify by Time/Unit:
//         TU=6  → HR Screening
//         TU=45 → Culture Fit Interview
//         1st TU=2 (broad multi-agent table) → LI Screening
//         2nd TU=2 (typically Hunny-dominated Pipeline) → Pipeline Screening
//    4. Date labels come from "Agent Performance | … | DD/MM/YYYY" rows
//       in raw markdown; if extraction fails we fall back to (today, …).
// ════════════════════════════════════════════════════════════
// ── Custom Agent table extractor.
//    The standard parseTables() requires a |:-:|...|:-:| separator row.
//    But the Agent Performance section emits some tables without that separator
//    (HR Screening table directly follows the Productivity row of the previous
//    block, Culture Fit ditto). Using the standard parser we'd only see ~4 of
//    the 12 agent tables — and the HR Screening data would be invisible.
//
//    This function scans the raw markdown line-by-line and starts a new agent
//    table whenever it encounters a row that looks like an Agent header
//    (`| Agent | <name> | <name> | ... | Total |`). It then collects subsequent
//    table rows until it hits another such header, a blank line, or a non-
//    table line. Caller can then run the same TU-classification logic.
function extractAgentTables(rawMd){
  if (!rawMd) return [];
  const lines = rawMd.split('\n');
  const isAgentHeader = (cells) => cells.length >= 12
    && cleanText(cells[0]).toLowerCase() === 'agent'
    && /total/i.test(cleanText(cells[cells.length-1] || ''));
  const isTableRow = (line) => line.trim().startsWith('|');
  const splitRow = (line) => line.trim().replace(/^\||\|$/g,'').split('|').map(s=>s.trim());
  const isSeparator = (line) => /^\|[\s\-:|]+\|$/.test(line.trim());
  const tables = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++){
    const line = lines[i];
    if (!isTableRow(line)) {
      if (cur) { tables.push(cur); cur = null; }
      continue;
    }
    if (isSeparator(line)) continue;
    const cells = splitRow(line);
    if (isAgentHeader(cells)) {
      // Push previous and start new.
      if (cur) tables.push(cur);
      cur = { headers: cells, rows: [], startLine: i };
      continue;
    }
    if (cur) {
      // Stop if this looks like an Agent Performance / HR Screening / Culture Fit
      // subtitle row (those rows have very few populated cells).
      const first = cleanText(cells[0]).toLowerCase();
      if (/agent\s+performance|hr\s+screening|li\s+screening|pipeline\s+screening|culture\s+fit\s+(assessments|interview)/i.test(first)) {
        tables.push(cur); cur = null;
        continue;
      }
      cur.rows.push(cells);
    }
  }
  if (cur) tables.push(cur);
  return tables;
}

function parseAgents(tables, rawMd, fpDatesIso){
  // ── New flat per-date format (introduced May 2026):
  //
  //   | Agent Name | Application Screening Done | Pipeline Screening Done | HR Screening Done | Culture Fit SCreening Done |
  //   | Tanya Ahmed | 0 | 0 | 0 | 1 |
  //   | … (21 agent rows) … |
  //   | Date | 22/05/2026 |  |  |  |        ← marks the date of the NEXT block
  //   | Agent Name | … (repeat header)
  //   | Tanya Ahmed | … |
  //   | … |
  //   | Date | 21/05/2026 |  |  |  |
  //   | Agent Name | … |
  //   | … |
  //
  //   The very first block has NO preceding Date row — it's "today" (we use the
  //   newest Funnel-Performance date as the anchor).

  function emptyStage(){ return { agents:[], values:[], total:0 }; }
  function isoFromDmy(s){
    const dm = String(s||'').match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (!dm) return null;
    return `${dm[3]}-${String(parseInt(dm[2],10)).padStart(2,'0')}-${String(parseInt(dm[1],10)).padStart(2,'0')}`;
  }
  function addDays(iso, n){
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0,10);
  }

  // The new format is parsed as ONE big table by parseTables (no blank lines between
  // blocks, so the Date / Agent-Name rows get folded into a single table's rows).
  const apTable = tables.find(t =>
    t.headers
    && /^(agent|owner)\s*name$/i.test(cleanText(t.headers[0]||''))
    && t.headers.some(h => /application\s*screening/i.test(cleanText(h)))
    && t.headers.some(h => /culture\s*fit/i.test(cleanText(h)))
  );

  if (!apTable) {
    // No flat table found — return empty (the old multi-table extractor is no longer used).
    return { dates: [], byDate: {}, hrs: emptyStage(), lis: emptyStage(), pipe: emptyStage(), cfa: emptyStage() };
  }

  // Resolve column indices (header order is fixed but we lookup anyway in case it shifts).
  const hdr = apTable.headers.map(cleanText);
  const colAgent = 0;
  const colApp   = hdr.findIndex(h => /application\s*screening/i.test(h));
  const colPipe  = hdr.findIndex(h => /pipeline\s*screening/i.test(h));
  const colHr    = hdr.findIndex(h => /hr\s*screening/i.test(h));
  const colCf    = hdr.findIndex(h => /culture\s*fit/i.test(h));

  // The first block's date is the most recent — there's no Date row above it.
  // Heuristic: take the first Date marker found in the rows and add 1 day,
  //            OR fall back to the newest FP date.
  let firstBlockDate = null;
  for (const row of apTable.rows) {
    if (/^date$/i.test(cleanText(row[0]||''))) {
      const iso = isoFromDmy(row[1] || row[2] || '');
      if (iso) { firstBlockDate = addDays(iso, 1); break; }
    }
  }
  if (!firstBlockDate && Array.isArray(fpDatesIso) && fpDatesIso.length) {
    firstBlockDate = fpDatesIso.slice().sort().slice(-1)[0];
  }
  if (!firstBlockDate) firstBlockDate = '2026-05-23';

  // Walk rows, switching `currentDate` whenever we see a "Date | DD/MM/YYYY" marker.
  // Accumulate per-date / per-stage counts.
  const accum = {};  // dateIso → { hrs:{name:n}, lis:{}, pipe:{}, cfa:{} }
  const seenDates = [];
  function ensureDate(d){
    if (!accum[d]) {
      accum[d] = { hrs:{}, lis:{}, pipe:{}, cfa:{} };
      seenDates.push(d);
    }
  }
  let currentDate = firstBlockDate;
  ensureDate(currentDate);

  for (const row of apTable.rows) {
    const first = cleanText(row[0]||'');
    if (!first) continue;
    const firstLower = first.toLowerCase();

    // Date divider — sets the date for subsequent rows
    if (firstLower === 'date') {
      const iso = isoFromDmy(row[1] || row[2] || '');
      if (iso) { currentDate = iso; ensureDate(currentDate); }
      continue;
    }
    // Repeated "Agent Name" header — skip
    if (firstLower === 'agent name' || firstLower === 'owner name') continue;
    // Repeated separator-ish — skip (in case any slipped through)
    if (/^[:\-]+$/.test(first)) continue;

    // Agent row — read the four stage cells
    const agentName = first;
    const app  = cleanNum(row[colApp]);
    const pipe = cleanNum(row[colPipe]);
    const hr   = cleanNum(row[colHr]);
    const cf   = cleanNum(row[colCf]);

    if (app  > 0) accum[currentDate].lis[agentName]  = (accum[currentDate].lis[agentName]  || 0) + app;
    if (pipe > 0) accum[currentDate].pipe[agentName] = (accum[currentDate].pipe[agentName] || 0) + pipe;
    if (hr   > 0) accum[currentDate].hrs[agentName]  = (accum[currentDate].hrs[agentName]  || 0) + hr;
    if (cf   > 0) accum[currentDate].cfa[agentName]  = (accum[currentDate].cfa[agentName]  || 0) + cf;
  }

  // Build the byDate result from accumulators.
  const byDate = {};
  function toBlock(counts){
    const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    return {
      agents: sorted.map(e=>e[0]),
      values: sorted.map(e=>e[1]),
      total:  sorted.reduce((s,e)=>s+e[1], 0),
    };
  }
  seenDates.forEach(d => {
    byDate[d] = {
      hrs:  toBlock(accum[d].hrs),
      lis:  toBlock(accum[d].lis),
      pipe: toBlock(accum[d].pipe),
      cfa:  toBlock(accum[d].cfa),
    };
  });

  const dates = seenDates.slice().sort().reverse();   // newest first

  // Aggregate across all dates (drives the FP-stage agent-breakdown modal).
  function aggregate(stage){
    const agg = {};
    dates.forEach(d => {
      const data = byDate[d] && byDate[d][stage];
      if (!data) return;
      data.agents.forEach((name, i) => { agg[name] = (agg[name]||0) + data.values[i]; });
    });
    const sorted = Object.entries(agg).sort((a,b)=>b[1]-a[1]);
    return {
      agents: sorted.map(e=>e[0]),
      values: sorted.map(e=>e[1]),
      total:  sorted.reduce((s,e)=>s+e[1], 0)
    };
  }

  return {
    dates,
    byDate,
    hrs:  aggregate('hrs'),
    lis:  aggregate('lis'),
    pipe: aggregate('pipe'),
    cfa:  aggregate('cfa'),
  };
}

// ════════════════════════════════════════════════════════════
//  PARSER: Hiring Priorities (Job Positions table — Corp + Ind)
//
//  Sheet layout — two "Job Positions" tables stacked:
//    Headers: Job Positions | Priority | Facility | Hiring Manager |
//             Requirement Raised | Hired | Joined | Pending Requirement |
//             Inactive | Attrition | Inactive Source | Attrition Source
//    First row of each table is a section label ("Corporate" / "Industrial").
//    Subsequent rows are the actual job positions.
// ════════════════════════════════════════════════════════════
function parseHiringPriorities(tables){
  // The Job-Positions tables share the same header. We pick all of them.
  const jpTables = tables.filter(t =>
    t.headers && cleanText(t.headers[0]).toLowerCase() === 'job positions'
    && t.headers.some(h => /requirement\s*raised/i.test(cleanText(h)))
  );
  const out = { corp: [], ind: [] };
  if (!jpTables.length) return out;

  function findIdx(headers, regex){
    for (let i = 0; i < headers.length; i++){
      if (regex.test(cleanText(headers[i]))) return i;
    }
    return -1;
  }

  jpTables.forEach(t => {
    const hdr = t.headers.map(cleanText);
    const idx = {
      pos:     findIdx(hdr, /^job\s*positions?$/i),
      prio:    findIdx(hdr, /^priority$/i),
      fac:     findIdx(hdr, /^facility$/i),
      mgr:     findIdx(hdr, /^hiring\s*manager$/i),
      raised:  findIdx(hdr, /^requirement\s*raised$/i),
      hired:   findIdx(hdr, /^hired$/i),
      joined:  findIdx(hdr, /^joined$/i),
      pending: findIdx(hdr, /^pending\s*requirement$/i),
      inact:   findIdx(hdr, /^inactive$/i),
      attr:    findIdx(hdr, /^attrition$/i),
    };
    // Walk rows. The first row in each block whose only filled cell is "Corporate"
    // or "Industrial" tells us which bucket the rest of the rows belong to.
    let bucket = null;
    t.rows.forEach(r => {
      const first = cleanText(r[idx.pos] || '');
      if (!first) return;
      const lower = first.toLowerCase();
      if (lower === 'corporate') { bucket = 'corp'; return; }
      if (lower === 'industrial') { bucket = 'ind'; return; }
      // Skip rows that are repeat header rows in the second table.
      if (lower === 'job positions') return;
      if (!bucket) {
        // If we haven't seen a section label, infer from the row's "Facility" col.
        const fac = cleanText(r[idx.fac] || '').toLowerCase();
        bucket = /firmware/.test(fac) ? 'ind' : 'corp';
      }
      const rec = {
        position: first,
        priority: parseInt(cleanText(r[idx.prio]||''), 10) || null,
        facility: cleanText(r[idx.fac]||''),
        manager:  cleanText(r[idx.mgr]||''),
        raised:   cleanNum(r[idx.raised]),
        hired:    cleanNum(r[idx.hired]),
        joined:   cleanNum(r[idx.joined]),
        pending:  cleanNum(r[idx.pending]),
        inactive: cleanNum(r[idx.inact]),
        attrition:cleanNum(r[idx.attr]),
      };
      out[bucket].push(rec);
    });
  });
  return out;
}

// ════════════════════════════════════════════════════════════
//  PARSER: Attrition 2026
//
//  Sheet layout — one wide table with these columns:
//      Full Name | Categorization | Tenure | Average | Quickest |
//      Date Of Joining | Date of Exit | Source | <months-numeric>
//
//  The "Average" and "Quickest" columns only carry summary data on the first
//  four rows (alternating Industrial-label / Industrial-stat / Corporate-label
//  / Corporate-stat); they're empty for the remaining per-person rows. We
//  pluck out the summary stats AND build the per-person list separately.
// ════════════════════════════════════════════════════════════
function parseAttrition(tables){
  const t = tables.find(t =>
    t.headers
    && /^full\s*name$/i.test(cleanText(t.headers[0]||''))
    && t.headers.some(h => /date\s*of\s*exit/i.test(cleanText(h)))
  );
  if (!t) return { records: [], summary: {} };
  const hdr = t.headers.map(cleanText);
  const idx = {
    name:    hdr.findIndex(h => /^full\s*name$/i.test(h)),
    cat:     hdr.findIndex(h => /categorization/i.test(h)),
    tenure:  hdr.findIndex(h => /^tenure$/i.test(h)),
    avg:     hdr.findIndex(h => /^average$/i.test(h)),
    quick:   hdr.findIndex(h => /^quickest$/i.test(h)),
    joined:  hdr.findIndex(h => /date\s*of\s*joining/i.test(h)),
    exited:  hdr.findIndex(h => /date\s*of\s*exit/i.test(h)),
    source:  hdr.findIndex(h => /^source$/i.test(h)),
  };
  // Tenure-in-months value lives in the column whose header is empty (works for
  // both old layout — empty col at the end — and new layout — empty col between
  // Source and Average). Fall back to scanning the first data row for the
  // rightmost integer-only cell if no empty header is found.
  let idxMonths = hdr.findIndex(h => !h);
  if (idxMonths === -1 && t.rows.length){
    const probe = t.rows.find(r => cleanText(r[0]) && !/categorization/i.test(cleanText(r[0]||'')));
    if (probe){
      for (let i = probe.length - 1; i >= 0; i--){
        const v = cleanText(probe[i]);
        if (/^\d+$/.test(v)) { idxMonths = i; break; }
      }
    }
  }
  if (idxMonths === -1) idxMonths = t.headers.length - 1;

  // ── Pull the inline summary stats (rows 0-3 use the Avg/Quickest columns
  //    for category labels + values, alternating).
  const summary = { industrialAvgMonths: null, industrialQuickest: null, corporateAvgMonths: null, corporateQuickest: null };
  if (t.rows.length >= 4) {
    const r0 = t.rows[0], r1 = t.rows[1], r2 = t.rows[2], r3 = t.rows[3];
    const tryAssign = (labelCell, valueCell, cat) => {
      const lbl = cleanText(labelCell).toLowerCase();
      if (/industrial/.test(lbl)) {
        summary.industrialAvgMonths = cleanNum(valueCell);
      } else if (/corporate/.test(lbl)) {
        summary.corporateAvgMonths = cleanNum(valueCell);
      }
    };
    // r0/r1 -> first category (Industrial label, value)
    tryAssign(r0[idx.avg], r1[idx.avg]);
    // r2/r3 -> second category (Corporate label, value)
    tryAssign(r2[idx.avg], r3[idx.avg]);
    // Quickest column — same pattern but values are strings like "14 Days"
    const qInd = cleanText(r1[idx.quick]);
    const qCorp = cleanText(r3[idx.quick]);
    if (/industrial/i.test(cleanText(r0[idx.quick]))) summary.industrialQuickest = qInd;
    if (/corporate/i.test(cleanText(r2[idx.quick]))) summary.corporateQuickest = qCorp;
  }

  // ── Per-person records (skip blanks)
  const records = t.rows
    .filter(r => cleanText(r[idx.name]))
    .map(r => ({
      name:    cleanText(r[idx.name]),
      category:cleanText(r[idx.cat]),
      tenure:  cleanText(r[idx.tenure]),
      joined:  cleanText(r[idx.joined]),
      exited:  cleanText(r[idx.exited]),
      source:  cleanText(r[idx.source]),
      months:  cleanNum(r[idxMonths]),
    }));
  return { records, summary };
}

// ════════════════════════════════════════════════════════════
//  TOP-LEVEL PARSE — each section wrapped so partial failures
//  don't kill the whole sync.
// ════════════════════════════════════════════════════════════
function safe(fn, label, errors){
  try { return fn(); }
  catch(e) { console.error('[TAR parser] '+label+' failed:', e); errors.push(label+': '+(e.message||e)); return null; }
}

function parseSheet(md){
  const errors = [];
  const tables = parseTables(md);
  // Parse FP first so we can pass its dates to parseAgents (used to synthesise
  // the most-recent agent-section anchor if the sheet's first one is missing).
  const fp = safe(() => parseFunnelPerformance(tables), 'funnelPerformance', errors);
  const fpDatesIso = fp ? Object.keys(fp) : [];
  const out = {
    tableCount:   tables.length,
    activeFunnel: safe(() => parseActiveFunnel(tables), 'activeFunnel', errors),
    fp,
    hired:        safe(() => parseHired(tables), 'hired', errors) || { corp: [], ind: [] },
    priorities:   safe(() => parseHiringPriorities(tables), 'priorities', errors) || { corp: [], ind: [] },
    attrition:    safe(() => parseAttrition(tables), 'attrition', errors) || { records: [], summary: {} },
    agents:       safe(() => parseAgents(tables, md, fpDatesIso), 'agents', errors) || { dates:[], byDate:{}, hrs:{agents:[],values:[],total:0}, lis:{agents:[],values:[],total:0}, pipe:{agents:[],values:[],total:0}, cfa:{agents:[],values:[],total:0} },
    parseErrors:  errors,
    syncedAt:     new Date().toISOString(),
  };
  return out;
}

// ════════════════════════════════════════════════════════════
//  SYNC
// ════════════════════════════════════════════════════════════
function extractSheetMarkdown(res){
  if (!res) return '';
  if (typeof res === 'string') {
    try { return extractSheetMarkdown(JSON.parse(res)); } catch(e){ return res; }
  }
  if (typeof res.fileContent === 'string' && res.fileContent.length) return res.fileContent;
  if (Array.isArray(res.content)) {
    for (const item of res.content) {
      if (!item) continue;
      if (typeof item === 'string') { const inner = extractSheetMarkdown(item); if (inner) return inner; continue; }
      if (typeof item.text === 'string') {
        try { const o = JSON.parse(item.text); const inner = extractSheetMarkdown(o); if (inner) return inner; } catch(e){}
        if (item.text.includes('|')) return item.text;
      }
      if (item.fileContent) return item.fileContent;
    }
  }
  if (res.result) return extractSheetMarkdown(res.result);
  if (res.data)   return extractSheetMarkdown(res.data);
  return '';
}

// ─── Google Apps Script web-app loader ──────────────────────────────────────
//
//   The dashboard now reads the Sheet through a Google Apps Script web app
//   (URL in config.json → appsScriptUrl, or the APPS_SCRIPT_URL default at the
//   top of this file). The script is expected to return one of these shapes
//   (any of them works — the converter detects which):
//
//   a) { "Sheet Name 1": [[row1cells], [row2cells], ...],
//        "Sheet Name 2": [[...], ...] }                — keyed by tab name
//   b) [[row1cells], [row2cells], ...]                 — single 2D array
//   c) [{ "name": "...", "values": [[...]] }, ...]    — array of sheet objs
//   d) { "sheets": [{ "name": "...", "values": [[...]] }, ...] }
//   e) plain text/markdown                             — passed straight through

function rowsToMarkdown(rows){
  if (!Array.isArray(rows) || !rows.length) return '';
  const out = [];
  let inSection = false;
  let lastWidth = 0;
  function pipeLine(cells){
    return '| ' + cells.map(c => String(c == null ? '' : c).replace(/\|/g, '/')).join(' | ') + ' |';
  }
  for (const row of rows){
    if (!Array.isArray(row)) continue;
    const cells = row.map(c => (c == null ? '' : String(c)).trim());
    const isBlank = cells.every(c => !c);
    if (isBlank){ out.push(''); inSection = false; continue; }
    let padded = cells.slice();
    if (inSection && padded.length < lastWidth){
      while (padded.length < lastWidth) padded.push('');
    }
    if (!inSection){
      lastWidth = padded.length;
      out.push(pipeLine(padded));
      out.push('| ' + padded.map(() => ':-:').join(' | ') + ' |');
      inSection = true;
    } else {
      out.push(pipeLine(padded));
    }
  }
  return out.join('\n');
}

function jsonToMarkdown(data){
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return '';

  // Single 2D array
  if (Array.isArray(data) && data.length && Array.isArray(data[0])) {
    return rowsToMarkdown(data);
  }
  // Array of { name, values } sheet objects
  if (Array.isArray(data) && data.length && (data[0].values || data[0].rows)) {
    return data.map(s => rowsToMarkdown(s.values || s.rows || [])).filter(Boolean).join('\n\n');
  }
  // { sheets: [...] }
  if (Array.isArray(data.sheets)) {
    return data.sheets.map(s => rowsToMarkdown(s.values || s.rows || [])).filter(Boolean).join('\n\n');
  }
  // { sheetName: 2DArray, ... }
  const parts = [];
  for (const [, rows] of Object.entries(data)) {
    if (Array.isArray(rows) && rows.length && Array.isArray(rows[0])) parts.push(rowsToMarkdown(rows));
  }
  if (parts.length) return parts.join('\n\n');

  // Fallback fields some scripts use
  if (typeof data.markdown === 'string') return data.markdown;
  if (typeof data.text === 'string')     return data.text;
  if (typeof data.content === 'string')  return data.content;
  return '';
}

// JSONP loader — avoids CORS by loading the response as a <script> tag
// instead of via fetch(). Required because Apps Script's /exec redirects to
// googleusercontent.com without preserving the Access-Control-Allow-Origin
// header, so cross-origin fetch() requests fail. JSONP doesn't trigger CORS
// since the browser allows cross-origin <script src>.
function fetchViaJSONP(url, timeoutMs){
  return new Promise((resolve, reject) => {
    const cbName = '__tarJsonp_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    const sep    = url.indexOf('?') >= 0 ? '&' : '?';
    const fullUrl = `${url}${sep}callback=${cbName}&cb=${Date.now()}`;
    const script = document.createElement('script');
    let done = false;
    const cleanup = () => {
      done = true;
      try { delete window[cbName]; } catch(_) { window[cbName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    };
    window[cbName] = (data) => { if (!done) { cleanup(); resolve(data); } };
    script.onerror = () => { if (!done) { cleanup(); reject(new Error('JSONP script load error (network or 4xx/5xx)')); } };
    script.src = fullUrl;
    document.head.appendChild(script);
    setTimeout(() => { if (!done) { cleanup(); reject(new Error('JSONP timeout (' + timeoutMs + 'ms)')); } }, timeoutMs || 30000);
  });
}

async function fetchFromAppsScript(){
  if (!APPS_SCRIPT_URL) throw new Error('APPS_SCRIPT_URL is not configured');

  // ── Path 1 — JSONP via <script src=…?callback=…>. Apps Script returns the
  //    JSON wrapped in our callback, bypassing CORS entirely.
  try {
    console.log('[TAR sync] JSONP load:', APPS_SCRIPT_URL);
    const data = await fetchViaJSONP(APPS_SCRIPT_URL, 30000);
    const md = jsonToMarkdown(data);
    if (md) return md;
    console.warn('[TAR sync] JSONP succeeded but JSON shape not recognised — falling back to fetch');
  } catch(e) {
    console.warn('[TAR sync] JSONP path failed:', e.message);
  }

  // ── Path 2 — Plain fetch fallback (works if Apps Script CORS is fixed or
  //    the page is served from a same-origin proxy).
  const url = APPS_SCRIPT_URL + (APPS_SCRIPT_URL.indexOf('?') >= 0 ? '&' : '?') + 'cb=' + Date.now();
  const resp = await fetch(url, { cache: 'no-store', redirect: 'follow' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText||''}`.trim());
  const text = await resp.text();
  if (!text.trim()) throw new Error('Apps Script returned empty body');
  let parsed;
  try { parsed = JSON.parse(text); }
  catch(e) {
    console.log('[TAR sync] Apps Script returned non-JSON text — passing through');
    return text;
  }
  const md = jsonToMarkdown(parsed);
  if (!md) {
    console.error('[TAR sync] Apps Script JSON did not match any known shape:', parsed);
    throw new Error('Apps Script JSON shape not recognised (see console)');
  }
  return md;
}

async function doSync(){
  const btns = document.querySelectorAll('.sync-btn');
  btns.forEach(b => { b.classList.add('syncing'); b.disabled = true; });
  toast('Reading sheet…');
  try {
    let md = '';

    // Path A — Google Apps Script web app (default for hosted deployments)
    if (APPS_SCRIPT_URL) {
      try {
        console.log('[TAR sync] fetching Apps Script:', APPS_SCRIPT_URL);
        md = await fetchFromAppsScript();
      } catch(e) {
        console.warn('[TAR sync] Apps Script fetch failed:', e.message);
      }
    }

    // Path B — Cowork bridge (when running inside the Cowork app and Path A failed)
    if (!md && window.cowork && typeof window.cowork.callMcpTool === 'function') {
      try {
        console.log('[TAR sync] falling back to Cowork bridge…');
        const res = await window.cowork.callMcpTool(DRIVE_TOOL, { fileId: SHEET_ID });
        md = extractSheetMarkdown(res);
      } catch(e) {
        console.warn('[TAR sync] Cowork bridge also failed:', e.message);
      }
    }

    if (!md) throw new Error('Could not retrieve sheet data from Apps Script or Cowork bridge — see console');
    console.log('[TAR sync] markdown chars:', md.length);

    const parsed = parseSheet(md);
    console.log('[TAR sync] parsed:', {
      tables: parsed.tableCount,
      activeFunnel: parsed.activeFunnel ? Object.keys(parsed.activeFunnel) : null,
      fpDates: parsed.fp ? Object.keys(parsed.fp) : null,
      hiredCorp: parsed.hired?.corp?.length || 0,
      hiredInd: parsed.hired?.ind?.length || 0,
      agentsHRS: parsed.agents?.hrs?.total || 0,
      attritionCount: parsed.attrition?.records?.length || 0,
      errors: parsed.parseErrors,
    });
    const today = todayISO();
    DB.snapshots[today] = parsed;
    DB.currentDate = today;
    saveStore();
    refreshAll();
    const summary = `${parsed.fp ? Object.keys(parsed.fp).length : 0} days · ${parsed.hired.corp.length + parsed.hired.ind.length} hires`;
    if (parsed.parseErrors && parsed.parseErrors.length) {
      toast(`Synced w/ ${parsed.parseErrors.length} issue(s): ${parsed.parseErrors[0]}`, 'err');
    } else {
      toast(`Synced ✓ ${summary}`, 'ok');
    }
  } catch(e) {
    console.error('[TAR sync] failed:', e);
    toast('Sync failed: ' + (e && e.message ? e.message : e), 'err');
  } finally {
    btns.forEach(b => { b.classList.remove('syncing'); b.disabled = false; });
  }
}

// Expose a manual reset helper on window so user can clear cache if needed
window.tarResetCache = function(){ localStorage.removeItem(STORE_KEY); location.reload(); };

// ════════════════════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════════════════════
let toastTimer = null;
function toast(msg, kind){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show ' + (kind||'');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2500);
}

// ════════════════════════════════════════════════════════════
//  STATUS BADGE STYLE
// ════════════════════════════════════════════════════════════
function statusClass(s){
  const l = (s||'').toLowerCase();
  if (/doj/.test(l)) return 'status-doj';
  if (/joined/.test(l)) return 'status-joined';
  if (/document/.test(l)) return 'status-docpending';
  if (/on hold/.test(l)) return 'status-onhold';
  if (/awaiting/.test(l)) return 'status-awaiting';
  if (/reject/.test(l)) return 'status-rejected';
  if (/report card/.test(l)) return 'status-report';
  if (/submit/.test(l)) return 'status-submit';
  return 'status-default';
}

// ════════════════════════════════════════════════════════════
//  GET CURRENT SNAPSHOT
// ════════════════════════════════════════════════════════════
function getSnap(){
  if (!DB.currentDate || !DB.snapshots[DB.currentDate]) return null;
  return DB.snapshots[DB.currentDate];
}

// ════════════════════════════════════════════════════════════
//  RENDER: ACTIVE FUNNEL STATES (Corporate only)
// ════════════════════════════════════════════════════════════
function renderActiveFunnel(){
  const snap = getSnap();
  const body = document.getElementById('afs-body');
  document.getElementById('afs-date').textContent = '📅 ' + fmtDate(DB.currentDate);
  if (!snap || !snap.activeFunnel) {
    body.innerHTML = '<div class="loading"><span>No data yet — press Sync.</span></div>';
    return;
  }
  const af = snap.activeFunnel;

  // Compute top-strip counts
  let corpCount = 0, bottleneckCount = 0;
  CORP_ROLES.forEach(r => {
    const d = af[r] || {};
    const hasAny = ['Qualified HRS Available','Qualified CFA Available','Qualified Domain-I Available','Qualified Domain-II Available','Qualified Domain-III Available']
      .some(k => (d[k]||0) > 0);
    if (hasAny) corpCount++;
    const cfBacklog = (d['Qualified CFA Available']||0) - (d['Total CFAs Scheduled']||0);
    const d1Backlog = (d['Qualified Domain-I Available']||0) - (d['Total Domain-I Scheduled']||0);
    if (cfBacklog > 0 || d1Backlog > 0) bottleneckCount++;
  });

  const topChips = `
    <div class="afs-topchips">
      <span class="afs-topchip on">Corp <span class="count">${corpCount}</span></span>
      <span class="afs-topchip">Industrial <span class="count">0</span></span>
      ${bottleneckCount > 0 ? `<span class="afs-topchip alert"><span class="ico">●</span> ${bottleneckCount} role${bottleneckCount===1?'':'s'} with backlog</span>` : ''}
    </div>`;

  const cardsHtml = CORP_ROLES.map(r => {
    const color = CORP_COLORS[r];
    const data = af[r] || {};
    const get = k => Number(data[k] || 0);
    const unactioned = get('Total Unactioned Applicants');
    const hrs        = get('Qualified HRS Available');
    const cfQual     = get('Qualified CFA Available');
    const cfSched    = get('Total CFAs Scheduled');
    const cfToday    = get('CFAs Scheduled For Today');
    const d1Qual     = get('Qualified Domain-I Available');
    const d1Sched    = get('Total Domain-I Scheduled');
    const d1Today    = get('Domain-I Scheduled For Today');
    const d2Qual     = get('Qualified Domain-II Available');
    const d3Qual     = get('Qualified Domain-III Available');

    // Backlog = qualified candidates not yet scheduled. Per the user's spec, the
    // highlight is a soft grey — informative, not alarming.
    const cfBacklog = Math.max(0, cfQual - cfSched);
    const d1Backlog = Math.max(0, d1Qual - d1Sched);
    const hasAnyBacklog = cfBacklog > 0 || d1Backlog > 0;

    // Role status (used in the top-right of each card)
    const statusOk = !hasAnyBacklog;

    // Generate short role code (Brand School → BS, Brand Events → BE, Pharma R&D → PRD, Ecommerce → EC)
    const codeMap = { 'Brand School': 'BS', 'Brand Events': 'BE', 'Pharma R&D': 'PRD', 'Ecommerce': 'EC' };
    const code = codeMap[r] || r.split(/\s+/).map(w => w[0]).join('').slice(0,3).toUpperCase();

    function tile(label, value, opts){
      opts = opts || {};
      const cls = ['afs-tile'];
      if (opts.sub) cls.push('sub');
      if (opts.backlog) cls.push('backlog');
      if (!value) cls.push('zero');
      const note = (opts.backlog && opts.backlogN > 0)
        ? `<div class="afs-backlog-note"><span class="afs-dot"></span>${opts.backlogN} unscheduled</div>` : '';
      return `<div class="${cls.join(' ')}">
        <div class="afs-tile-lbl">${label}</div>
        <div class="afs-tile-val">${fmt(value)}</div>
        ${note}
      </div>`;
    }

    // Per-section accent colours — subtle, used only on the section label bar
    // and the primary tile's top border. Tiles themselves stay light.
    const SEC = {
      hrs:  '#32B4AC',   // brand cyan
      cf:   '#16a34a',   // green
      d1:   '#2563eb',   // blue
      d2:   '#7c3aed',   // purple
      d3:   '#ea580c',   // orange
    };

    return `
      <div class="afs-card">
        <div class="afs-card-head">
          <div class="afs-headleft">
            <span class="afs-code" style="background:${color}">${code}</span>
            <span class="afs-tag">CORP</span>
            <div class="afs-title">${r}</div>
          </div>
          <div class="afs-status">
            <span class="afs-status-dot ${statusOk?'ok':'warn'}"></span>
            <span class="afs-status-lbl">${statusOk?'LIVE':'BACKLOG'}</span>
          </div>
        </div>

        <div class="afs-section" style="--sec-c:${SEC.hrs}">
          <div class="afs-section-lbl">HR Screening</div>
          ${tile('Qualified for HRS', hrs)}
        </div>

        <div class="afs-section" style="--sec-c:${SEC.cf}">
          <div class="afs-section-lbl">Culture Fit</div>
          ${tile('Qualified for CF', cfQual, { backlog: cfBacklog > 0, backlogN: cfBacklog })}
          <div class="afs-pair">
            ${tile('Total CF Scheduled', cfSched, { sub: true })}
            ${tile('CF Scheduled Today', cfToday, { sub: true })}
          </div>
        </div>

        <div class="afs-section" style="--sec-c:${SEC.d1}">
          <div class="afs-section-lbl">Domain - I</div>
          ${tile('Qualified for Domain-I', d1Qual, { backlog: d1Backlog > 0, backlogN: d1Backlog })}
          <div class="afs-pair">
            ${tile('Total Dom-I Scheduled', d1Sched, { sub: true })}
            ${tile('Dom-I Scheduled Today', d1Today, { sub: true })}
          </div>
        </div>

        <div class="afs-pair">
          <div class="afs-section" style="--sec-c:${SEC.d2}">
            <div class="afs-section-lbl">Domain - II</div>
            ${tile('Qualified for Dom-II', d2Qual, { sub: true })}
          </div>
          <div class="afs-section" style="--sec-c:${SEC.d3}">
            <div class="afs-section-lbl">Domain - III</div>
            ${tile('Qualified for Dom-III', d3Qual, { sub: true })}
          </div>
        </div>
      </div>`;
  }).join('');

  body.innerHTML = topChips + `<div class="afs-grid">${cardsHtml}</div>`;
}

// ════════════════════════════════════════════════════════════
//  RENDER: FUNNEL PERFORMANCE (matrix view, day + month)
// ════════════════════════════════════════════════════════════
function setFpView(v){
  fpView = v;
  document.getElementById('fpv-day').classList.toggle('on',   v==='day');
  document.getElementById('fpv-week').classList.toggle('on',  v==='week');
  document.getElementById('fpv-month').classList.toggle('on', v==='month');
  // The calendar picker is relevant for Day + Week (which day's week to anchor on);
  // hidden for Month aggregate.
  document.getElementById('fp-cal-host').style.display = (v==='month') ? 'none' : 'inline-flex';
  closeFpCal();
  renderFP();
}

// ── Calendar picker open/close + click-outside-to-close
function toggleFpCal(e){
  if (e) { e.stopPropagation(); }
  const pop = document.getElementById('fp-cal-pop');
  if (!pop) return;
  if (pop.classList.contains('show')) { pop.classList.remove('show'); return; }
  // Build grid each time it opens
  const snap = getSnap();
  const dates = (snap && snap.fp) ? Object.keys(snap.fp).sort((a,b)=>b.localeCompare(a)) : [];
  const grid = document.getElementById('fp-cal-grid');
  if (!dates.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;color:var(--muted);font-size:11px;font-style:italic;text-align:center;padding:8px">No dates yet</div>';
  } else {
    grid.innerHTML = dates.map(d => {
      const isOn = d === fpSelectedDate;
      const dt = new Date(d);
      const dow = isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-GB',{weekday:'short'});
      return `<div class="cal-day ${isOn?'on':''}" onclick="selectFpDate('${d}')"><span>${fmtShortDate(d)}</span><span class="cal-dow">${dow}</span></div>`;
    }).join('');
  }
  pop.classList.add('show');
}
function closeFpCal(){
  const pop = document.getElementById('fp-cal-pop');
  if (pop) pop.classList.remove('show');
}
// Click-outside listener (installed once)
if (!window.__fpCalClickInstalled) {
  window.__fpCalClickInstalled = true;
  document.addEventListener('click', e => {
    const host = document.getElementById('fp-cal-host');
    if (!host) return;
    if (!host.contains(e.target)) closeFpCal();
  });
}
function setFpType(t){
  fpType = t;
  ['corp','ind','all'].forEach(x => document.getElementById('fpt-'+x).classList.toggle('on', x===t));
  // Reset role selection to all visible roles
  const roles = t==='corp' ? CORP_ROLES : t==='ind' ? IND_ROLES : [...CORP_ROLES, ...IND_ROLES];
  fpSelectedRoles = new Set(roles);
  renderFP();
}
function selectFpDate(d){ fpSelectedDate = d; closeFpCal(); renderFP(); }
function toggleFpRole(role){
  if (fpSelectedRoles.has(role)) { if (fpSelectedRoles.size > 1) fpSelectedRoles.delete(role); }
  else fpSelectedRoles.add(role);
  renderFP();
}

// ── Update the calendar button label to reflect the current selection.
//    No need to render all the date pills anymore — the picker shows them.
function renderFpCal(){
  const snap = getSnap();
  if (!snap || !snap.fp) {
    document.getElementById('fp-cal-label').textContent = '—';
    return;
  }
  const dates = Object.keys(snap.fp).sort((a,b)=>b.localeCompare(a));  // ALL dates, newest first
  if (!fpSelectedDate || !dates.includes(fpSelectedDate)) fpSelectedDate = dates[0];
  const lbl = document.getElementById('fp-cal-label');
  if (fpView === 'week') {
    // Week = 7 dates ending on selected (or fewer if dataset is small)
    const idx = dates.indexOf(fpSelectedDate);
    const weekDates = dates.slice(idx, idx + 7);
    if (weekDates.length) {
      const newest = weekDates[0];
      const oldest = weekDates[weekDates.length - 1];
      lbl.textContent = `${fmtShortDate(oldest)} – ${fmtShortDate(newest)}`;
    } else {
      lbl.textContent = fmtShortDate(fpSelectedDate);
    }
  } else {
    lbl.textContent = fmtShortDate(fpSelectedDate);
  }
}

function aggregateMonth(fpData){
  const out = { corp: {}, ind: {} };
  CORP_STAGES.forEach(([raw]) => { out.corp[raw] = {}; CORP_ROLES.forEach(r => out.corp[raw][r]=0); });
  IND_STAGES.forEach(([raw]) => { out.ind[raw] = {}; IND_ROLES.forEach(r => out.ind[raw][r]=0); });
  Object.values(fpData).forEach(day => {
    CORP_STAGES.forEach(([raw]) => CORP_ROLES.forEach(r => out.corp[raw][r] += (day.corp?.[raw]?.[r]||0)));
    IND_STAGES.forEach(([raw]) => IND_ROLES.forEach(r => out.ind[raw][r] += (day.ind?.[raw]?.[r]||0)));
  });
  return out;
}

// Aggregate the 7-day window ending on (and including) `anchorDate`.
// `fpData` is `snap.fp` (date → {corp, ind}). Returns same shape as a single day.
function aggregateWeek(fpData, anchorDate){
  const dates = Object.keys(fpData).sort((a,b)=>b.localeCompare(a));
  const idx = Math.max(0, dates.indexOf(anchorDate));
  const window = dates.slice(idx, idx + 7);
  const out = { corp: {}, ind: {}, window };
  CORP_STAGES.forEach(([raw]) => { out.corp[raw] = {}; CORP_ROLES.forEach(r => out.corp[raw][r]=0); });
  IND_STAGES.forEach(([raw]) => { out.ind[raw] = {}; IND_ROLES.forEach(r => out.ind[raw][r]=0); });
  window.forEach(d => {
    const day = fpData[d];
    if (!day) return;
    CORP_STAGES.forEach(([raw]) => CORP_ROLES.forEach(r => out.corp[raw][r] += (day.corp?.[raw]?.[r]||0)));
    IND_STAGES.forEach(([raw]) => IND_ROLES.forEach(r => out.ind[raw][r] += (day.ind?.[raw]?.[r]||0)));
  });
  return out;
}

function renderFpChips(){
  const chipsEl = document.getElementById('fp-role-chips');
  const visibleRoles = fpType==='corp' ? CORP_ROLES : fpType==='ind' ? IND_ROLES : [...CORP_ROLES, ...IND_ROLES];
  chipsEl.innerHTML = visibleRoles.map(r => {
    const on = fpSelectedRoles.has(r);
    return `<div class="chip ${on?'on':'off'}" onclick="toggleFpRole('${r.replace(/'/g,"\\'")}')">${r}</div>`;
  }).join('');
}

// Destroy a tracked chart by canvas id
function destroyChart(id){ if (chartInst[id]) { try{ chartInst[id].destroy(); }catch(e){} delete chartInst[id]; } }

function renderDonutFor(canvasId, totalLabel, slices, colorMap){
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const labels = slices.map(s => s.label);
  const values = slices.map(s => s.value);
  const colors = slices.map(s => (colorMap && colorMap[s.label]) || colorFor(s.label));
  chartInst[canvasId] = new Chart(ctx, {
    type:'doughnut',
    data:{ labels, datasets:[{ data:values, backgroundColor:colors, borderColor:'#fff', borderWidth:2, hoverOffset:6 }] },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins:{ legend:{display:false},
        tooltip:{ backgroundColor:'#fff', borderColor:'rgba(0,0,0,.1)', borderWidth:1, titleColor:'#1f2937', bodyColor:'#4b5563',
          callbacks:{ label: c => {
            const total = c.dataset.data.reduce((s,v)=>s+v,0);
            const pct = total>0 ? Math.round(c.raw/total*100) : 0;
            return `  ${c.label}: ${c.raw} (${pct}%)`;
          } } }
      }
    },
    plugins:[donutLabelPlugin]
  });
}

function renderRoleBarFor(canvasId, role, stages, blockData, color){
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const labels = stages.map(s => s[1]);
  const values = stages.map(s => blockData[s[0]]?.[role] || 0);
  chartInst[canvasId] = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ data:values, backgroundColor:color+'cc', borderRadius:4, borderSkipped:false }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false},
        tooltip:{ backgroundColor:'#fff', borderColor:color+'44', borderWidth:1, titleColor:'#1f2937', bodyColor:'#4b5563',
          callbacks:{ label: c => '  '+c.raw } }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{color:'#6b7280',font:{size:9}}, border:{color:'rgba(0,0,0,.06)'} },
        y:{ grid:{color:'rgba(0,0,0,.04)'}, ticks:{color:'#6b7280',font:{size:9}}, border:{color:'rgba(0,0,0,.06)'} }
      }
    },
    plugins:[dataLabelPlugin]
  });
}

function renderFP(){
  renderFpCal();
  renderFpChips();
  const snap = getSnap();
  const body = document.getElementById('fp-body');
  if (!snap || !snap.fp) {
    body.innerHTML = '<div class="loading"><span>No funnel data yet — press Sync.</span></div>';
    return;
  }
  let data, periodLabel;
  if (fpView === 'month') {
    data = aggregateMonth(snap.fp);
    const totalDays = Object.keys(snap.fp).length;
    periodLabel = `Consolidated · ${totalDays} day${totalDays===1?'':'s'}`;
  } else if (fpView === 'week') {
    const wk = aggregateWeek(snap.fp, fpSelectedDate);
    data = wk;
    const w = wk.window || [];
    if (w.length) {
      periodLabel = `Week · ${fmtDate(w[w.length-1])} → ${fmtDate(w[0])} (${w.length} day${w.length===1?'':'s'})`;
    } else {
      periodLabel = `Week · no data`;
    }
  } else {
    data = (snap.fp[fpSelectedDate] || aggregateMonth(snap.fp));
    periodLabel = `Day · ${fmtDate(fpSelectedDate)}`;
  }
  document.getElementById('fp-period').textContent = '📅 ' + periodLabel;

  // Destroy any prior FP charts
  Object.keys(chartInst).forEach(id => { if (id.startsWith('fpd-') || id.startsWith('fpr-')) destroyChart(id); });

  // Build sections per type
  const sections = [];
  if (fpType === 'corp' || fpType === 'all') {
    sections.push({ tag:'CORP', tagCls:'', title:'Corporate Funnel', stages:CORP_STAGES, roles:CORP_ROLES, blockData:data.corp, colorMap:CORP_COLORS, prefix:'corp' });
  }
  if (fpType === 'ind' || fpType === 'all') {
    sections.push({ tag:'IND', tagCls:'ind', title:'Industrial Funnel', stages:IND_STAGES, roles:IND_ROLES, blockData:data.ind, colorMap:IND_COLORS, prefix:'ind' });
  }

  const html = sections.map(sec => {
    const activeRoles = sec.roles.filter(r => fpSelectedRoles.has(r));
    // Overall donuts per stage — hide any stage whose total across the
    // currently-selected roles is 0. The user only wants cards with data.
    const stagesWithData = sec.stages.filter(([raw]) => {
      const total = activeRoles.reduce((s, r) => s + (sec.blockData[raw]?.[r] || 0), 0);
      return total > 0;
    });
    const donuts = stagesWithData.map(([raw, short, color]) => {
      const slices = activeRoles.map(r => ({ label: r, value: sec.blockData[raw]?.[r] || 0 })).filter(s => s.value > 0);
      const total = slices.reduce((s,x) => s+x.value, 0);
      const canvasId = `fpd-${sec.prefix}-${raw.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_-]/g,'')}`;
      const clickable = !!STAGE_TO_AGENT[raw];
      const onclick = clickable ? `onclick="openAgentModalForStage('${raw.replace(/'/g,"\\'")}','${short.replace(/'/g,"\\'")}')"` : '';
      return `
        <div class="donut-card ${clickable?'clickable':''}" ${onclick}>
          <div class="donut-head">${short}</div>
          <div class="donut-wrap">
            <canvas id="${canvasId}"></canvas>
            <div class="donut-center"><div class="donut-num">${fmt(total)}</div><div class="donut-sub">${activeRoles.length} role${activeRoles.length===1?'':'s'}</div></div>
          </div>
        </div>`;
    }).join('');
    // If every stage was empty, show a small placeholder instead of an empty grid.
    const donutsBlock = donuts || '<div style="grid-column:1/-1;font-size:12px;color:var(--muted);text-align:center;padding:16px;font-style:italic">No activity recorded for this period.</div>';

    // Single shared role-color legend for this section
    const sharedLegend = activeRoles.length ? `
      <div class="shared-legend">
        <span class="legend-label">Color key:</span>
        ${activeRoles.map(r => `<span class="legend-chip" style="background:${colorFor(r)};color:#fff">${r}</span>`).join('')}
      </div>` : '';

    // ── Role × Stage HEATMAP (replaces the old per-role bar chart + tiles).
    //    Each row = role, each column = stage, each cell = number bucketed
    //    into one of five intensity classes (b0..b4).
    // Full stage names — small font but complete words for clarity.
    const SHORT_LABELS = {
      // Corporate
      'Form+EA Applications Recieved': 'Applications Received',
      'Applications Screenings Undertaken': 'Application Screening',
      'Pipeline Screenings Undertaken': 'Pipeline Screening',
      'HRS Undertaken': 'HR Screening',
      'CFAs Scheduling Undertaken': 'CFA Scheduling',
      'CFAs Undertaken': 'Culture Fit',
      'Domain-I Undertaken': 'Domain-I',
      'Domain-II Undertaken': 'Domain-II',
      'Domain-III Undertaken': 'Domain-III',
      // Industrial
      'Show-Ups': 'Show-Ups',
      'HRS Undertaken': 'HR Screening',
      'Shortlist for Culture Fit': 'Shortlist Culture Fit',
      'CFAs Undertaken': 'Culture Fit',
      'Shortlist Trial': 'Shortlist Trial',
      'Trail Undertaken (Day-I)': 'Trial Day-I',
      'Trail Undertaken (Day-II)': 'Trial Day-II',
      'Hired': 'Hired',
      'Joined': 'Joined',
    };
    // Anchor colour per section — used as the gradient endpoint for cell shading.
    const heatColor = (sec.prefix === 'ind') ? '#7c3aed' : '#5b46e5';
    // Bucket function — matches the reference's "Volume" legend (1-2 / 3-6 / 7-12 / 13+).
    const bucketOf = (v) => v <= 0 ? 'b0' : v <= 2 ? 'b1' : v <= 6 ? 'b2' : v <= 12 ? 'b3' : 'b4';

    const headerCells = sec.stages.map(([raw, short]) =>
      `<th>${SHORT_LABELS[raw] || short || raw}</th>`
    ).join('');
    const bodyRows = activeRoles.map(r => {
      const cells = sec.stages.map(([raw, short]) => {
        const v = sec.blockData[raw]?.[r] || 0;
        const cls = bucketOf(v);
        const clickable = v > 0 && !!STAGE_TO_AGENT[raw];
        const onclick = clickable ? `onclick="openAgentModalForStage('${raw.replace(/'/g,"\\'")}','${SHORT_LABELS[raw]||short}','${r.replace(/'/g,"\\'")}')"` : '';
        const content = v <= 0 ? '0' : fmt(v);
        return `<td><div class="fp-cell ${cls} ${clickable?'clickable':''}" style="--hc:${heatColor}" ${onclick} title="${r} · ${SHORT_LABELS[raw]||short}: ${v}">${content}</div></td>`;
      }).join('');
      return `<tr><td>${r}</td>${cells}</tr>`;
    }).join('');

    const heatmap = activeRoles.length ? `
      <div class="fp-heatmap">
        <table class="fp-heatmap-table">
          <thead><tr><th></th>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>` : '';

    return `
      <div class="section">
        <div class="section-head">
          <span class="section-tag ${sec.tagCls}">${sec.tag}</span>
          <div class="section-title">${sec.title} · Overall Metrics</div>
          <div class="section-sub">${periodLabel}</div>
        </div>
        <div class="donut-grid">${donutsBlock}</div>
        ${sharedLegend}
        <div class="section-head" style="margin-top:18px">
          <span class="section-tag ${sec.tagCls}">${sec.tag}</span>
          <div class="section-title">Role-wise Breakdown</div>
          <div class="section-sub">${activeRoles.length} of ${sec.roles.length} role${sec.roles.length===1?'':'s'} selected</div>
        </div>
        ${activeRoles.length ? heatmap : '<div class="loading" style="padding:20px"><span>All roles deselected. Use chips above to select.</span></div>'}
      </div>`;
  }).join('');

  body.innerHTML = html;

  // Render canvases — only the donut canvases now (per-role bar charts replaced by heatmap).
  setTimeout(() => {
    sections.forEach(sec => {
      const activeRoles = sec.roles.filter(r => fpSelectedRoles.has(r));
      sec.stages.forEach(([raw, short, color]) => {
        const slices = activeRoles.map(r => ({ label: r, value: sec.blockData[raw]?.[r] || 0 })).filter(s => s.value > 0);
        if (!slices.length) return;       // matches the filter that suppressed the card
        const canvasId = `fpd-${sec.prefix}-${raw.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_-]/g,'')}`;
        renderDonutFor(canvasId, short, slices, sec.colorMap);
      });
    });
  }, 50);
}

// ════════════════════════════════════════════════════════════
//  AGENT MODAL — clickable HRS / App Screening / CFA / Pipeline tiles.
//  If a role is provided (from a role row), the agent list is filtered
//  to only the agents allocated to that (role, stage) pair.
// ════════════════════════════════════════════════════════════
function openAgentModalForStage(stageRaw, stageShort, role){
  const key = STAGE_TO_AGENT[stageRaw];
  if (!key) return;
  const snap = getSnap();
  const A = snap?.agents?.[key];
  let labels = [], values = [];
  if (A && A.agents.length) {
    labels = A.agents.slice();
    values = A.values.slice();
  }
  // Filter to allocated agents if a role was provided
  if (role) {
    const allocated = getAllocatedAgentsForRoleStage(role, stageRaw);
    if (allocated.length) {
      const filtered = labels.map((n, i) => ({ name: n, v: values[i] }))
        .filter(x => allocated.some(a => a.toLowerCase() === x.name.toLowerCase()));
      labels = filtered.map(x => x.name);
      values = filtered.map(x => x.v);
      // Include allocated agents who appear in the alloc list but have 0 in agent perf
      allocated.forEach(a => { if (!labels.some(l => l.toLowerCase() === a.toLowerCase())) { labels.push(a); values.push(0); } });
    }
  }
  const filteredTotal = values.reduce((s,v) => s+v, 0);
  const subParts = [];
  subParts.push(role ? `${role} · ${stageShort}` : `All roles · ${stageShort}`);
  subParts.push(labels.length ? `${filteredTotal} units across ${labels.length} agent${labels.length===1?'':'s'}` : 'No agent data yet');
  document.getElementById('amod-title').textContent = (role ? role + ' · ' : '') + stageShort + ' — Agent breakdown';
  document.getElementById('amod-sub').textContent = subParts.join(' · ');
  document.getElementById('agent-modal-bg').classList.add('show');
  setTimeout(() => {
    destroyChart('amod-canvas');
    if (!labels.length) return;
    const colors = ['#0F9D94','#2563eb','#7c3aed','#16a34a','#C48A1E','#db2777','#ea580c','#06b6d4','#8b5cf6','#10b981','#f97316','#ec4899','#3b82f6','#22c55e','#a855f7'];
    const ctx = document.getElementById('amod-canvas');
    chartInst['amod-canvas'] = new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets:[{ data:values, backgroundColor:labels.map((_,i)=>colors[i%colors.length]+'cc'), borderRadius:5, borderSkipped:false }] },
      options:{
        indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false},
          tooltip:{ backgroundColor:'#fff', borderColor:'rgba(0,0,0,.1)', borderWidth:1, titleColor:'#1f2937', bodyColor:'#4b5563',
            callbacks:{ label: c => `  ${c.raw} units  (${filteredTotal>0?Math.round(c.raw/filteredTotal*100):0}% of ${filteredTotal})` } } },
        scales:{
          x:{ grid:{color:'rgba(0,0,0,.04)'}, ticks:{color:'#6b7280',font:{size:10}}, border:{color:'rgba(0,0,0,.08)'} },
          y:{ grid:{display:false}, ticks:{color:'#1f2937',font:{size:10,weight:'500'}}, border:{color:'rgba(0,0,0,.08)'} }
        }
      }
    });
  }, 60);
}
function closeAgentModal(){
  document.getElementById('agent-modal-bg').classList.remove('show');
  destroyChart('amod-canvas');
}

// ════════════════════════════════════════════════════════════
//  RENDER: HIRING STATUS TRACKER (Corp + Ind blocks)
// ════════════════════════════════════════════════════════════
function groupByRole(candidates){
  const out = {};
  candidates.forEach(c => {
    const role = c.job || 'Other';
    if (!out[role]) out[role] = [];
    out[role].push(c);
  });
  return out;
}

const HIRE_DONUT_COLORS = ['#0F9D94','#2563eb','#7c3aed','#16a34a','#C48A1E','#db2777','#ea580c','#06b6d4','#8b5cf6','#10b981','#f97316','#ec4899'];

function renderHire(){
  const snap = getSnap();
  const body = document.getElementById('hire-body');
  if (!snap || !snap.hired) {
    body.innerHTML = '<div class="loading"><span>No hiring data yet — press Sync.</span></div>';
    return;
  }
  const H = snap.hired;
  function renderBlock(title, tag, candidates, includeOwners){
    const grouped = groupByRole(candidates);
    const roles = Object.keys(grouped).sort((a,b) => grouped[b].length - grouped[a].length);
    const total = candidates.length;
    if (!roles.length) {
      return `<div class="hire-block">
        <div class="hire-block-head">
          <span class="section-tag ${tag==='ind'?'ind':''}">${tag.toUpperCase()}</span>
          <div class="hire-block-title">${title}</div>
          <div class="hire-block-total">0</div>
        </div>
        <div style="font-size:11px;color:var(--muted);padding:12px 0;text-align:center">No hires yet.</div>
      </div>`;
    }
    return `
      <div class="hire-block">
        <div class="hire-block-head">
          <span class="section-tag ${tag==='ind'?'ind':''}">${tag.toUpperCase()}</span>
          <div class="hire-block-title">${title}</div>
          <div class="hire-block-total">${total}</div>
        </div>
        ${roles.map((role, idx) => {
          const candidates = grouped[role];
          const color = colorFor(role);
          return `
            <div class="role-tile" data-role="${tag}-${idx}">
              <div class="role-tile-head" onclick="toggleRole(this.parentElement)">
                <span class="role-dot" style="background:${color}"></span>
                <span class="role-name">${role}</span>
                <span class="role-count" style="color:${color}">${candidates.length}</span>
                <span class="role-chev">▼</span>
              </div>
              <div class="role-body">
                ${candidates.map(c => `
                  <div class="cand-row">
                    <div style="flex:1;min-width:0">
                      <div class="cand-name">${c.name}</div>
                      <div class="cand-meta">
                        ${c.date?`<span>📅 ${c.date}</span>`:''}
                        ${c.source?`<span>${c.source}</span>`:''}
                        ${includeOwners && c.lisOwner?`<span>LIS: ${c.lisOwner}</span>`:''}
                        ${includeOwners && c.hrsOwner?`<span>HRS: ${c.hrsOwner}</span>`:''}
                      </div>
                    </div>
                    <span class="status-badge ${statusClass(c.status)}">${c.status||'—'}</span>
                  </div>`).join('')}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  // Build slices for each block (role + source)
  function buildSlicesBy(arr, key, fallback){
    const map = {};
    arr.forEach(c => { const k = (c[key] || fallback || 'Other').trim() || fallback || 'Other'; map[k] = (map[k]||0)+1; });
    return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a,b) => b.value - a.value);
  }
  const corpRoleSlices   = buildSlicesBy(H.corp, 'job', 'Other');
  const indRoleSlices    = buildSlicesBy(H.ind,  'job', 'Other');
  const corpSourceSlices = buildSlicesBy(H.corp, 'source', 'Unknown');
  const indSourceSlices  = buildSlicesBy(H.ind,  'source', 'Unknown');

  function donutBlock(title, tag, slices, canvasId, colorFn){
    if (!slices.length) {
      return `<div class="hire-donut-card">
        <div class="hire-donut-head"><span class="section-tag ${tag==='ind'?'ind':''}">${tag.toUpperCase()}</span>${title}</div>
        <div style="text-align:center;color:var(--muted);font-size:11px;padding:24px 0">No hires yet.</div>
      </div>`;
    }
    const total = slices.reduce((s,x) => s+x.value, 0);
    return `<div class="hire-donut-card">
      <div class="hire-donut-head"><span class="section-tag ${tag==='ind'?'ind':''}">${tag.toUpperCase()}</span>${title} <span style="margin-left:auto;font-family:var(--font-display);font-size:18px;color:var(--gold)">${total}</span></div>
      <div class="hire-donut-wrap">
        <canvas id="${canvasId}"></canvas>
        <div class="donut-center"><div class="donut-num" style="color:var(--gold)">${total}</div><div class="donut-sub">total hired</div></div>
      </div>
      <div class="hire-donut-legend">${slices.map(s=>`<span class="legend-chip" style="background:${colorFn(s.label)}">${s.label}<b>${s.value}</b></span>`).join('')}</div>
    </div>`;
  }

  body.innerHTML = `
    <div class="hire-donut-row">
      ${donutBlock('Hired by Role', 'corp', corpRoleSlices, 'hd-corp-role', colorFor)}
      ${donutBlock('Hired by Role', 'ind', indRoleSlices,  'hd-ind-role',  colorFor)}
    </div>
    <div class="hire-donut-row">
      ${donutBlock('Hired by Source', 'corp', corpSourceSlices, 'hd-corp-src', colorForSource)}
      ${donutBlock('Hired by Source', 'ind', indSourceSlices,  'hd-ind-src',  colorForSource)}
    </div>
    <div class="hiring-grid">
      ${renderBlock('Corporate Hires', 'corp', H.corp, true)}
      ${renderBlock('Industrial Hires', 'ind', H.ind, false)}
    </div>`;

  // Render hiring donuts
  setTimeout(() => {
    function renderHireDonut(canvasId, slices, colorFn){
      destroyChart(canvasId);
      const ctx = document.getElementById(canvasId);
      if (!ctx || !slices.length) return;
      chartInst[canvasId] = new Chart(ctx, {
        type:'doughnut',
        data:{ labels:slices.map(s=>s.label), datasets:[{ data:slices.map(s=>s.value), backgroundColor:slices.map(s=>colorFn(s.label)), borderColor:'#fff', borderWidth:2, hoverOffset:6 }] },
        options:{
          responsive:true, maintainAspectRatio:false, cutout:'62%',
          plugins:{ legend:{display:false},
            tooltip:{ backgroundColor:'#fff', borderColor:'rgba(0,0,0,.1)', borderWidth:1, titleColor:'#1f2937', bodyColor:'#4b5563',
              callbacks:{ label: c => {
                const total = c.dataset.data.reduce((s,v)=>s+v,0);
                const pct = total>0 ? Math.round(c.raw/total*100) : 0;
                return `  ${c.label}: ${c.raw} (${pct}%)`;
              } } }
          }
        },
        plugins:[donutLabelPlugin]
      });
    }
    renderHireDonut('hd-corp-role', corpRoleSlices,   colorFor);
    renderHireDonut('hd-ind-role',  indRoleSlices,    colorFor);
    renderHireDonut('hd-corp-src',  corpSourceSlices, colorForSource);
    renderHireDonut('hd-ind-src',   indSourceSlices,  colorForSource);
  }, 50);
}

function toggleRole(tile){
  tile.classList.toggle('open');
}

// ════════════════════════════════════════════════════════════
//  RENDER: AGENT PERFORMANCE (unchanged behaviour, updated colors)
// ════════════════════════════════════════════════════════════
const dataLabelPlugin = {
  id: 'inlineLabels',
  afterDatasetsDraw(chart) {
    const { ctx, data } = chart;
    const meta = chart.getDatasetMeta(0);
    data.datasets[0].data.forEach((val, i) => {
      if (!val) return;
      const bar = meta.data[i];
      ctx.save();
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(val, bar.x, bar.y - 2);
      ctx.restore();
    });
  }
};

// Draws the role-wise count on each donut slice (skips tiny slices).
const donutLabelPlugin = {
  id: 'donutLabels',
  afterDatasetsDraw(chart) {
    const { ctx, data } = chart;
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data) return;
    const total = data.datasets[0].data.reduce((s,v) => s + (v||0), 0);
    if (!total) return;
    meta.data.forEach((arc, i) => {
      const val = data.datasets[0].data[i];
      if (!val) return;
      const frac = val / total;
      if (frac < 0.05) return; // hide tiny slice labels
      const angle = (arc.startAngle + arc.endAngle) / 2;
      const radius = (arc.innerRadius + arc.outerRadius) / 2;
      const x = arc.x + Math.cos(angle) * radius;
      const y = arc.y + Math.sin(angle) * radius;
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2.5;
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = String(val);
      ctx.strokeText(label, x, y);
      ctx.fillText(label, x, y);
      ctx.restore();
    });
  }
};

// Aggregate a stage across an array of date keys (returns same shape as a date entry).
function aggregateAgentStage(byDate, dateKeys, stageKey){
  const agg = {};
  dateKeys.forEach(d => {
    const data = byDate[d] && byDate[d][stageKey];
    if (!data) return;
    data.agents.forEach((name, i) => { agg[name] = (agg[name]||0) + data.values[i]; });
  });
  const sorted = Object.entries(agg).sort((a,b)=>b[1]-a[1]);
  return { agents: sorted.map(e=>e[0]), values: sorted.map(e=>e[1]), total: sorted.reduce((s,e)=>s+e[1], 0) };
}

function renderAgents(){
  const snap = getSnap();

  // ── Calendar button label
  const dates = (snap && snap.agents && Array.isArray(snap.agents.dates)) ? snap.agents.dates.slice() : [];
  if (!dates.length) {
    document.getElementById('ap-cal-label').textContent = '—';
  } else {
    if (!agentSelectedDate || !dates.includes(agentSelectedDate)) agentSelectedDate = dates[0];
    if (agentView === 'week') {
      const idx = dates.indexOf(agentSelectedDate);
      const wk = dates.slice(idx, idx + 7);
      document.getElementById('ap-cal-label').textContent = wk.length > 1
        ? `${fmtShortDate(wk[wk.length-1])} – ${fmtShortDate(wk[0])}`
        : fmtShortDate(agentSelectedDate);
    } else if (agentView === 'month') {
      document.getElementById('ap-cal-label').textContent = `All ${dates.length} day${dates.length===1?'':'s'}`;
    } else {
      document.getElementById('ap-cal-label').textContent = fmtShortDate(agentSelectedDate);
    }
  }

  if (!snap || !snap.agents) {
    Object.keys(chartInst).forEach(k => { if (k.startsWith('apc-')) { try{ chartInst[k].destroy(); }catch(e){} delete chartInst[k]; } });
    ['top-hrs','top-lis','top-pipe','top-cfa'].forEach(id => document.getElementById(id).textContent = '—');
    ['top-hrs-sub','top-lis-sub','top-pipe-sub','top-cfa-sub'].forEach(id => document.getElementById(id).textContent = 'No data yet');
    ['apt-hrs','apt-lis','apt-pipe','apt-cfa'].forEach(id => document.getElementById(id).textContent = '—');
    return;
  }

  // ── Aggregate based on view mode.
  let A;
  if (!dates.length) {
    A = { hrs: emptyAgentBlock(), lis: emptyAgentBlock(), pipe: emptyAgentBlock(), cfa: emptyAgentBlock() };
  } else if (agentView === 'month') {
    // All dates
    A = {
      hrs:  aggregateAgentStage(snap.agents.byDate, dates, 'hrs'),
      lis:  aggregateAgentStage(snap.agents.byDate, dates, 'lis'),
      pipe: aggregateAgentStage(snap.agents.byDate, dates, 'pipe'),
      cfa:  aggregateAgentStage(snap.agents.byDate, dates, 'cfa'),
    };
  } else if (agentView === 'week') {
    const idx = dates.indexOf(agentSelectedDate);
    const wk = dates.slice(idx, idx + 7);
    A = {
      hrs:  aggregateAgentStage(snap.agents.byDate, wk, 'hrs'),
      lis:  aggregateAgentStage(snap.agents.byDate, wk, 'lis'),
      pipe: aggregateAgentStage(snap.agents.byDate, wk, 'pipe'),
      cfa:  aggregateAgentStage(snap.agents.byDate, wk, 'cfa'),
    };
  } else {
    // Day view
    A = snap.agents.byDate[agentSelectedDate] || { hrs: emptyAgentBlock(), lis: emptyAgentBlock(), pipe: emptyAgentBlock(), cfa: emptyAgentBlock() };
  }

  const setTop = (key, slot) => {
    const d = A[key];
    if (!d || !d.agents.length) { document.getElementById(slot[0]).textContent = '—'; document.getElementById(slot[1]).textContent = 'No data'; return; }
    document.getElementById(slot[0]).textContent = d.agents[0];
    document.getElementById(slot[1]).textContent = `${d.values[0]} units · ${d.total} total`;
  };
  setTop('hrs', ['top-hrs','top-hrs-sub']);
  setTop('lis', ['top-lis','top-lis-sub']);
  setTop('pipe',['top-pipe','top-pipe-sub']);
  setTop('cfa', ['top-cfa','top-cfa-sub']);
  document.getElementById('apt-hrs').textContent  = A.hrs  ? fmt(A.hrs.total)  : '0';
  document.getElementById('apt-lis').textContent  = A.lis  ? fmt(A.lis.total)  : '0';
  document.getElementById('apt-pipe').textContent = A.pipe ? fmt(A.pipe.total) : '0';
  document.getElementById('apt-cfa').textContent  = A.cfa  ? fmt(A.cfa.total)  : '0';

  const renderChart = (canvasId, dataObj, color) => {
    if (chartInst[canvasId]) { try{ chartInst[canvasId].destroy(); }catch(e){} delete chartInst[canvasId]; }
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (!dataObj || !dataObj.agents || !dataObj.agents.length) {
      const c = ctx.getContext('2d');
      c.clearRect(0,0,ctx.width,ctx.height);
      c.save();
      c.fillStyle = '#9ca3af'; c.font = '600 11px system-ui';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('No data for this view', ctx.width/2, ctx.height/2);
      c.restore();
      return;
    }
    chartInst[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels: dataObj.agents, datasets:[{ data: dataObj.values, backgroundColor: color + 'cc', borderRadius:5, borderSkipped:false }] },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false},
          tooltip:{ backgroundColor:'#fff', borderColor:color+'44', borderWidth:1, titleColor:'#1f2937', bodyColor:'#4b5563',
            callbacks:{ label: c => `  ${c.raw} units  (${dataObj.total>0?Math.round(c.raw/dataObj.total*100):0}% of ${dataObj.total})` } }
        },
        scales:{
          x:{ grid:{display:false}, ticks:{color:'#6b7280',font:{size:10}}, border:{color:'rgba(0,0,0,.08)'} },
          y:{ grid:{color:'rgba(0,0,0,.04)'}, ticks:{color:'#6b7280',font:{size:10}}, border:{color:'rgba(0,0,0,.08)'} }
        }
      },
      plugins:[dataLabelPlugin]
    });
  };
  renderChart('apc-hrs',  A.hrs,  '#32B4AC');
  renderChart('apc-lis',  A.lis,  '#2563eb');
  renderChart('apc-pipe', A.pipe, '#7c3aed');
  renderChart('apc-cfa',  A.cfa,  '#16a34a');
}

function emptyAgentBlock(){ return { agents:[], values:[], total:0 }; }

// Called from calendar dropdown
function setAgentDate(d){
  agentSelectedDate = d;
  closeAgentCal();
  renderAgents();
}

function setAgentView(v){
  agentView = v;
  document.getElementById('apv-day').classList.toggle('on',   v==='day');
  document.getElementById('apv-week').classList.toggle('on',  v==='week');
  document.getElementById('apv-month').classList.toggle('on', v==='month');
  document.getElementById('ap-cal-host').style.display = (v==='month') ? 'none' : 'inline-flex';
  closeAgentCal();
  renderAgents();
}

function toggleAgentCal(e){
  if (e) e.stopPropagation();
  const pop = document.getElementById('ap-cal-pop');
  if (!pop) return;
  if (pop.classList.contains('show')) { pop.classList.remove('show'); return; }
  const snap = getSnap();
  const dates = (snap && snap.agents && Array.isArray(snap.agents.dates)) ? snap.agents.dates : [];
  const grid = document.getElementById('ap-cal-grid');
  if (!dates.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;color:var(--muted);font-size:11px;font-style:italic;text-align:center;padding:8px">No dates yet</div>';
  } else {
    grid.innerHTML = dates.map(d => {
      const isOn = d === agentSelectedDate;
      const dt = new Date(d + 'T00:00:00');
      const dow = isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-GB',{weekday:'short'});
      return `<div class="cal-day ${isOn?'on':''}" onclick="setAgentDate('${d}')"><span>${fmtShortDate(d)}</span><span class="cal-dow">${dow}</span></div>`;
    }).join('');
  }
  pop.classList.add('show');
}
function closeAgentCal(){
  const pop = document.getElementById('ap-cal-pop');
  if (pop) pop.classList.remove('show');
}
if (!window.__apCalClickInstalled) {
  window.__apCalClickInstalled = true;
  document.addEventListener('click', e => {
    const host = document.getElementById('ap-cal-host');
    if (!host) return;
    if (!host.contains(e.target)) closeAgentCal();
  });
}

// ════════════════════════════════════════════════════════════
//  RENDER: HIRING PRIORITIES
//   ─ Two interactive sortable tables (Corporate + Industrial)
//   ─ Below each table: per-role Raised-vs-Hired circle visual
// ════════════════════════════════════════════════════════════
let hpSortState = { corp: { col: 'priority', dir: 'asc' }, ind: { col: 'priority', dir: 'asc' } };

function hpSort(bucket, col){
  if (hpSortState[bucket].col === col) {
    hpSortState[bucket].dir = (hpSortState[bucket].dir === 'asc') ? 'desc' : 'asc';
  } else {
    hpSortState[bucket].col = col;
    hpSortState[bucket].dir = 'asc';
  }
  renderPriorities();
}

function renderPriorities(){
  const snap = getSnap();
  document.getElementById('hp-date').textContent = '📅 ' + fmtDate(DB.currentDate);
  const body = document.getElementById('hp-body');
  if (!snap || !snap.priorities || (!snap.priorities.corp.length && !snap.priorities.ind.length)) {
    body.innerHTML = '<div class="loading"><span>No hiring priorities data yet — press Sync.</span></div>';
    return;
  }
  const P = snap.priorities;

  // Sort by priority (P1 first); positions without a priority go to the end.
  function sortByPriority(rows){
    return rows.slice().sort((a,b) => {
      const ap = a.priority == null ? 99 : a.priority;
      const bp = b.priority == null ? 99 : b.priority;
      return ap - bp;
    });
  }

  // ── A single role row: position info (Position name, Priority badge,
  //    Facility, Hiring Manager) on the left; Raised/Hired/Joined bubble
  //    visual on the right.
  function roleRow(r){
    const raised = r.raised || 0;
    const hired  = r.hired  || 0;
    const joined = r.joined || 0;
    const maxVal = Math.max(raised, hired, joined, 1);
    // Diameter scales 36..68 px relative to the role's max value.
    const dia = (v) => Math.max(36, Math.min(68, 36 + (v / maxVal) * 32));
    const dR = dia(raised), dH = dia(hired), dJ = dia(joined);

    const RAISED_COLOR = '#2563eb';   // blue
    const HIRED_COLOR  = '#0F9D94';   // teal
    const JOINED_COLOR = '#7c3aed';   // purple

    const pct = raised > 0 ? Math.round(hired / raised * 100) : (hired > 0 ? 100 : 0);
    const fillColor = pct >= 100 ? '#16a34a' : (pct >= 50 ? '#ca8a04' : '#ea580c');

    const prioBadge = r.priority
      ? `<span class="hp-prio p${Math.min(r.priority,5)}">${r.priority}</span>`
      : '<span style="color:var(--muted);font-size:10px">No priority</span>';

    return `<div class="hp-role-row">
      <div class="hp-role-info">
        <div class="hp-role-info-top">
          ${prioBadge}
          <div class="hp-role-name">${r.position||''}</div>
        </div>
        <div class="hp-role-meta">
          ${r.facility?`<span><b>Facility</b> · ${r.facility}</span>`:''}
          ${r.manager?`<span><b>Hiring Manager</b> · ${r.manager}</span>`:''}
        </div>
      </div>
      <div class="hp-role-vis">
        <div class="hp-vbubble" style="width:${dR}px;height:${dR}px;background:${RAISED_COLOR}" title="Requirement Raised: ${raised}">
          <span class="bb-num">${raised}</span>
          <span class="bb-lbl">Raised</span>
        </div>
        <div class="hp-vbubble" style="width:${dH}px;height:${dH}px;background:${HIRED_COLOR}" title="Hired: ${hired}">
          <span class="bb-num">${hired}</span>
          <span class="bb-lbl">Hired</span>
        </div>
        <div class="hp-vbubble" style="width:${dJ}px;height:${dJ}px;background:${JOINED_COLOR}" title="Joined: ${joined}">
          <span class="bb-num">${joined}</span>
          <span class="bb-lbl">Joined</span>
        </div>
        <div class="hp-vis-divider"></div>
        <span class="hp-fill-chip" style="background:${fillColor}1A;color:${fillColor};border:1px solid ${fillColor}40" title="Hired / Raised">Fill ${pct}%</span>
      </div>
    </div>`;
  }

  function section(rows, bucket, title){
    const sorted = sortByPriority(rows);
    return `<div>
      <div class="hp-section-head ${bucket}">
        <div class="hp-card-title">${title}</div>
        <span class="hp-section-count">${bucket.toUpperCase()} · ${rows.length} position${rows.length===1?'':'s'}</span>
        <span style="margin-left:auto;font-size:10px;color:var(--muted);display:flex;gap:10px">
          <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:#2563eb"></span>Raised</span>
          <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:#0F9D94"></span>Hired</span>
          <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:#7c3aed"></span>Joined</span>
        </span>
      </div>
      ${sorted.length ? sorted.map(roleRow).join('') : '<div style="padding:10px;font-size:11px;color:var(--muted);font-style:italic">No positions yet.</div>'}
    </div>`;
  }

  body.innerHTML = `
    ${section(P.corp, 'corp', 'Corporate · Job Positions')}
    ${section(P.ind,  'ind',  'Industrial · Job Positions')}
  `;
}

// ════════════════════════════════════════════════════════════
//  RENDER: ATTRITION 2026
// ════════════════════════════════════════════════════════════
// Default `col: null` = preserve the order rows appear in the sheet. Clicking a
// header switches to that column; clicking again toggles direction; clicking it
// a third time returns to sheet order.
let atrSortState = { col: null, dir: 'asc' };
function atrSort(col){
  if (atrSortState.col === col) {
    if (atrSortState.dir === 'asc') { atrSortState.dir = 'desc'; }
    else { atrSortState.col = null; atrSortState.dir = 'asc'; }
  } else {
    atrSortState.col = col;
    atrSortState.dir = 'asc';
  }
  renderAttrition();
}

// Parse "DD/MM/YYYY" → sortable yyyymmdd number
function atrDateKey(s){
  const m = String(s||'').match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (!m) return 0;
  return parseInt(m[3],10)*10000 + parseInt(m[2],10)*100 + parseInt(m[1],10);
}

function renderAttrition(){
  const snap = getSnap();
  document.getElementById('atr-date').textContent = '📅 ' + fmtDate(DB.currentDate);
  const body = document.getElementById('atr-body');
  if (!snap || !snap.attrition || !snap.attrition.records.length) {
    body.innerHTML = '<div class="loading"><span>No attrition data yet — press Sync.</span></div>';
    return;
  }
  const A = snap.attrition;
  const records = A.records;

  // ── Summary KPIs (split by category — Corp + Ind rows, each with Count / Avg
  //    Tenure / Quickest Exit. Values come first from the sheet's own summary
  //    cells (Average / Quickest columns on rows 0-3), falling back to a
  //    record-based computation if those are absent.)
  const total = records.length;
  const corpRecs = records.filter(r => /corporate/i.test(r.category));
  const indRecs  = records.filter(r => /industrial/i.test(r.category));

  function computeAvg(recs){
    if (!recs.length) return 0;
    return recs.reduce((s,r)=>s+(+r.months||0),0) / recs.length;
  }
  function computeQuickest(recs){
    if (!recs.length) return null;
    const min = recs.reduce((m,r)=> (r.months!=null && r.months < m ? r.months : m), Infinity);
    return isFinite(min) ? min : null;
  }
  function quickestLabel(sheetVal, recsMin){
    // Prefer the sheet's own "X Days" string; else format the computed minimum months.
    if (sheetVal && /\d/.test(sheetVal)) return sheetVal;
    if (recsMin != null) return `${recsMin} mo`;
    return '—';
  }

  const sum = (A.summary || {});
  const corpAvgMonths = (sum.corporateAvgMonths != null && sum.corporateAvgMonths > 0) ? sum.corporateAvgMonths : computeAvg(corpRecs);
  const indAvgMonths  = (sum.industrialAvgMonths != null && sum.industrialAvgMonths > 0) ? sum.industrialAvgMonths : computeAvg(indRecs);
  const corpQuickest  = quickestLabel(sum.corporateQuickest,  computeQuickest(corpRecs));
  const indQuickest   = quickestLabel(sum.industrialQuickest, computeQuickest(indRecs));

  const kpis = `
    <div class="atr-summary-bar">
      <span><b>${fmt(total)}</b> total attrition in 2026</span>
      <span class="sep"></span>
      <span><b style="color:#0F9D94">${fmt(corpRecs.length)}</b> Corporate (${total?Math.round(corpRecs.length/total*100):0}%)</span>
      <span class="sep"></span>
      <span><b style="color:#7c3aed">${fmt(indRecs.length)}</b> Industrial (${total?Math.round(indRecs.length/total*100):0}%)</span>
    </div>

    <div class="atr-kpi-section" style="--sec-c:#0F9D94">
      <div class="atr-kpi-section-lbl">Corporate</div>
      <div class="atr-kpis">
        <div class="atr-kpi" style="--kpi-c:#0F9D94">
          <div class="atr-kpi-lbl">Total Exits</div>
          <div class="atr-kpi-val">${fmt(corpRecs.length)}</div>
          <div class="atr-kpi-sub">${total ? Math.round(corpRecs.length/total*100) : 0}% of total</div>
        </div>
        <div class="atr-kpi" style="--kpi-c:#0F9D94">
          <div class="atr-kpi-lbl">Avg Tenure</div>
          <div class="atr-kpi-val">${Number(corpAvgMonths).toFixed(1)}<span class="unit">mo</span></div>
          <div class="atr-kpi-sub">across ${corpRecs.length} exit${corpRecs.length===1?'':'s'}</div>
        </div>
        <div class="atr-kpi" style="--kpi-c:#0F9D94">
          <div class="atr-kpi-lbl">Quickest Exit</div>
          <div class="atr-kpi-val">${corpQuickest}</div>
          <div class="atr-kpi-sub">shortest Corp tenure</div>
        </div>
      </div>
    </div>

    <div class="atr-kpi-section" style="--sec-c:#7c3aed">
      <div class="atr-kpi-section-lbl">Industrial</div>
      <div class="atr-kpis">
        <div class="atr-kpi" style="--kpi-c:#7c3aed">
          <div class="atr-kpi-lbl">Total Exits</div>
          <div class="atr-kpi-val">${fmt(indRecs.length)}</div>
          <div class="atr-kpi-sub">${total ? Math.round(indRecs.length/total*100) : 0}% of total</div>
        </div>
        <div class="atr-kpi" style="--kpi-c:#7c3aed">
          <div class="atr-kpi-lbl">Avg Tenure</div>
          <div class="atr-kpi-val">${Number(indAvgMonths).toFixed(1)}<span class="unit">mo</span></div>
          <div class="atr-kpi-sub">across ${indRecs.length} exit${indRecs.length===1?'':'s'}</div>
        </div>
        <div class="atr-kpi" style="--kpi-c:#7c3aed">
          <div class="atr-kpi-lbl">Quickest Exit</div>
          <div class="atr-kpi-val">${indQuickest}</div>
          <div class="atr-kpi-sub">shortest Ind tenure</div>
        </div>
      </div>
    </div>`;

  // ── Donut data
  const bySource = {};
  records.forEach(r => { const s = r.source || 'Unknown'; bySource[s] = (bySource[s]||0) + 1; });
  const sourceEntries = Object.entries(bySource).sort((a,b)=>b[1]-a[1]);
  const byCategory = { Corporate: corpRecs.length, Industrial: indRecs.length };

  const donuts = `
    <div class="atr-row">
      <div class="atr-card">
        <div class="atr-card-head">
          <div class="atr-card-title">Attrition by Source</div>
          <span class="atr-card-tag">${sourceEntries.length} source${sourceEntries.length===1?'':'s'}</span>
        </div>
        <div class="atr-donut-wrap"><canvas id="atr-donut-src"></canvas></div>
      </div>
      <div class="atr-card">
        <div class="atr-card-head">
          <div class="atr-card-title">Attrition by Category</div>
          <span class="atr-card-tag">${total} total</span>
        </div>
        <div class="atr-donut-wrap"><canvas id="atr-donut-cat"></canvas></div>
      </div>
    </div>`;

  // ── Sortable records table
  function th(col, label){
    const isOn = atrSortState.col === col;
    const arr = !isOn ? '' : (atrSortState.dir === 'asc' ? '▲' : '▼');
    return `<th class="${isOn?'sorted':''}" onclick="atrSort('${col}')">${label}<span class="sort-arr">${arr}</span></th>`;
  }

  // Sort. col === null means "preserve the sheet's natural order" (just show
  // records as they appear in the sheet).
  let sorted;
  if (atrSortState.col === null) {
    sorted = records.slice();
  } else {
    sorted = records.slice().sort((a,b) => {
      let av, bv;
      if (atrSortState.col === 'months') {
        av = a.months || 0; bv = b.months || 0;
      } else {
        av = (a[atrSortState.col] || '').toLowerCase();
        bv = (b[atrSortState.col] || '').toLowerCase();
      }
      if (av < bv) return atrSortState.dir === 'asc' ? -1 : 1;
      if (av > bv) return atrSortState.dir === 'asc' ?  1 : -1;
      return 0;
    });
  }

  const rowsHtml = sorted.map(r => {
    const isCorp = /corporate/i.test(r.category);
    return `<tr>
      <td><div class="atr-name">${r.name||'—'}</div></td>
      <td><span class="atr-cat-chip ${isCorp?'corp':'ind'}">${r.category||'—'}</span></td>
      <td class="atr-tenure">${r.tenure||'—'}</td>
      <td>${r.source||'—'}</td>
    </tr>`;
  }).join('');

  const tableHtml = `
    <div class="atr-table-card">
      <div class="atr-card-head">
        <div class="atr-card-title">Exited Employees</div>
        <span class="atr-card-tag">${total} record${total===1?'':'s'}</span>
      </div>
      <div class="atr-table-wrap">
        <table class="atr-table">
          <thead>
            <tr>
              ${th('name','Name')}
              ${th('category','Category')}
              ${th('tenure','Tenure')}
              ${th('source','Source')}
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div style="font-size:10px;color:var(--muted);font-style:italic">${atrSortState.col ? 'Click the same header twice to clear sort and return to sheet order.' : 'Showing records in sheet order. Click any column header to sort.'}</div>
    </div>`;

  body.innerHTML = kpis + donuts + tableHtml;

  // Render donuts
  setTimeout(() => {
    const SRC_COLORS = ['#0F9D94','#2563eb','#7c3aed','#16a34a','#C48A1E','#db2777','#ea580c','#06b6d4','#8b5cf6','#10b981'];
    const ctxSrc = document.getElementById('atr-donut-src');
    if (ctxSrc) {
      destroyChart('atr-donut-src');
      chartInst['atr-donut-src'] = new Chart(ctxSrc, {
        type:'doughnut',
        data:{
          labels: sourceEntries.map(e=>e[0]),
          datasets:[{ data: sourceEntries.map(e=>e[1]), backgroundColor: sourceEntries.map((_,i) => SRC_COLORS[i%SRC_COLORS.length]), borderColor:'#fff', borderWidth:2 }]
        },
        options:{
          responsive:true, maintainAspectRatio:false, cutout:'58%',
          plugins:{
            legend:{ position:'right', labels:{ font:{size:10}, color:'#1f2937', boxWidth:12 } },
            tooltip:{ backgroundColor:'#fff', borderColor:'rgba(0,0,0,.1)', borderWidth:1, titleColor:'#1f2937', bodyColor:'#4b5563',
              callbacks:{ label: c => `  ${c.label}: ${c.raw} (${Math.round(c.raw/total*100)}%)` } }
          }
        },
        plugins:[donutLabelPlugin]
      });
    }
    const ctxCat = document.getElementById('atr-donut-cat');
    if (ctxCat) {
      destroyChart('atr-donut-cat');
      chartInst['atr-donut-cat'] = new Chart(ctxCat, {
        type:'doughnut',
        data:{
          labels: ['Corporate','Industrial'],
          datasets:[{ data:[corpRecs.length, indRecs.length], backgroundColor:['#0F9D94','#7c3aed'], borderColor:'#fff', borderWidth:2 }]
        },
        options:{
          responsive:true, maintainAspectRatio:false, cutout:'58%',
          plugins:{
            legend:{ position:'right', labels:{ font:{size:11}, color:'#1f2937', boxWidth:12 } },
            tooltip:{ backgroundColor:'#fff', borderColor:'rgba(0,0,0,.1)', borderWidth:1, titleColor:'#1f2937', bodyColor:'#4b5563',
              callbacks:{ label: c => `  ${c.label}: ${c.raw} (${total?Math.round(c.raw/total*100):0}%)` } }
          }
        },
        plugins:[donutLabelPlugin]
      });
    }
  }, 50);
}

// ════════════════════════════════════════════════════════════
//  PAGE NAV
// ════════════════════════════════════════════════════════════
function showPage(p){
  document.querySelectorAll('.sb-item').forEach(el => el.classList.toggle('active', el.dataset.page === p));
  document.querySelectorAll('#page-priorities,#page-active,#page-fp,#page-hiring,#page-agents,#page-attrition').forEach(el => el.classList.remove('active'));
  document.getElementById('page-' + p).classList.add('active');
  if (p === 'priorities') renderPriorities();
  else if (p === 'active') renderActiveFunnel();
  else if (p === 'fp') renderFP();
  else if (p === 'hiring') renderHire();
  else if (p === 'agents') renderAgents();
  else if (p === 'attrition') renderAttrition();
}

// ════════════════════════════════════════════════════════════
//  REFRESH ALL
// ════════════════════════════════════════════════════════════
function refreshAll(){
  const snap = getSnap();
  if (snap && snap.syncedAt) {
    const t = new Date(snap.syncedAt);
    document.getElementById('last-sync').textContent = t.toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    document.getElementById('sb-conn').textContent = 'Synced ' + fmtDate(DB.currentDate);
  } else {
    document.getElementById('last-sync').textContent = '—';
    document.getElementById('sb-conn').textContent = 'Not synced';
  }
  const pageEl = document.querySelector('.sb-item.active');
  const page = pageEl ? pageEl.dataset.page : 'priorities';
  if (page === 'priorities') renderPriorities();
  else if (page === 'active') renderActiveFunnel();
  else if (page === 'fp') renderFP();
  else if (page === 'hiring') renderHire();
  else if (page === 'agents') renderAgents();
  else if (page === 'attrition') renderAttrition();
}

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════
// ── Load ./config.json (optional). When present, its keys override the
//    `let` defaults declared at the top of this file. The fetch fails silently
//    if the file is missing or unreachable (e.g. opened from file://), in
//    which case the embedded defaults are used.
async function loadConfig(){
  try {
    const resp = await fetch('./config.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const cfg = await resp.json();
    if (cfg.sheetId)            SHEET_ID            = cfg.sheetId;
    if (cfg.driveTool)          DRIVE_TOOL          = cfg.driveTool;
    if (cfg.storeKey)           STORE_KEY           = cfg.storeKey;
    if (cfg.appsScriptUrl)      APPS_SCRIPT_URL     = cfg.appsScriptUrl;
    if (Array.isArray(cfg.corpRoles)) CORP_ROLES    = cfg.corpRoles;
    if (Array.isArray(cfg.indRoles))  IND_ROLES     = cfg.indRoles;
    if (cfg.manualAllocations && typeof cfg.manualAllocations === 'object') {
      MANUAL_ALLOCATIONS = cfg.manualAllocations;
    }
    // Selected-roles set is derived from CORP_ROLES + IND_ROLES at module load;
    // refresh it in case those just changed.
    fpSelectedRoles = new Set([...CORP_ROLES, ...IND_ROLES]);
    console.log('[TAR] config.json loaded:', Object.keys(cfg));
  } catch(e) {
    console.warn('[TAR] config.json not loaded, using embedded defaults:', e.message);
  }
}

async function init(){
  await loadConfig();   // pull config.json overrides before anything else
  loadStore();
  refreshAll();
  // Always sync on open so day-on-day data stays fresh
  await doSync();
}

init();
