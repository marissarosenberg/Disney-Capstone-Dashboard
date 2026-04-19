const scenarioFiles = {};
let trendChart = null;
let comparisonChart = null;

const comparisonMetricConfig = {
  revenue_final: { label: "2028 Revenue ($mm)", type: "money" },
  ebitda_final: { label: "2028 EBITDA ($mm)", type: "money" },
  cfo_final: { label: "2028 Cash from Operations ($mm)", type: "money" },
  min_cash_over_horizon: { label: "Minimum Cash ($mm)", type: "money" },
  ending_revolver_final: { label: "2028 Ending Revolver ($mm)", type: "money" },
  peak_net_debt_to_ebitda: { label: "Peak Net Debt / EBITDA (x)", type: "multiple" }
};

async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Could not load ${path}`);
  }
  return await response.json();
}

function formatMoney(x) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "";
  return `$${Number(x).toLocaleString(undefined, { maximumFractionDigits: 0 })} mm`;
}

function formatMoneyPrecise(x) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "";
  return `$${Number(x).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} mm`;
}

function formatMultiple(x) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "";
  return `${Number(x).toFixed(2)}x`;
}

function formatDiag(x) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "";
  return Number(x).toExponential(2);
}

function formatCellValue(metricType, value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  if (metricType === "multiple") return Number(value).toFixed(2);
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function buildScenarioFileMap(summaryRows) {
  summaryRows.forEach(row => {
    scenarioFiles[row.scenario] = `data/${row.scenario}_forecast.json`;
  });
}

function renderRunMeta(runRow) {
  const el = document.getElementById("runMeta");
  el.innerHTML = `
    <div><strong>Scenario:</strong> ${runRow.scenario_label}</div>
    <div><strong>Run ID:</strong> ${runRow.run_id}</div>
    <div><strong>Run Timestamp:</strong> ${runRow.run_timestamp}</div>
    <div><strong>Model Version:</strong> ${runRow.model_version}</div>
    <div><strong>Data Version:</strong> ${runRow.data_version}</div>
  `;
}

function renderCards(summary) {
  const container = document.getElementById("kpiCards");
  container.innerHTML = `
    <div class="card"><h3>2028 Revenue</h3><p>${formatMoney(summary.revenue_final)}</p></div>
    <div class="card"><h3>2028 EBITDA</h3><p>${formatMoney(summary.ebitda_final)}</p></div>
    <div class="card"><h3>2028 CFO</h3><p>${formatMoney(summary.cfo_final)}</p></div>
    <div class="card"><h3>Minimum Cash</h3><p>${formatMoney(summary.min_cash_over_horizon)}</p></div>
    <div class="card"><h3>Ending Revolver</h3><p>${formatMoney(summary.ending_revolver_final)}</p></div>
    <div class="card"><h3>Peak Net Debt / EBITDA</h3><p>${formatMultiple(summary.peak_net_debt_to_ebitda)}</p></div>
  `;
}

function renderDiagnostics(runRow) {
  const el = document.getElementById("diagnosticsBox");
  const statusClass = runRow.hard_pass ? "status-pass" : "status-fail";
  const statusLabel = runRow.hard_pass ? "PASS" : "FAIL";

  el.innerHTML = `
    <div class="audit-status-wrap">
      <h3 class="audit-status-title">Audit Status</h3>
      <span class="${statusClass}">${statusLabel}</span>
    </div>

    <div class="diag-row"><strong>Run Status:</strong> ${runRow.status}</div>
    <div class="diag-row"><strong>Hard Pass:</strong> ${runRow.hard_pass}</div>
    <div class="diag-row"><strong>Max Balance Error:</strong> ${formatDiag(runRow.max_balance_error)}</div>
    <div class="diag-row"><strong>Max Cash Recon Error:</strong> ${formatDiag(runRow.max_cash_recon_error)}</div>
    <div class="diag-row"><strong>Assumption Set:</strong> ${runRow.assumption_set_version}</div>
    <div class="diag-row"><strong>Environment:</strong> ${runRow.environment_ref}</div>
    <div class="diag-row"><strong>Notes:</strong> ${runRow.notes}</div>
    <div class="small-note">
      Dashboard values are read from exported JSON files and are not manually editable.
    </div>
  `;
}

function renderForecastTable(rows) {
  const el = document.getElementById("forecastTable");

  const headers = [
    { key: "Year", label: "Year" },
    { key: "Revenue", label: "Revenue" },
    { key: "EBITDA", label: "EBITDA" },
    { key: "NetIncome", label: "Net Income" },
    { key: "Cash_End", label: "Ending Cash" },
    { key: "NetDebt_to_EBITDA", label: "Net Debt / EBITDA" },
    { key: "DiagnosticStatus", label: "Diagnostic Status" }
  ];

  const headHtml = headers.map(h => `<th>${h.label}</th>`).join("");

  const bodyHtml = rows.map(r => `
    <tr>
      <td>${r.Year}</td>
      <td>${formatMoneyPrecise(r.Revenue)}</td>
      <td>${formatMoneyPrecise(r.EBITDA)}</td>
      <td>${formatMoneyPrecise(r.NetIncome)}</td>
      <td>${formatMoneyPrecise(r.Cash_End)}</td>
      <td>${formatMultiple(r.NetDebt_to_EBITDA)}</td>
      <td>${r.DiagnosticStatus ?? ""}</td>
    </tr>
  `).join("");

  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;
}

function renderComparisonTable(rows) {
  const el = document.getElementById("comparisonTable");

  if (!rows.length) {
    el.innerHTML = "<p>No comparison data available.</p>";
    return;
  }

  const keys = Object.keys(rows[0]);
  const headHtml = keys.map(h => `<th>${h}</th>`).join("");

  const bodyHtml = rows.map(row => {
    const metricName = row["Metric"];
    const isMultipleRow = metricName === "Peak Net Debt / EBITDA (x)";

    const cells = keys.map(k => {
      const val = row[k];
      if (k === "Metric") return `<td>${val ?? ""}</td>`;
      return `<td>${formatCellValue(isMultipleRow ? "multiple" : "money", val)}</td>`;
    }).join("");

    return `<tr>${cells}</tr>`;
  }).join("");

  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;
}

function renderTrendChart(rows, metric, label) {
  const labels = rows.map(r => r.Year);
  const values = rows.map(r => Number(r[metric]));

  if (trendChart) {
    trendChart.destroy();
    trendChart = null;
  }

  const ctx = document.getElementById("trendChart").getContext("2d");

  const metricLabel =
    metric === "Cash_End"
      ? "Ending Cash"
      : metric === "NetDebt_to_EBITDA"
      ? "Net Debt / EBITDA"
      : metric;

  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${label} – ${metricLabel}`,
          data: values,
          borderWidth: 3,
          tension: 0.25,
          pointRadius: 4,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: true
        }
      },
      scales: {
        y: {
          beginAtZero: false
        }
      }
    }
  });
}

