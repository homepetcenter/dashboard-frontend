    const BASE = "https://dashboard-backend-production-e29c.up.railway.app";
    const fmt = (n) => Number(n || 0).toLocaleString("en-US");
    const fmtK = (n) => { n = Number(n || 0); if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1) + "K"; return fmt(n); };
    function abbreviateKpis() {
      document.querySelectorAll(".kpi-val").forEach((el) => {
        const raw = el.textContent.trim();
        if (/^[\d,]+$/.test(raw)) { const num = parseInt(raw.replace(/,/g, ""), 10); if (num >= 10000) { el.title = fmt(num); el.textContent = fmtK(num); } }
      });
    }
    const fmtDur = (s) => Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0");
    const RANGE_LABEL = { "7d": "7 ימים אחרונים", "30d": "30 יום אחרונים", "90d": "90 יום אחרונים", "12m": "שנה אחרונה" };
    let currentRange = "30d", currentGroup = localStorage.getItem("dashGroup") || "home", customStart = null, customEnd = null, cmpStart = null, cmpEnd = null;
    let charts = {}; const cache = {};
    const cacheKey = () => document.getElementById("siteSelect").value + "|" + (customStart && customEnd ? customStart + ":" + customEnd : currentRange) + "|" + (cmpStart && cmpEnd ? cmpStart + ":" + cmpEnd : "");
    const periodLabel = () => (customStart && customEnd) ? `${customStart} – ${customEnd}` : (RANGE_LABEL[currentRange] || "");

    function setStatus(msg, type) {
      const el = document.getElementById("status");
      if (!msg) { el.classList.add("hidden"); return; }
      el.textContent = msg; el.className = "mb-4 text-center text-sm rounded-lg py-2 " + (type === "error" ? "bg-red-100 text-red-700" : "bg-blue-50 text-blue-600");
    }
    function niceDate(d) { if (!d) return d; if (d.length === 8) return d.slice(6,8)+"/"+d.slice(4,6); if (d.length === 6) return d.slice(4,6)+"/"+d.slice(0,4); if (d.length === 10) return d.slice(8,10)+"/"+d.slice(5,7); return d; }
    const shortPath = (p) => p && p.length > 50 ? p.slice(0,50)+"…" : (p || "");
    function safeDecode(s) { try { return decodeURIComponent(String(s).replace(/\+/g, " ")); } catch (e) { return String(s); } }
    function prettyUrl(s) { if (!s) return s; let v = safeDecode(s).replace(/^https?:\/\/[^/]+/, ""); return v || "/"; }
    function makeChart(id, config) { if (charts[id]) charts[id].destroy(); charts[id] = new Chart(document.getElementById(id), config); }

    // ---- Google algorithm-update markers (maintained list, easy to extend) ----
    const GOOGLE_UPDATES = [
      { date: "2024-03-05", name: "Core 3/24" }, { date: "2024-06-20", name: "Spam 6/24" },
      { date: "2024-08-15", name: "Core 8/24" }, { date: "2024-11-11", name: "Core 11/24" },
      { date: "2024-12-12", name: "Core 12/24" }, { date: "2025-03-13", name: "Core 3/25" },
      { date: "2025-06-30", name: "Core 6/25" },
    ];
    function drawMarks(chart, marks, color, label, yOff) {
      if (!marks || !marks.length) return;
      const { ctx, chartArea, scales } = chart; if (!scales.x) return;
      marks.forEach((mk) => {
        const x = scales.x.getPixelForValue(mk.index);
        if (x < chartArea.left || x > chartArea.right) return;
        ctx.save(); ctx.strokeStyle = color; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke();
        ctx.fillStyle = color; ctx.font = "bold 10px sans-serif"; ctx.fillText(label, x + 2, chartArea.top + yOff);
        ctx.restore();
      });
    }
    Chart.register({ id: "gUpdates", afterDatasetsDraw(chart) {
      drawMarks(chart, chart.$gUpdates, "#f59e0b", "G", 10);
      drawMarks(chart, chart.$annotations, "#9333ea", "📝", 22);
    }});
    function marksFor(rawDates, dateList) {
      const norm = rawDates.map((d) => { d = String(d).replace(/-/g, ""); return d.length === 6 ? d + "15" : d; });
      const marks = [];
      dateList.forEach((u) => {
        const ud = String(u).replace(/-/g, "");
        if (ud < norm[0] || ud > norm[norm.length - 1]) return;
        for (let i = 0; i < norm.length; i++) if (norm[i] >= ud) { marks.push({ index: i }); break; }
      });
      return marks;
    }
    // ---- Personal annotations (per site, localStorage) ----
    const annotKey = () => "annot_" + document.getElementById("siteSelect").value;
    const getAnnots = () => JSON.parse(localStorage.getItem(annotKey()) || "[]");
    function renderAnnotList() {
      const a = getAnnots().sort((x, y) => y.date.localeCompare(x.date));
      document.getElementById("annotList").innerHTML = a.length ? a.map((x, i) =>
        `<div class="flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-0 text-sm"><span class="text-purple-600 font-bold">📝</span><span class="text-slate-400 text-xs">${x.date}</span><div class="flex-1">${x.text}</div><button class="annot-del text-slate-300 hover:text-rose-500" data-i="${i}">🗑</button></div>`).join("")
        : `<div class="text-slate-400 text-sm">אין הערות עדיין</div>`;
      document.querySelectorAll(".annot-del").forEach((b) => b.addEventListener("click", () => {
        const a2 = getAnnots().sort((x, y) => y.date.localeCompare(x.date)); a2.splice(Number(b.dataset.i), 1);
        localStorage.setItem(annotKey(), JSON.stringify(a2)); renderAnnotList(); loadGroup(currentGroup, false);
      }));
    }
    function applyAnnotations(id, rawDates) {
      const c = charts[id]; if (!c || !rawDates || !rawDates.length) return;
      c.$annotations = marksFor(rawDates, getAnnots().map((a) => a.date)); c.update();
    }
    function applyGUpdates(id, rawDates) {
      const c = charts[id]; if (!c || !rawDates || !rawDates.length) return;
      c.$gUpdates = marksFor(rawDates, GOOGLE_UPDATES.map((u) => u.date));
      c.$annotations = marksFor(rawDates, getAnnots().map((a) => a.date));
      c.update();
    }

    // ===== Generic sortable + filterable table =====
    const tables = {};
    function cellHtml(val, col, row) {
      if (col.render) return col.render(val, row);
      if (val == null) return "";
      if (col.type === "num" || col.type === "money") return fmt(val);
      if (col.type === "pct") return val + "%";
      if (col.type === "x") return val + "x";
      if (col.long) {
        const dec = col.url ? prettyUrl(val) : safeDecode(val);
        const t = dec.replace(/"/g, "&quot;");
        if (col.url) {
          const SITE_ORIGIN = { homepetcenter:"https://homepetcenter.co.il", quickpet:"https://quickpet.co.il", tiktakpet:"https://tiktakpet.co.il" };
          let href = String(val);
          if (!/^https?:\/\//.test(href)) href = (SITE_ORIGIN[document.getElementById("siteSelect").value] || "") + (href.startsWith("/") ? href : "/" + href);
          return `<a href="${href}" target="_blank" rel="noopener" class="text-blue-600 hover:underline" title="${t}">${shortPath(dec)}</a>`;
        }
        return `<span title="${t}">${shortPath(dec)}</span>`;
      }
      return val;
    }
    function mountTable(id, columns, rows, opts = {}) {
      tables[id] = { columns, rows: rows || [], sort: opts.defaultSort || null, filter: "", opts };
      drawTable(id);
    }
    function exportCSV(id) {
      const st = tables[id]; if (!st) return;
      const rows = st._rows || st.rows;
      const esc = (v) => { v = String(v ?? ""); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      const header = st.columns.map((c) => esc(c.label)).join(",");
      const body = rows.map((r) => st.columns.map((c) => esc(r[c.key])).join(",")).join("\n");
      const blob = new Blob(["﻿" + header + "\n" + body], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = id + "_" + document.getElementById("siteSelect").value + ".csv";
      a.click(); URL.revokeObjectURL(a.href);
    }
    function drawTable(id) {
      const st = tables[id], el = document.getElementById(id); if (!el) return;
      if (!st.expanded) st.expanded = new Set();
      const hasExpand = typeof st.opts.expand === "function";
      const idKey = st.columns[0].key;
      let rows = st.rows.slice();
      if (st.filter) { const f = st.filter.toLowerCase(); rows = rows.filter((r) => st.columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(f))); }
      if (st.sort) { const { key, dir } = st.sort; rows.sort((a, b) => { let x = a[key], y = b[key]; if (typeof x === "number" && typeof y === "number") return dir === "asc" ? x - y : y - x; x = String(x ?? ""); y = String(y ?? ""); return dir === "asc" ? x.localeCompare(y, "he") : y.localeCompare(x, "he"); }); }
      st._rows = rows;
      const colCount = st.columns.length + (hasExpand ? 1 : 0);
      const head = (hasExpand ? `<th class="w-6"></th>` : "") + st.columns.map((c) => `<th data-k="${c.key}" class="srt py-2 font-medium cursor-pointer select-none text-right">${c.label}${st.sort && st.sort.key === c.key ? (st.sort.dir === "asc" ? " ▲" : " ▼") : ""}</th>`).join("");
      let body = "";
      if (!rows.length) body = `<tr><td class="py-3 text-slate-400" colspan="${colCount}">אין תוצאות</td></tr>`;
      else rows.forEach((r) => {
        const rid = String(r[idKey]); const open = st.expanded.has(rid);
        const toggle = hasExpand ? `<td class="py-2 text-slate-400 cursor-pointer exp-tg" data-rid="${rid.replace(/"/g, "&quot;")}">${open ? "▾" : "▸"}</td>` : "";
        body += `<tr class="border-b ${hasExpand ? "cursor-pointer exp-row hover:bg-slate-50" : ""}" data-rid="${rid.replace(/"/g, "&quot;")}">${toggle}${st.columns.map((c) => `<td class="py-2 text-right">${cellHtml(r[c.key], c, r)}</td>`).join("")}</tr>`;
        if (hasExpand && open) body += `<tr class="bg-slate-50"><td colspan="${colCount}" class="py-2 px-3">${st.opts.expand(r)}</td></tr>`;
      });
      let foot = "";
      const hasNumCol = st.columns.some((c, i) => i > 0 && (c.type === "num" || c.type === "money"));
      if (st.opts.totals !== false && rows.length && hasNumCol) {
        const cells = (hasExpand ? `<td></td>` : "") + st.columns.map((c, i) => {
          if (i === 0) return `<td class="py-2 text-right">סה"כ (${fmt(rows.length)})</td>`;
          if (c.type === "num" || c.type === "money") return `<td class="py-2">${fmt(rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0))}</td>`;
          return `<td></td>`;
        }).join("");
        foot = `<tfoot class="border-t-2 font-bold text-slate-700 ${st.opts.scroll ? "sticky bottom-0 bg-white" : ""}"><tr>${cells}</tr></tfoot>`;
      }
      const searchInp = st.opts.search === false ? "" : `<input type="text" placeholder="🔍 חיפוש..." class="tbl-search flex-1 border border-slate-300 rounded-lg px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-400" value="${st.filter.replace(/"/g, "&quot;")}">`;
      const controls = `<div class="flex gap-2 mb-2 items-center">${searchInp}<button class="tbl-export border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 whitespace-nowrap">⬇ CSV</button></div>`;
      el.innerHTML = controls + `<div class="overflow-x-auto ${st.opts.scroll ? "max-h-[40rem] overflow-y-auto" : ""}"><table class="w-full text-sm whitespace-nowrap"><thead class="${st.opts.scroll ? "sticky top-0 bg-white" : ""}"><tr class="text-slate-400 border-b">${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
      const inp = el.querySelector(".tbl-search");
      if (inp) inp.addEventListener("input", (e) => { st.filter = e.target.value; const pos = e.target.selectionStart; drawTable(id); const ni = el.querySelector(".tbl-search"); ni.focus(); try { ni.setSelectionRange(pos, pos); } catch (_) {} });
      el.querySelector(".tbl-export").addEventListener("click", () => exportCSV(id));
      el.querySelectorAll("th[data-k]").forEach((th) => th.addEventListener("click", () => { const k = th.dataset.k; if (st.sort && st.sort.key === k) st.sort.dir = st.sort.dir === "asc" ? "desc" : "asc"; else st.sort = { key: k, dir: "desc" }; drawTable(id); }));
      if (hasExpand) el.querySelectorAll(".exp-row").forEach((tr) => tr.addEventListener("click", () => { const rid = tr.dataset.rid; if (st.expanded.has(rid)) st.expanded.delete(rid); else st.expanded.add(rid); drawTable(id); }));
    }
    function pctCol(rows, key, into) { const tot = rows.reduce((s, r) => s + (r[key] || 0), 0) || 1; rows.forEach((r) => (r[into] = Number(((r[key] / tot) * 100).toFixed(1)))); }

    // ===== Auth / API =====
    let accessKey = localStorage.getItem("dashKey") || "";
    async function api(path) {
      const site = document.getElementById("siteSelect").value;
      let q = `?site=${encodeURIComponent(site)}`;
      if (customStart && customEnd) q += `&start=${customStart}&end=${customEnd}`; else q += `&range=${currentRange}`;
      if (cmpStart && cmpEnd) q += `&cmpStart=${cmpStart}&cmpEnd=${cmpEnd}`;
      const res = await fetch(`${BASE}${path}${q}`, { headers: { "X-Access-Key": accessKey } });
      if (res.status === 401) { showLogin(); throw new Error("נדרשת סיסמה"); }
      const text = await res.text(); const d = text ? JSON.parse(text) : {}; // tolerate empty body
      if (d.error) throw new Error(d.error); return d;
    }
    function showLogin() { document.getElementById("loginOverlay").classList.remove("hidden"); }
    function hideLogin() { document.getElementById("loginOverlay").classList.add("hidden"); }
    let userRole = "admin";
    async function applyRole() {
      try {
        const res = await fetch(`${BASE}/api/me`, { headers: { "X-Access-Key": accessKey } });
        if (res.status === 401) { showLogin(); return false; }
        const d = await res.json(); userRole = d.role || "admin";
      } catch (e) { userRole = "admin"; }
      const viewer = userRole === "viewer";
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("hidden", viewer && b.dataset.group !== "compare"));
      // Hide admin-only header controls (alerts bell) for the CEO role
      const bell = document.getElementById("bellBtn"); if (bell) bell.classList.toggle("hidden", viewer);
      if (viewer) currentGroup = "compare";
      return true;
    }
    async function tryLogin(pw) {
      const errEl = document.getElementById("pwError"); errEl.classList.add("hidden");
      try {
        const res = await fetch(`${BASE}/api/me`, { headers: { "X-Access-Key": pw } });
        if (res.status === 401) { errEl.classList.remove("hidden"); return; }
        accessKey = pw; localStorage.setItem("dashKey", pw); hideLogin();
        await applyRole();
        Object.keys(cache).forEach((k) => delete cache[k]); loadGroup(currentGroup, true);
      } catch (e) { errEl.classList.remove("hidden"); }
    }
    document.getElementById("pwBtn").addEventListener("click", () => tryLogin(document.getElementById("pwInput").value));
    document.getElementById("pwInput").addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(document.getElementById("pwInput").value); });

    function setKpi(id, valueText, cur, prev, lowerBetter) {
      document.getElementById(id).textContent = valueText;
      const el = document.getElementById(id + "_d"); if (!el) return;
      if (prev == null || prev === 0) { el.textContent = ""; el.className = "delta flat"; return; }
      const pct = ((cur - prev) / prev) * 100, better = lowerBetter ? cur < prev : cur > prev;
      const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "■";
      el.textContent = `${arrow} ${Math.abs(pct).toFixed(1)}%`;
      el.className = "delta " + (Math.abs(pct) < 0.05 ? "flat" : better ? "up" : "down");
    }

    // ===== Renderers =====
    function renderEvents(d) {
      mountTable("eventsMount", [ {key:"name",label:"אירוע",align:"right"},{key:"count",label:"כמות",type:"num"},{key:"users",label:"משתמשים",type:"num"} ], (d.events||[]).slice(), { defaultSort:{key:"count",dir:"desc"}, scroll:true });
      const ft = d.formTotals || {};
      document.getElementById("formStarts").textContent = fmt(ft.starts);
      document.getElementById("formSubmits").textContent = fmt(ft.submits);
      document.getElementById("formRate").textContent = (ft.completionRate ?? 0) + "%";
      const rateCell = (v) => v == null ? `<span class="text-slate-400">—</span>` : `<span class="font-bold ${v >= 70 ? "text-emerald-600" : v >= 40 ? "text-amber-600" : "text-rose-600"}">${v}%</span>`;
      mountTable("formsMount", [ {key:"page",label:"דף",align:"right",long:true,url:true},{key:"starts",label:"התחילו",type:"num"},{key:"submits",label:"שלחו",type:"num"},{key:"completionRate",label:"% השלמה",render:rateCell} ], (d.forms||[]).slice(), { defaultSort:{key:"starts",dir:"desc"}, scroll:true });
      // Custom funnel
      lastEvents = d.events || [];
      const saved = JSON.parse(localStorage.getItem("fnSteps") || '["session_start","view_item","add_to_cart","purchase"]');
      document.querySelectorAll(".fn-step").forEach((sel, i) => {
        sel.innerHTML = `<option value="">— ללא —</option>` + lastEvents.map((e) => `<option value="${e.name}" ${e.name === saved[i] ? "selected" : ""}>${e.name}</option>`).join("");
      });
      drawCustomFunnel();
    }
    let lastEvents = [];
    function drawCustomFunnel() {
      const steps = [...document.querySelectorAll(".fn-step")].map((s) => s.value).filter(Boolean);
      localStorage.setItem("fnSteps", JSON.stringify([...document.querySelectorAll(".fn-step")].map((s) => s.value)));
      const el = document.getElementById("fnResult");
      if (steps.length < 2) { el.innerHTML = `<div class="text-slate-400 text-sm">בחרי לפחות 2 אירועים</div>`; return; }
      const counts = steps.map((n) => ({ name: n, count: (lastEvents.find((e) => e.name === n) || {}).count || 0 }));
      const maxC = Math.max(1, ...counts.map((c) => c.count));
      let worst = { i: -1, drop: -1 };
      counts.forEach((c, i) => { if (i > 0 && counts[i - 1].count > 0) { const dr = (counts[i - 1].count - c.count) / counts[i - 1].count * 100; if (dr > worst.drop) worst = { i, drop: dr }; } });
      el.innerHTML = counts.map((c, i) => {
        const w = Math.max(3, (c.count / maxC) * 100).toFixed(0);
        const drop = i > 0 && counts[i - 1].count > 0 ? ((counts[i - 1].count - c.count) / counts[i - 1].count * 100) : null;
        const isWorst = i === worst.i && worst.drop > 0;
        const dropHtml = drop != null ? `<span class="${isWorst ? "text-rose-600 font-bold" : "text-slate-400"} text-xs">▼ ${drop.toFixed(0)}%${isWorst ? " ← הנשירה הגדולה" : ""}</span>` : "";
        return `<div class="flex items-center gap-3 mb-2"><div class="w-40 text-sm text-slate-700 truncate" title="${c.name}">${c.name}</div><div class="flex-1 bg-slate-100 rounded h-7 relative overflow-hidden"><div class="${isWorst ? "bg-rose-400" : "bg-blue-600"} h-7 rounded" style="width:${w}%"></div><span class="absolute inset-0 flex items-center px-2 text-xs font-bold text-slate-800">${fmt(c.count)}</span></div><div class="w-44 text-left">${dropHtml}</div></div>`;
      }).join("");
    }
    document.querySelectorAll(".fn-step").forEach((s) => s.addEventListener("change", drawCustomFunnel));
    function renderRetention(d) {
      const rows = d.retention || [];
      const cell = (pct) => { const bg = pct >= 20 ? "#1d4ed8" : pct >= 10 ? "#3b82f6" : pct >= 5 ? "#93c5fd" : pct > 0 ? "#dbeafe" : "#f8fafc"; const col = pct >= 10 ? "#fff" : "#334155"; return `background:${bg};color:${col};`; };
      let html = `<table class="text-sm text-center border-collapse"><thead><tr class="text-slate-400"><th class="py-2 px-3 text-right">קוהורטה (שבוע)</th><th class="py-2 px-3">גודל</th>${[0,1,2,3,4,5].map((n)=>`<th class="py-2 px-3">שבוע ${n}</th>`).join("")}</tr></thead><tbody>`;
      rows.forEach((r) => {
        html += `<tr><td class="py-1 px-3 text-right text-slate-600">${niceDate(r.cohort.replace(/-/g,""))}</td><td class="py-1 px-3 font-medium">${fmt(r.size)}</td>${r.weeks.map((w)=>`<td class="py-1 px-3" style="${cell(w.pct)}">${w.users?w.pct+"%":""}</td>`).join("")}</tr>`;
      });
      html += `</tbody></table>`;
      document.getElementById("retentionGrid").innerHTML = rows.length ? html : `<div class="text-slate-400">אין מספיק נתונים</div>`;
    }
    let seasData = null, seasMetric = "sessions";
    function drawSeasonality() {
      if (!seasData) return;
      document.querySelectorAll(".seas-m").forEach((b) => b.classList.toggle("active", b.dataset.seas === seasMetric));
      const DAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
      let max = 1;
      seasData.forEach((row) => row.forEach((c) => { if (c[seasMetric] > max) max = c[seasMetric]; }));
      let html = `<table class="text-xs" style="border-collapse:collapse"><thead><tr><th class="p-1"></th>`;
      for (let h = 0; h < 24; h++) html += `<th class="p-1 text-slate-400 font-normal">${h}</th>`;
      html += `</tr></thead><tbody>`;
      seasData.forEach((row, d) => {
        html += `<tr><td class="p-1 text-slate-500 font-medium">${DAYS[d]}</td>`;
        row.forEach((c) => {
          const v = c[seasMetric], a = max ? v / max : 0;
          const bg = a === 0 ? "#f8fafc" : `rgba(29,78,216,${(0.12 + a * 0.88).toFixed(2)})`;
          const col = a > 0.5 ? "#fff" : "#475569";
          const title = `יום ${DAYS[d]} שעה ${row.indexOf(c)}: ${fmt(c.sessions)} כניסות, ₪${fmt(c.revenue)}`;
          html += `<td class="text-center" style="background:${bg};color:${col};width:26px;height:24px;font-size:9px" title="${title}">${v > 0 && a > 0.25 ? (seasMetric === "revenue" ? Math.round(v / 1000) + "k" : v) : ""}</td>`;
        });
        html += `</tr>`;
      });
      document.getElementById("seasGrid").innerHTML = html + `</tbody></table>`;
    }
    document.querySelectorAll(".seas-m").forEach((b) => b.addEventListener("click", () => { seasMetric = b.dataset.seas; drawSeasonality(); }));
    function renderAnalyses(d) {
      seasData = d.seasonality || null; drawSeasonality();
      const dev = (d.deviceConversion || []).slice();
      const totS = dev.reduce((s, x) => s + x.sessions, 0) || 1;
      dev.forEach((x) => (x.share = Number(((x.sessions / totS) * 100).toFixed(1))));
      mountTable("devConvMount", [
        {key:"name",label:"מכשיר",align:"right"},
        {key:"sessions",label:"Sessions",type:"num"},
        {key:"share",label:"% מהתנועה",type:"pct"},
        {key:"transactions",label:"עסקאות",type:"num"},
        {key:"convRate",label:"אחוז המרה",type:"pct"},
        {key:"revenue",label:"הכנסה (₪)",type:"num"},
        {key:"bounceRate",label:"Bounce",type:"pct"},
      ], dev, { search:false, defaultSort:{key:"sessions",dir:"desc"} });
      const flagCell = (v) => v.includes("הזדמנות") ? `<span class="text-amber-600 font-bold">${v}</span>` : v.includes("מנצח") ? `<span class="text-emerald-600 font-bold">${v}</span>` : "";
      mountTable("prodMatrixMount", [
        {key:"name",label:"מוצר",align:"right",long:true},
        {key:"viewed",label:"צפיות",type:"num"},
        {key:"carted",label:"לסל",type:"num"},
        {key:"purchased",label:"נקנה",type:"num"},
        {key:"cartRate",label:"% לסל",type:"pct"},
        {key:"buyRate",label:"% קנייה",type:"pct"},
        {key:"revenue",label:"הכנסה (₪)",type:"num"},
        {key:"flag",label:"סטטוס",render:flagCell},
      ], (d.productMatrix||[]).slice(), { defaultSort:{key:"viewed",dir:"desc"}, scroll:true });
      mountTable("srcMedMount", [
        {key:"name",label:"מקור / מדיום",align:"right",long:true},
        {key:"sessions",label:"Sessions",type:"num"},
        {key:"users",label:"Users",type:"num"},
        {key:"transactions",label:"עסקאות",type:"num"},
        {key:"convRate",label:"המרה",type:"pct"},
        {key:"revenue",label:"הכנסה (₪)",type:"num"},
      ], (d.sourceMedium||[]).slice(), { defaultSort:{key:"revenue",dir:"desc"}, scroll:true });
      mountTable("catDeepMount", [
        {key:"name",label:"קטגוריה",align:"right",long:true},
        {key:"revenue",label:"הכנסה (₪)",type:"num"},
        {key:"qty",label:"כמות שנמכרה",type:"num"},
        {key:"avgPrice",label:"מחיר ממוצע (₪)",type:"num"},
      ], (d.categoriesDeep||[]).slice(), { defaultSort:{key:"revenue",dir:"desc"}, scroll:true });
    }
    function renderInsights(d) {
      const C = d.counts || {};
      document.getElementById("insSummary").innerHTML = [
        `<div class="card flex items-center gap-2"><span class="text-2xl">🔴</span><div><div class="text-2xl font-bold text-rose-600">${C.bad||0}</div><div class="text-xs text-slate-500">דחוף</div></div></div>`,
        `<div class="card flex items-center gap-2"><span class="text-2xl">🟡</span><div><div class="text-2xl font-bold text-amber-500">${C.warn||0}</div><div class="text-xs text-slate-500">הזדמנויות</div></div></div>`,
        `<div class="card flex items-center gap-2"><span class="text-2xl">🟢</span><div><div class="text-2xl font-bold text-emerald-600">${C.good||0}</div><div class="text-xs text-slate-500">חוזקות</div></div></div>`,
      ].join("");
      const STYLE = { bad:{b:"border-rose-400",bg:"bg-rose-50",i:"🔴"}, warn:{b:"border-amber-400",bg:"bg-amber-50",i:"🟡"}, good:{b:"border-emerald-400",bg:"bg-emerald-50",i:"🟢"} };
      const aiCard = document.getElementById("aiCard");
      if (d.aiSummary) { document.getElementById("aiText").textContent = d.aiSummary; aiCard.classList.remove("hidden"); }
      else aiCard.classList.add("hidden");
      try { renderAlerts(d); alertsKey = cacheKey(); } catch (e) {}
      lastInsights = d.insights || [];
      document.getElementById("insList").innerHTML = lastInsights.map((x, i) => {
        const s = STYLE[x.level] || STYLE.warn;
        return `<div class="card border-r-4 ${s.b} ${s.bg}"><div class="flex items-start justify-between gap-2"><div class="font-bold text-slate-800 mb-1">${s.i} ${x.title}</div><button class="ins-task shrink-0 text-xs border border-slate-300 rounded-md px-2 py-1 text-slate-500 hover:bg-white" data-i="${i}">➕ משימה</button></div><div class="text-sm text-slate-600">💡 ${x.rec}</div></div>`;
      }).join("") || `<div class="card text-slate-400">אין תובנות</div>`;
      document.querySelectorAll(".ins-task").forEach((b) => b.addEventListener("click", () => {
        const ins = lastInsights[Number(b.dataset.i)]; if (!ins) return;
        addTask(ins.title); b.textContent = "✓ נוסף"; b.disabled = true;
      }));
    }
    // ---- Audience toggles (geo / tech) ----
    const audToggleData = {}; let audGeo = "countries", audTech = "browsers";
    function drawAudGeo() {
      document.querySelectorAll(".aud-geo").forEach((b) => b.classList.toggle("active", b.dataset.geo === audGeo));
      mountTable("audGeoMount", [ {key:"name",label:audGeo==="countries"?"מדינה":"עיר",align:"right"},{key:"sessions",label:"Sessions",type:"num"} ], audToggleData[audGeo] || [], { defaultSort:{key:"sessions",dir:"desc"}, scroll:true });
    }
    function drawAudTech() {
      document.querySelectorAll(".aud-tech").forEach((b) => b.classList.toggle("active", b.dataset.tech === audTech));
      mountTable("audTechMount", [ {key:"name",label:audTech==="browsers"?"דפדפן":"מערכת",align:"right"},{key:"sessions",label:"Sessions",type:"num"} ], audToggleData[audTech] || [], { search:false, defaultSort:{key:"sessions",dir:"desc"} });
    }
    document.querySelectorAll(".aud-geo").forEach((b) => b.addEventListener("click", () => { audGeo = b.dataset.geo; drawAudGeo(); }));
    document.querySelectorAll(".aud-tech").forEach((b) => b.addEventListener("click", () => { audTech = b.dataset.tech; drawAudTech(); }));

    // ---- Ads level toggle (campaigns / ad groups) ----
    let adLevelData = null, adLevel = "campaigns";
    function drawAdLevel() {
      if (!adLevelData) return;
      document.querySelectorAll(".ad-lvl").forEach((b) => b.classList.toggle("active", b.dataset.lvl === adLevel));
      mountTable("adLevelMount", adLevelData.cols, adLevelData[adLevel], { defaultSort:{key:"cost",dir:"desc"}, scroll:true });
    }
    document.querySelectorAll(".ad-lvl").forEach((b) => b.addEventListener("click", () => { adLevel = b.dataset.lvl; drawAdLevel(); }));

    // ---- What-If simulator ----
    let adsTotals = null;
    function updateWhatIf() {
      if (!adsTotals || !adsTotals.cost) return;
      const pct = Number(document.getElementById("whatIfSlider").value);
      document.getElementById("whatIfPct").textContent = (pct > 0 ? "+" : "") + pct + "%";
      const newCost = adsTotals.cost * (1 + pct / 100);
      const newRev = adsTotals.revenue * (1 + pct / 100);
      const dRev = newRev - adsTotals.revenue, dProfit = dRev - (newCost - adsTotals.cost);
      document.getElementById("wiCost").textContent = fmt(Math.round(newCost));
      document.getElementById("wiRev").textContent = fmt(Math.round(newRev));
      const sign = (v) => (v > 0 ? "+" : "") + fmt(Math.round(v));
      const el1 = document.getElementById("wiDeltaRev"); el1.textContent = sign(dRev); el1.className = "kpi-val " + (dRev >= 0 ? "!text-emerald-600" : "!text-rose-600");
      const el2 = document.getElementById("wiDeltaProfit"); el2.textContent = sign(dProfit); el2.className = "kpi-val " + (dProfit >= 0 ? "!text-emerald-600" : "!text-rose-600");
    }
    document.getElementById("whatIfSlider").addEventListener("input", updateWhatIf);

    // ---- Task board (localStorage) ----
    let lastInsights = [];
    const getTasks = () => JSON.parse(localStorage.getItem("dashTasks") || "[]");
    const saveTasks = (t) => localStorage.setItem("dashTasks", JSON.stringify(t));
    function addTask(text) {
      const t = getTasks();
      t.unshift({ id: Date.now(), text, site: document.getElementById("siteSelect").value, date: new Date().toISOString().slice(0, 10), done: false });
      saveTasks(t); renderTaskBoard();
    }
    function renderTaskBoard() {
      const t = getTasks();
      document.getElementById("taskBoard").innerHTML = t.length ? t.map((x) =>
        `<div class="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0 ${x.done ? "opacity-50" : ""}">
          <input type="checkbox" ${x.done ? "checked" : ""} data-id="${x.id}" class="task-done accent-blue-600">
          <div class="flex-1 text-sm ${x.done ? "line-through" : ""}">${x.text}</div>
          <span class="text-xs text-slate-400">${x.site} · ${x.date}</span>
          <button class="task-del text-slate-300 hover:text-rose-500" data-id="${x.id}">🗑</button>
        </div>`).join("") : `<div class="text-slate-400 text-sm">אין משימות — צרי מתובנה (➕) או ידנית</div>`;
      document.querySelectorAll(".task-done").forEach((c) => c.addEventListener("change", () => { const t2 = getTasks(); const it = t2.find((x) => x.id == c.dataset.id); if (it) { it.done = c.checked; saveTasks(t2); renderTaskBoard(); } }));
      document.querySelectorAll(".task-del").forEach((b) => b.addEventListener("click", () => { saveTasks(getTasks().filter((x) => x.id != b.dataset.id)); renderTaskBoard(); }));
    }
    document.getElementById("taskAdd").addEventListener("click", () => { const v = document.getElementById("taskInput").value.trim(); if (v) { addTask(v); document.getElementById("taskInput").value = ""; } });
    document.getElementById("taskInput").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("taskAdd").click(); });
    renderTaskBoard();
    document.getElementById("annotAdd").addEventListener("click", () => {
      const dt = document.getElementById("annotDate").value, tx = document.getElementById("annotText").value.trim();
      if (!dt || !tx) { setStatus("יש למלא תאריך וטקסט להערה", "error"); return; }
      const a = getAnnots(); a.push({ date: dt, text: tx });
      localStorage.setItem(annotKey(), JSON.stringify(a));
      document.getElementById("annotText").value = "";
      renderAnnotList(); loadGroup(currentGroup, false);
    });
    renderAnnotList();
    function renderPeriods(d) {
      const tm = d.current || {}, lm = d.previous || {}, ly = d.lastYear || {};
      document.getElementById("pdSub").textContent = d.label ? `(${d.label})` : "";
      const METRICS = [
        { k: "revenue", label: "הכנסות (₪)", money: true },
        { k: "transactions", label: "עסקאות" },
        { k: "sessions", label: "Sessions" },
        { k: "users", label: "משתמשים" },
        { k: "conversionRate", label: "אחוז המרה", pct: true },
        { k: "aov", label: "עסקה ממוצעת (₪)", money: true },
      ];
      const delta = (cur, base) => {
        if (!base) return "";
        const p = ((cur - base) / base) * 100;
        const cls = Math.abs(p) < 0.5 ? "text-slate-400" : p > 0 ? "text-emerald-600" : "text-rose-600";
        const arr = p > 0 ? "▲" : p < 0 ? "▼" : "■";
        return `<span class="${cls} text-xs font-medium">${arr} ${Math.abs(p).toFixed(0)}%</span>`;
      };
      const val = (m, mt) => mt.pct ? (m[mt.k] ?? 0) + "%" : fmt(m[mt.k]);
      const rows = METRICS.map((mt) => `<tr class="border-b last:border-0">
        <td class="py-2 text-right font-medium text-slate-700">${mt.label}</td>
        <td class="py-2 text-center font-bold text-blue-700">${val(tm, mt)}</td>
        <td class="py-2 text-center">${val(lm, mt)} <div>${delta(tm[mt.k], lm[mt.k])}</div></td>
        <td class="py-2 text-center">${val(ly, mt)} <div>${delta(tm[mt.k], ly[mt.k])}</div></td>
      </tr>`).join("");
      document.getElementById("pdBand").innerHTML = `<table class="w-full text-sm whitespace-nowrap"><thead><tr class="text-slate-400 border-b">
        <th class="py-2 text-right">מדד</th><th class="py-2 text-center">תקופה נבחרת</th><th class="py-2 text-center">תקופה קודמת</th><th class="py-2 text-center">שנה שעברה</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    }
    function renderOverview(d) {
      const a = d.analytics || {}, s = d.searchConsole || {}, pr = d.prev || {};
      document.getElementById("compareNote").textContent = d.compareTo ? "בהשוואה לתקופה: " + d.compareTo : "";
      setKpi("ovSessions", fmt(a.sessions), a.sessions, pr.sessions); setKpi("ovUsers", fmt(a.users), a.users, pr.users);
      setKpi("ovNew", fmt(a.newUsers), a.newUsers, pr.newUsers); setKpi("ovBounce", (a.bounceRate ?? 0)+"%", a.bounceRate, pr.bounceRate, true);
      setKpi("ovPps", (a.pagesPerSession ?? 0), a.pagesPerSession, pr.pagesPerSession); setKpi("ovDur", fmtDur(a.avgSessionDuration||0), a.avgSessionDuration, pr.avgSessionDuration);
      setKpi("ovImpr", fmt(s.impressions), s.impressions, pr.impressions); setKpi("ovClicks", fmt(s.clicks), s.clicks, pr.clicks);
      setKpi("ovCtr", (s.ctr ?? 0)+"%", s.ctr, pr.ctr); setKpi("ovViews", fmt(a.pageViews), a.pageViews, pr.pageViews);
      document.getElementById("ovChartTitle").textContent = "Sessions — " + periodLabel();
      const series = a.series || [];
      const spark = (id, key, color) => makeChart(id, { type: "line",
        data: { labels: series.map((_, i) => i), datasets: [{ data: series.map((pt) => pt[key] || 0), borderColor: color, borderWidth: 1.5, pointRadius: 0, fill: true, backgroundColor: color + "15", tension: 0.35 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } } });
      spark("spSessions", "sessions", "#1d4ed8"); spark("spUsers", "users", "#0ea5e9");
      spark("spNew", "newUsers", "#8b5cf6"); spark("spViews", "pageViews", "#10b981");
      makeChart("ovChart", { type: "line", data: { labels: series.map((p)=>niceDate(p.date)), datasets: [{ label:"Sessions", data: series.map((p)=>p.sessions), borderColor:"#1d4ed8", backgroundColor:"rgba(29,78,216,0.08)", fill:true, tension:0.35, pointRadius:2 }] }, options: { responsive:true, plugins:{legend:{display:false}} } });
      applyGUpdates("ovChart", series.map((p)=>p.date));
    }
    async function generateReport() {
      setStatus("בונה דוח… (אוסף נתונים מ-3 תקופות לכל חנות)", "info");
      let d;
      try {
        let q = (customStart && customEnd) ? `?start=${customStart}&end=${customEnd}` : `?range=${currentRange}`;
        const res = await fetch(`${BASE}/api/report${q}`, { headers: { "X-Access-Key": accessKey } });
        if (res.status === 401) { showLogin(); return; }
        d = await res.json(); if (d.error) throw new Error(d.error);
      } catch (e) { setStatus("שגיאה: " + e.message, "error"); return; }
      setStatus("", "");
      const NM = { homepetcenter: "הום פט", quickpet: "קוויק פט", tiktakpet: "טיק טק פט" };
      const sites = (d.sites || []);
      const period = d.period || periodLabel();
      const today = new Date().toLocaleDateString("he-IL");
      const nf = (n) => Math.round(Number(n || 0)).toLocaleString("en-US");
      const pct = (cur, base) => { if (!base) return "—"; const c = Math.round(((cur - base) / base) * 100); const col = c > 0 ? "#1e8e3e" : c < 0 ? "#d93025" : "#5f6368"; return `<span style="color:${col};font-weight:600">${c > 0 ? "▲" : c < 0 ? "▼" : ""}${Math.abs(c)}%</span>`; };
      const totalGross = sites.reduce((a, s) => a + (s.now.gross || 0), 0);
      const totalNet = sites.reduce((a, s) => a + (s.now.net || 0), 0);
      const totalRev = totalNet;
      const totalOrders = sites.reduce((a, s) => a + (s.now.orders || 0), 0);
      const totalSess = sites.reduce((a, s) => a + (s.now.sessions || 0), 0);
      // cross-store current comparison — gross + net side by side
      const pcCell = (v) => (v == null ? "—" : nf(v));
      const cmpRows = sites.map((s) => `<tr><td class="site">${NM[s.site] || s.site}</td><td>₪${nf(s.now.net)}</td><td>₪${nf(s.now.gross)}</td><td>${nf(s.now.orders)}</td><td>₪${nf(s.now.aov)}</td><td>${nf(s.now.items)}</td><td>${pcCell(s.now.productsCount)}</td><td>₪${nf(s.now.refunds)}</td><td>${pct(s.now.net, s.prev && s.prev.net)}</td></tr>`).join("");
      const T = sites.reduce((a, s) => { a.net += s.now.net || 0; a.gross += s.now.gross || 0; a.orders += s.now.orders || 0; a.items += s.now.items || 0; a.pc += (s.now.productsCount || 0); a.refunds += s.now.refunds || 0; a.prevNet += (s.prev && s.prev.net) || 0; return a; }, { net: 0, gross: 0, orders: 0, items: 0, pc: 0, refunds: 0, prevNet: 0 });
      const cmpTotalRow = `<tr style="background:#f1f3f4;font-weight:700"><td class="site">סה&quot;כ</td><td>₪${nf(T.net)}</td><td>₪${nf(T.gross)}</td><td>${nf(T.orders)}</td><td>—</td><td>${nf(T.items)}</td><td>${nf(T.pc)}</td><td>₪${nf(T.refunds)}</td><td>${pct(T.net, T.prevNet)}</td></tr>`;
      // Monthly net-sales trend (last 6 calendar months) — brand rows + group total
      const months = d.monthlyMonths || [];
      const bySite = d.monthlyBySite || {};
      const monthHeaders = months.map((m) => `<th>${m}</th>`).join("");
      const monthRows = sites.map((s) => {
        const arr = bySite[s.site] || [];
        const cells = arr.map((m) => `<td>₪${nf(m.net)}</td>`).join("");
        return `<tr><td class="site">${NM[s.site] || s.site}</td>${cells}<td>${pct(arr.length ? arr[arr.length - 1].net : 0, arr.length ? arr[0].net : 0)}</td></tr>`;
      }).join("");
      const groupCells = months.map((_, i) => { const tot = sites.reduce((a, s) => a + (((bySite[s.site] || [])[i] || {}).net || 0), 0); return `<td><b>₪${nf(tot)}</b></td>`; }).join("");
      const gFirst = sites.reduce((a, s) => a + (((bySite[s.site] || [])[0] || {}).net || 0), 0);
      const gLast = sites.reduce((a, s) => a + (((bySite[s.site] || [])[months.length - 1] || {}).net || 0), 0);
      const monthlySection = `<h2>מגמת מכירות נטו לפי מותג — ${months.length} חודשים אחרונים</h2>
<table><thead><tr><th>מותג</th>${monthHeaders}<th>שינוי</th></tr></thead><tbody>${monthRows}<tr style="background:#f1f3f4"><td class="site">סה&quot;כ קבוצה</td>${groupCells}<td>${pct(gLast, gFirst)}</td></tr></tbody></table>`;
      // Google Ads per brand
      const adsRows = sites.filter((s) => s.ads).map((s) => { const a = s.ads, rv = s.now.net; const roas = a.cost ? (rv / a.cost).toFixed(2) : 0; return `<tr><td class="site">${NM[s.site] || s.site}</td><td>${nf(a.clicks)}</td><td>₪${nf(a.cost)}</td><td>₪${nf(rv)}</td><td>${roas}x</td><td>₪${a.cpc}</td></tr>`; }).join("");
      const adsTotals = sites.reduce((t, s) => { if (s.ads) { t.clicks += s.ads.clicks; t.cost += s.ads.cost; t.rev += s.now.net; } return t; }, { clicks: 0, cost: 0, rev: 0 });
      const adsSection = adsRows ? `<h2>📣 Google Ads לפי מותג</h2><table><thead><tr><th>מותג</th><th>קליקים</th><th>עלות פרסום</th><th>הכנסת חנות</th><th>ROAS משוקלל</th><th>CPC</th></tr></thead><tbody>${adsRows}<tr style="background:#f1f3f4"><td class="site">סה&quot;כ</td><td>${nf(adsTotals.clicks)}</td><td>₪${nf(adsTotals.cost)}</td><td>₪${nf(adsTotals.rev)}</td><td>${adsTotals.cost ? (adsTotals.rev / adsTotals.cost).toFixed(2) : 0}x</td><td>—</td></tr></tbody></table><p class="note">עלות = הוצאת Google Ads בפועל · הכנסת חנות = מכירות WooCommerce בפועל · ROAS משוקלל = הכנסת חנות ÷ עלות פרסום.</p>` : "";
      // Organic vs paid per brand
      const PAIDCH = ["Paid Search", "Paid Shopping", "Paid Social", "Display", "Cross-network", "Paid Other"];
      const groupChan = (chs) => { let paid = 0, org = 0, direct = 0, other = 0, total = 0; (chs || []).forEach((c) => { total += c.revenue; if (c.name === "Organic Search" || c.name === "Organic Shopping") org += c.revenue; else if (c.name === "Direct") direct += c.revenue; else if (PAIDCH.includes(c.name)) paid += c.revenue; else other += c.revenue; }); return { paid, org, direct, other, total: total || 1 }; };
      const ovpRows = sites.map((s) => { const g = groupChan(s.channels); const wooTotal = s.now.net || 0; const pp = (x) => Math.round((x / g.total) * 100); const amt = (x) => Math.round((x / g.total) * wooTotal); return `<tr><td class="site">${NM[s.site] || s.site}</td><td>₪${nf(wooTotal)}</td><td>${pp(g.paid)}% · ₪${nf(amt(g.paid))}</td><td>${pp(g.org)}% · ₪${nf(amt(g.org))}</td><td>${pp(g.direct)}% · ₪${nf(amt(g.direct))}</td><td>${pp(g.other)}% · ₪${nf(amt(g.other))}</td></tr>`; }).join("");
      const ovpSection = `<h2>אורגני מול ממומן</h2><table><thead><tr><th>מותג</th><th>סה&quot;כ הכנסה (WooCommerce)</th><th>ממומן</th><th>אורגני</th><th>ישיר</th><th>אחר</th></tr></thead><tbody>${ovpRows}</tbody></table><p class="note">סה&quot;כ הכנסה = מכירות WooCommerce בפועל (נטו כולל משלוח). ההתפלגות (ממומן/אורגני/ישיר/אחר) לפי אחוזי הערוצים של GA4, מוחלת על ההכנסה האמיתית. ממומן = Paid + Cross-network · אורגני = Organic · ישיר = Direct · אחר = Referral/Unassigned.</p>`;
      const conclSection = `<h2>מסקנות והמלצות לפי מותג</h2>` + sites.map((s) => `<p><b>${NM[s.site] || s.site}:</b> [כתבי כאן מסקנות והמלצות — פתוח לעריכה]</p>`).join("");
      // per-store detailed section with 6mo + YoY
      const fmtMoney = (v) => "₪" + nf(v);
      const perStore = sites.map((s) => {
        const pv = s.prev || {};
        const row = (label, k, fmt) => `<tr><td class="m">${label}</td><td>${fmt(s.now[k])}</td><td>${fmt(pv[k])}</td><td>${pct(s.now[k], pv[k])}</td><td>${fmt(s.h6[k])}</td><td>${pct(s.now[k], s.h6[k])}</td><td>${fmt(s.y1[k])}</td><td>${pct(s.now[k], s.y1[k])}</td></tr>`;
        return `<h2>${NM[s.site] || s.site}</h2>
<table><thead><tr><th>מדד</th><th>תקופה נוכחית</th><th>חודש קודם</th><th>שינוי חודשי</th><th>לפני חצי שנה</th><th>שינוי</th><th>שנה שעברה</th><th>שינוי שנתי</th></tr></thead><tbody>
${row("מכירות ברוטו", "gross", fmtMoney)}
${row("מכירות נטו (כולל משלוח)", "net", fmtMoney)}
${row("הזמנות", "orders", nf)}
${row("ערך הזמנה ממוצע", "aov", fmtMoney)}
${row("Sessions", "sessions", nf)}
${row("משתמשים", "users", nf)}
${row("קליקים אורגניים", "gscClicks", nf)}
</tbody></table>`;
      }).join("");
      // ---- Charts data (Chart.js visualizations) ----
      const chColors = ["#1a73e8", "#34a853", "#fbbc04", "#ea4335", "#9334e6", "#00897b"];
      const chartsData = {
        stores: sites.map((s) => NM[s.site] || s.site),
        gross: sites.map((s) => s.now.gross || 0),
        net: sites.map((s) => s.now.net || 0),
        months: months,
        monthly: sites.map((s) => ({ name: NM[s.site] || s.site, data: (bySite[s.site] || []).map((m) => m.net) })),
        ovp: sites.map((s) => { const g = groupChan(s.channels); const wt = s.now.net || 0; const a = (x) => Math.round((x / g.total) * wt); return { name: NM[s.site] || s.site, paid: a(g.paid), org: a(g.org), direct: a(g.direct), other: a(g.other) }; }),
      };
      const chartsSection = `<h2>📊 ויזואליזציה</h2>
<div class="charts">
  <div class="chartbox"><div class="ct">מכירות ברוטו מול נטו לפי חנות</div><canvas id="cGN"></canvas></div>
  <div class="chartbox"><div class="ct">נתח מכירות נטו מהקבוצה</div><canvas id="cShare"></canvas></div>
  <div class="chartbox wide"><div class="ct">מגמת מכירות נטו לפי מותג (${months.length} חודשים)</div><canvas id="cTrend"></canvas></div>
  <div class="chartbox wide"><div class="ct">אורגני מול ממומן לפי מותג (₪)</div><canvas id="cOvp"></canvas></div>
</div>`;
      const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>דוח ביצועים — ${period}</title>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"><\/script>
<style>
*{box-sizing:border-box} body{font-family:'Heebo',Arial,sans-serif;color:#3c4043;margin:0;background:#f1f3f4}
.toolbar{position:sticky;top:0;background:#1a73e8;color:#fff;padding:10px 18px;display:flex;gap:14px;align-items:center;font-size:14px;z-index:9}
.toolbar button{background:#fff;color:#1a73e8;border:0;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer;font-family:inherit}
.report{max-width:920px;margin:24px auto;background:#fff;border:1px solid #e8eaed;border-radius:14px;padding:44px 52px;box-shadow:0 1px 3px rgba(60,64,67,.12)}
h1{font-size:28px;margin:0 0 4px;color:#202124} h2{font-size:19px;color:#1a73e8;margin:30px 0 10px;border-bottom:2px solid #e8eaed;padding-bottom:6px}
.meta{color:#5f6368;font-size:13px;margin:0 0 10px}
.kpis{display:flex;gap:16px;flex-wrap:wrap;margin:14px 0}
.kpi{flex:1;min-width:150px;background:#f8f9fa;border:1px solid #e8eaed;border-radius:12px;padding:14px 16px}
.kpi .l{color:#5f6368;font-size:12px} .kpi .v{font-size:24px;font-weight:700;color:#1a73e8}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
th,td{text-align:right;padding:8px 10px;border-bottom:1px solid #eee} th{color:#5f6368;font-weight:500;background:#f8f9fa}
td.site,td.m{font-weight:700;color:#202124}
.note{color:#5f6368;font-size:13px;margin-top:8px;border-top:1px dashed #dadce0;padding-top:12px}
.charts{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:14px 0}
.chartbox{background:#f8f9fa;border:1px solid #e8eaed;border-radius:12px;padding:14px 16px}
.chartbox.wide{grid-column:1 / -1}
.chartbox .ct{font-size:13px;font-weight:700;color:#202124;margin-bottom:8px}
.chartbox canvas{height:260px !important;max-height:260px}
@media print{.toolbar{display:none}body{background:#fff}.report{border:0;box-shadow:none;margin:0;max-width:100%;padding:10px}h2{page-break-after:avoid}table,.chartbox{page-break-inside:avoid}}
</style></head>
<body>
<div class="toolbar"><button onclick="window.print()">🖨️ הדפס / שמור כ-PDF</button><span>✏️ הדוח פתוח לעריכה — לחצי על כל טקסט כדי לשנות, ואז הדפיסי או שמרי כ-PDF</span></div>
<div class="report" contenteditable="true">
<h1>דוח ביצועים — קבוצת החנויות</h1>
<p class="meta">תקופה: ${period} · השוואה מול חצי שנה אחורה ומול שנה שעברה (אותו אורך תקופה) · הופק: ${today}</p>
<div class="kpis">
<div class="kpi"><div class="l">סה&quot;כ מכירות ברוטו</div><div class="v">₪${nf(totalGross)}</div></div>
<div class="kpi"><div class="l">סה&quot;כ מכירות נטו (כולל משלוח)</div><div class="v">₪${nf(totalNet)}</div></div>
<div class="kpi"><div class="l">סה&quot;כ הזמנות</div><div class="v">${nf(totalOrders)}</div></div>
<div class="kpi"><div class="l">סה&quot;כ Sessions</div><div class="v">${nf(totalSess)}</div></div>
</div>
<h2>תקציר מנהלים</h2>
<p>בתקופה הנסקרת (${period}) מכירות הברוטו הכוללות של שלוש החנויות עמדו על ₪${nf(totalGross)} (נטו כולל משלוח: ₪${nf(totalNet)}) מ-${nf(totalOrders)} הזמנות. [לחצי כאן כדי לכתוב תובנות ומסקנות — פתוח לעריכה.]</p>
<h2>טבלת ביצועים מסכמת לפי מותג</h2>
<table><thead><tr><th>מותג</th><th>מכירות נטו</th><th>מכירות ברוטו</th><th>הזמנות</th><th>AOV</th><th>מוצרים</th><th>סוגים</th><th>החזרות</th><th>לעומת חודש קודם</th></tr></thead><tbody>${cmpRows}${cmpTotalRow}</tbody></table>
<p class="note">מכירות נטו כוללות משלוח (ללא מע&quot;מ) · מוצרים = יחידות שנמכרו · סוגים = מוצרים שונים · "לעומת חודש קודם" = שינוי במכירות נטו מול התקופה הקודמת. (לחנויות עם Analytics לא זמין, "סוגים" מוצג כ-—).</p>
${chartsSection}
${monthlySection}
${adsSection}
${ovpSection}
${perStore}
${conclSection}
<h2>הערות נוספות</h2>
<p class="note">[הוסיפי כאן הערות, המלצות ופעולות להמשך לכל חנות — הכל ניתן לעריכה ולמחיקה.]</p>
</div>
<script>
  const CD = ${JSON.stringify(chartsData)}, PAL = ${JSON.stringify(chColors)};
  const OPT = { responsive:true, maintainAspectRatio:false, animation:false, plugins:{legend:{position:'bottom'}} };
  function drawCharts(){
    if(!window.Chart){ return setTimeout(drawCharts,120); }
    Chart.defaults.font.family="'Heebo',Arial,sans-serif";
    const g=(id)=>document.getElementById(id);
    new Chart(g('cGN'),{type:'bar',data:{labels:CD.stores,datasets:[{label:'ברוטו',data:CD.gross,backgroundColor:'#1a73e8'},{label:'נטו',data:CD.net,backgroundColor:'#34a853'}]},options:OPT});
    new Chart(g('cShare'),{type:'doughnut',data:{labels:CD.stores,datasets:[{data:CD.net,backgroundColor:PAL}]},options:OPT});
    new Chart(g('cTrend'),{type:'line',data:{labels:CD.months,datasets:CD.monthly.map((m,i)=>({label:m.name,data:m.data,borderColor:PAL[i%PAL.length],backgroundColor:'transparent',tension:.3}))},options:OPT});
    new Chart(g('cOvp'),{type:'bar',data:{labels:CD.ovp.map(o=>o.name),datasets:[{label:'ממומן',data:CD.ovp.map(o=>o.paid),backgroundColor:'#ea4335'},{label:'אורגני',data:CD.ovp.map(o=>o.org),backgroundColor:'#34a853'},{label:'ישיר',data:CD.ovp.map(o=>o.direct),backgroundColor:'#1a73e8'},{label:'אחר',data:CD.ovp.map(o=>o.other),backgroundColor:'#9aa0a6'}]},options:Object.assign({},OPT,{scales:{x:{stacked:true},y:{stacked:true}}})});
  }
  drawCharts();
<\/script>
</body></html>`;
      const w = window.open("", "_blank");
      if (!w) { setStatus("חלון הדוח נחסם — אפשרי חלונות קופצים (popups) לאתר ונסי שוב", "error"); return; }
      w.document.write(html); w.document.close();
    }
    function renderCompare(d) {
      const NAMES = { homepetcenter:"homepetcenter", quickpet:"quickpet", tiktakpet:"tiktakpet" };
      const viewer = (d.role === "viewer") || (userRole === "viewer");
      const hideCard = (mountId, hide) => { const el = document.getElementById(mountId); if (el && el.closest(".card")) el.closest(".card").style.display = hide ? "none" : ""; };
      hideCard("cmpLive", viewer);      // CEO: no live mode
      hideCard("cmpAdsMount", viewer);  // CEO: no ad-cost details
      const dpct = (cur, prev) => { if (!prev) return ""; const ch = Math.round(((cur - prev) / prev) * 100); const cls = ch > 0 ? "text-emerald-600" : ch < 0 ? "text-rose-600" : "text-slate-400"; const ar = ch > 0 ? "▲" : ch < 0 ? "▼" : ""; return ` <span class="${cls}" style="font-size:.7rem">${ar}${Math.abs(ch)}%</span>`; };
      const rows = (d.sites||[]).filter((s)=>!s.error).map((s)=>({ site: NAMES[s.site]||s.site, sessions:s.sessions, users:s.users, revenue:(s.woo?s.woo.revenue:s.revenue), transactions:s.transactions, conv:s.conversionRate, bounce:s.bounceRate, prevSessions:s.prevSessions, prevRevenue:(s.woo?s.woo.prevRevenue:s.prevRevenue) }));
      mountTable("cmpMount", [
        {key:"site",label:"אתר",align:"right"},
        {key:"sessions",label:"Sessions",type:"num",render:(v,r)=>fmt(v)+dpct(v,r.prevSessions)},
        {key:"users",label:"Users",type:"num"},
        {key:"revenue",label:"הכנסות (₪)",type:"num",render:(v,r)=>fmt(v)+dpct(v,r.prevRevenue)},
        {key:"transactions",label:"עסקאות",type:"num"},{key:"conv",label:"המרה",type:"pct"},{key:"bounce",label:"Bounce",type:"pct"},
      ], rows, { search:false, defaultSort:{key:"revenue",dir:"desc"} });
      makeChart("cmpSessions", { type:"bar", data:{ labels:rows.map((r)=>r.site), datasets:[{ data:rows.map((r)=>r.sessions), backgroundColor:["#1d4ed8","#0ea5e9","#10b981"] }] }, options:{responsive:true,plugins:{legend:{display:false}}} });
      makeChart("cmpRevenue", { type:"bar", data:{ labels:rows.map((r)=>r.site), datasets:[{ data:rows.map((r)=>r.revenue), backgroundColor:["#16a34a","#65a30d","#f59e0b"] }] }, options:{responsive:true,plugins:{legend:{display:false}}} });
      const ok = (d.sites||[]).filter((s)=>!s.error);
      // SEO comparison
      mountTable("cmpSeoMount", [
        {key:"site",label:"אתר",align:"right"},{key:"clicks",label:"קליקים",type:"num"},{key:"impressions",label:"חשיפות",type:"num"},
        {key:"keywords",label:"מילים מדורגות",type:"num"},{key:"top10",label:"% ב-Top 10",type:"pct"},{key:"pos",label:"מיקום ממוצע"},
      ], ok.map((s)=>({ site:NAMES[s.site]||s.site, clicks:s.gscClicks||0, impressions:s.gscImpressions||0, keywords:s.rankingKeywords||0, top10:s.top10pct||0, pos:s.avgPosition ?? "—" })), { search:false, defaultSort:{key:"clicks",dir:"desc"} });
      // Traffic mix + conversion
      mountTable("cmpMixMount", [
        {key:"site",label:"אתר",align:"right"},{key:"organic",label:"אורגני",type:"pct"},{key:"paid",label:"ממומן",type:"pct"},{key:"direct",label:"ישיר",type:"pct"},{key:"conv",label:"המרה",type:"pct"},
      ], ok.map((s)=>({ site:NAMES[s.site]||s.site, organic:s.organicPct||0, paid:s.paidPct||0, direct:s.directPct||0, conv:s.conversionRate||0 })), { search:false, defaultSort:{key:"organic",dir:"desc"} });
      // Ad cost comparison
      mountTable("cmpAdsMount", [
        {key:"site",label:"אתר",align:"right"},{key:"cost",label:"עלות פרסום (₪)",type:"num"},{key:"adrev",label:"הכנסת חנות (₪)",type:"num"},{key:"roas",label:"ROAS משוקלל",type:"x"},{key:"cpa",label:"עלות פרסום להזמנה (₪)",type:"num"}],
        ok.map((s)=>({ site:NAMES[s.site]||s.site, cost:s.adCost||0, adrev:s.adRevenue||0, roas:s.roas||0, cpa:s.cpa||0 })), { search:false, defaultSort:{key:"cost",dir:"desc"} });
      // WooCommerce store comparison (only sites with woo data)
      const wooRows = ok.filter((s)=>s.woo).map((s)=>({ site:NAMES[s.site]||s.site, orders:s.woo.orders||0, gross:s.woo.grossSales||0, net:s.woo.netRevenue||0, aov:s.woo.avgOrder||0, customers:s.woo.payingCustomers ?? "—" }));
      const wooCols = [
        {key:"site",label:"אתר",align:"right"},{key:"orders",label:"הזמנות",type:"num"},{key:"gross",label:"ברוטו (₪)",type:"num"},{key:"net",label:"נטו כולל משלוח (₪)",type:"num"},{key:"aov",label:"ערך הזמנה (₪)",type:"num"},
      ];
      if (!viewer) wooCols.push({key:"customers",label:"לקוחות משלמים"}); // CEO: no paying-customers
      mountTable("cmpWooMount", wooCols, wooRows, { search:false, defaultSort:{key:"revenue",dir:"desc"} });
      // Financial breakdown — gross + net only (net includes shipping; tax/shipping shown inside net)
      const finRows = ok.filter((s)=>s.woo).map((s)=>({ site:NAMES[s.site]||s.site, gross:s.woo.grossSales||0, net:s.woo.netRevenue||0, refunds:s.woo.refunds||0, items:s.woo.items||0 }));
      mountTable("cmpFinMount", [
        {key:"site",label:"אתר",align:"right"},{key:"gross",label:"ברוטו (₪)",type:"num"},{key:"net",label:"נטו כולל משלוח (₪)",type:"num"},{key:"refunds",label:"החזרים (₪)",type:"num"},{key:"items",label:"פריטים",type:"num"},
      ], finRows, { search:false, defaultSort:{key:"gross",dir:"desc"} });
      if (!viewer) loadLiveSites();
    }
    async function loadLiveSites() {
      if (userRole === "viewer") return;
      const el = document.getElementById("cmpLive"); if (!el) return;
      try {
        const res = await fetch(`${BASE}/api/livesites`, { headers: { "X-Access-Key": accessKey } });
        if (!res.ok) return;
        const d = await res.json();
        const NM = { homepetcenter:"homepetcenter", quickpet:"quickpet", tiktakpet:"tiktakpet" };
        el.innerHTML = (d.sites||[]).map((s)=>`<div class="text-center rounded-lg border border-slate-200 py-3"><div class="text-xs text-slate-500 mb-1">${NM[s.site]||s.site}</div><div class="text-3xl font-extrabold ${s.active>0?"text-emerald-600":"text-slate-300"}">${fmt(s.active||0)}</div><div class="text-[10px] text-slate-400">פעילים עכשיו</div></div>`).join("");
      } catch (e) {}
    }
    function renderSales(d) {
      const pr = d.prev || {};
      const ss = document.getElementById("slSource"); if (ss) ss.textContent = "💰 מקור נתוני הכסף: " + (d.revenueSource || "GA4") + (d.netRevenue != null ? ` · נטו: ₪${fmt(d.netRevenue)} · החזרים: ₪${fmt(d.refunds || 0)}` : "");
      setKpi("slRevenue", fmt(d.revenue), d.revenue, pr.revenue); const slN = document.getElementById("slNet"); if (slN) slN.textContent = "₪" + fmt(d.netRevenue != null ? d.netRevenue : d.revenue); setKpi("slTx", fmt(d.transactions), d.transactions, pr.transactions);
      setKpi("slAov", fmt(d.aov), d.aov, pr.aov); setKpi("slConv", (d.conversionRate ?? 0)+"%", d.conversionRate, pr.conversionRate);
      mountTable("slProductsMount", [ {key:"name",label:"מוצר",align:"right",long:true},{key:"viewed",label:"צפיות",type:"num"},{key:"carted",label:"לסל",type:"num"},{key:"purchased",label:"נרכש",type:"num"},{key:"revenue",label:"הכנסה (₪)",type:"num"},{key:"buyRate",label:"% רכישה",type:"pct"} ], (d.products||[]).slice(), { defaultSort:{key:"revenue",dir:"desc"}, scroll:true });
      const cv = d.customerValue || {};
      document.getElementById("cvArpu").textContent = fmt(cv.arpu);
      document.getElementById("cvBuyers").textContent = fmt(cv.buyers);
      document.getElementById("cvRevBuyer").textContent = fmt(cv.revenuePerBuyer);
      document.getElementById("cvOrders").textContent = (cv.ordersPerBuyer ?? 0);
      document.getElementById("cvReturn").textContent = (cv.returningBuyerShare ?? 0) + "%";
      document.getElementById("lyRepeat").textContent = (cv.repeatPurchaseRate ?? 0) + "%";
      document.getElementById("lyNewShare").textContent = (cv.newCustomerShare ?? 0) + "%";
      document.getElementById("lyRetShare").textContent = (cv.returningCustomerShare ?? 0) + "%";
      document.getElementById("lyRetRev").textContent = fmt(cv.returningRevenue);
      document.getElementById("lyRetRevShare").textContent = (cv.returningRevenueShare ?? 0) + "%";
      document.getElementById("lyLtv").textContent = fmt(cv.estLtv);
      const f = d.funnel || {};
      document.getElementById("slAbandon").textContent = (f.cartAbandonRate ?? 0) + "%";
      makeChart("slFunnel", { type:"bar", data:{ labels:["צפיות","הוספה לסל","Checkout","רכישה"], datasets:[{ data:[f.sessions,f.addToCart,f.checkout,f.purchase], backgroundColor:["#93c5fd","#60a5fa","#3b82f6","#1d4ed8"] }] }, options:{ indexAxis:"y", responsive:true, plugins:{legend:{display:false}} } });
      const ch = (d.channelRevenue||[]).slice(); pctCol(ch, "revenue", "pct");
      mountTable("slChannelsMount", [ {key:"name",label:"ערוץ",align:"right"},{key:"revenue",label:"הכנסה (₪)",type:"num"},{key:"pct",label:"%",type:"pct"} ], ch, { search:false, defaultSort:{key:"revenue",dir:"desc"} });
      mountTable("slCategoriesMount", [ {key:"name",label:"קטגוריה",align:"right",long:true},{key:"qty",label:"כמות",type:"num"},{key:"revenue",label:"הכנסה (₪)",type:"num"} ], (d.categories||[]).slice(), { defaultSort:{key:"revenue",dir:"desc"}, scroll:true });
      // Detailed checkout funnel
      const steps = d.checkoutFunnel || [];
      const maxC = Math.max(1, ...steps.filter((s)=>s.tracked).map((s)=>s.count));
      document.getElementById("slCheckoutFunnel").innerHTML = steps.map((s) => {
        if (!s.tracked) return `<div class="flex items-center gap-3 mb-2 opacity-50"><div class="w-32 text-sm">${s.label}</div><div class="flex-1 text-xs text-slate-400 border border-dashed border-slate-300 rounded px-2 py-1">לא נמדד — להפעיל ב-GTM</div></div>`;
        const w = Math.max(3, (s.count / maxC) * 100).toFixed(0);
        const drop = s.dropFromPrev != null ? `<span class="text-rose-600 text-xs font-medium">▼ ${s.dropFromPrev}%</span>` : "";
        return `<div class="flex items-center gap-3 mb-2"><div class="w-32 text-sm text-slate-700">${s.label}</div><div class="flex-1 bg-slate-100 rounded h-7 relative overflow-hidden"><div class="bg-blue-600 h-7 rounded" style="width:${w}%"></div><span class="absolute inset-0 flex items-center px-2 text-xs font-bold text-slate-800">${fmt(s.count)}</span></div><div class="w-14 text-left">${drop}</div></div>`;
      }).join("");
    }
    function renderTrends(d) {
      const ser = d.series || [], labels = ser.map((r)=>niceDate(r.date));
      const line = (id, data, color) => makeChart(id, { type:"line", data:{ labels, datasets:[{ data, borderColor:color, backgroundColor:color+"22", fill:true, tension:0.35, pointRadius:0 }] }, options:{responsive:true,plugins:{legend:{display:false}}} });
      line("trRevenue", ser.map((r)=>r.revenue), "#16a34a");
      line("trConv", ser.map((r)=>r.conversionRate), "#1d4ed8");
      line("trAov", ser.map((r)=>r.aov), "#f59e0b");
      applyGUpdates("trRevenue", ser.map((r)=>r.date));
      const pj = d.projection || {};
      document.getElementById("projDay").textContent = pj.dayOfMonth ? `(יום ${pj.dayOfMonth} מתוך ${pj.daysInMonth})` : "";
      document.getElementById("projMtd").textContent = fmt(pj.mtdRevenue);
      setKpi("projRev", fmt(pj.forecastRevenue), pj.forecastRevenue, pj.lastMonthRevenue);
      setKpi("projTx", fmt(pj.forecastTransactions), pj.forecastTransactions, pj.lastMonthTransactions);
      document.getElementById("projLast").textContent = fmt(pj.lastMonthRevenue);
    }
    function renderAds(d) {
      const t = d.totals || {};
      document.getElementById("adCost").textContent = fmt(t.cost); document.getElementById("adRev").textContent = fmt(t.revenue);
      document.getElementById("adRoas").textContent = (t.roas ?? 0)+"x"; document.getElementById("adClicks").textContent = fmt(t.clicks); document.getElementById("adCpc").textContent = (t.cpc ?? 0);
      adsTotals = t; updateWhatIf();
      const roasCell = (v) => { const c = v>=3?"text-emerald-600":v>=1?"text-amber-600":"text-rose-600"; return `<span class="font-bold ${c}">${v}x</span>`; };
      const cols = [ {key:"name",label:"שם",align:"right",long:true},{key:"cost",label:"עלות (₪)",type:"num"},{key:"impressions",label:"חשיפות",type:"num"},{key:"clicks",label:"קליקים",type:"num"},{key:"ctr",label:"CTR",type:"pct"},{key:"cpc",label:"CPC (₪)"},{key:"revenue",label:"הכנסה (₪)",type:"num"},{key:"transactions",label:"עסקאות",type:"num"},{key:"cpa",label:"CPA (₪)"},{key:"convRate",label:"המרה",type:"pct"},{key:"roas",label:"ROAS",render:roasCell} ];
      adLevelData = { campaigns: (d.campaigns||[]).slice(), adGroups: (d.adGroups||[]).slice(), cols };
      drawAdLevel();
      const aq = (d.adQueries||[]).map((r) => ({ ...r, status: r.transactions === 0 && r.cost >= 10 ? "⚠️ בזבוז" : r.roas >= 3 ? "✓ רווחי" : "" }));
      const statusCell = (v) => v.includes("בזבוז") ? `<span class="text-rose-600 font-bold">${v}</span>` : v.includes("רווחי") ? `<span class="text-emerald-600">${v}</span>` : "";
      mountTable("adQueriesMount", [
        {key:"query",label:"מה הקלידו",align:"right",long:true},
        {key:"campaign",label:"קמפיין",align:"right",long:true},
        {key:"cost",label:"עלות (₪)",type:"num"},
        {key:"clicks",label:"קליקים",type:"num"},
        {key:"sessions",label:"כניסות",type:"num"},
        {key:"revenue",label:"הכנסה (₪)",type:"num"},
        {key:"transactions",label:"עסקאות",type:"num"},
        {key:"roas",label:"ROAS",render:roasCell},
        {key:"status",label:"סטטוס",render:statusCell},
      ], aq, { defaultSort:{key:"cost",dir:"desc"}, scroll:true });
    }
    const DONUT = ["#1d4ed8","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#64748b","#a3a3a3","#84cc16","#f97316"];
    function renderTraffic(d) {
      const ch = (d.channels||[]).slice(), dev = d.devices || [];
      makeChart("trChart", { type:"doughnut", data:{ labels:ch.map((c)=>c.name), datasets:[{ data:ch.map((c)=>c.sessions), backgroundColor:DONUT }] }, options:{responsive:true,plugins:{legend:{position:"bottom",labels:{boxWidth:12,font:{size:11}}}}} });
      makeChart("devChart", { type:"doughnut", data:{ labels:dev.map((c)=>c.name), datasets:[{ data:dev.map((c)=>c.sessions), backgroundColor:["#1d4ed8","#f59e0b","#10b981","#ec4899"] }] }, options:{responsive:true,plugins:{legend:{position:"bottom",labels:{boxWidth:12,font:{size:11}}}}} });
      pctCol(ch, "sessions", "pct");
      mountTable("trMount", [ {key:"name",label:"ערוץ",align:"right"},{key:"sessions",label:"Sessions",type:"num"},{key:"users",label:"Users",type:"num"},{key:"revenue",label:"הכנסה (₪)",type:"num"},{key:"transactions",label:"עסקאות",type:"num"},{key:"convRate",label:"המרה",type:"pct"},{key:"pct",label:"% תנועה",type:"pct"} ], ch, { search:false, defaultSort:{key:"sessions",dir:"desc"}, scroll:true });
      document.getElementById("aiTotal").textContent = (d.aiTotal ? `(סה"כ ${fmt(d.aiTotal)} כניסות)` : "");
      mountTable("aiMount", [ {key:"name",label:"מקור AI",align:"right",long:true},{key:"sessions",label:"Sessions",type:"num"},{key:"users",label:"Users",type:"num"},{key:"transactions",label:"עסקאות",type:"num"},{key:"revenue",label:"הכנסה (₪)",type:"num"},{key:"convRate",label:"המרה",type:"pct"} ], (d.aiTraffic||[]).slice(), { search:false, defaultSort:{key:"sessions",dir:"desc"}, scroll:true });
      // First vs last touch attribution
      const ft = d.firstTouch || [];
      const ftMap = {}; ft.forEach((c) => ftMap[c.name] = c);
      const names = [...new Set([...ch.map((c)=>c.name), ...ft.map((c)=>c.name)])];
      const attr = names.map((n) => {
        const f = ftMap[n] || {}, l = ch.find((c)=>c.name===n) || {};
        const fr = f.revenue || 0, lr = l.revenue || 0;
        const role = fr > lr * 1.3 ? "🚪 פותח היכרות" : lr > fr * 1.3 ? "🎯 סוגר עסקאות" : "⚖️ מאוזן";
        return { name: n, firstRevenue: fr, lastRevenue: lr, role };
      }).filter((r) => r.firstRevenue || r.lastRevenue);
      mountTable("attrMount", [ {key:"name",label:"ערוץ",align:"right"},{key:"firstRevenue",label:"הכנסה כמגע ראשון (₪)",type:"num"},{key:"lastRevenue",label:"הכנסה כמגע אחרון (₪)",type:"num"},{key:"role",label:"תפקיד"} ], attr, { search:false, defaultSort:{key:"lastRevenue",dir:"desc"} });
    }
    const DAY_NAMES = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
    function renderAudience(d) {
      audToggleData.countries = (d.countries||[]).slice(); audToggleData.cities = (d.cities||[]).slice();
      drawAudGeo();
      const hours = d.byHour || []; makeChart("audHours", { type:"bar", data:{ labels:hours.map((h)=>h.hour+":00"), datasets:[{ data:hours.map((h)=>h.sessions), backgroundColor:"#1d4ed8" }] }, options:{responsive:true,plugins:{legend:{display:false}}} });
      const days = d.byDay || []; makeChart("audDays", { type:"bar", data:{ labels:days.map((x)=>DAY_NAMES[x.day]), datasets:[{ data:days.map((x)=>x.sessions), backgroundColor:"#10b981" }] }, options:{responsive:true,plugins:{legend:{display:false}}} });
      const nvr = d.newReturning || [];
      makeChart("audNvr", { type:"doughnut", data:{ labels:nvr.map((x)=>x.type), datasets:[{ data:nvr.map((x)=>x.users), backgroundColor:["#1d4ed8","#10b981"] }] }, options:{responsive:true,plugins:{legend:{position:"bottom"}}} });
      mountTable("audNvrMount", [ {key:"type",label:"סוג",align:"right"},{key:"users",label:"משתמשים",type:"num"},{key:"transactions",label:"עסקאות",type:"num"},{key:"conversionRate",label:"המרה",type:"pct"} ], nvr.slice(), { search:false });
      mountTable("audSearchMount", [ {key:"term",label:"מונח חיפוש",align:"right",long:true},{key:"count",label:"חיפושים",type:"num"},{key:"users",label:"משתמשים",type:"num"} ], (d.siteSearch||[]).slice(), { defaultSort:{key:"count",dir:"desc"}, scroll:true });
      const eng = d.engagement || {};
      document.getElementById("engRate").textContent = (eng.engagementRate ?? 0) + "%";
      document.getElementById("engSessions").textContent = fmt(eng.engagedSessions);
      document.getElementById("engEvents").textContent = (eng.eventsPerSession ?? 0);
      document.getElementById("engTime").textContent = fmtDur(eng.avgEngagementPerUser || 0);
      audToggleData.browsers = (d.browsers||[]).slice(); audToggleData.os = (d.os||[]).slice();
      drawAudTech();
      const age = d.age || []; makeChart("audAge", { type:"bar", data:{ labels:age.map((x)=>x.name), datasets:[{ data:age.map((x)=>x.users), backgroundColor:"#8b5cf6" }] }, options:{responsive:true,plugins:{legend:{display:false}}} });
      const gen = d.gender || []; makeChart("audGender", { type:"doughnut", data:{ labels:gen.map((x)=>x.name==="male"?"זכר":x.name==="female"?"נקבה":x.name), datasets:[{ data:gen.map((x)=>x.users), backgroundColor:["#1d4ed8","#ec4899","#94a3b8"] }] }, options:{responsive:true,plugins:{legend:{position:"bottom"}}} });
    }
    function renderRealtime(d) {
      document.getElementById("rtActive").textContent = fmt(d.active);
      mountTable("rtDeviceMount", [ {key:"name",label:"מכשיר",align:"right"},{key:"users",label:"פעילים",type:"num"} ], (d.byDevice||[]).slice(), { search:false, defaultSort:{key:"users",dir:"desc"} });
      rtGeoData = { byCity: (d.byCity||[]).slice(), byCountry: (d.byCountry||[]).slice() };
      drawRtGeo();
      mountTable("rtEventMount", [ {key:"name",label:"אירוע",align:"right"},{key:"count",label:"כמות",type:"num"} ], (d.byEvent||[]).slice(), { search:false, defaultSort:{key:"count",dir:"desc"} });
    }
    function goalKey() { return "goals_" + document.getElementById("siteSelect").value; }
    async function loadPacing(budget) {
      const info = document.getElementById("pacingInfo");
      if (!budget) { info.textContent = "הגדירי תקציב חודשי למעלה כדי לראות את קצב השריפה"; if (charts["pacingChart"]) charts["pacingChart"].destroy(); return; }
      const now = new Date(), y = now.getFullYear(), m = now.getMonth();
      const pad = (n) => String(n).padStart(2, "0");
      const ms = `${y}-${pad(m + 1)}-01`, todayStr = `${y}-${pad(m + 1)}-${pad(now.getDate())}`;
      const daysInMonth = new Date(y, m + 1, 0).getDate(), dayOfMonth = now.getDate();
      try {
        const site = document.getElementById("siteSelect").value;
        const res = await fetch(`${BASE}/api/ads?site=${encodeURIComponent(site)}&start=${ms}&end=${todayStr}`, { headers: { "X-Access-Key": accessKey } });
        const d = await res.json();
        const series = d.costSeries || [];
        let cum = 0; const actual = series.map((r) => { cum += r.cost; return Math.round(cum); });
        const spent = cum;
        const daysLeft = Math.max(1, daysInMonth - dayOfMonth);
        const allowedPerDay = Math.max(0, (budget - spent) / daysLeft);
        const pace = spent / (budget * (dayOfMonth / daysInMonth));
        const status = spent > budget ? `<span class="text-rose-600 font-bold">חריגה מהתקציב!</span>` : pace > 1.1 ? `<span class="text-amber-600 font-bold">קצב מהיר מדי</span>` : `<span class="text-emerald-600 font-bold">בקצב תקין</span>`;
        info.innerHTML = `הוצא: <b>₪${fmt(Math.round(spent))}</b> מתוך ₪${fmt(budget)} (${((spent / budget) * 100).toFixed(0)}%) · ${status} · מותר להוציא עוד <b>₪${fmt(Math.round(allowedPerDay))}/יום</b> ב-${daysLeft} הימים שנותרו`;
        const labels = series.map((r) => niceDate(r.date));
        const ideal = series.map((_, i) => Math.round(budget * ((i + 1) / daysInMonth)));
        makeChart("pacingChart", { type: "line", data: { labels, datasets: [
          { label: "הוצאה מצטברת", data: actual, borderColor: "#dc2626", backgroundColor: "rgba(220,38,38,.08)", fill: true, tension: .3, pointRadius: 0 },
          { label: "קצב אידיאלי", data: ideal, borderColor: "#94a3b8", borderDash: [6, 4], pointRadius: 0, fill: false },
        ] }, options: { responsive: true, plugins: { legend: { position: "bottom" } } } });
      } catch (e) { info.textContent = "שגיאה בטעינת נתוני עלות"; }
    }
    function renderGoals(d) {
      const saved = JSON.parse(localStorage.getItem(goalKey()) || "{}");
      document.getElementById("goalRevenue").value = saved.revenue || "";
      document.getElementById("goalTx").value = saved.tx || "";
      document.getElementById("goalBudget").value = saved.budget || "";
      loadPacing(saved.budget);
      const bar = (label, actual, goal, unit) => {
        if (!goal) return `<div class="card"><div class="font-medium text-slate-700 mb-1">${label}</div><div class="text-sm text-slate-400">לא הוגדר יעד</div></div>`;
        const p = Math.min(100, (actual / goal) * 100), reached = actual >= goal;
        return `<div class="card"><div class="flex justify-between mb-1"><div class="font-medium text-slate-700">${label}</div><div class="text-sm ${reached?'text-emerald-600':'text-slate-600'}">${fmt(actual)} / ${fmt(goal)} ${unit} (${p.toFixed(0)}%)</div></div><div class="bg-slate-100 rounded-full h-4 overflow-hidden"><div class="${reached?'bg-emerald-500':'bg-blue-600'} h-4" style="width:${p}%"></div></div></div>`;
      };
      document.getElementById("goalProgress").innerHTML = bar("הכנסות", d.revenue||0, saved.revenue, "₪") + bar("עסקאות", d.transactions||0, saved.tx, "");
    }
    document.getElementById("goalSave").addEventListener("click", () => {
      localStorage.setItem(goalKey(), JSON.stringify({ revenue: Number(document.getElementById("goalRevenue").value)||0, tx: Number(document.getElementById("goalTx").value)||0, budget: Number(document.getElementById("goalBudget").value)||0 }));
      loadPart("goals", true);
    });
    function renderPages(d) {
      const pgChange = (v) => v == null ? `<span class="text-slate-400 text-xs">חדש</span>` : `<span class="font-bold ${v >= 0 ? "text-emerald-600" : "text-rose-600"}">${v >= 0 ? "▲" : "▼"} ${Math.abs(v)}%</span>`;
      mountTable("pgTopMount", [ {key:"path",label:"דף",align:"right",long:true,url:true},{key:"views",label:"צפיות",type:"num"},{key:"prevViews",label:"תקופה קודמת",type:"num"},{key:"change",label:"שינוי",render:pgChange} ], (d.topPages||[]).slice(), { defaultSort:{key:"views",dir:"desc"}, scroll:true });
      mountTable("pgLandingMount", [ {key:"path",label:"דף כניסה",align:"right",long:true,url:true},{key:"sessions",label:"Sessions",type:"num"},{key:"bounceRate",label:"Bounce",type:"pct"},{key:"revenue",label:"הכנסה (₪)",type:"num"},{key:"transactions",label:"עסקאות",type:"num"},{key:"convRate",label:"המרה",type:"pct"} ], (d.landingPages||[]).slice(), { defaultSort:{key:"sessions",dir:"desc"}, scroll:true });
    }
    function area(id, labels, data, color) { makeChart(id, { type:"line", data:{ labels, datasets:[{ data, borderColor:color, backgroundColor:color+"22", fill:true, tension:0.35, pointRadius:0 }] }, options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{display:false}}} }); }
    function renderSearch(d) {
      const ser = d.series || [], labels = ser.map((r)=>niceDate(r.date));
      area("seImpr", labels, ser.map((r)=>r.impressions), "#1d4ed8"); area("seClicks", labels, ser.map((r)=>r.clicks), "#10b981"); area("seCtr", labels, ser.map((r)=>r.ctr), "#f59e0b");
      applyGUpdates("seClicks", ser.map((r)=>r.date)); applyGUpdates("seImpr", ser.map((r)=>r.date));
      const pos = d.positions || [];
      sePosDetails = d.positionDetails || {};
      document.getElementById("seKwTotal").textContent = d.totalKeywords ? `(סה"כ ${fmt(d.totalKeywords)} מילים)` : "";
      makeChart("sePos", { type:"bar", data:{ labels:pos.map((b)=>b.bucket), datasets:[{ data:pos.map((b)=>b.count), backgroundColor:["#16a34a","#65a30d","#eab308","#f97316","#dc2626"] }] }, options:{responsive:true, onClick:(e,els)=>{ if(els.length) showPosBucket(pos[els[0].index].bucket); }, plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}} });
      document.getElementById("sePosDetail").classList.add("hidden");
      const br = d.branded || { branded:{clicks:0}, nonBranded:{clicks:0} };
      makeChart("seBrand", { type:"doughnut", data:{ labels:["ממותג","לא-ממותג"], datasets:[{ data:[br.branded.clicks, br.nonBranded.clicks], backgroundColor:["#1d4ed8","#94a3b8"] }] }, options:{responsive:true,plugins:{legend:{position:"bottom"}}} });
      kwMasterData = d.master || [];
      buildKwPresets();
      applyKwPreset(kwActivePreset);
      if (rkData.length) drawRkTable(); // refresh GSC merge in rank tracker
    }

    // ---- Unified keyword master table ----
    let kwMasterData = [], kwActivePreset = "all";
    const KW_PRESETS = [
      { id:"all",       label:"הכל",                 f:()=>true,                 sort:{key:"clicks",dir:"desc"} },
      { id:"ctrOpp",    label:"🎯 הזדמנויות CTR",     f:(r)=>r.ctrOpp,            sort:{key:"impressions",dir:"desc"} },
      { id:"striking",  label:"🏃 Striking (5-15)",   f:(r)=>r.striking,          sort:{key:"impressions",dir:"desc"} },
      { id:"question",  label:"❓ שאלות",             f:(r)=>r.question,          sort:{key:"impressions",dir:"desc"} },
      { id:"cannibal",  label:"⚠️ קניבליזציה",        f:(r)=>r.cannibal>=2,       sort:{key:"impressions",dir:"desc"} },
      { id:"up",        label:"📈 עלו",               f:(r)=>r.change>0,          sort:{key:"change",dir:"desc"} },
      { id:"down",      label:"📉 ירדו",              f:(r)=>r.change<0,          sort:{key:"change",dir:"asc"} },
      { id:"potential", label:"🚀 פוטנציאל",          f:(r)=>r.potential>=5,      sort:{key:"potential",dir:"desc"} },
    ];
    function buildKwPresets() {
      document.getElementById("kwPresets").innerHTML = KW_PRESETS.map((pst) => {
        const n = kwMasterData.filter(pst.f).length;
        return `<button class="kw-pst text-xs px-3 py-1.5 rounded-full border ${pst.id===kwActivePreset?"bg-blue-600 text-white border-blue-600":"bg-slate-50 text-slate-600 border-slate-200 hover:bg-blue-50"}" data-p="${pst.id}">${pst.label} <span class="opacity-70">(${fmt(n)})</span></button>`;
      }).join("");
      document.querySelectorAll(".kw-pst").forEach((b) => b.addEventListener("click", () => applyKwPreset(b.dataset.p)));
    }
    function applyKwPreset(id) {
      kwActivePreset = id;
      const pst = KW_PRESETS.find((x) => x.id === id) || KW_PRESETS[0];
      buildKwPresets();
      const pageCell = (v, row) => v
        ? `<a href="${v}" target="_blank" rel="noopener" class="text-blue-600 hover:underline" title="${prettyUrl(v)}">${shortPath(prettyUrl(v))}</a> <span class="text-slate-400 text-xs">(${row.pagePosition})</span>`
        : `<span class="text-amber-600 text-xs font-medium">✍️ אין דף</span>`;
      const chCell = (v) => v == null ? "" : `<span class="font-bold ${v>0?"text-emerald-600":"text-rose-600"}">${v>0?"▲":"▼"} ${Math.abs(v)}</span>`;
      const potCell = (v) => v >= 5 ? `<span class="font-bold text-emerald-600">+${fmt(v)}</span>` : "";
      const cannibExpand = (r) => r.detail && r.detail.length
        ? `<div class="text-xs text-slate-600 space-y-1">${r.detail.map((pg)=>`• <a href="${pg.page}" target="_blank" rel="noopener" class="text-blue-600 hover:underline">${prettyUrl(pg.page)}</a> <span class="text-slate-400">— מיקום ${pg.position}, ${fmt(pg.clicks)} קליקים, ${fmt(pg.impressions)} חשיפות</span>`).join("<br>")}</div>`
        : `<span class="text-xs text-slate-400">אין דפים מתחרים</span>`;
      mountTable("kwMaster", [
        {key:"key",label:"מילה",align:"right",long:true},
        {key:"page",label:"דף מדורג",align:"right",render:pageCell},
        {key:"position",label:"מיקום"},
        {key:"change",label:"שינוי",render:chCell},
        {key:"impressions",label:"חשיפות",type:"num"},
        {key:"clicks",label:"קליקים",type:"num"},
        {key:"ctr",label:"CTR",type:"pct"},
        {key:"potential",label:"פוטנציאל",render:potCell},
        {key:"tagsText",label:"תגיות",align:"right"},
      ], kwMasterData.filter(pst.f), { defaultSort: pst.sort, scroll:true, expand:cannibExpand });
    }

    let opData = { opportunities: [] };
    let opFilter = "all";
    const OP_CATS = {
      growth: { label: "🟢 צמיחה", cls: "bg-emerald-100 text-emerald-700" },
      threat: { label: "🔴 איום", cls: "bg-rose-100 text-rose-700" },
      seo: { label: "🔍 SEO", cls: "bg-blue-100 text-blue-700" },
      products: { label: "🛒 מוצרים", cls: "bg-amber-100 text-amber-700" },
      ads: { label: "📣 פרסום", cls: "bg-violet-100 text-violet-700" },
    };
    function opAddTask(i) {
      const o = opData.opportunities[i];
      if (o) { addTask(`${o.title} — ${o.action}`); setStatus("✓ נוסף ללוח המשימות (מסך 💡 תובנות)", "ok"); }
    }
    function drawOpTable() {
      const rows = opData.opportunities.map((o, i) => ({ ...o, _i: i })).filter((o) => opFilter === "all" || o.category === opFilter);
      mountTable("opMount", [
        { key: "score", label: "עדיפות", type: "num", render: (v) => `<div class="flex items-center gap-1"><div class="w-12 h-1.5 rounded bg-slate-200 overflow-hidden"><div style="width:${v}%" class="h-full ${v >= 66 ? "bg-rose-500" : v >= 33 ? "bg-amber-400" : "bg-emerald-500"}"></div></div><span class="text-xs text-slate-500">${v}</span></div>` },
        { key: "category", label: "סוג", render: (v) => { const c = OP_CATS[v] || { label: v, cls: "bg-slate-100 text-slate-600" }; return `<span class="text-xs px-2 py-0.5 rounded-full ${c.cls} whitespace-nowrap">${c.label}</span>`; } },
        { key: "title", label: "הזדמנות", align: "right", long: true },
        { key: "valueText", label: "שווי משוער", align: "right" },
        { key: "action", label: "מה לעשות", align: "right", long: true },
        { key: "link", label: "קישור", render: (v, row) => v ? `<a href="${v}" target="_blank" rel="noopener" class="text-blue-600 hover:underline whitespace-nowrap">${row.linkLabel || "פתח"} ↗</a>` : "" },
        { key: "_i", label: "", render: (v) => `<button onclick="opAddTask(${v})" class="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-blue-100 text-slate-600 whitespace-nowrap">➕ משימה</button>` },
      ], rows, { defaultSort: { key: "score", dir: "desc" }, scroll: true, totals: false });
    }
    function renderOpportunities(d) {
      opData = d || { opportunities: [] };
      const c = opData.counts || {};
      const k = (v, l, extra) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val ${extra || ""}">${v}</div></div>`;
      document.getElementById("opSummary").innerHTML =
        k(fmt(c.total || 0), "סה\"כ הזדמנויות", "") +
        k(fmt(c.growth || 0), "הזדמנויות צמיחה", "!text-emerald-600") +
        k(fmt(c.threat || 0), "איומים דחופים", "!text-rose-600") +
        k("~" + fmt(opData.potentialClicks || 0), "פוטנציאל קליקים/חודש", "!text-blue-600");
      const chips = [["all", "הכל"], ["growth", "🟢 צמיחה"], ["threat", "🔴 איומים"], ["seo", "🔍 SEO"], ["products", "🛒 מוצרים"], ["ads", "📣 פרסום"]];
      document.getElementById("opChips").innerHTML = chips.map(([key, l]) => `<button data-opf="${key}" class="op-chip text-xs px-3 py-1 rounded-full ${opFilter === key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-blue-100"}">${l}</button>`).join("");
      document.querySelectorAll(".op-chip").forEach((b) => b.addEventListener("click", () => { opFilter = b.dataset.opf; renderOpportunities(opData); }));
      const s = opData.sources || {}; const offline = [];
      if (!s.merchant) offline.push("Merchant Center");
      if (!s.ranks) offline.push("מעקב מיקומים");
      if (!s.vitals) offline.push("Core Web Vitals");
      document.getElementById("opSources").textContent = offline.length ? ("מקורות שלא נטענו הפעם (לכן ייתכן שחסרות הזדמנויות מהם): " + offline.join(", ")) : "";
      drawOpTable();
    }
    function renderPagePerf(d) {
      mountTable("ppMount", [
        { key: "page", label: "דף", align: "right", long: true, url: true },
        { key: "keywords", label: "מילות מפתח", type: "num" },
        { key: "top10", label: "ב-Top 10", type: "num" },
        { key: "top3", label: "ב-Top 3", type: "num" },
        { key: "clicks", label: "קליקים", type: "num" },
        { key: "impressions", label: "חשיפות", type: "num" },
        { key: "avgPos", label: "מיקום ממוצע" },
      ], (d.pages || []).slice(), { defaultSort: { key: "keywords", dir: "desc" }, scroll: true, totals: false });
    }
    const BRAND_NAMES = { homepetcenter: "הום פט", tiktakpet: "טיק טק", quickpet: "קוויק פט" };
    function renderHome(d) {
      const k = (v, l) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val">${v}</div></div>`;
      const t = d.totals || {};
      document.getElementById("homeTotals").innerHTML =
        k(fmt(t.activeNow), "🟢 גולשים עכשיו (הכל)") +
        k("₪" + fmt(t.todayRevenue), "הכנסות היום") +
        k(fmt(t.todayTx), "עסקאות היום") +
        k("₪" + fmt(t.monthRevenue), "הכנסות החודש");
      const delta = (now, prev) => {
        if (!prev) return "";
        const pc = Math.round(((now - prev) / prev) * 100);
        const cls = pc >= 0 ? "up" : "down";
        return ` <span class="delta ${cls}">${pc >= 0 ? "▲" : "▼"}${Math.abs(pc)}%</span>`;
      };
      document.getElementById("homeSites").innerHTML = (d.sites || []).map((s) => `
        <div class="card cursor-pointer hover:ring-2 hover:ring-blue-300 transition" data-gosite="${s.site}">
          <div class="flex items-center justify-between mb-2">
            <div class="font-bold text-slate-800">${BRAND_NAMES[s.site] || s.site}</div>
            <div class="text-xs ${s.activeNow > 0 ? "text-emerald-600" : "text-slate-400"}">🟢 ${fmt(s.activeNow)} עכשיו</div>
          </div>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div><div class="kpi-label">הכנסות היום</div><div class="font-bold text-slate-700">₪${fmt(s.todayRevenue)}</div></div>
            <div><div class="kpi-label">עסקאות היום</div><div class="font-bold text-slate-700">${fmt(s.todayTx)}</div></div>
            <div><div class="kpi-label">סשנים היום</div><div class="font-bold text-slate-700">${fmt(s.todaySessions)}</div></div>
            <div><div class="kpi-label">הכנסות החודש</div><div class="font-bold text-slate-700">₪${fmt(s.monthRevenue)}</div></div>
            <div class="col-span-2"><div class="kpi-label">קליקים אורגניים (7 ימים)</div><div class="font-bold text-slate-700">${fmt(s.gscClicks7d)}${delta(s.gscClicks7d, s.gscClicksPrev7d)}</div></div>
          </div>
        </div>`).join("");
      document.querySelectorAll("#homeSites [data-gosite]").forEach((el) => el.addEventListener("click", () => {
        document.getElementById("siteSelect").value = el.dataset.gosite;
        localStorage.setItem("dashSite", el.dataset.gosite);
        Object.keys(cache).forEach((x) => delete cache[x]);
        showGroup("performance");
      }));
    }
    function renderPricing(d) {
      const un = document.getElementById("prUnavailable");
      if (!d.available) {
        un.classList.remove("hidden");
        un.textContent = "⚠️ נתוני תחרותיות מחירים לא זמינים: " + (d.error || d.message || "") + (d.hint ? " · " + d.hint : "");
        document.getElementById("prKpis").innerHTML = ""; document.getElementById("prMount").innerHTML = "";
        return;
      }
      un.classList.add("hidden");
      const k = (v, l, cls) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val ${cls || ""}">${v}</div></div>`;
      document.getElementById("prKpis").innerHTML =
        k(fmt(d.total), "מוצרים עם benchmark") +
        k(fmt(d.pricier), "יקרים מהשוק (5%+)", "!text-rose-600") +
        k(fmt(d.similar), "בטווח השוק (±5%)") +
        k(fmt(d.cheaper), "זולים מהשוק", "!text-emerald-600");
      mountTable("prMount", [
        { key: "title", label: "מוצר", align: "right", long: true },
        { key: "brand", label: "מותג" },
        { key: "price", label: "המחיר שלך (₪)", type: "num" },
        { key: "benchmark", label: "מחיר שוק (₪)", type: "num" },
        { key: "diffPct", label: "פער %", type: "num" },
      ], d.items || [], { defaultSort: { key: "diffPct", dir: "desc" }, scroll: true, totals: false });
    }
    function renderCrossCannibal(d) {
      const k = (v, l) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val">${v}</div></div>`;
      const items = d.crossCannibal || [];
      document.getElementById("xcKpis").innerHTML =
        k(fmt(d.totalQueries || 0), "מילים עם תחרות פנימית") +
        k(fmt(items.reduce((s, r) => s + (r.impressions || 0), 0)), "חשיפות במילים אלו (Top 150)") +
        k(fmt(items.reduce((s, r) => s + (r.clicks || 0), 0)), "קליקים במילים אלו");
      mountTable("xcMount", [
        { key: "query", label: "שאילתה", align: "right", long: true },
        { key: "sitesCount", label: "מותגים מתחרים", type: "num" },
        { key: "leaderName", label: "מוביל כרגע" },
        { key: "impressions", label: "חשיפות", type: "num" },
        { key: "clicks", label: "קליקים", type: "num" },
      ], items.map((r) => ({ ...r, leaderName: BRAND_NAMES[r.leader] || r.leader })), {
        defaultSort: { key: "impressions", dir: "desc" }, scroll: true, totals: false,
        expand: (r) => `<table class="w-full text-xs"><tr class="text-slate-400"><th class="text-right py-1">מותג</th><th>מיקום</th><th>קליקים</th><th>חשיפות</th></tr>` +
          Object.entries(r.sites || {}).sort((a, b) => (a[1].position ?? 999) - (b[1].position ?? 999)).map(([site, v]) =>
            `<tr><td class="text-right py-1 font-medium">${BRAND_NAMES[site] || site}${site === r.leader ? " 👑" : ""}</td><td class="text-center">${v.position ?? "—"}</td><td class="text-center">${fmt(v.clicks)}</td><td class="text-center">${fmt(v.impressions)}</td></tr>`).join("") + `</table>`,
      });
    }
    const CAT_LABELS = { noDesc:"אין תיאור", thinDesc:"תיאור דל", noSku:'אין מק"ט', noGtin:"אין ברקוד/GTIN", noBrand:"אין מותג", noMeta:"אין Meta Description", noImage:"אין תמונה", noAlt:"תמונה בלי ALT", unitPriceOnNonFood:"מחיר ליחידה שגוי", outOfStock:"אזל מהמלאי", noCategory:"אין קטגוריה" };
    function renderCatalog(d) {
      const un = document.getElementById("catUnavailable");
      if (!d.available) {
        un.classList.remove("hidden");
        un.textContent = "⚠️ בריאות הקטלוג לא זמינה: " + (d.error || d.message || "") + " · יש להגדיר מפתחות WooCommerce (WC_CK_/WC_CS_) ל-Railway";
        document.getElementById("catKpis").innerHTML = ""; document.getElementById("catBreakdown").innerHTML = ""; document.getElementById("catMount").innerHTML = ""; document.getElementById("catDupMount").innerHTML = "";
        return;
      }
      un.classList.add("hidden");
      const k = (v, l, cls) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val ${cls || ""}">${v}</div></div>`;
      document.getElementById("catKpis").innerHTML =
        k(fmt(d.total), "סה\"כ מוצרים") +
        k(d.healthPct + "%", "ציון בריאות", d.healthPct >= 80 ? "!text-emerald-600" : d.healthPct >= 50 ? "" : "!text-rose-600") +
        k(fmt(d.flagged), "מוצרים עם פערים", "!text-rose-600") +
        k(fmt((d.dupSkuCount || 0) + (d.dupNameCount || 0)), "כפילויות");
      // Breakdown chips: count per issue type, sorted
      const c = d.counts || {};
      document.getElementById("catBreakdown").innerHTML = Object.entries(c)
        .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
        .map(([key, n]) => `<span class="jump-btn text-xs px-3 py-1 rounded-full" style="background:#fee2e2;color:#b91c1c">${CAT_LABELS[key] || key}: ${fmt(n)}</span>`).join("") || '<span class="text-sm text-emerald-600">אין פערים 🎉</span>';
      mountTable("catMount", [
        { key: "name", label: "מוצר", align: "right", long: true, render: (v, r) => r.url ? `<a href="${r.url}" target="_blank" rel="noopener" class="text-blue-600 hover:underline">${String(v || "").replace(/</g, "&lt;")}</a>` : String(v || "") },
        { key: "sku", label: "מק\"ט" },
        { key: "brand", label: "מותג" },
        { key: "issues", label: "פערים", align: "right", long: true },
        { key: "issueCount", label: "מס' פערים", type: "num" },
      ], (d.products || []), { defaultSort: { key: "issueCount", dir: "desc" }, scroll: true, totals: false });
      const dups = [...(d.dupSku || []).map((x) => ({ type: "מק\"ט זהה", value: x.sku, count: x.count, ids: x.ids })),
                    ...(d.dupName || []).map((x) => ({ type: "שם זהה", value: x.name, count: x.count, ids: x.ids }))];
      mountTable("catDupMount", [
        { key: "type", label: "סוג" },
        { key: "value", label: "ערך", align: "right", long: true },
        { key: "count", label: "מופעים", type: "num" },
        { key: "ids", label: "מזהי מוצר", align: "right", long: true },
      ], dups, { defaultSort: { key: "count", dir: "desc" }, scroll: true, totals: false });
    }

    // ===================== Content Enrichment (Stage B) =====================
    // Approved drafts live in localStorage per site until exported to CSV.
    const enrKey = () => "enrichApproved_" + document.getElementById("siteSelect").value;
    const enrGetApproved = () => JSON.parse(localStorage.getItem(enrKey()) || "{}");
    const enrSaveApproved = (o) => localStorage.setItem(enrKey(), JSON.stringify(o));
    let enrCurrentDraft = null;
    async function enrApi(path) {
      const site = document.getElementById("siteSelect").value;
      const res = await fetch(`${BASE}${path}${path.includes("?") ? "&" : "?"}site=${encodeURIComponent(site)}`, { headers: { "X-Access-Key": accessKey } });
      if (res.status === 401) { showLogin(); throw new Error("נדרשת סיסמה"); }
      const t = await res.text(); const d = t ? JSON.parse(t) : {};
      if (d.error) throw new Error(d.error); return d;
    }
    function enrUpdateExportBtn() {
      const n = Object.keys(enrGetApproved()).length;
      document.getElementById("enrApprovedCount").textContent = n;
      document.getElementById("enrExport").classList.toggle("hidden", n === 0);
    }
    async function enrLoadList() {
      const st = document.getElementById("enrListStatus");
      st.textContent = "טוען מוצרים לטיפול...";
      try {
        const d = await enrApi("/api/enrich-list?limit=100");
        if (!d.available) { document.getElementById("enrUnavailable").classList.remove("hidden"); document.getElementById("enrUnavailable").textContent = "⚠️ " + (d.error || d.message || "לא זמין"); st.textContent = ""; return; }
        document.getElementById("enrUnavailable").classList.add("hidden");
        st.textContent = `${fmt(d.total)} מוצרים חסרי תוכן · מוצגים ${d.items.length}` + (d.partial ? ` (נסרקו ${d.scannedPages} מתוך ${d.totalPages} עמודי קטלוג — יש עוד)` : "");
        const approved = enrGetApproved();
        mountTable("enrListMount", [
          { key: "name", label: "מוצר", align: "right", long: true },
          { key: "brand", label: "מותג" },
          { key: "missing", label: "חסר", align: "right", long: true },
          { key: "_act", label: "פעולה", render: (v, r) => `<button class="enr-gen bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1 text-xs" data-id="${r.id}">${approved[r.id] ? "✓ נוצר — ערוך" : "✨ צור טיוטה"}</button>` },
        ], d.items, { defaultSort: { key: "missingCount", dir: "desc" }, scroll: true, totals: false, search: true });
        enrUpdateExportBtn();
      } catch (e) {
        st.textContent = /failed to fetch|load failed|timeout/i.test(e.message)
          ? "החנות לא הגיבה בזמן. נסי שוב בעוד רגע — הסריקה נשמרת בזיכרון ותהיה מהירה יותר."
          : "שגיאה: " + e.message;
      }
    }
    async function enrGenerate(id) {
      const ed = document.getElementById("enrEditor"); ed.classList.remove("hidden");
      document.getElementById("enrFields").innerHTML = "";
      document.getElementById("enrStatus").textContent = "🤖 ה-AI מייצר טיוטה על סמך נתוני המוצר...";
      ed.scrollIntoView({ behavior: "smooth", block: "start" });
      try {
        const d = await enrApi("/api/enrich-generate?id=" + id);
        if (!d.available) { document.getElementById("enrStatus").textContent = "שגיאה: " + (d.error || d.message || "") + (d.raw ? " · " + d.raw : ""); return; }
        enrCurrentDraft = d.draft;
        enrRenderEditor(d.draft);
        document.getElementById("enrStatus").textContent = "";
      } catch (e) { document.getElementById("enrStatus").textContent = "שגיאה: " + e.message; }
    }
    const enrEsc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Recommended lengths for SEO fields — shown live so you can see if a field is too short/long.
    const ENR_LIMITS = { metaTitle: [50, 60], metaDescription: [140, 155] };
    function enrField(fkey, label, cur, sug, multiline) {
      const id = "enrf_" + fkey;
      const input = multiline
        ? `<textarea id="${id}" rows="4" class="enr-in w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" data-f="${fkey}">${enrEsc(sug)}</textarea>`
        : `<input id="${id}" type="text" class="enr-in w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" data-f="${fkey}" value="${enrEsc(sug)}">`;
      const lim = ENR_LIMITS[fkey];
      const counter = lim ? `<span class="text-xs" id="cnt_${fkey}"></span>` : "";
      return `<div class="border border-slate-200 rounded-lg p-3">
        <div class="flex items-center justify-between mb-1">
          <label class="text-sm font-bold text-slate-700"><input type="checkbox" class="enr-chk align-middle ms-1" data-f="${fkey}" checked> ${label}</label>
          ${counter}
        </div>
        ${cur ? `<div class="text-xs text-slate-400 mb-2">נוכחי: ${enrEsc(cur).slice(0, 200) || "—"}</div>` : ""}
        ${input}
      </div>`;
    }
    function enrUpdateCounters() {
      Object.entries(ENR_LIMITS).forEach(([f, [min, max]]) => {
        const el = document.getElementById("enrf_" + f), out = document.getElementById("cnt_" + f);
        if (!el || !out) return;
        const n = el.value.length;
        const ok = n >= min && n <= max;
        out.textContent = `${n}/${max} תווים` + (n < min ? " — קצר מדי" : n > max ? " — ארוך מדי" : " ✓");
        out.className = "text-xs " + (ok ? "text-emerald-600" : n > max ? "text-rose-600" : "text-amber-600");
      });
    }
    function enrRenderEditor(draft) {
      document.getElementById("enrEditorTitle").textContent = "טיוטה: " + (draft.suggested.nameSuggestion || draft.current.name || ("#" + draft.productId));
      const s = draft.suggested, c = draft.current, miss = draft.missing || {};
      let html = "";
      // Amount for the store's per-100g/ml calculator, read from the product title.
      if (draft.amount) {
        const a = draft.amount;
        const shown = a.grams != null ? `${fmt(a.grams)} גרם` : `${fmt(a.ml)} מ"ל`;
        html += `<div class="border border-emerald-200 bg-emerald-50 rounded-lg p-3">
          <div class="flex items-center justify-between mb-1">
            <label class="text-sm font-bold text-slate-700"><input type="checkbox" class="enr-chk align-middle ms-1" data-f="amount" checked> ⚖️ כמות למחשבון (100 גרם/מ"ל)</label>
            <span class="text-xs text-slate-500">זוהה מהשם: "${enrEsc(a.raw)}"${a.multiplier ? ` × ${a.multiplier}` : ""}</span>
          </div>
          ${draft.wooWeight ? `<div class="text-xs text-slate-400 mb-2">משקל קיים בווקומרס: ${enrEsc(draft.wooWeight)}</div>` : ""}
          <input id="enrf_amount" type="text" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value="${a.grams != null ? a.grams : a.ml}">
          <div class="text-xs text-slate-400 mt-1">${shown} · יחידה: ${a.grams != null ? "גרם" : 'מ"ל'}</div>
        </div>`;
      }
      html += enrField("name", "שם מוצר", c.name, s.nameSuggestion, false);
      // Only fields that were actually empty are offered — nothing existing gets overwritten.
      if (miss.shortDescription && s.shortDescription) html += enrField("shortDescription", "תיאור קצר", c.shortDescription, s.shortDescription, true);
      if (miss.longDescription && s.longDescription) html += enrField("longDescription", "תיאור מלא", c.longDescription, s.longDescription, true);
      if (miss.metaTitle && s.metaTitle) html += enrField("metaTitle", "Meta Title", c.metaTitle, s.metaTitle, false);
      if (miss.metaDescription && s.metaDescription) html += enrField("metaDescription", "Meta Description", c.metaDescription, s.metaDescription, true);
      if (Array.isArray(s.faq) && s.faq.length) {
        const faqText = s.faq.map((f) => `שאלה: ${f.q}\nתשובה: ${f.a}`).join("\n\n");
        html += enrField("faq", "FAQ (שאלות ותשובות)", "", faqText, true);
      }
      if (Array.isArray(s.imageAlts) && s.imageAlts.length) {
        html += `<div class="border border-slate-200 rounded-lg p-3"><div class="text-sm font-bold text-slate-700 mb-1"><input type="checkbox" class="enr-chk align-middle ms-1" data-f="imageAlts" checked> ALT לתמונות</div>
          <div class="text-xs text-slate-400 mb-2">לא נכלל בקובץ הייבוא — ווקומרס לא מעדכן ALT דרך ייבוא מוצרים. אפשר להעתיק ידנית או להשתמש בתוסף מדיה.</div>` +
          s.imageAlts.map((a, i) => `<div class="mb-2"><div class="text-xs text-slate-400">תמונה #${a.id}</div><input id="enrf_alt_${i}" data-imgid="${a.id}" type="text" class="enr-alt w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value="${enrEsc(a.alt)}"></div>`).join("") +
          `</div>`;
      }
      const filled = Object.entries(miss).filter(([, v]) => !v).map(([k]) => k);
      if (filled.length) html += `<div class="text-xs text-slate-400">שדות שכבר מלאים במוצר ולכן לא נוצרו מחדש: ${filled.length}</div>`;
      document.getElementById("enrFields").innerHTML = html;
      enrUpdateCounters();
      document.querySelectorAll("#enrFields .enr-in").forEach((el) => el.addEventListener("input", enrUpdateCounters));
    }
    function enrApproveCurrent() {
      if (!enrCurrentDraft) return;
      const checked = {}; document.querySelectorAll("#enrFields .enr-chk").forEach((c) => { checked[c.dataset.f] = c.checked; });
      const val = (f) => { const el = document.getElementById("enrf_" + f); return el ? el.value : ""; };
      const rec = { productId: enrCurrentDraft.productId, sku: enrCurrentDraft.sku, url: enrCurrentDraft.url, approvedAt: new Date().toISOString() };
      if (checked.name) rec.name = val("name");
      if (checked.shortDescription) rec.shortDescription = val("shortDescription");
      if (checked.longDescription) rec.longDescription = val("longDescription");
      if (checked.metaTitle) rec.metaTitle = val("metaTitle");
      if (checked.metaDescription) rec.metaDescription = val("metaDescription");
      if (checked.faq) rec.faq = val("faq");
      if (checked.amount) rec.amount = val("amount");
      if (checked.imageAlts) rec.imageAlts = [...document.querySelectorAll(".enr-alt")].map((el) => ({ id: el.dataset.imgid, alt: el.value }));
      const store = enrGetApproved(); store[rec.productId] = rec; enrSaveApproved(store);
      enrUpdateExportBtn();
      document.getElementById("enrStatus").textContent = "✓ נשמר לרשימת המאושרים. אפשר להמשיך למוצר הבא או לייצא CSV.";
      // refresh list button labels
      document.querySelectorAll(`#enrListMount .enr-gen[data-id="${rec.productId}"]`).forEach((b) => b.textContent = "✓ נוצר — ערוך");
    }
    function enrExportCsv() {
      const store = enrGetApproved(); const rows = Object.values(store);
      if (!rows.length) return;
      // ONE unified file for WooCommerce → Products → Import (matches products by ID).
      // Empty cell = "leave this field alone", so products keep whatever they already had.
      // ALT is deliberately NOT here: Woo's product importer cannot write image ALT.
      const unitKey = localStorage.getItem("unitMetaKey") || "";  // set once the field name is known
      const cols = ["ID", "SKU", "Name", "Description", "Short description",
        "Meta: _yoast_wpseo_title", "Meta: _yoast_wpseo_metadesc", "Weight (g/ml)"];
      if (unitKey) cols.push("Meta: " + unitKey);
      const esc = (v) => { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      const lines = [cols.join(",")];
      rows.forEach((r) => {
        let longDesc = r.longDescription || "";
        if (longDesc && r.faq) longDesc += "\n\nשאלות ותשובות:\n" + r.faq;
        const cells = [r.productId, r.sku || "", r.name || "", longDesc, r.shortDescription || "", r.metaTitle || "", r.metaDescription || "", r.amount || ""];
        if (unitKey) cells.push(r.amount || "");
        lines.push(cells.map(esc).join(","));
      });
      const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "enrichment_" + document.getElementById("siteSelect").value + ".csv"; a.click(); URL.revokeObjectURL(a.href);
    }
    // Event delegation: the table re-renders itself on sort/search, which would drop
    // per-button listeners. Listening on the container keeps the buttons working.
    document.getElementById("enrListMount").addEventListener("click", (e) => {
      const btn = e.target.closest(".enr-gen");
      if (!btn) return;
      e.preventDefault();
      enrGenerate(Number(btn.dataset.id));
    });
    // ===================== Barcode reconciliation =====================
    // Site data comes from the backend; the user's file is parsed in the browser
    // (never uploaded anywhere). Matching is by SKU, which is the only reliable key.
    let bcSite = null, bcFileRows = null, bcResult = null;
    const bcNorm = (s) => String(s == null ? "" : s).trim();
    const bcNormSku = (s) => bcNorm(s).toLowerCase().replace(/\s+/g, "");
    // Barcodes are digits; strip spaces/dashes and any spreadsheet quote prefix.
    const bcNormGtin = (s) => {
      let v = bcNorm(s).replace(/^['`]/, "").replace(/[\s-]/g, "");
      // Rescue barcodes that a spreadsheet turned into scientific notation.
      if (/^\d(?:\.\d+)?e\+?\d+$/i.test(v)) { const n = Number(v); if (Number.isFinite(n)) v = n.toFixed(0); }
      return v;
    };

    function bcParseDelimited(text) {
      const clean = text.replace(/^﻿/, "");
      const firstLine = clean.slice(0, clean.indexOf("\n") === -1 ? clean.length : clean.indexOf("\n"));
      const delim = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? "\t"
        : (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
      const rows = []; let cur = [], val = "", q = false, atFieldStart = true;
      for (let i = 0; i < clean.length; i++) {
        const c = clean[i];
        if (q) {
          if (c === '"' && clean[i + 1] === '"') { val += '"'; i++; }
          else if (c === '"') q = false;
          else val += c;
        }
        // A quote only opens a quoted field at the START of a field. Otherwise it is
        // literal text — Hebrew headers like מק"ט would otherwise swallow the whole file.
        else if (c === '"' && atFieldStart) { q = true; atFieldStart = false; }
        else if (c === delim) { cur.push(val); val = ""; atFieldStart = true; }
        else if (c === "\n") { cur.push(val); rows.push(cur); cur = []; val = ""; atFieldStart = true; }
        else if (c !== "\r") { val += c; atFieldStart = false; }
      }
      if (val !== "" || cur.length) { cur.push(val); rows.push(cur); }
      return rows.filter((r) => r.some((x) => bcNorm(x) !== ""));
    }

    document.getElementById("bcLoadSite").addEventListener("click", async () => {
      const st = document.getElementById("bcStatus");
      const items = [], seen = new Set();
      let page = 1, guard = 0;
      try {
        // Walk the catalogue in slices so no single request runs long enough to be cut off.
        while (guard++ < 60) {
          st.textContent = `טוען ברקודים מהאתר... ${fmt(items.length)} מוצרים`;
          const d = await enrApi(`/api/barcodes?startPage=${page}&maxPages=8`);
          if (!d.available) { document.getElementById("bcUnavailable").classList.remove("hidden"); document.getElementById("bcUnavailable").textContent = "⚠️ " + (d.error || d.message); st.textContent = ""; return; }
          document.getElementById("bcUnavailable").classList.add("hidden");
          const fresh = (d.items || []).filter((it) => !seen.has(it.id));
          fresh.forEach((it) => seen.add(it.id));
          items.push(...fresh);
          if (d.done || d.lastPage == null || !fresh.length) break;
          page = d.lastPage + 1;
        }
        // Duplicate barcodes across the whole store — a real Merchant Center problem.
        const byGtin = new Map();
        items.forEach((it) => { if (it.gtin) { const a = byGtin.get(it.gtin) || []; a.push(it); byGtin.set(it.gtin, a); } });
        const duplicates = [...byGtin.entries()].filter(([, a]) => a.length > 1)
          .map(([gtin, a]) => ({ gtin, count: a.length, products: a.map((x) => `${x.name} (#${x.id})`).join(" | ") }));
        bcSite = {
          items, duplicates, duplicateCount: duplicates.length,
          total: items.length,
          withGtin: items.filter((i) => i.gtin).length,
          withoutGtin: items.filter((i) => !i.gtin).length,
          withoutSku: items.filter((i) => !i.sku).length,
        };
        const k = (v, l, cls) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val ${cls || ""}">${v}</div></div>`;
        document.getElementById("bcKpis").innerHTML =
          k(fmt(bcSite.total), "מוצרים באתר") +
          k(fmt(bcSite.withGtin), "עם ברקוד", "!text-emerald-600") +
          k(fmt(bcSite.withoutGtin), "בלי ברקוד", "!text-rose-600") +
          k(fmt(bcSite.duplicateCount), "ברקודים כפולים", bcSite.duplicateCount ? "!text-amber-600" : "");
        st.textContent = `נטענו ${fmt(bcSite.total)} מוצרים · ${fmt(bcSite.withoutSku)} מהם בלי מק"ט (לא ניתן להצליב אותם)`;
      } catch (e) {
        st.textContent = /failed to fetch|load failed/i.test(e.message)
          ? `נעצר אחרי ${fmt(items.length)} מוצרים — החנות איטית. אפשר ללחוץ שוב.`
          : "שגיאה: " + e.message;
      }
    });

    document.getElementById("bcFile").addEventListener("change", (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      const st = document.getElementById("bcStatus");
      const isExcel = /\.(xlsx|xlsm|xls)$/i.test(f.name);
      const reader = new FileReader();
      reader.onerror = () => { st.textContent = "לא הצלחתי לקרוא את הקובץ."; };
      reader.onload = () => {
        try {
          let rows;
          if (isExcel) {
            if (typeof XLSX === "undefined") { st.textContent = "קורא קבצי Excel לא נטען. רענני את הדף (Ctrl+Shift+R) ונסי שוב, או שמרי את הקובץ כ-CSV."; return; }
            const wb = XLSX.read(new Uint8Array(reader.result), { type: "array" });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            // raw:true keeps numbers as numbers — with raw:false Excel hands back
            // long barcodes in scientific notation ("7.29E+12"), which would never match.
            rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" })
              .map((r) => r.map((v) => (typeof v === "number" && Number.isInteger(v) ? v.toFixed(0) : String(v == null ? "" : v))))
              .filter((r) => r.some((x) => bcNorm(x) !== ""));
          } else {
            rows = bcParseDelimited(String(reader.result));
          }
          if (rows.length < 2) { st.textContent = "הקובץ ריק או ללא שורות נתונים."; return; }
          bcFileRows = rows;
          const header = rows[0].map((h) => bcNorm(h));
          const mk = (sel, guess) => {
            const el = document.getElementById(sel);
            el.innerHTML = header.map((h, i) => `<option value="${i}">${h || "עמודה " + (i + 1)}</option>`).join("");
            const gi = header.findIndex((h) => guess.test(h));
            if (gi >= 0) el.value = String(gi);
          };
          mk("bcColSku", /sku|מק"?ט|מקט|קטלוג|catalog/i);
          mk("bcColGtin", /barcode|gtin|ean|upc|ברקוד/i);
          document.getElementById("bcMapping").classList.remove("hidden");
          st.textContent = `הקובץ נקרא: ${fmt(rows.length - 1)} שורות. ודאי שהעמודות נכונות ולחצי "השווה".`;
        } catch (e) { st.textContent = "לא הצלחתי לקרוא את הקובץ: " + e.message; }
      };
      // Excel needs the raw bytes; CSV is read as UTF-8 text.
      if (isExcel) reader.readAsArrayBuffer(f); else reader.readAsText(f, "utf-8");
    });

    document.getElementById("bcCompare").addEventListener("click", () => {
      const st = document.getElementById("bcStatus");
      if (!bcSite) { st.textContent = 'קודם לחצי "טען ברקודים מהאתר".'; return; }
      if (!bcFileRows) { st.textContent = "קודם בחרי קובץ."; return; }
      const iSku = Number(document.getElementById("bcColSku").value);
      const iGtin = Number(document.getElementById("bcColGtin").value);

      // Build lookup from the user's file
      const fileBySku = new Map();
      for (let r = 1; r < bcFileRows.length; r++) {
        const sku = bcNormSku(bcFileRows[r][iSku]);
        const gtin = bcNormGtin(bcFileRows[r][iGtin]);
        if (sku) fileBySku.set(sku, gtin);
      }

      const fill = [], mismatch = [], missingInFile = [], notOnSite = [];
      const siteSkus = new Set();
      for (const p of bcSite.items) {
        const sku = bcNormSku(p.sku);
        if (sku) siteSkus.add(sku);
        const fileGtin = sku ? fileBySku.get(sku) : undefined;
        const siteGtin = bcNormGtin(p.gtin);
        if (!siteGtin && fileGtin) fill.push({ id: p.id, name: p.name, sku: p.sku, siteGtin: "", fileGtin, url: p.url });
        else if (siteGtin && fileGtin && siteGtin !== fileGtin) mismatch.push({ id: p.id, name: p.name, sku: p.sku, siteGtin, fileGtin, url: p.url });
        else if (!siteGtin && !fileGtin) missingInFile.push({ id: p.id, name: p.name, sku: p.sku, siteGtin: "", fileGtin: "", url: p.url });
      }
      fileBySku.forEach((gtin, sku) => { if (!siteSkus.has(sku)) notOnSite.push({ id: "", name: "(לא נמצא באתר)", sku, siteGtin: "", fileGtin: gtin, url: "" }); });

      const dupSite = (bcSite.duplicates || []).map((d) => ({ id: "", name: d.products, sku: "", siteGtin: d.gtin, fileGtin: "", url: "" }));
      bcResult = { fill, mismatch, missingInFile, dupSite, notOnSite };

      const chip = (n, label, color) => `<span class="jump-btn text-xs px-3 py-1 rounded-full" style="background:${color}22;color:${color}">${label}: ${fmt(n)}</span>`;
      document.getElementById("bcSummary").innerHTML =
        chip(fill.length, "✅ למילוי", "#1e8e3e") +
        chip(mismatch.length, "⚠️ לא תואם", "#d93025") +
        chip(missingInFile.length, "❓ חסר בשניהם", "#5f6368") +
        chip(dupSite.length, "👯 כפול באתר", "#b8860b") +
        chip(notOnSite.length, "📦 בקובץ לא באתר", "#5f6368");
      st.textContent = "ההשוואה הושלמה.";
      bcRenderView();
    });

    function bcRenderView() {
      if (!bcResult) return;
      const view = document.getElementById("bcView").value;
      const rows = bcResult[view] || [];
      mountTable("bcMount", [
        { key: "name", label: "מוצר", align: "right", long: true, render: (v, r) => r.url ? `<a href="${r.url}" target="_blank" rel="noopener" class="text-blue-600 hover:underline">${String(v || "").replace(/</g, "&lt;")}</a>` : String(v || "") },
        { key: "sku", label: "מק\"ט" },
        { key: "siteGtin", label: "ברקוד באתר" },
        { key: "fileGtin", label: "ברקוד אצלך" },
        { key: "id", label: "מזהה" },
      ], rows, { scroll: true, totals: false });
    }
    document.getElementById("bcView").addEventListener("change", bcRenderView);

    document.getElementById("bcExport").addEventListener("click", () => {
      if (!bcResult) return;
      // Export only rows that are safe to import: barcodes we can fill in.
      const rows = bcResult.fill;
      if (!rows.length) { document.getElementById("bcStatus").textContent = "אין שורות למילוי לייצוא."; return; }
      const esc = (v) => { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      const lines = ["ID,SKU,Name,GTIN"].concat(rows.map((r) => [r.id, r.sku, r.name, r.fileGtin].map(esc).join(",")));
      const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "barcodes_fill_" + document.getElementById("siteSelect").value + ".csv"; a.click(); URL.revokeObjectURL(a.href);
    });

    // ===================== Bulk runner =====================
    // Drives generation from the browser, one product per request, with a delay
    // between calls. That keeps every request short (no proxy timeouts), shows real
    // progress, respects the AI provider's rate limits, and can be stopped/resumed.
    let bulkStop = false;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    function bulkLog(msg, cls) {
      const el = document.getElementById("bulkLog");
      el.innerHTML = `<div class="${cls || ""}">${msg}</div>` + el.innerHTML;
    }
    // Auto-approve a generated draft (bulk mode: review happens on the CSV sample).
    function bulkApprove(draft) {
      const s = draft.suggested || {}, miss = draft.missing || {};
      // Only take fields that were actually missing — never overwrite existing content.
      const rec = {
        productId: draft.productId, sku: draft.sku, url: draft.url,
        approvedAt: new Date().toISOString(),
        name: s.nameSuggestion || "",
        shortDescription: miss.shortDescription ? (s.shortDescription || "") : "",
        longDescription: miss.longDescription ? (s.longDescription || "") : "",
        metaTitle: miss.metaTitle ? (s.metaTitle || "") : "",
        metaDescription: miss.metaDescription ? (s.metaDescription || "") : "",
        faq: Array.isArray(s.faq) ? s.faq.map((f) => `שאלה: ${f.q}\nתשובה: ${f.a}`).join("\n\n") : "",
        amount: draft.amount ? (draft.amount.grams != null ? draft.amount.grams : draft.amount.ml) : "",
        amountUnit: draft.amount ? (draft.amount.grams != null ? "g" : "ml") : "",
        imageAlts: Array.isArray(s.imageAlts) ? s.imageAlts.map((a) => ({ id: a.id, alt: a.alt })) : [],
      };
      const store = enrGetApproved(); store[rec.productId] = rec;
      try { enrSaveApproved(store); }
      catch (e) { throw new Error("נגמר מקום האחסון בדפדפן — ייצאי CSV עכשיו כדי לפנות מקום, ואז המשיכי."); }
      enrUpdateExportBtn();
    }
    async function bulkRun() {
      bulkStop = false;
      const count = Math.max(1, Number(document.getElementById("bulkCount").value) || 100);
      let delay = Math.max(1, Number(document.getElementById("bulkDelay").value) || 5) * 1000;
      document.getElementById("bulkBar").classList.remove("hidden");
      document.getElementById("bulkStop").classList.remove("hidden");
      document.getElementById("bulkStart").classList.add("hidden");
      document.getElementById("bulkLog").innerHTML = "";
      const st = document.getElementById("bulkStatus"), fill = document.getElementById("bulkFill");
      const done = enrGetApproved();

      st.textContent = "טוען רשימת מוצרים...";
      let queue = [];
      try {
        // Pull candidates in pages until we have enough that aren't already done.
        for (let off = 0; queue.length < count && off < 5000; off += 100) {
          const d = await enrApi(`/api/enrich-list?limit=100&offset=${off}`);
          if (!d.available || !d.items || !d.items.length) break;
          d.items.forEach((it) => { if (!done[it.id] && queue.length < count) queue.push(it); });
          if (d.items.length < 100) break;
        }
      } catch (e) { st.textContent = "שגיאה בטעינת הרשימה: " + e.message; }

      if (!queue.length) {
        st.textContent = "לא נמצאו מוצרים חדשים לטיפול (ייתכן שכולם כבר טופלו).";
        document.getElementById("bulkStop").classList.add("hidden");
        document.getElementById("bulkStart").classList.remove("hidden");
        return;
      }

      let ok = 0, fail = 0, i = 0;
      const t0 = Date.now();
      for (const item of queue) {
        if (bulkStop) { bulkLog("⏸ נעצר על ידך", "text-amber-600"); break; }
        i++;
        try {
          const d = await enrApi("/api/enrich-generate?id=" + item.id);
          if (d.available && d.draft) { bulkApprove(d.draft); ok++; bulkLog(`✓ ${item.name}`, "text-emerald-600"); }
          else {
            fail++;
            const msg = d.error || d.message || "שגיאה";
            bulkLog(`✗ ${item.name} — ${msg}`, "text-rose-600");
            // Ran out of free quota: back off hard instead of burning through the list.
            if (/מכסה|quota|RESOURCE_EXHAUSTED|429/i.test(msg)) {
              const m = msg.match(/כ-(\d+) שניות/);
              const wait = m ? Number(m[1]) * 1000 : 60000;
              bulkLog(`⏳ ממתין ${Math.round(wait / 1000)} שניות בגלל מגבלת מכסה...`, "text-amber-600");
              await sleep(wait);
              delay = Math.min(delay * 1.5, 30000); // slow down from here on
            }
          }
        } catch (e) {
          fail++; bulkLog(`✗ ${item.name} — ${e.message}`, "text-rose-600");
          if (/אחסון/.test(e.message)) { st.textContent = e.message; break; }
        }
        const pct = Math.round((i / queue.length) * 100);
        fill.style.width = pct + "%";
        const avg = (Date.now() - t0) / i;
        const left = Math.round((avg * (queue.length - i)) / 60000);
        st.textContent = `${i}/${queue.length} · הצליחו ${ok} · נכשלו ${fail}${left > 0 ? ` · נותרו כ-${left} דקות` : ""}`;
        if (i < queue.length && !bulkStop) await sleep(delay);
      }
      document.getElementById("bulkStop").classList.add("hidden");
      document.getElementById("bulkStart").classList.remove("hidden");
      st.textContent += " — סיום. אפשר לייצא CSV.";
    }
    document.getElementById("bulkStart").addEventListener("click", bulkRun);
    document.getElementById("bulkStop").addEventListener("click", () => { bulkStop = true; });

    // ===================== Brand recovery =====================
    let brandRows = [];
    document.getElementById("brandScan").addEventListener("click", async () => {
      const st = document.getElementById("brandStatus");
      brandRows = [];
      // Walk the catalogue in slices so no single request runs long enough to be cut off.
      let page = 1, guard = 0, totals = { missing: 0, matched: 0, unmatched: 0, known: 0, scanned: 0, source: "" };
      const seen = new Set();
      try {
        while (guard++ < 40) {
          st.textContent = `סורק... ${fmt(totals.scanned)} מוצרים נבדקו, ${fmt(brandRows.length)} מותגים זוהו`;
          const d = await enrApi(`/api/brands?startPage=${page}&maxPages=10`);
          if (!d.available) { st.textContent = "שגיאה: " + (d.error || d.message); return; }
          // Guard against duplicates (e.g. an older backend that ignores paging).
          const fresh = (d.items || []).filter((it) => !seen.has(it.id));
          fresh.forEach((it) => seen.add(it.id));
          brandRows.push(...fresh);
          totals.missing += d.missingBrand || 0;
          totals.matched += fresh.length;
          totals.unmatched += d.unmatched || 0;
          totals.known = d.knownBrands || totals.known;
          totals.scanned += d.scannedProducts || 0;
          totals.source = d.brandSource || totals.source;
          // Stop when finished, when the server doesn't support paging, or when a
          // slice contributed nothing new.
          if (d.done || d.lastPage == null || !fresh.length) break;
          page = d.lastPage + 1;
        }
        st.textContent = `${fmt(totals.known)} מותגים מוכרים (${totals.source}) · נסרקו ${fmt(totals.scanned)} מוצרים · ${fmt(totals.missing)} ללא מותג · זוהו ${fmt(totals.matched)} · לא זוהו ${fmt(totals.unmatched)}`;
        document.getElementById("brandExport").classList.toggle("hidden", !brandRows.length);
        mountTable("brandMount", [
          { key: "name", label: "מוצר", align: "right", long: true, render: (v, r) => r.url ? `<a href="${r.url}" target="_blank" rel="noopener" class="text-blue-600 hover:underline">${String(v || "").replace(/</g, "&lt;")}</a>` : String(v || "") },
          { key: "suggestedBrand", label: "מותג מוצע" },
          { key: "confidence", label: "ביטחון", render: (v) => { const c = v === "גבוה" ? "#1e8e3e" : v === "בינוני" ? "#b8860b" : "#d93025"; return `<span style="color:${c};font-weight:600">${v || ""}</span>`; } },
          { key: "matched", label: "זוהה לפי" },
        ], brandRows, { defaultSort: { key: "confidence", dir: "asc" }, scroll: true, totals: false });
      } catch (e) {
        st.textContent = /failed to fetch|load failed/i.test(e.message)
          ? `נעצר אחרי ${fmt(brandRows.length)} תוצאות — החנות איטית. התוצאות שנאספו מוצגות; אפשר ללחוץ שוב.`
          : "שגיאה: " + e.message;
        if (brandRows.length) {
          document.getElementById("brandExport").classList.remove("hidden");
          mountTable("brandMount", [
            { key: "name", label: "מוצר", align: "right", long: true },
            { key: "suggestedBrand", label: "מותג מוצע" },
            { key: "matched", label: "זוהה לפי" },
          ], brandRows, { scroll: true, totals: false });
        }
      }
    });
    document.getElementById("brandExport").addEventListener("click", () => {
      if (!brandRows.length) return;
      const esc = (v) => { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      const lines = ["ID,Name,Brands,Confidence"].concat(brandRows.map((r) => [r.id, r.name, r.suggestedBrand, r.confidence || ""].map(esc).join(",")));
      const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "brands_" + document.getElementById("siteSelect").value + ".csv"; a.click(); URL.revokeObjectURL(a.href);
    });

    document.getElementById("enrLoadList").addEventListener("click", enrLoadList);
    document.getElementById("enrExport").addEventListener("click", enrExportCsv);
    document.getElementById("enrApproveAll").addEventListener("click", enrApproveCurrent);
    document.getElementById("enrClose").addEventListener("click", () => document.getElementById("enrEditor").classList.add("hidden"));
    document.getElementById("enrRegen").addEventListener("click", () => { if (enrCurrentDraft) enrGenerate(enrCurrentDraft.productId); });

    function renderCannibal(d) {
      const k = (v, l) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val">${v}</div></div>`;
      const items = d.cannibal || [];
      document.getElementById("cannibalKpis").innerHTML =
        k(fmt(d.totalConflicts || 0), "שאילתות עם קניבליזציה") +
        k(fmt(items.reduce((s, r) => s + (r.wasted || 0), 0)), "חשיפות מפוצלות (Top 100)") +
        k(fmt(items.reduce((s, r) => s + (r.clicks || 0), 0)), "קליקים בשאילתות אלו");
      mountTable("cannibalMount", [
        { key: "query", label: "שאילתה", align: "right", long: true },
        { key: "pagesCount", label: "דפים מתחרים", type: "num" },
        { key: "clicks", label: "קליקים", type: "num" },
        { key: "impressions", label: "חשיפות", type: "num" },
        { key: "wasted", label: "חשיפות מפוצלות", type: "num" },
      ], items, {
        defaultSort: { key: "wasted", dir: "desc" }, scroll: true, totals: false,
        expand: (r) => `<table class="w-full text-xs"><tr class="text-slate-400"><th class="text-right py-1">דף</th><th>מיקום</th><th>קליקים</th><th>חשיפות</th><th>נתח</th></tr>` +
          (r.pages || []).map((pg) => `<tr><td class="text-right py-1" dir="ltr">${pg.page}</td><td class="text-center">${pg.position ?? "—"}</td><td class="text-center">${fmt(pg.clicks)}</td><td class="text-center">${fmt(pg.impressions)}</td><td class="text-center">${pg.share}%</td></tr>`).join("") + `</table>`,
      });
    }
    function renderDecay(d) {
      const k = (v, l, cls) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val ${cls || ""}">${v}</div></div>`;
      const items = d.decay || [];
      document.getElementById("decayKpis").innerHTML =
        k(fmt(d.totalDecaying || 0), "דפים בשחיקה") +
        k(fmt(items.reduce((s, r) => s + (r.drop || 0), 0)), "קליקים שאבדו (28 יום, Top 100)") +
        k(items.length ? Math.round(items.reduce((s, r) => s + r.dropPct, 0) / items.length) + "%" : "—", "ירידה ממוצעת");
      mountTable("decayMount", [
        { key: "page", label: "דף", align: "right", long: true, url: true },
        { key: "clicksPeak", label: "קליקים בשיא", type: "num" },
        { key: "clicksNow", label: "קליקים היום", type: "num" },
        { key: "drop", label: "אובדן", type: "num" },
        { key: "dropPct", label: "% ירידה", type: "num" },
        { key: "peakWhen", label: "שיא מתי" },
        { key: "position", label: "מיקום נוכחי" },
      ], items, { defaultSort: { key: "drop", dir: "desc" }, scroll: true, totals: false });
    }
    function renderOrgPotential(d) {
      const k = (v, l, extra) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val ${extra || ""}">${v}</div></div>`;
      document.getElementById("opotKpis").innerHTML =
        k(fmt(d.currentClicks || 0), "קליקים אורגניים נוכחיים", "") +
        k(fmt(d.potentialClicks || 0), "פוטנציאל (אם Top 3)", "!text-emerald-600") +
        k("+" + fmt(d.gap || 0), "פער / הזדמנות", "!text-blue-600");
      mountTable("opotMount", [
        { key: "query", label: "מילה", align: "right", long: true },
        { key: "position", label: "מיקום" },
        { key: "impressions", label: "חשיפות", type: "num" },
        { key: "clicks", label: "קליקים", type: "num" },
        { key: "potential", label: "קליקים פוטנציאליים", type: "num" },
      ], (d.keywords || []).slice(), { defaultSort: { key: "potential", dir: "desc" }, scroll: true, totals: false });
    }
    async function loadSpider() {
      const u = document.getElementById("spUrl").value.trim();
      if (!u) { setStatus("הדביקי כתובת URL", "error"); return; }
      try {
        setStatus("שולף ומנתח את הדף…", "info");
        const res = await fetch(`${BASE}/api/spider?url=${encodeURIComponent(u)}`, { headers: { "X-Access-Key": accessKey } });
        if (res.status === 401) { showLogin(); return; }
        const d = await res.json(); setStatus("", "");
        if (d.error) { document.getElementById("spMeta").innerHTML = `<div class="text-rose-600 text-sm">שגיאה בשליפת הדף: ${d.error}</div>`; document.getElementById("spWrap").classList.add("hidden"); return; }
        renderSpider(d);
      } catch (e) { setStatus("שגיאה: " + e.message, "error"); }
    }
    function renderSpider(d) {
      document.getElementById("spMeta").innerHTML =
        `<div class="text-sm"><b>Title:</b> ${d.title || "—"} <span class="text-slate-400">(${(d.title || "").length} תווים)</span></div>` +
        `<div class="text-sm mt-1"><b>Meta description:</b> ${d.metaDesc || "<span class='text-rose-500'>חסר</span>"}</div>` +
        `<div class="text-sm mt-1"><b>H1:</b> ${(d.h1s || []).join(" · ") || "<span class='text-rose-500'>חסר</span>"}</div>` +
        (d.h2s && d.h2s.length ? `<div class="text-sm mt-1 text-slate-500"><b>H2:</b> ${d.h2s.join(" · ")}</div>` : "") +
        `<div class="text-xs text-slate-400 mt-1">סה"כ מילים בדף: ${fmt(d.wordCount || 0)}</div>`;
      document.getElementById("spWrap").classList.remove("hidden");
      mountTable("spWords", [{ key: "word", label: "מילה", align: "right" }, { key: "count", label: "מופעים", type: "num" }], (d.top || []).slice(), { defaultSort: { key: "count", dir: "desc" }, scroll: true, totals: false, search: false });
      mountTable("spBg", [{ key: "phrase", label: "ביטוי", align: "right", long: true }, { key: "count", label: "מופעים", type: "num" }], (d.topBg || []).slice(), { defaultSort: { key: "count", dir: "desc" }, scroll: true, totals: false, search: false });
    }
    function renderGUpdates(d) {
      const s = d.series || [];
      if (s.length) {
        makeChart("guChart", { type: "line", data: { labels: s.map((p) => niceDate(p.date)), datasets: [{ label: "תנודתיות", data: s.map((p) => p.volatility), borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.1)", fill: true, tension: 0.3, pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
        applyGUpdates("guChart", s.map((p) => p.date));
      } else if (charts["guChart"]) { charts["guChart"].destroy(); }
      document.getElementById("guNote").textContent = s.length ? "" : "אין עדיין מספיק היסטוריית מעקב מיקומים לחישוב תנודתיות — הריצי את מעקב המיקומים כמה ימים.";
      document.getElementById("guUpdates").innerHTML =
        GOOGLE_UPDATES.slice().reverse().map((u) => `<div class="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0"><span class="text-xs text-slate-400 w-24">${u.date}</span><span class="text-sm text-slate-700">${u.name}</span></div>`).join("") +
        `<div class="text-xs text-slate-400 mt-3">מקורות חיים: <a href="https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history" target="_blank" rel="noopener" class="text-blue-600 hover:underline">Google Search Status</a> · <a href="https://www.searchenginejournal.com/google-algorithm-history/" target="_blank" rel="noopener" class="text-blue-600 hover:underline">היסטוריית עדכונים</a></div>`;
    }
    const TA_STOP = new Set(["של","את","על","עם","אני","אתה","הוא","היא","אנחנו","הם","הן","זה","זו","גם","כי","אבל","או","אם","יש","אין","לא","כל","אל","מה","מי","היו","היה","הייתה","אשר","כמו","עוד","רק","כך","אז","כדי","עד","בין","לפי","אחרי","לפני","the","a","an","and","or","of","to","in","on","for","is","are","was","were","with","that","this","it","as","at","by","be","from","you","your","we","our","they"]);
    function analyzeText() {
      const raw = document.getElementById("taText").value || "";
      const ignore = document.getElementById("taStop").checked;
      const n = Number(document.getElementById("taN").value || 1);
      const tokens = (raw.toLowerCase().match(/[\p{L}\p{N}']+/gu) || []);
      const words = tokens.filter((w) => !ignore || !TA_STOP.has(w));
      let grams = [];
      if (n === 1) grams = words;
      else for (let i = 0; i + n <= words.length; i++) grams.push(words.slice(i, i + n).join(" "));
      const freq = {}; grams.forEach((g) => (freq[g] = (freq[g] || 0) + 1));
      const totalGrams = grams.length || 1;
      const chars = raw.length, charsNoSpace = raw.replace(/\s/g, "").length;
      const sentences = (raw.match(/[.!?\n]+/g) || []).length || (raw.trim() ? 1 : 0);
      document.getElementById("taStats").innerHTML = [
        ["מילים", fmt(words.length)], ["מילים ייחודיות", fmt(new Set(words).size)],
        ["תווים", fmt(chars)], ["תווים ללא רווח", fmt(charsNoSpace)], ["משפטים", fmt(sentences)],
      ].map(([l, v]) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val">${v}</div></div>`).join("");
      const rows = Object.entries(freq).map(([word, count]) => ({ word, count, pct: Number(((count / totalGrams) * 100).toFixed(1)) })).sort((a, b) => b.count - a.count);
      document.getElementById("taFreqWrap").classList.remove("hidden");
      mountTable("taFreqMount", [
        { key: "word", label: n === 1 ? "מילה" : "ביטוי", align: "right", long: true },
        { key: "count", label: "מופעים", type: "num" },
        { key: "pct", label: "% מהטקסט" },
      ], rows, { defaultSort: { key: "count", dir: "desc" }, scroll: true, totals: false });
    }
    async function loadContent(months) {
      const site = document.getElementById("siteSelect").value;
      try {
        setStatus("טוען ביצועי תוכן…", "info");
        const res = await fetch(`${BASE}/api/content?site=${encodeURIComponent(site)}&months=${months}`, { headers: { "X-Access-Key": accessKey } });
        if (res.status === 401) { showLogin(); return; }
        const d = await res.json(); if (d.error) throw new Error(d.error);
        setStatus("", ""); renderContent(d);
      } catch (e) { setStatus("שגיאה: " + e.message, "error"); }
    }
    function renderContent(d) {
      const sel = document.getElementById("ctMonths"); if (sel && d.months) sel.value = String(d.months);
      document.getElementById("ctNote").textContent = d.capped ? "הערה: Search Console שומר עד ~16 חודשים, לכן התקופה נחתכה." : "";
      const s = d.chartSeries || [];
      makeChart("ctChart", { type: "line", data: { labels: s.map((r) => niceDate(r.date)), datasets: [
        { label: "קליקים", data: s.map((r) => r.clicks), borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.06)", yAxisID: "yC", tension: 0.3, pointRadius: 0, borderWidth: 2 },
        { label: "חשיפות", data: s.map((r) => r.impressions), borderColor: "#fb923c", yAxisID: "yI", tension: 0.3, pointRadius: 0, borderWidth: 2 },
        { label: "CTR %", data: s.map((r) => r.ctr), borderColor: "#22c55e", yAxisID: "yR", tension: 0.3, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3] },
        { label: "מיקום ממוצע", data: s.map((r) => r.position), borderColor: "#64748b", yAxisID: "yP", tension: 0.3, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3] },
      ] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: true, position: "top", labels: { boxWidth: 12, font: { size: 10 } } } }, scales: {
        yC: { type: "linear", position: "left", beginAtZero: true, title: { display: true, text: "קליקים" } },
        yI: { type: "linear", position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: "חשיפות" } },
        yR: { display: false, beginAtZero: true },
        yP: { display: false, reverse: true, min: 1 },
        x: { ticks: { maxTicksLimit: 25, autoSkip: true, maxRotation: 0 } },
      } } });
      mountTable("ctMonthlyMount", [
        { key: "month", label: "חודש", align: "right" },
        { key: "organicClicks", label: "קליקים אורגניים", type: "num" },
        { key: "referralClicks", label: "Referral", type: "num" },
        { key: "allClicks", label: "סה\"כ סשנים", type: "num" },
        { key: "organicDuration", label: "משך ביקור אורגני", render: (v) => fmtDur(v || 0) },
      ], (d.monthly || []).slice().reverse(), { defaultSort: { key: "month", dir: "desc" }, totals: false });
    }
    async function takeSnapshot() {
      const info = document.getElementById("snapInfo");
      info.innerHTML = '<span class="text-blue-600">מצלם… (אוסף נתונים מכל החנויות)</span>';
      try {
        const res = await fetch(`${BASE}/api/snapshot`, { headers: { "X-Access-Key": accessKey } });
        if (res.status === 401) { showLogin(); return; }
        const d = await res.json(); if (d.error) throw new Error(d.error);
        info.innerHTML = `<span class="text-emerald-600">✓ נשמר צילום ל-${d.date} (${d.recorded} חנויות). טוען…</span>`;
        loadPart("snapshots", true);
      } catch (e) { info.innerHTML = `<span class="text-rose-600">שגיאה: ${e.message}</span>`; }
    }
    function renderSnapshots(d) {
      const h = d.history || [];
      if (!h.length) {
        document.getElementById("snapInfo").innerHTML = 'אין עדיין נתונים שמורים — לחצי "📸 צלם עכשיו" כדי להתחיל לצבור (ומומלץ להגדיר צילום יומי אוטומטי).';
        document.getElementById("snapMount").innerHTML = ""; if (charts["snapChart"]) charts["snapChart"].destroy(); return;
      }
      document.getElementById("snapInfo").textContent = `${fmt(h.length)} ימים שמורים · ${h[0].date} → ${h[h.length - 1].date}`;
      makeChart("snapChart", { type: "line", data: { labels: h.map((r) => niceDate(r.date)), datasets: [
        { label: "מכירות (₪)", data: h.map((r) => r.woo_revenue), borderColor: "#16a34a", backgroundColor: "rgba(22,163,74,0.08)", fill: true, tension: 0.3, pointRadius: 0, yAxisID: "y" },
        { label: "Sessions", data: h.map((r) => r.ga_sessions), borderColor: "#1d4ed8", tension: 0.3, pointRadius: 0, yAxisID: "y1" },
      ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true } }, scales: { y: { position: "left", beginAtZero: true }, y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false } } } } });
      mountTable("snapMount", [
        { key: "date", label: "תאריך" }, { key: "woo_revenue", label: "מכירות (₪)", type: "num" }, { key: "woo_orders", label: "הזמנות", type: "num" },
        { key: "ga_sessions", label: "Sessions", type: "num" }, { key: "ga_users", label: "Users", type: "num" }, { key: "gsc_clicks", label: "קליקים אורגניים", type: "num" }, { key: "gsc_impressions", label: "חשיפות", type: "num" },
      ], h.slice().reverse(), { search: false, defaultSort: { key: "date", dir: "desc" }, totals: false, scroll: true });
    }
    async function loadMonthlyUsers() {
      const site = document.getElementById("siteSelect").value;
      const m = document.getElementById("muMonths").value, src = document.getElementById("muSource").value;
      try {
        setStatus("טוען משתמשים חודשי…", "info");
        const res = await fetch(`${BASE}/api/monthlyusers?site=${encodeURIComponent(site)}&months=${m}&source=${src}`, { headers: { "X-Access-Key": accessKey } });
        if (res.status === 401) { showLogin(); return; }
        const d = await res.json(); if (d.error) throw new Error(d.error);
        setStatus("", ""); renderMonthlyUsers(d);
      } catch (e) { setStatus("שגיאה: " + e.message, "error"); }
    }
    function renderMonthlyUsers(d) {
      const ms = document.getElementById("muSource"); if (ms && d.source) ms.value = d.source;
      const mm = document.getElementById("muMonths"); if (mm && d.months) mm.value = String(d.months);
      const s = d.series || [];
      makeChart("muChart", { type: "bar", data: { labels: s.map((r) => r.month), datasets: [
        { type: "bar", label: "ימים 1-10", data: s.map((r) => r.d1), backgroundColor: "#1d4ed8", stack: "s" },
        { type: "bar", label: "ימים 11-20", data: s.map((r) => r.d2), backgroundColor: "#3b82f6", stack: "s" },
        { type: "bar", label: "ימים 21-31", data: s.map((r) => r.d3), backgroundColor: "#93c5fd", stack: "s" },
        { type: "line", label: "נפח חודשי", data: s.map((r) => r.total), borderColor: "#1e3a5f", backgroundColor: "transparent", pointRadius: 3, tension: 0.3, stack: "line" },
      ] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: true, position: "top", labels: { boxWidth: 12, font: { size: 10 } } } }, scales: { x: { stacked: true, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 24 } }, y: { stacked: true, beginAtZero: true } } } });
    }
    function renderSummary(d) {
      const c = d.rankingCurrent || {}, i = d.rankingInitial || {};
      const badge = (v) => `<span class="inline-block bg-amber-100 text-amber-800 font-bold rounded px-3 py-1 text-sm">${v}%</span>`;
      const row = (label, cur, init) => `<div class="grid grid-cols-3 items-center py-2 border-b border-slate-100 last:border-0"><span class="text-sm text-slate-600">${label}</span><span class="text-center">${badge(cur)}</span><span class="text-center">${badge(init)}</span></div>`;
      document.getElementById("sumRanking").innerHTML =
        row("% מילות מפתח ב-Top 5", c.top5 || 0, i.top5 || 0) +
        row("% מילות מפתח ב-Top 10", c.top10 || 0, i.top10 || 0) +
        row("% מילות מפתח ב-Top 20", c.top20 || 0, i.top20 || 0);
      document.getElementById("sumInitNote").textContent = `"בסיס" = חלון התחלה ${d.initialPeriod || ""} · סה"כ מילים מדורגות עכשיו: ${fmt(c.total || 0)}`;
      const t = d.traffic || {};
      const vbadge = (v) => `<span class="inline-block bg-amber-100 text-amber-800 font-bold rounded px-3 py-1 text-sm">${v}</span>`;
      const trow = (label, val) => `<div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"><span class="text-sm text-slate-600">${label}</span>${vbadge(val)}</div>`;
      document.getElementById("sumTraffic").innerHTML =
        trow("סה\"כ תנועה לאתר (כל המקורות)", fmt(t.totalSessions || 0)) +
        trow("תנועה אורגנית (GA4)", fmt(t.organic || 0)) +
        trow("% אורגני מסך התנועה", (t.organicPct || 0) + "%") +
        trow("צפיות בעמודים", fmt(t.pageviews || 0)) +
        trow("צפיות ממוצעות לכל ביקור", t.pagesPerSession || 0) +
        trow("משך ביקור ממוצע", fmtDur(t.avgSessionDuration || 0)) +
        trow("שיעור נטישה", (t.bounceRate || 0) + "%");
      document.getElementById("sumTrafficTitle").textContent = `📊 נתוני תנועה · ${d.period || ""}`;
    }
    async function addToTracker(kw, btn) {
      try { kw = decodeURIComponent(kw); await rkApi("POST", { add: [kw] }); if (btn) { btn.textContent = "✓ נוסף"; btn.disabled = true; } setStatus("✓ נוסף למעקב מיקומים", "ok"); }
      catch (e) { setStatus("שגיאה: " + e.message, "error"); }
    }
    async function loadGap() {
      const site = document.getElementById("siteSelect").value, vs = document.getElementById("gapVs").value;
      try {
        setStatus("טוען פערים…", "info");
        const res = await fetch(`${BASE}/api/gap?site=${encodeURIComponent(site)}&vs=${encodeURIComponent(vs)}`, { headers: { "X-Access-Key": accessKey } });
        if (res.status === 401) { showLogin(); return; }
        const d = await res.json(); if (d.error) throw new Error(d.error);
        setStatus("", ""); renderGap(d);
      } catch (e) { setStatus("שגיאה: " + e.message, "error"); }
    }
    function renderGap(d) {
      const site = document.getElementById("siteSelect").value;
      const sel = document.getElementById("gapVs"); if (sel && d.vs) sel.value = d.vs;
      const vs = d.vs || (sel ? sel.value : "");
      const info = document.getElementById("gapInfo");
      if (vs === site) { info.innerHTML = '<span class="text-amber-600">בחרי מתחרה שונה מהאתר הנוכחי (בורר "השווה מול")</span>'; document.getElementById("gapMount").innerHTML = ""; return; }
      info.textContent = `${fmt(d.count || 0)} מילים ש-${vs} מדורג עליהן בעמוד 1 ו-${site} מפספס`;
      mountTable("gapMount", [
        { key: "keyword", label: "מילה", align: "right", long: true },
        { key: "theirPosition", label: "מיקום מתחרה" },
        { key: "theirImpressions", label: "חשיפות מתחרה", type: "num" },
        { key: "theirClicks", label: "קליקים מתחרה", type: "num" },
        { key: "myPosition", label: "מיקום שלך", render: (v) => v == null ? "—" : v },
        { key: "_act", label: "", render: (v, row) => `<button onclick="addToTracker('${encodeURIComponent(row.keyword)}',this)" class="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-blue-100 text-slate-600 whitespace-nowrap">➕ מעקב</button>` },
      ], (d.gaps || []).slice(), { defaultSort: { key: "theirImpressions", dir: "desc" }, scroll: true, totals: false });
    }
    const RD_COLORS = { r51_100:"#f97316", r41_50:"#fb923c", r31_40:"#fdba74", r21_30:"#facc15", r11_20:"#fde047", r6_10:"#d9f99d", r4_5:"#a3e635", r2_3:"#4ade80", r1:"#16a34a" };
    const RD_LABELS = { r1:"מקום 1", r2_3:"2-3", r4_5:"4-5", r6_10:"6-10", r11_20:"11-20", r21_30:"21-30", r31_40:"31-40", r41_50:"41-50", r51_100:"51-100" };
    const RD_ORDER = ["r51_100","r41_50","r31_40","r21_30","r11_20","r6_10","r4_5","r2_3","r1"]; // bottom → top
    async function loadRankDist(months) {
      const site = document.getElementById("siteSelect").value;
      try {
        setStatus("טוען פיזור דירוג… (עד כמה שניות)", "info");
        const res = await fetch(`${BASE}/api/rankdist?site=${encodeURIComponent(site)}&months=${months}`, { headers: { "X-Access-Key": accessKey } });
        if (res.status === 401) { showLogin(); return; }
        const d = await res.json(); if (d.error) throw new Error(d.error);
        setStatus("", ""); renderRankDist(d);
      } catch (e) { setStatus("שגיאה: " + e.message, "error"); }
    }
    function renderRankDist(d) {
      const sel = document.getElementById("rdMonths"); if (sel && d.months) sel.value = String(d.months);
      document.getElementById("rdNote").textContent = d.capped ? "הערה: Search Console שומר עד ~16 חודשים, לכן התקופה נחתכה לגבול הזה." : "";
      const s = d.series || [];
      const datasets = RD_ORDER.map((b) => ({ label: RD_LABELS[b], data: s.map((row) => row[b] || 0), backgroundColor: RD_COLORS[b], borderWidth: 0 }));
      makeChart("rdChart", { type: "bar", data: { labels: s.map((row) => niceDate(row.date)), datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: "top", labels: { boxWidth: 12, font: { size: 10 } } }, tooltip: { mode: "index", intersect: false } }, scales: { x: { stacked: true, ticks: { maxTicksLimit: 30, autoSkip: true, maxRotation: 0 } }, y: { stacked: true, beginAtZero: true } } } });
      const last = s[s.length - 1] || {};
      document.getElementById("rdTotals").innerHTML = last.date
        ? `<span class="text-xs text-slate-500">היום האחרון (${niceDate(last.date)}): </span>` + RD_ORDER.slice().reverse().map((b) => `<span class="inline-flex items-center gap-1 ml-3 text-xs"><span style="width:10px;height:10px;border-radius:2px;background:${RD_COLORS[b]};display:inline-block"></span>${RD_LABELS[b]}: <b>${fmt(last[b] || 0)}</b></span>`).join("")
        : "";
    }
    function renderEntity(d) {
      const score = d.authorityScore || 0;
      const col = score >= 70 ? "text-emerald-600" : score >= 45 ? "text-amber-500" : "text-rose-500";
      const es = document.getElementById("entScore"); es.textContent = score; es.className = "text-5xl font-extrabold " + col;
      document.getElementById("entLabel").textContent = "מותג " + (d.authorityLabel || "");
      document.getElementById("entBreakdown").innerHTML = (d.breakdown || []).map((b) => {
        const pct = Math.round((b.points / b.max) * 100);
        return `<div class="mb-2"><div class="flex justify-between text-sm"><span class="text-slate-600">${b.factor}</span><span class="text-slate-400">${b.value} · ${b.points}/${b.max}</span></div><div class="h-1.5 rounded bg-slate-200 overflow-hidden mt-1"><div style="width:${pct}%" class="h-full bg-blue-500"></div></div></div>`;
      }).join("");
      const k = (v, l, extra) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val ${extra || ""}">${v}</div></div>`;
      const g = (n) => n == null ? "—" : (n > 0 ? "+" : "") + n + "%";
      document.getElementById("entKpis").innerHTML =
        k(d.brandedShare + "%", "נתח חיפושי מותג") +
        k(g(d.brandGrowth), "צמיחת חיפושי מותג", d.brandGrowth > 0 ? "!text-emerald-600" : d.brandGrowth < 0 ? "!text-rose-600" : "") +
        k(d.brandAvgPos != null ? d.brandAvgPos : "—", "מיקום ממוצע על המותג", d.ownsBrandSerp ? "!text-emerald-600" : "!text-amber-500") +
        k(fmt(d.brandedClicks || 0), "קליקים ממותג");
      const kg = d.knowledgeGraph || {};
      if (kg.recognized) {
        document.getElementById("entKgCard").innerHTML = `<div class="font-bold text-slate-800 mb-1">🧠 מזוהה כ-Entity בגוגל ✓</div><div class="text-sm text-slate-600"><b>${kg.name || ""}</b>${kg.types && kg.types.length ? ` · <span class="text-slate-400">${kg.types.join(", ")}</span>` : ""}</div>${kg.description ? `<div class="text-sm text-slate-500 mt-1">${kg.description}</div>` : ""}${kg.detail ? `<div class="text-xs text-slate-400 mt-2">${kg.detail.slice(0, 300)}</div>` : ""}${kg.detailUrl ? `<a href="${kg.detailUrl}" target="_blank" rel="noopener" class="text-blue-600 hover:underline text-xs">מקור ↗</a>` : ""}<div class="text-xs text-slate-400 mt-2">ציון התאמה של גוגל: ${kg.score || 0}</div>`;
      } else {
        const reason = kg.error ? ("שגיאת API: " + kg.error) : (kg.reason === "no API key" ? "לא הוגדר מפתח API — הפעילו את Knowledge Graph Search API על אותו מפתח Google של CrUX (או הוסיפו KG_API_KEY)" : "גוגל עדיין לא מזהה את המותג כ-Entity");
        document.getElementById("entKgCard").innerHTML = `<div class="font-bold text-slate-800 mb-1">🧠 לא מזוהה כ-Entity בגוגל</div><div class="text-sm text-slate-500">${reason}</div><div class="text-xs text-slate-400 mt-2">כדי להפוך ל-Entity מוכר: דף "אודות" עשיר, סימון Organization Schema, פרופיל Google Business פעיל, אזכורים באתרים סמכותיים, וערך בויקיפדיה/ויקינתונים אם רלוונטי.</div>`;
      }
      const tr = d.trend || [];
      makeChart("entChart", { type: "line", data: { labels: tr.map((p) => niceDate(p.date)), datasets: [{ label: "הופעות מותג", data: tr.map((p) => p.impressions), borderColor: "#7c3aed", backgroundColor: "rgba(124,58,237,0.08)", fill: true, tension: 0.35, pointRadius: 0 }, { label: "קליקים", data: tr.map((p) => p.clicks), borderColor: "#0ea5e9", borderWidth: 1.5, fill: false, tension: 0.35, pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true } } } });
      mountTable("entQueriesMount", [{ key: "query", label: "שאילתה", align: "right", long: true }, { key: "clicks", label: "קליקים", type: "num" }, { key: "impressions", label: "הופעות", type: "num" }, { key: "ctr", label: "CTR%" }, { key: "position", label: "מיקום" }], (d.brandQueries || []).slice(), { defaultSort: { key: "impressions", dir: "desc" }, scroll: true });
    }
    async function loadBackfill() {
      const site = document.getElementById("siteSelect").value, m = document.getElementById("bfMonths").value;
      const st = document.getElementById("bfStatus");
      let page = 1, total = 0, done = false, guard = 0;
      st.innerHTML = '<span class="text-blue-600">מייבא… (נמשך במנות, אל תסגרי את העמוד)</span>';
      try {
        while (!done && guard < 300) {
          const res = await fetch(`${BASE}/api/woo-backfill?site=${encodeURIComponent(site)}&months=${m}&page=${page}`, { headers: { "X-Access-Key": accessKey } });
          if (res.status === 401) { showLogin(); return; }
          const d = await res.json();
          if (!d.ok) { st.innerHTML = `<span class="text-rose-600">שגיאה: ${d.message || "ייבוא נכשל"}</span>`; return; }
          total += d.stored || 0;
          st.innerHTML = `<span class="text-blue-600">מייבא… ${fmt(total)} הזמנות עד כה</span>`;
          done = d.done; page = d.nextPage || page; guard++;
        }
        st.innerHTML = `<span class="text-emerald-600">✓ הסתיים — יובאו ${fmt(total)} הזמנות. טוען…</span>`;
        loadPart("orderhist", true);
      } catch (e) { st.innerHTML = `<span class="text-rose-600">שגיאה: ${e.message}</span>`; }
    }
    async function loadOrderHist(months) {
      const site = document.getElementById("siteSelect").value;
      try {
        setStatus("טוען היסטוריית הזמנות…", "info");
        const res = await fetch(`${BASE}/api/orders?site=${encodeURIComponent(site)}&months=${months}`, { headers: { "X-Access-Key": accessKey } });
        if (res.status === 401) { showLogin(); return; }
        const d = await res.json(); if (d.error) throw new Error(d.error);
        setStatus("", ""); renderOrderHist(d);
      } catch (e) { setStatus("שגיאה: " + e.message, "error"); }
    }
    function renderOrderHist(d) {
      const sel = document.getElementById("ohMonths"); if (sel && d.months != null) sel.value = String(d.months);
      document.getElementById("ohPeriod").textContent = d.period ? `(${d.period})` : "";
      const k = (v, l, extra) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val ${extra || ""}">${v}</div></div>`;
      document.getElementById("ohKpis").innerHTML =
        k(fmt(d.count || 0), "סה\"כ הזמנות", "") +
        k("₪" + fmt(d.paidRevenue || 0), "הכנסה ששולמה", "!text-emerald-600") +
        k(`${fmt(d.refundedCount || 0)} · ₪${fmt(d.refundedAmount || 0)}`, "החזרים", "!text-rose-600") +
        k("₪" + fmt(d.netRevenue || 0), "נטו (אחרי החזרים)", "!text-blue-600");
      const STC = { completed: "bg-emerald-100 text-emerald-700", processing: "bg-blue-100 text-blue-700", "on-hold": "bg-amber-100 text-amber-700", pending: "bg-slate-100 text-slate-600", cancelled: "bg-rose-100 text-rose-700", refunded: "bg-rose-100 text-rose-700", failed: "bg-rose-100 text-rose-700" };
      document.getElementById("ohStatus").innerHTML = (d.byStatus || []).map((x) => `<span class="text-sm px-3 py-1 rounded-full ${STC[x.status] || "bg-slate-100 text-slate-600"}">${x.status}: <b>${fmt(x.count)}</b></span>`).join("") || '<span class="text-slate-400 text-sm">אין הזמנות שמורות עדיין — לחצי "ייבא הזמנות היסטוריות" או חכי שה-webhook ידחוף חדשות</span>';
      mountTable("ohMount", [{ key: "id", label: "מס׳", align: "right" }, { key: "date", label: "תאריך" }, { key: "status", label: "סטטוס" }, { key: "customer", label: "לקוח", align: "right", long: true }, { key: "items", label: "פריטים", type: "num" }, { key: "total", label: "סכום", type: "num" }], (d.orders || []).slice(), { defaultSort: { key: "date", dir: "desc" }, scroll: true, totals: false });
    }
    let tpCatsSite = "";
    async function loadTpCats(site) {
      tpCatsSite = site;
      try {
        const res = await fetch(`${BASE}/api/woocats?site=${encodeURIComponent(site)}`, { headers: { "X-Access-Key": accessKey } });
        if (!res.ok) return;
        const d = await res.json();
        const sel = document.getElementById("tpCats");
        sel.innerHTML = (d.categories || []).map((c) => `<option value="${c.id}">${c.name} (${fmt(c.count)})</option>`).join("");
      } catch (e) {}
    }
    async function loadTopProducts() {
      const site = document.getElementById("siteSelect").value, m = document.getElementById("tpMonths").value, lim = document.getElementById("tpLimit").value;
      const cats = Array.from(document.getElementById("tpCats").selectedOptions || []).map((o) => o.value).join(",");
      try {
        setStatus("טוען מוצרים מובילים…", "info");
        const res = await fetch(`${BASE}/api/topproducts?site=${encodeURIComponent(site)}&months=${m}&limit=${lim}${cats ? "&categories=" + cats : ""}`, { headers: { "X-Access-Key": accessKey } });
        if (res.status === 401) { showLogin(); return; }
        const d = await res.json(); if (d.error) throw new Error(d.error);
        setStatus("", ""); renderTopProducts(d);
      } catch (e) { setStatus("שגיאה: " + e.message, "error"); }
    }
    function renderTopProducts(d) {
      const site = document.getElementById("siteSelect").value;
      if (tpCatsSite !== site) loadTpCats(site); // (re)populate category list when the site changes
      if (!d.available) { document.getElementById("tpInfo").innerHTML = `<span class="text-amber-600">WooCommerce לא מחובר לאתר זה. ${d.message || d.error || ""}</span>`; document.getElementById("tpMount").innerHTML = ""; return; }
      document.getElementById("tpInfo").textContent = `${fmt(d.count || 0)} מוצרים · תקופה: ${d.period || ""}`;
      mountTable("tpMount", [
        { key: "name", label: "מוצר", align: "right", long: true },
        { key: "sku", label: "מק״ט" },
        { key: "sold", label: "נמכרו (יח׳)", type: "num" },
        { key: "revenue", label: "הכנסה (₪)", type: "num" },
        { key: "orders", label: "הזמנות", type: "num" },
      ], (d.products || []).slice(), { defaultSort: { key: "sold", dir: "desc" }, scroll: true, totals: false });
    }
    function renderWooCust(d) {
      const msg = document.getElementById("wcMsg");
      if (!d.available) {
        msg.classList.remove("hidden");
        msg.innerHTML = `👤 נתוני לקוחות לא זמינים. ${d.message || ""}<br>נדרש מפתח WooCommerce (Read) ב-Railway (WC_CK_/WC_CS_) ושהאנליטיקס של WooCommerce מופעל.`;
        document.getElementById("wcKpis").innerHTML = ""; document.getElementById("wcMount").innerHTML = "";
        return;
      }
      msg.classList.add("hidden");
      const sm = d.summary || {};
      const k = (v, l, extra) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val ${extra || ""}">${v}</div></div>`;
      document.getElementById("wcKpis").innerHTML =
        k(sm.payingCustomers != null ? fmt(sm.payingCustomers) : "—", "לקוחות משלמים", "") +
        k("₪" + fmt(sm.topCustomerSpend || 0), "הלקוח המוביל", "!text-emerald-600") +
        k("₪" + fmt(sm.topAvgLtv || 0), "LTV ממוצע (טופ 100)", "") +
        k(fmt(sm.topRepeat || 0), "חוזרים (מתוך טופ 100)", "!text-blue-600");
      mountTable("wcMount", [
        { key: "name", label: "לקוח", align: "right", long: true },
        { key: "orders", label: "הזמנות", type: "num" },
        { key: "totalSpend", label: "סך קניות", type: "num" },
        { key: "avgOrder", label: "ממוצע להזמנה", type: "num" },
        { key: "lastActive", label: "פעיל לאחרונה" },
        { key: "country", label: "מדינה" },
      ], (d.customers || []).slice(), { defaultSort: { key: "totalSpend", dir: "desc" }, scroll: true, totals: false });
    }
    function renderWoo(d) {
      const msg = document.getElementById("wooMsg");
      const ids = ["wooKpis", "wooStatus", "wooOrders", "wooTop", "wooCats", "wooStock"];
      if (!d.available) {
        msg.classList.remove("hidden");
        msg.innerHTML = `🛍️ WooCommerce לא מחובר לאתר הזה. ${d.message || ""}<br>צרי מפתח API (הרשאת Read) ב-WooCommerce → Settings → Advanced → REST API, והוסיפי ב-Railway את <b>WC_CK_&lt;SITE&gt;</b> ו-<b>WC_CS_&lt;SITE&gt;</b>.`;
        ids.forEach((id) => (document.getElementById(id).innerHTML = ""));
        return;
      }
      msg.classList.add("hidden");
      const ps = d.periodSales || {};
      const k = (v, l, extra) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val ${extra || ""}">${v}</div></div>`;
      document.getElementById("wooKpis").innerHTML =
        k("₪" + fmt(ps.grossSales || 0), "מכירות ברוטו", "") +
        k("₪" + fmt(ps.netSales || 0), "מכירות נטו (כולל משלוח)", "") +
        k(fmt(ps.orders || 0), "הזמנות", "") +
        k("₪" + fmt(ps.avgOrder || 0), "ערך הזמנה ממוצע", "");
      const STC = { completed: "bg-emerald-100 text-emerald-700", processing: "bg-blue-100 text-blue-700", "on-hold": "bg-amber-100 text-amber-700", pending: "bg-slate-100 text-slate-600", cancelled: "bg-rose-100 text-rose-700", refunded: "bg-rose-100 text-rose-700", failed: "bg-rose-100 text-rose-700" };
      document.getElementById("wooStatus").innerHTML = (d.ordersByStatus || []).map((x) => `<span class="text-sm px-3 py-1 rounded-full ${STC[x.status] || "bg-slate-100 text-slate-600"}">${x.label}: <b>${fmt(x.count)}</b></span>`).join("") || '<span class="text-slate-400 text-sm">אין נתונים</span>';
      mountTable("wooOrders", [{ key: "id", label: "מס׳", align: "right" }, { key: "date", label: "תאריך" }, { key: "status", label: "סטטוס" }, { key: "items", label: "פריטים", type: "num" }, { key: "total", label: "סכום", type: "num" }], (d.recentOrders || []).slice(), { search: false, totals: false, defaultSort: { key: "date", dir: "desc" } });
      mountTable("wooTop", [{ key: "name", label: "מוצר", align: "right", long: true }, { key: "sold", label: "נמכרו", type: "num" }], (d.topSellers || []).slice(), { defaultSort: { key: "sold", dir: "desc" }, scroll: true, totals: false });
      mountTable("wooCats", [{ key: "name", label: "קטגוריה", align: "right", long: true }, { key: "count", label: "מוצרים", type: "num" }], (d.categories || []).slice(), { defaultSort: { key: "count", dir: "desc" }, scroll: true, totals: false });
      mountTable("wooStock", [{ key: "name", label: "מוצר", align: "right", long: true }, { key: "sku", label: "מק״ט" }, { key: "price", label: "מחיר", type: "num" }], (d.outOfStock || []).slice(), { scroll: true, totals: false });
    }
    function renderMerchant(d) {
      const un = document.getElementById("mcUnavailable");
      if (!d.available) { un.classList.remove("hidden"); un.textContent = "⚠️ Merchant Center לא זמין לאתר זה: " + (d.error || d.message || ""); document.getElementById("mcKpis").innerHTML = ""; document.getElementById("mcIssuesMount").innerHTML = ""; document.getElementById("mcProductsMount").innerHTML = ""; return; }
      un.classList.add("hidden");
      const k = (v, l, c) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val ${c||''}">${v}</div></div>`;
      document.getElementById("mcKpis").innerHTML =
        k(fmt(d.total), "מוצרים בפיד", "") +
        k(fmt(d.approved), "מאושרים", "!text-emerald-600") +
        k(fmt(d.disapproved), "נדחו", "!text-rose-600") +
        k(fmt(d.pending), "ממתינים/בבדיקה", "!text-amber-500");
      mountTable("mcIssuesMount", [ {key:"issue",label:"בעיה",align:"right",long:true},{key:"severity",label:"חומרה",align:"right"},{key:"count",label:"כמה מוצרים",type:"num"} ], (d.topIssues||[]).slice(), { defaultSort:{key:"count",dir:"desc"}, scroll:true });
      mountTable("mcProductsMount", [ {key:"title",label:"מוצר",align:"right",long:true},{key:"issue",label:"סיבת דחייה",align:"right",long:true},{key:"detail",label:"פירוט",align:"right",long:true} ], (d.problemProducts||[]).slice(), { defaultSort:{key:"title",dir:"asc"}, scroll:true });
    }
    function renderVitals(d) {
      const el = document.getElementById("vitalsMount");
      if (!d.vitals) { el.innerHTML = `<div class="text-amber-600 text-sm">⚠️ חסר מפתח <b>CRUX_API_KEY</b> ב-Railway — הוסיפי אותו כדי לראות נתוני מהירות</div>`; return; }
      const RATE = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] };
      const NAMES = { lcp: "LCP — טעינה", inp: "INP — תגובתיות", cls: "CLS — יציבות" };
      const fmtV = (k, v) => v == null ? "—" : k === "cls" ? v.toFixed(2) : (v / 1000).toFixed(1) + "s";
      const block = (label, data) => {
        if (!data || data.error) return `<div class="mb-2 text-sm"><span class="font-medium text-slate-700">${label}:</span> <span class="text-slate-400">אין מספיק נתוני גלישה לאתר זה</span></div>`;
        return `<div class="mb-3"><div class="font-medium text-slate-700 mb-1">${label}</div><div class="flex gap-3 flex-wrap">` +
          ["lcp", "inp", "cls"].map((k) => {
            const v = data[k], [g, n] = RATE[k];
            const cls = v == null ? "bg-slate-100 text-slate-400" : v <= g ? "bg-emerald-100 text-emerald-700" : v <= n ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700";
            const tag = v == null ? "" : v <= g ? "טוב ✓" : v <= n ? "דורש שיפור" : "גרוע ✗";
            return `<div class="rounded-lg px-4 py-2 ${cls}"><div class="text-xs">${NAMES[k]}</div><div class="font-bold text-xl">${fmtV(k, v)}</div><div class="text-xs">${tag}</div></div>`;
          }).join("") + `</div></div>`;
      };
      el.innerHTML = block("📱 מובייל", d.vitals.mobile) + block("💻 דסקטופ", d.vitals.desktop);
    }

    // ---- Technical audit (on-demand crawler) ----
    async function runAudit() {
      const btn = document.getElementById("auditRun"), prog = document.getElementById("auditProgress");
      btn.disabled = true; btn.textContent = "סורק..."; prog.classList.remove("hidden");
      const site = document.getElementById("siteSelect").value;
      const hdr = { "X-Access-Key": accessKey };
      try {
        prog.textContent = "מושך sitemap ו-robots.txt...";
        const u = await (await fetch(`${BASE}/api/audit?site=${site}&mode=urls`, { headers: hdr })).json();
        if (u.error) { prog.textContent = "שגיאה: " + u.error; btn.disabled = false; btn.textContent = "הרץ סריקה"; return; }
        if (!u.urls || !u.urls.length) { prog.textContent = "לא נמצא sitemap או שאין בו עמודים (נסי שוב — ייתכן עומס זמני)"; btn.disabled = false; btn.textContent = "הרץ סריקה"; return; }
        const all = [];
        for (let i = 0; i < u.urls.length; i += 15) {
          const res = await (await fetch(`${BASE}/api/audit`, { method: "POST", headers: { ...hdr, "Content-Type": "application/json" }, body: JSON.stringify({ site, urls: u.urls.slice(i, i + 15) }) })).json();
          all.push(...(res.results || []));
          prog.textContent = `נסרקו ${all.length} מתוך ${u.urls.length} עמודים...`;
        }
        const ok = all.filter((r) => r.status === 200);
        const issues = [];
        all.filter((r) => r.status !== 200).forEach((r) => issues.push({ url: r.url, issue: "🔴 שגיאה " + (r.status || "טעינה"), detail: "העמוד לא נטען תקין" }));
        (u.blocked || []).forEach((b) => issues.push({ url: b, issue: "🚫 חסום ב-robots", detail: "מופיע ב-sitemap אך חסום לסריקה" }));
        ok.filter((r) => r.noindex).forEach((r) => issues.push({ url: r.url, issue: "🙈 noindex", detail: "העמוד מסומן לא-להוסיף-לאינדקס" }));
        ok.filter((r) => !r.title).forEach((r) => issues.push({ url: r.url, issue: "✏️ חסר Title", detail: "" }));
        ok.filter((r) => r.titleLen > 65).forEach((r) => issues.push({ url: r.url, issue: "📏 Title ארוך", detail: r.titleLen + " תווים (מומלץ עד 65)" }));
        ok.filter((r) => r.title && !r.meta).forEach((r) => issues.push({ url: r.url, issue: "📝 חסר Meta Description", detail: "" }));
        ok.filter((r) => r.metaLen > 160).forEach((r) => issues.push({ url: r.url, issue: "📏 Meta ארוך", detail: r.metaLen + " תווים (מומלץ עד 160)" }));
        const byTitle = {}; ok.forEach((r) => { if (r.title) (byTitle[r.title] = byTitle[r.title] || []).push(r.url); });
        Object.entries(byTitle).filter(([, us]) => us.length > 1).forEach(([t, us]) => us.forEach((uu) => issues.push({ url: uu, issue: "👯 Title כפול", detail: `מופיע ב-${us.length} עמודים: "${t.slice(0, 50)}"` })));
        const chip = (n, label, color) => `<div class="card flex items-center gap-2 !py-2"><div class="text-xl font-bold ${color}">${n}</div><div class="text-xs text-slate-500">${label}</div></div>`;
        const count = (pred) => issues.filter(pred).length;
        document.getElementById("auditSummary").innerHTML =
          chip(ok.length, "עמודים תקינים", "text-emerald-600") +
          chip(count((i) => i.issue.includes("שגיאה")), "שגיאות טעינה/404", "text-rose-600") +
          chip(count((i) => i.issue.includes("Title")), "בעיות Title", "text-amber-600") +
          chip(count((i) => i.issue.includes("Meta")), "בעיות Meta", "text-amber-600") +
          chip(count((i) => i.issue.includes("noindex") || i.issue.includes("robots")), "בעיות אינדוקס", "text-purple-600");
        mountTable("auditIssuesMount", [ {key:"url",label:"עמוד",align:"right",long:true,url:true},{key:"issue",label:"בעיה",align:"right"},{key:"detail",label:"פירוט",align:"right"} ], issues, { defaultSort:{key:"issue",dir:"asc"}, scroll:true });
        prog.textContent = `✓ הסריקה הושלמה — ${all.length} עמודים, ${issues.length} ממצאים`;
      } catch (e) { prog.textContent = "שגיאה בסריקה: " + e.message; }
      btn.disabled = false; btn.textContent = "הרץ סריקה";
    }
    document.getElementById("auditRun").addEventListener("click", runAudit);

    // ---- Query Fan-Out ----
    async function runFanout() {
      const topic = document.getElementById("foInput").value.trim();
      if (!topic) { document.getElementById("foStatus").textContent = "הקלידי נושא"; return; }
      const btn = document.getElementById("foRun"), st = document.getElementById("foStatus");
      btn.disabled = true; btn.textContent = "מפרק..."; st.textContent = "סורק חיפושים אמיתיים...";
      try {
        const site = document.getElementById("siteSelect").value;
        const d = await (await fetch(`${BASE}/api/fanout?site=${site}&topic=${encodeURIComponent(topic)}`, { headers: { "X-Access-Key": accessKey } })).json();
        if (d.error) { st.textContent = "שגיאה: " + d.error; }
        else {
          const chip = (n, l, c) => `<div class="card !py-2"><div class="text-xl font-bold ${c}">${n}</div><div class="text-xs text-slate-500">${l}</div></div>`;
          document.getElementById("foSummary").innerHTML = chip(fmt(d.total), "וריאציות חיפוש", "text-slate-700") + chip(fmt(d.ranked), "🟢 מדורג עמוד 1", "text-emerald-600") + chip(fmt(d.opportunities), "🔴 הזדמנויות תוכן", "text-amber-600");
          const stCell = (v) => v.includes("הזדמנות") ? `<span class="text-amber-600 font-medium">${v}</span>` : v.includes("עמוד 2") ? `<span class="text-amber-500">${v}</span>` : `<span class="text-emerald-600">${v}</span>`;
          mountTable("foMount", [ {key:"key",label:"וריאציית חיפוש",align:"right",long:true},{key:"intent",label:"כוונה",align:"right"},{key:"impressions",label:"חשיפות",type:"num"},{key:"clicks",label:"קליקים",type:"num"},{key:"position",label:"מיקום"},{key:"status",label:"סטטוס",render:stCell} ], (d.subQueries||[]).slice(), { defaultSort:{key:"impressions",dir:"desc"}, scroll:true });
          st.textContent = `✓ נמצאו ${d.total} וריאציות סביב "${topic}"`;
        }
      } catch (e) { st.textContent = "שגיאה: " + e.message; }
      btn.disabled = false; btn.textContent = "פרק נושא";
    }
    document.getElementById("foRun").addEventListener("click", runFanout);
    document.getElementById("foInput").addEventListener("keydown", (e) => { if (e.key === "Enter") runFanout(); });

    // ---- Position-bucket drill-down ----
    let sePosDetails = {};
    function showPosBucket(bucket) {
      const rows = sePosDetails[bucket] || [];
      document.getElementById("sePosDetail").classList.remove("hidden");
      document.getElementById("sePosDetailTitle").textContent = `מילים במיקום ${bucket} (${fmt(rows.length)}${rows.length === 300 ? "+ — מוצגות 300 המובילות" : ""})`;
      mountTable("sePosDetailMount", [ {key:"key",label:"מילה",align:"right",long:true},{key:"position",label:"מיקום"},{key:"impressions",label:"חשיפות",type:"num"},{key:"clicks",label:"קליקים",type:"num"} ], rows.slice(), { defaultSort:{key:"impressions",dir:"desc"}, scroll:true });
      document.getElementById("sePosDetail").scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // ---- Realtime geo toggle (cities / countries) ----
    let rtGeoData = {}, rtGeo = "byCity";
    function drawRtGeo() {
      document.querySelectorAll(".rt-geo").forEach((b) => b.classList.toggle("active", b.dataset.rtg === rtGeo));
      mountTable("rtGeoMount", [ {key:"name",label:rtGeo==="byCity"?"עיר":"מדינה",align:"right"},{key:"users",label:"פעילים",type:"num"} ], rtGeoData[rtGeo] || [], { search:false, defaultSort:{key:"users",dir:"desc"} });
    }
    document.querySelectorAll(".rt-geo").forEach((b) => b.addEventListener("click", () => { rtGeo = b.dataset.rtg; drawRtGeo(); }));

    // ---- Rank tracker (Koliom-style) ----
    let rkData = [], rkFilter = "all";
    const RK_FILTERS = [
      { id:"all",   label:"הכל",                f:()=>true },
      { id:"top1",  label:"🥇 מקום 1",           f:(r)=>r.position===1 },
      { id:"page1", label:"עמוד ראשון (1-10)",   f:(r)=>r.position!=null&&r.position<=10 },
      { id:"page2", label:"עמוד 2+ (11-100)",    f:(r)=>r.position!=null&&r.position>10 },
      { id:"none",  label:"ללא דירוג",           f:(r)=>r.position==null },
    ];
    function rkSpark(series) {
      const pts = (series || []).filter((s) => s.position != null);
      if (pts.length < 2) return `<span class="text-slate-300">—</span>`;
      const w = 80, h = 24;
      const maxP = Math.max(...pts.map((p) => p.position), 10);
      const xs = pts.map((_, i) => (i / (pts.length - 1)) * (w - 4) + 2);
      const ys = pts.map((p) => ((p.position - 1) / (maxP - 1 || 1)) * (h - 6) + 3);
      const dPath = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
      const up = pts[pts.length - 1].position <= pts[0].position;
      return `<svg width="${w}" height="${h}" style="vertical-align:middle"><path d="${dPath}" fill="none" stroke="${up ? "#16a34a" : "#dc2626"}" stroke-width="1.5"/></svg>`;
    }
    function buildRkFilters() {
      document.getElementById("rkFilterChips").innerHTML = RK_FILTERS.map((ft) => {
        const n = rkData.filter(ft.f).length;
        return `<button class="rk-flt text-xs px-3 py-1.5 rounded-full border ${ft.id===rkFilter?"bg-blue-600 text-white border-blue-600":"bg-slate-50 text-slate-600 border-slate-200 hover:bg-blue-50"}" data-f="${ft.id}">${ft.label} <span class="opacity-70">(${n})</span></button>`;
      }).join("");
      document.querySelectorAll(".rk-flt").forEach((b) => b.addEventListener("click", () => { rkFilter = b.dataset.f; buildRkFilters(); drawRkTable(); }));
    }
    const RK_CTR = (p) => p == null ? 0 : p <= 1 ? 0.28 : p <= 2 ? 0.15 : p <= 3 ? 0.10 : p <= 4 ? 0.07 : p <= 5 ? 0.05 : p <= 10 ? 0.03 : p <= 20 ? 0.01 : 0.004;
    function rkEnriched() {
      const gsc = {}; (kwMasterData || []).forEach((m) => { gsc[m.key] = m; });
      return rkData.map((r) => {
        const g = gsc[r.keyword] || {};
        const estNow = r.volume ? Math.round(r.volume * RK_CTR(r.position)) : null;
        const top3 = r.volume ? Math.round(r.volume * 0.10) : null;
        return { ...r, gscClicks: g.clicks ?? null, gscImpr: g.impressions ?? null, estNow, uplift: top3 != null ? Math.max(0, top3 - (estNow || 0)) : null };
      });
    }
    function drawRkTable() {
      const ft = RK_FILTERS.find((x) => x.id === rkFilter) || RK_FILTERS[0];
      const posCell = (v) => v == null ? `<span class="text-slate-400">לא בטופ-100</span>` : `<span class="font-bold ${v <= 3 ? "text-emerald-600" : v <= 10 ? "text-lime-600" : v <= 20 ? "text-amber-600" : "text-rose-600"}">#${v}</span>`;
      const chCell = (v) => v == null ? "" : v > 0 ? `<span class="text-emerald-600 font-bold">▲ ${v}</span>` : v < 0 ? `<span class="text-rose-600 font-bold">▼ ${Math.abs(v)}</span>` : `<span class="text-slate-400">—</span>`;
      const vchCell = (v) => v == null ? "" : `<span class="text-xs font-medium ${v >= 0 ? "text-emerald-600" : "text-rose-600"}">${v >= 0 ? "+" : ""}${v}%</span>`;
      const upCell = (v) => v != null && v >= 5 ? `<span class="font-bold text-emerald-600">+${fmt(v)}</span>` : "";
      mountTable("rkTableMount", [
        {key:"keyword",label:"מילה",align:"right",long:true},
        {key:"position",label:"מיקום",render:posCell},
        {key:"change",label:"שינוי",render:chCell},
        {key:"initial",label:"התחלתי"},
        {key:"best",label:"שיא"},
        {key:"volume",label:"נפח חודשי",type:"num"},
        {key:"volChange",label:"נפח שנתי",render:vchCell},
        {key:"gscClicks",label:"קליקים (GSC)",type:"num"},
        {key:"estNow",label:"קליקים מוערך",type:"num"},
        {key:"uplift",label:"+ בטופ-3",render:upCell},
        {key:"_spark",label:"מגמה",render:(v,row)=>rkSpark(row.series)},
        {key:"url",label:"דף מדורג",align:"right",long:true,url:true},
      ], rkEnriched().filter(ft.f), { defaultSort:{key:"position",dir:"asc"}, scroll:true });
      // Summary cards
      const en = rkEnriched();
      const sum = (arr, k) => arr.reduce((s, r) => s + (Number(r[k]) || 0), 0);
      const totalVol = sum(en, "volume");
      const volP1 = sum(en.filter((r) => r.position != null && r.position <= 10), "volume");
      const upliftSum = sum(en, "uplift");
      const card = (v, l, c) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val ${c || ""}">${v}</div></div>`;
      document.getElementById("rkSummary").innerHTML =
        card(fmt(totalVol), "נפח חיפוש כולל במעקב / חודש", "") +
        card(fmt(volP1), "נפח שבו את בעמוד הראשון", "!text-emerald-600") +
        card(totalVol ? ((volP1 / totalVol) * 100).toFixed(0) + "%" : "—", "נתח השוק שלך (עמוד 1)", "") +
        card("+" + fmt(upliftSum), "פוטנציאל קליקים/חודש אם הכל בטופ-3", "!text-blue-600");
    }
    function renderRanks(d) {
      rkData = d.keywords || [];
      document.getElementById("rkCount").textContent = d.tracked ? `(${d.tracked} מילים)` : "";
      loadRkChips();
      buildRkFilters();
      drawRkTable();
      const sel = document.getElementById("rkChartSel");
      sel.innerHTML = rkData.map((k) => `<option value="${k.keyword.replace(/"/g, "&quot;")}">${k.keyword}</option>`).join("") || `<option value="">אין נתונים עדיין</option>`;
      drawRkChart();
    }
    function drawRkChart() {
      const kw = document.getElementById("rkChartSel").value;
      const item = rkData.find((k) => k.keyword === kw);
      if (!item) { if (charts["rkChart"]) charts["rkChart"].destroy(); return; }
      const ser = item.series || [];
      makeChart("rkChart", { type: "line",
        data: { labels: ser.map((s) => niceDate(String(s.date).replace(/-/g, ""))), datasets: [{ label: "מיקום", data: ser.map((s) => s.position), borderColor: "#1d4ed8", backgroundColor: "rgba(29,78,216,.08)", fill: true, tension: .3, pointRadius: 3, spanGaps: true }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { reverse: true, min: 1, title: { display: true, text: "מיקום בגוגל (1 = למעלה)" } } } } });
    }
    document.getElementById("rkChartSel").addEventListener("change", drawRkChart);
    async function rkApi(method, body) {
      const site = document.getElementById("siteSelect").value;
      const res = await fetch(`${BASE}/api/keywords?site=${site}`, { method, headers: { "X-Access-Key": accessKey, "Content-Type": "application/json" }, body: body ? JSON.stringify({ site, ...body }) : undefined });
      return res.json();
    }
    async function loadRkChips() {
      try {
        const d = await rkApi("GET");
        const kws = d.keywords || [];
        document.getElementById("rkCount").textContent = `(${kws.length} מילים)`;
        document.getElementById("rkChips").innerHTML = kws.map((k) =>
          `<span class="inline-flex items-center gap-1 bg-slate-100 rounded-full px-3 py-1 text-sm">${k}<button class="rk-del text-slate-400 hover:text-rose-500" data-k="${k.replace(/"/g, "&quot;")}">✕</button></span>`).join("") || `<span class="text-slate-400 text-sm">אין מילים — הוסיפי למעלה</span>`;
        document.querySelectorAll(".rk-del").forEach((b) => b.addEventListener("click", async () => { await rkApi("POST", { remove: [b.dataset.k] }); loadRkChips(); }));
      } catch (e) { document.getElementById("rkChips").innerHTML = `<span class="text-amber-600 text-sm">⚠️ ${e.message || "שגיאת חיבור ל-Supabase"}</span>`; }
    }
    document.getElementById("rkAdd").addEventListener("click", async () => {
      const v = document.getElementById("rkInput").value.trim(); if (!v) return;
      await rkApi("POST", { add: v.split(",").map((s) => s.trim()).filter(Boolean) });
      document.getElementById("rkInput").value = ""; loadRkChips();
    });
    document.getElementById("rkInput").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("rkAdd").click(); });
    document.getElementById("rkVol").addEventListener("click", async () => {
      const btn = document.getElementById("rkVol"), st = document.getElementById("rkStatus");
      btn.disabled = true; btn.textContent = "מושך נפחים...";
      try {
        const site = document.getElementById("siteSelect").value;
        const r = await (await fetch(`${BASE}/api/kw-volume?site=${site}`, { headers: { "X-Access-Key": accessKey } })).json();
        st.textContent = r.error ? "שגיאה: " + r.error : `✓ עודכנו נפחי חיפוש ל-${r.updated} מילים`;
        loadPart("ranks", true);
      } catch (e) { st.textContent = "שגיאה: " + e.message; }
      btn.disabled = false; btn.textContent = "📊 עדכן נפחי חיפוש";
    });
    document.getElementById("rkRun").addEventListener("click", async () => {
      const btn = document.getElementById("rkRun"), st = document.getElementById("rkStatus");
      btn.disabled = true; btn.textContent = "בודק מול גוגל...";
      try {
        const site = document.getElementById("siteSelect").value;
        const kd = await rkApi("GET");
        const kws = (kd.keywords || []).filter((k) => k && k.trim());
        if (!kws.length) { st.textContent = "אין מילים במעקב"; }
        else {
          let done = 0, found = 0;
          st.textContent = `בודק 0/${kws.length}...`;
          // 2 keywords in parallel — each live check takes ~10-20s
          let idx = 0;
          async function worker() {
            while (idx < kws.length) {
              const k = kws[idx++];
              try {
                const r = await (await fetch(`${BASE}/api/rank-run?site=${site}&kw=${encodeURIComponent(k)}`, { headers: { "X-Access-Key": accessKey } })).json();
                if (r.position) found++;
              } catch (e) {}
              done++; st.textContent = `בודק ${done}/${kws.length}... (${found} נמצאו עד כה)`;
            }
          }
          await Promise.all([worker(), worker()]);
          st.textContent = `✓ נבדקו ${done} מילים, ${found} נמצאו בטופ-100`;
          loadPart("ranks", true);
        }
      } catch (e) { st.textContent = "שגיאה: " + e.message; }
      btn.disabled = false; btn.textContent = "🔄 בדוק מיקומים עכשיו";
    });

    const PARTS = {
      insights:{path:"/api/insights",render:renderInsights}, realtime:{path:"/api/realtime",render:renderRealtime}, goals:{path:"/api/ecommerce",render:renderGoals},
      periods:{path:"/api/periods",render:renderPeriods},
      overview:{path:"/api/data",render:renderOverview}, compare:{path:"/api/compare",render:renderCompare},
      trends:{path:"/api/trends",render:renderTrends},
      sales:{path:"/api/ecommerce",render:renderSales}, ads:{path:"/api/ads",render:renderAds},
      traffic:{path:"/api/sources",render:renderTraffic}, audience:{path:"/api/audience",render:renderAudience},
      retention:{path:"/api/retention",render:renderRetention}, events:{path:"/api/events",render:renderEvents}, analyses:{path:"/api/analyses",render:renderAnalyses},
      pages:{path:"/api/pages",render:renderPages}, search:{path:"/api/search",render:renderSearch},
      health:{path:"/api/vitals",render:renderVitals},
      ranks:{path:"/api/rank-history",render:renderRanks},
      merchant:{path:"/api/merchant",render:renderMerchant},
      woo:{path:"/api/woo",render:renderWoo},
      woocust:{path:"/api/woocustomers",render:renderWooCust},
      orderhist:{path:"/api/orders",render:renderOrderHist},
      topproducts:{path:"/api/topproducts",render:renderTopProducts},
      opportunities:{path:"/api/opportunities",render:renderOpportunities},
      entity:{path:"/api/entity",render:renderEntity},
      rankdist:{path:"/api/rankdist",render:renderRankDist},
      gap:{path:"/api/gap",render:renderGap},
      cannibal:{path:"/api/cannibal",render:renderCannibal},
      decay:{path:"/api/decay",render:renderDecay},
      home:{path:"/api/home",render:renderHome},
      pricing:{path:"/api/pricing",render:renderPricing},
      crosscannibal:{path:"/api/cross-cannibal",render:renderCrossCannibal},
      catalog:{path:"/api/catalog",render:renderCatalog},
      enrich:{static:true,render:()=>{}},
      barcodes:{static:true,render:()=>{}},
      summary:{path:"/api/summary",render:renderSummary},
      monthlyusers:{path:"/api/monthlyusers",render:renderMonthlyUsers},
      snapshots:{path:"/api/snapshot-history",render:renderSnapshots},
      content:{path:"/api/content",render:renderContent},
      pageperf:{path:"/api/pageperf",render:renderPagePerf},
      orgpotential:{path:"/api/orgpotential",render:renderOrgPotential},
      spider:{static:true,render:()=>{}},
      gupdates:{path:"/api/volatility",render:renderGUpdates},
      textanalysis:{static:true,render:()=>{}},
    };
    // ---- Grouped navigation: 6 rich screens, each loads several endpoints ----
    const GROUPS = {
      home: ["home"],
      decisions: ["opportunities", "insights"],
      performance: ["summary", "monthlyusers", "overview", "periods", "trends", "realtime", "goals", "snapshots"],
      commerce: ["sales", "ads", "woo", "topproducts", "woocust", "orderhist", "merchant", "pricing"],
      keywords: ["search", "ranks", "rankdist", "orgpotential", "gap", "cannibal", "crosscannibal"],
      content: ["pages", "pageperf", "content", "entity", "decay"],
      audience: ["traffic", "audience", "analyses", "retention", "events"],
      tools: ["catalog", "enrich", "barcodes", "spider", "textanalysis", "gupdates", "health"],
      compare: ["compare"],
    };
    const DOM_ORDER = ["home","opportunities","insights","summary","monthlyusers","snapshots","overview","trends","realtime","goals","sales","ads","woo","topproducts","woocust","orderhist","merchant","pricing","traffic","audience","analyses","retention","events","ranks","rankdist","content","pageperf","orgpotential","gap","cannibal","decay","crosscannibal","catalog","enrich","barcodes","spider","search","pages","entity","textanalysis","gupdates","health","compare"];

    async function loadPart(name, force) {
      const t = PARTS[name], key = cacheKey();
      if (t.static) { t.render(); return; } // client-only tool, no backend fetch
      if (!force && cache[name] && cache[name].key === key) { t.render(cache[name].data); return; }
      try {
        const data = await api(t.path); cache[name] = { key, data }; t.render(data);
        document.getElementById("updatedAt").textContent = "עודכן: " + new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
      } catch (err) { if (err.message && err.message.includes("forbidden")) return; setStatus("שגיאה: " + err.message, "error"); }
    }
    const SECTION_TITLES = { home:"🏠 בית", pricing:"💸 תחרותיות מחירים", crosscannibal:"🥊 קניבליזציה בין המותגים", catalog:"🩺 בריאות קטלוג", enrich:"✍️ מחולל תוכן", barcodes:"🔢 הצלבת ברקודים", opportunities:"🎯 הזדמנויות השבוע", insights:"💡 תובנות", summary:"📋 סיכום מנהלים", monthlyusers:"👥 משתמשים חודשי", snapshots:"🗄️ נתונים שמורים", overview:"📈 סקירה", trends:"📉 מגמות", realtime:"⏱️ זמן אמת", goals:"🎯 יעדים", sales:"💰 מכירות", ads:"📣 פרסום (ROAS)", woo:"🛍️ חנות (WooCommerce)", topproducts:"🏆 מוצרים מובילים", woocust:"👤 לקוחות", orderhist:"📜 היסטוריית הזמנות", merchant:"🛒 Merchant Center", traffic:"🚦 מקורות תנועה", audience:"🌍 קהל", analyses:"🗓️ ניתוחים", retention:"🔁 Retention", events:"🔔 אירועים", search:"🔍 חיפוש", pages:"📄 דפים מובילים", health:"🩺 בריאות האתר", ranks:"📈 מעקב מיקומים", rankdist:"📊 פיזור דירוג", content:"📈 ביצועי תוכן", pageperf:"📑 ביצועי עמודים", orgpotential:"🚀 פוטנציאל אורגני", gap:"🔋 פערי מילים", cannibal:"⚔️ קניבליזציה", decay:"🍂 שחיקת תוכן", spider:"🕷️ Spider Goggles", gupdates:"🌦️ עדכוני גוגל", entity:"🏆 סמכות מותג", textanalysis:"📝 ניתוח טקסט", compare:"📊 השוואת אתרים" };
    const SOURCES = {
      ga4:      { label: "Google Analytics", color: "#E37400", emoji: "📈" },
      gsc:      { label: "Search Console",   color: "#1a73e8", emoji: "🔍" },
      woo:      { label: "WooCommerce",      color: "#7f54b3", emoji: "🛍️" },
      merchant: { label: "Merchant Center",  color: "#4285f4", emoji: "🛒" },
      ads:      { label: "Google Ads",       color: "#34a853", emoji: "📣" },
      store:    { label: "מאגר ההזמנות",      color: "#10b981", emoji: "🗄️" },
      tool:     { label: "כלי",               color: "#64748b", emoji: "🧰" },
      mixed:    { label: "משולב",             color: "#7c3aed", emoji: "✨" },
    };
    const SCREEN_SRC = {
      overview: "ga4", trends: "ga4", realtime: "ga4", periods: "ga4", goals: "ga4", monthlyusers: "ga4", traffic: "ga4", audience: "ga4", analyses: "ga4", retention: "ga4", events: "ga4",
      summary: "mixed", insights: "mixed", opportunities: "mixed", compare: "mixed", home: "mixed",
      pricing: "merchant", crosscannibal: "gsc", catalog: "woo", enrich: "woo", barcodes: "woo",
      search: "gsc", ranks: "gsc", rankdist: "gsc", pages: "gsc", pageperf: "gsc", orgpotential: "gsc", gap: "gsc", cannibal: "gsc", decay: "gsc", content: "gsc", entity: "gsc", gupdates: "gsc", health: "gsc",
      woo: "woo", woocust: "woo", topproducts: "woo", sales: "woo",
      ads: "ads", merchant: "merchant", orderhist: "store", snapshots: "store", spider: "tool", textanalysis: "tool",
    };
    async function loadGroup(group, force) {
      document.getElementById("loadingBar").classList.add("loading");
      setStatus("טוען נתונים...", "info");
      await Promise.all(GROUPS[group].map((n) => loadPart(n, force)));
      setStatus("", null); hideLogin();
      abbreviateKpis();
      document.getElementById("loadingBar").classList.remove("loading");
    }
    function buildSubnav(members) {
      const nav = document.getElementById("subnav");
      if (members.length <= 1) { nav.innerHTML = ""; nav.classList.add("hidden"); return; }
      nav.classList.remove("hidden");
      nav.innerHTML = members.map((n) => `<button class="jump-btn text-xs px-3 py-1 rounded-full bg-slate-100 hover:bg-blue-100 text-slate-600" data-jump="${n}">${SECTION_TITLES[n] || n}</button>`).join("");
      nav.querySelectorAll(".jump-btn").forEach((b) => b.addEventListener("click", () => { const s = document.querySelector(`[data-screen="${b.dataset.jump}"]`); if (s) s.scrollIntoView({ behavior: "smooth", block: "start" }); }));
    }
    function showGroup(group) {
      if (!GROUPS[group]) group = "home"; // fallback if saved group no longer exists
      currentGroup = group;
      localStorage.setItem("dashGroup", group);
      const members = GROUPS[group];
      document.querySelectorAll("[data-screen]").forEach((s) => {
        const show = members.includes(s.dataset.screen);
        s.classList.toggle("hidden", !show);
        if (show && !s.querySelector(".sec-title")) {
          const brand = SOURCES[SCREEN_SRC[s.dataset.screen] || "mixed"] || SOURCES.mixed;
          const h = document.createElement("div");
          h.className = "sec-title text-lg font-bold text-slate-700 mt-2 mb-2 pb-1 border-b border-slate-200 flex items-center flex-wrap";
          h.style.borderInlineStart = `4px solid ${brand.color}`;
          h.style.paddingInlineStart = ".6rem";
          h.innerHTML = `<span>${SECTION_TITLES[s.dataset.screen] || ""}</span><span class="sec-src" style="background:${brand.color}22;color:${brand.color}">${brand.emoji} ${brand.label}</span>`;
          if (members.length > 1) s.insertBefore(h, s.firstChild);
        }
      });
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.group === group));
      buildSubnav(members);
      window.scrollTo({ top: 0, behavior: "smooth" });
      loadGroup(group);
    }
    const reloadGroup = () => { Object.keys(cache).forEach((k) => delete cache[k]); alertsKey = ""; loadGroup(currentGroup, true); };

    document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => showGroup(b.dataset.group)));
    function setActiveRange(r) { currentRange = r; customStart = customEnd = null; localStorage.setItem("dashRange", r); document.querySelectorAll(".range-btn").forEach((b)=>b.classList.toggle("active", b.dataset.range===r)); }
    document.querySelectorAll(".range-btn[data-range]").forEach((b)=>b.addEventListener("click",()=>{ setActiveRange(b.dataset.range); reloadGroup(); }));
    // Calendar-month quick buttons (this month / last month)
    document.querySelectorAll(".range-btn[data-month]").forEach((b)=>b.addEventListener("click",()=>{
      const pad=(n)=>String(n).padStart(2,"0"), now=new Date(), y=now.getFullYear(), m=now.getMonth();
      let s,e;
      if(b.dataset.month==="this"){ s=`${y}-${pad(m+1)}-01`; e=`${y}-${pad(m+1)}-${pad(now.getDate())}`; }
      else{ const ly=m===0?y-1:y, lm=m===0?11:m-1, dim=new Date(ly,lm+1,0).getDate(); s=`${ly}-${pad(lm+1)}-01`; e=`${ly}-${pad(lm+1)}-${pad(dim)}`; }
      customStart=s; customEnd=e; currentRange="";
      document.querySelectorAll(".range-btn").forEach((x)=>x.classList.remove("active")); b.classList.add("active");
      reloadGroup();
    }));
    document.getElementById("applyDates").addEventListener("click", () => {
      const s = document.getElementById("dateStart").value, e = document.getElementById("dateEnd").value;
      if (!s || !e) { setStatus("יש לבחור תאריך התחלה וסיום","error"); return; }
      if (s > e) { setStatus("תאריך ההתחלה מאוחר מהסיום","error"); return; }
      customStart = s; customEnd = e; document.querySelectorAll(".range-btn").forEach((b)=>b.classList.remove("active")); reloadGroup();
    });
    document.getElementById("siteSelect").addEventListener("change", () => { localStorage.setItem("dashSite", document.getElementById("siteSelect").value); reloadGroup(); });
    document.getElementById("refreshBtn").addEventListener("click", reloadGroup);
    document.getElementById("cmpApply").addEventListener("click", () => {
      const s = document.getElementById("cmpStart").value, e = document.getElementById("cmpEnd").value;
      if (!s || !e) { setStatus("לבחירת השוואה — מלאי תאריך התחלה וסיום", "error"); return; }
      cmpStart = s; cmpEnd = e; reloadGroup();
    });
    document.getElementById("cmpClear").addEventListener("click", () => {
      cmpStart = cmpEnd = null; document.getElementById("cmpStart").value = ""; document.getElementById("cmpEnd").value = ""; reloadGroup();
    });

    // Reorder sections into the grouped order, keep footer last
    DOM_ORDER.forEach((n) => { const s = document.querySelector(`[data-screen="${n}"]`); if (s) document.body.appendChild(s); });
    const _footer = document.querySelector(".mt-6.text-xs"); if (_footer) document.body.appendChild(_footer);

    // ---- War Room mode ----
    let warTimer = null;
    async function warTick() {
      const site = document.getElementById("siteSelect").value;
      const pad2 = (n) => String(n).padStart(2, "0");
      const now = new Date();
      const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
      const hdr = { headers: { "X-Access-Key": accessKey } };
      try {
        const rt = await (await fetch(`${BASE}/api/realtime?site=${site}`, hdr)).json();
        document.getElementById("wrActive").textContent = fmt(rt.active);
      } catch (e) {}
      try {
        const ov = await (await fetch(`${BASE}/api/data?site=${site}&start=${today}&end=${today}`, hdr)).json();
        document.getElementById("wrSessions").textContent = fmt(ov.analytics?.sessions);
      } catch (e) {}
      try {
        const ec = await (await fetch(`${BASE}/api/ecommerce?site=${site}&start=${today}&end=${today}`, hdr)).json();
        document.getElementById("wrRevenue").textContent = fmt(ec.revenue);
        document.getElementById("wrTx").textContent = fmt(ec.transactions);
      } catch (e) {}
      document.getElementById("wrTime").textContent = new Date().toLocaleTimeString("he-IL");
      document.getElementById("wrSite").textContent = site + ".co.il";
    }
    function openWarRoom() {
      const el = document.getElementById("warRoom");
      el.classList.remove("hidden"); el.classList.add("flex");
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      warTick(); warTimer = setInterval(warTick, 20000);
    }
    function closeWarRoom() {
      const el = document.getElementById("warRoom");
      el.classList.add("hidden"); el.classList.remove("flex");
      clearInterval(warTimer); warTimer = null;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
    document.getElementById("warRoomBtn").addEventListener("click", openWarRoom);
    document.getElementById("warRoomClose").addEventListener("click", closeWarRoom);
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && warTimer) closeWarRoom(); });

    // Dark mode
    const darkBtn = document.getElementById("darkBtn");
    function setDark(on) { document.body.classList.toggle("dark", on); darkBtn.textContent = on ? "☀️" : "🌙"; localStorage.setItem("dashDark", on ? "1" : "0"); }
    darkBtn.addEventListener("click", () => setDark(!document.body.classList.contains("dark")));
    if (localStorage.getItem("dashDark") === "1") setDark(true);

    // Restore saved selections
    const savedSite = localStorage.getItem("dashSite"); if (savedSite) document.getElementById("siteSelect").value = savedSite;
    const savedRange = localStorage.getItem("dashRange") || "30d";
    // ---- Alerts bell (central hub for opportunities/warnings/errors) ----
    function renderAlerts(d) {
      const ins = d.insights || [], C = d.counts || {};
      const urgent = (C.bad || 0) + (C.warn || 0);
      const badge = document.getElementById("bellBadge");
      if (urgent > 0) { badge.textContent = urgent; badge.classList.remove("hidden"); } else badge.classList.add("hidden");
      document.getElementById("bellSummary").innerHTML =
        `<div class="card !py-1.5 flex items-center gap-1"><span>🔴</span><b class="text-rose-600">${C.bad||0}</b><span class="text-xs text-slate-500">דחוף</span></div>` +
        `<div class="card !py-1.5 flex items-center gap-1"><span>🟡</span><b class="text-amber-500">${C.warn||0}</b><span class="text-xs text-slate-500">הזדמנויות</span></div>` +
        `<div class="card !py-1.5 flex items-center gap-1"><span>🟢</span><b class="text-emerald-600">${C.good||0}</b><span class="text-xs text-slate-500">חוזקות</span></div>`;
      const ST = { bad:{b:"border-rose-400",bg:"bg-rose-50",i:"🔴"}, warn:{b:"border-amber-400",bg:"bg-amber-50",i:"🟡"}, good:{b:"border-emerald-400",bg:"bg-emerald-50",i:"🟢"} };
      document.getElementById("bellList").innerHTML = ins.map((x) => { const s = ST[x.level] || ST.warn;
        return `<div class="card !p-3 border-r-4 ${s.b} ${s.bg}"><div class="font-bold text-sm text-slate-800 mb-1">${s.i} ${x.title}</div><div class="text-xs text-slate-600">💡 ${x.rec}</div></div>`; }).join("")
        || `<div class="text-slate-400 text-sm">אין התראות כרגע</div>`;
      document.getElementById("bellStatus").textContent = "";
    }
    let alertsKey = "";
    async function loadAlerts(force) {
      if (userRole === "viewer") return; // CEO role has no access to alerts data
      const key = cacheKey();
      if (!force && alertsKey === key) return;
      alertsKey = key;
      document.getElementById("bellStatus").textContent = "טוען התראות...";
      try { const d = await api("/api/insights"); renderAlerts(d); } catch (e) { document.getElementById("bellStatus").textContent = ""; }
    }
    document.getElementById("bellBtn").addEventListener("click", () => { document.getElementById("bellPanel").classList.remove("hidden"); loadAlerts(false); });
    document.getElementById("bellClose").addEventListener("click", () => document.getElementById("bellPanel").classList.add("hidden"));
    document.getElementById("bellBackdrop").addEventListener("click", () => document.getElementById("bellPanel").classList.add("hidden"));

    setActiveRange(savedRange); applyRole().finally(() => showGroup(currentGroup));
    // Load alerts in the background so the badge appears without opening the panel
    setTimeout(() => loadAlerts(false), 2000);
    setInterval(() => { if (GROUPS[currentGroup] && GROUPS[currentGroup].includes("realtime") && !document.hidden) loadPart("realtime", true); }, 20000);
    setInterval(() => { if (currentGroup === "compare" && !document.hidden) loadLiveSites(); }, 20000);
    setInterval(() => { if (currentGroup === "home" && !document.hidden) loadPart("home", true); }, 60000);