function renderComparisonChart(summaryRows, selectedMetricKey) {
  const config = comparisonMetricConfig[selectedMetricKey];
  const labels = summaryRows.map(r => r.scenario_label);
  const values = summaryRows.map(r => Number(r[selectedMetricKey]));

  if (comparisonChart) {
    comparisonChart.destroy();
    comparisonChart = null;
  }

  const ctx = document.getElementById("comparisonChart").getContext("2d");

  comparisonChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: config.label,
          data: values,
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: true
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

async function updateDashboard(summaryRows, runRows, comparisonRows) {
  const scenario = document.getElementById("scenarioSelect").value;
  const metric = document.getElementById("metricSelect").value;
  const comparisonMetric = document.getElementById("comparisonMetricSelect").value;

  const forecastRows = await loadJSON(scenarioFiles[scenario]);
  const summary = summaryRows.find(x => x.scenario === scenario);
  const runRow = runRows.find(x => x.scenario === scenario);

  renderRunMeta(runRow);
  renderCards(summary);
  renderDiagnostics(runRow);
  renderForecastTable(forecastRows);
  renderComparisonTable(comparisonRows);
  renderTrendChart(forecastRows, metric, summary.scenario_label);
  renderComparisonChart(summaryRows, comparisonMetric);
}

async function init() {
  try {
    const summaryRows = await loadJSON("data/scenario_summary.json");
    const runRows = await loadJSON("data/run_manifest.json");
    const comparisonRows = await loadJSON("data/scenario_comparison.json");

    buildScenarioFileMap(summaryRows);

    const scenarioSelect = document.getElementById("scenarioSelect");
    const metricSelect = document.getElementById("metricSelect");
    const comparisonMetricSelect = document.getElementById("comparisonMetricSelect");

    summaryRows.forEach(row => {
      const option = document.createElement("option");
      option.value = row.scenario;
      option.textContent = row.scenario_label;
      scenarioSelect.appendChild(option);
    });

    scenarioSelect.value = summaryRows[0].scenario;
    metricSelect.value = "Revenue";
    comparisonMetricSelect.value = "revenue_final";

    scenarioSelect.addEventListener("change", () => updateDashboard(summaryRows, runRows, comparisonRows));
    metricSelect.addEventListener("change", () => updateDashboard(summaryRows, runRows, comparisonRows));
    comparisonMetricSelect.addEventListener("change", () => updateDashboard(summaryRows, runRows, comparisonRows));

    await updateDashboard(summaryRows, runRows, comparisonRows);
  } catch (err) {
    document.body.innerHTML = `<pre style="padding:20px;">Dashboard load error:\n${err.message}</pre>`;
  }
}

init();