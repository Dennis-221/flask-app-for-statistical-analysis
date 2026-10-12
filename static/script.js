// const dropzone = document.getElementById("dropzone");
// const fileInput = document.getElementById("fileInput");
// const dropzoneIdle = document.getElementById("dropzoneIdle");
// const dropzoneLoading = document.getElementById("dropzoneLoading");
// const errorMessage = document.getElementById("errorMessage");
// const result = document.getElementById("result");
// const resultFilename = document.getElementById("resultFilename");
// const statColumns = document.getElementById("statColumns");
// const statRows = document.getElementById("statRows");
// const previewHead = document.getElementById("previewHead");
// const previewBody = document.getElementById("previewBody");
// const tableNote = document.getElementById("tableNote");
// const resetBtn = document.getElementById("resetBtn");
//
// function showError(message) {
//   errorMessage.textContent = message;
//   errorMessage.hidden = false;
// }
//
// function clearError() {
//   errorMessage.hidden = true;
//   errorMessage.textContent = "";
// }
//
// function setLoading(isLoading) {
//   dropzoneIdle.hidden = isLoading;
//   dropzoneLoading.hidden = !isLoading;
// }
//
// function resetView() {
//   result.hidden = true;
//   dropzone.hidden = false;
//   clearError();
//   fileInput.value = "";
// }
//
// function renderResult(data) {
//   resultFilename.textContent = data.filename;
//   statColumns.textContent = data.columns.length;
//   statRows.textContent = data.row_count;
//
//   previewHead.innerHTML = "";
//   const headRow = document.createElement("tr");
//   data.columns.forEach((col) => {
//     const th = document.createElement("th");
//     th.textContent = col;
//     headRow.appendChild(th);
//   });
//   previewHead.appendChild(headRow);
//
//   previewBody.innerHTML = "";
//   data.preview.forEach((row) => {
//     const tr = document.createElement("tr");
//     row.forEach((cell) => {
//       const td = document.createElement("td");
//       td.textContent = cell;
//       tr.appendChild(td);
//     });
//     previewBody.appendChild(tr);
//   });
//
//   const shown = data.preview.length;
//   tableNote.textContent =
//     shown < data.row_count
//       ? `showing first ${shown} of ${data.row_count} rows`
//       : `showing all ${data.row_count} rows`;
//
//   dropzone.hidden = true;
//   result.hidden = false;
// }
//
// async function uploadFile(file) {
//   clearError();
//
//   if (!file.name.toLowerCase().endsWith(".csv")) {
//     showError("Only .csv files are accepted.");
//     return;
//   }
//
//   setLoading(true);
//
//   const formData = new FormData();
//   formData.append("file", file);
//
//   try {
//     const response = await fetch("/upload", {
//       method: "POST",
//       body: formData,
//     });
//     const data = await response.json();
//
//     if (!response.ok) {
//       showError(data.error || "Something went wrong reading that file.");
//       return;
//     }
//
//     renderResult(data);
//   } catch (err) {
//     showError("Could not reach the server. Try again.");
//   } finally {
//     setLoading(false);
//   }
// }
//
// dropzone.addEventListener("click", () => fileInput.click());
//
// dropzone.addEventListener("keydown", (e) => {
//   if (e.key === "Enter" || e.key === " ") {
//     e.preventDefault();
//     fileInput.click();
//   }
// });
//
// fileInput.addEventListener("change", () => {
//   if (fileInput.files.length > 0) {
//     uploadFile(fileInput.files[0]);
//   }
// });
//
// ["dragenter", "dragover"].forEach((eventName) => {
//   dropzone.addEventListener(eventName, (e) => {
//     e.preventDefault();
//     dropzone.classList.add("is-dragover");
//   });
// });
//
// ["dragleave", "drop"].forEach((eventName) => {
//   dropzone.addEventListener(eventName, (e) => {
//     e.preventDefault();
//     dropzone.classList.remove("is-dragover");
//   });
// });
//
// dropzone.addEventListener("drop", (e) => {
//   const file = e.dataTransfer.files[0];
//   if (file) {
//     uploadFile(file);
//   }
// });
//
// resetBtn.addEventListener("click", resetView);

// ============================================================
// Section 01 — Upload  (existing elements)
// ============================================================
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const dropzoneIdle = document.getElementById("dropzoneIdle");
const dropzoneLoading = document.getElementById("dropzoneLoading");
const errorMessage = document.getElementById("errorMessage");
const result = document.getElementById("result");
const resultFilename = document.getElementById("resultFilename");
const statColumns = document.getElementById("statColumns");
const statRows = document.getElementById("statRows");
const statMissing = document.getElementById("statMissing");
const statDuplicates = document.getElementById("statDuplicates");
const legend = document.getElementById("legend");
const previewHead = document.getElementById("previewHead");
const previewBody = document.getElementById("previewBody");
const tableNote = document.getElementById("tableNote");
const resetBtn = document.getElementById("resetBtn");

// NEW: track the uploaded filename separately, since /clean's response
// doesn't repeat it but we still want to display it after re-rendering.
let currentFilename = "";

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function clearError(el) {
  el.hidden = true;
  el.textContent = "";
}

function setLoading(isLoading) {
  dropzoneIdle.hidden = isLoading;
  dropzoneLoading.hidden = !isLoading;
}

// NEW: lock/unlock a downstream pipeline section (Clean / Stats / Plots)
function setSectionLocked(sectionEl, buttonEl, locked) {
  sectionEl.classList.toggle("is-locked", locked);
  buttonEl.disabled = locked;
}

function resetView() {
  result.hidden = true;
  dropzone.hidden = false;
  clearError(errorMessage);
  fileInput.value = "";
  currentFilename = "";

  // NEW: re-lock and clear the downstream sections
  setSectionLocked(cleanSectionWrap, cleanBtn, true);
  setSectionLocked(statsSectionWrap, statsBtn, true);
  setSectionLocked(plotsSectionWrap, plotsBtn, true);

  cleanResult.hidden = true;
  clearError(cleanError);

  featureCheckboxes.innerHTML = '<p class="feature-picker__empty">Upload a CSV to see numeric columns here.</p>';
  statsTableWrap.hidden = true;
  clearError(statsError);

  plotsResult.hidden = true;
  clearError(plotsError);
}

function renderPreviewSection(data) {
  resultFilename.textContent = currentFilename;
  statColumns.textContent = data.columns.length;
  statRows.textContent = data.row_count;
  statMissing.textContent = data.missing_row_count;
  statDuplicates.textContent = data.duplicate_row_count;

  previewHead.innerHTML = "";
  const headRow = document.createElement("tr");
  const numTh = document.createElement("th");
  numTh.textContent = "#";
  headRow.appendChild(numTh);
  data.columns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col;
    headRow.appendChild(th);
  });
  previewHead.appendChild(headRow);

  previewBody.innerHTML = "";
  data.preview.forEach((row) => {
    const tr = document.createElement("tr");
    if (row.is_missing) tr.classList.add("row-missing");
    if (row.is_duplicate) tr.classList.add("row-duplicate");

    const numTd = document.createElement("td");
    numTd.textContent = row.row_number;
    numTd.classList.add("row-num");
    tr.appendChild(numTd);

    row.cells.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    previewBody.appendChild(tr);
  });

  legend.hidden = !(data.missing_row_count > 0 || data.duplicate_row_count > 0);

  const shown = data.preview.length;
  tableNote.textContent =
    shown < data.row_count
      ? `showing first ${shown} of ${data.row_count} rows`
      : `showing all ${data.row_count} rows`;

  dropzone.hidden = true;
  result.hidden = false;
}

async function uploadFile(file) {
  clearError(errorMessage);

  if (!file.name.toLowerCase().endsWith(".csv")) {
    showError(errorMessage, "Only .csv files are accepted.");
    return;
  }

  setLoading(true);

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("/upload", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();

    if (!response.ok) {
      showError(errorMessage, data.error || "Something went wrong reading that file.");
      return;
    }

    currentFilename = data.filename;
    renderPreviewSection(data);

    // NEW: unlock Clean / Stats / Plots now that a dataset is loaded
    setSectionLocked(cleanSectionWrap, cleanBtn, false);
    setSectionLocked(statsSectionWrap, statsBtn, false);
    setSectionLocked(plotsSectionWrap, plotsBtn, false);
    renderFeatureCheckboxes(data.numeric_columns);
  } catch (err) {
    showError(errorMessage, "Could not reach the server. Try again.");
  } finally {
    setLoading(false);
  }
}

dropzone.addEventListener("click", () => fileInput.click());

dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) {
    uploadFile(fileInput.files[0]);
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropzone.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
  });
});

dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) {
    uploadFile(file);
  }
});

resetBtn.addEventListener("click", resetView);


// ============================================================
// NEW — Section 02: Clean data (remove duplicates, fill missing)
// ============================================================
const cleanSectionWrap = document.getElementById("cleanSectionWrap");
const cleanBtn = document.getElementById("cleanBtn");
const cleanError = document.getElementById("cleanError");
const cleanResult = document.getElementById("cleanResult");
const cleanDuplicatesRemoved = document.getElementById("cleanDuplicatesRemoved");
const cleanMissingHandled = document.getElementById("cleanMissingHandled");
const cleanRowNote = document.getElementById("cleanRowNote");

cleanBtn.addEventListener("click", async () => {
  clearError(cleanError);
  cleanBtn.classList.add("is-loading");
  cleanBtn.disabled = true;

  try {
    const response = await fetch("/clean", { method: "POST" });
    const data = await response.json();

    if (!response.ok) {
      showError(cleanError, data.error || "Could not clean the dataset.");
      return;
    }

    cleanDuplicatesRemoved.textContent = data.duplicates_removed;
    cleanMissingHandled.textContent = data.missing_values_handled;
    cleanRowNote.textContent = `${data.rows_before} rows before cleaning → ${data.rows_after} rows after`;
    cleanResult.hidden = false;

    // Reflect the cleaned dataset back in the Section 01 preview + stats,
    // and refresh the numeric column checkboxes in case dtypes changed.
    renderPreviewSection(data);
    renderFeatureCheckboxes(data.numeric_columns);
  } catch (err) {
    showError(cleanError, "Could not reach the server. Try again.");
  } finally {
    cleanBtn.classList.remove("is-loading");
    cleanBtn.disabled = false;
  }
});


// ============================================================
// NEW — Section 03: Statistical analysis
// ============================================================
const statsSectionWrap = document.getElementById("statsSectionWrap");
const featureCheckboxes = document.getElementById("featureCheckboxes");
const selectAllBtn = document.getElementById("selectAllBtn");
const selectNoneBtn = document.getElementById("selectNoneBtn");
const statsBtn = document.getElementById("statsBtn");
const statsError = document.getElementById("statsError");
const statsTableWrap = document.getElementById("statsTableWrap");
const statsHead = document.getElementById("statsHead");
const statsBody = document.getElementById("statsBody");

const STAT_ROWS = [
  ["count", "Count"],
  ["mean", "Mean"],
  ["std", "Std Dev"],
  ["min", "Min"],
  ["max", "Max"],
  ["q1", "Q1"],
  ["median", "Median (Q2)"],
  ["q3", "Q3"],
  ["iqr", "IQR"],
];


function renderFeatureCheckboxes(numericColumns) {
  featureCheckboxes.innerHTML = "";

  if (!numericColumns || numericColumns.length === 0) {
    featureCheckboxes.innerHTML = '<p class="feature-picker__empty">No numeric columns found in this dataset.</p>';
    return;
  }

  numericColumns.forEach((col) => {
    const label = document.createElement("label");
    label.className = "feature-checkbox";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = col;
    input.checked = true;

    label.appendChild(input);
    label.appendChild(document.createTextNode(col));
    featureCheckboxes.appendChild(label);
  });
}

function getSelectedFeatures() {
  return Array.from(featureCheckboxes.querySelectorAll("input[type=checkbox]:checked")).map(
    (el) => el.value
  );
}

selectAllBtn.addEventListener("click", () => {
  featureCheckboxes.querySelectorAll("input[type=checkbox]").forEach((el) => (el.checked = true));
});

selectNoneBtn.addEventListener("click", () => {
  featureCheckboxes.querySelectorAll("input[type=checkbox]").forEach((el) => (el.checked = false));
});

statsBtn.addEventListener("click", async () => {
  clearError(statsError);
  const columns = getSelectedFeatures();

  if (columns.length === 0) {
    showError(statsError, "Select at least one numeric column.");
    return;
  }

  statsBtn.classList.add("is-loading");
  statsBtn.disabled = true;

  try {
    const response = await fetch("/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columns }),
    });
    const data = await response.json();

    if (!response.ok) {
      showError(statsError, data.error || "Could not compute statistics.");
      return;
    }

    renderStatsTable(data.stats);
  } catch (err) {
    showError(statsError, "Could not reach the server. Try again.");
  } finally {
    statsBtn.classList.remove("is-loading");
    statsBtn.disabled = false;
  }
});

function renderStatsTable(stats) {
  const columns = Object.keys(stats);

  // TRANSPOSED: features are now rows, metrics are now columns
  statsHead.innerHTML = "";
  const headRow = document.createElement("tr");
  const featureTh = document.createElement("th");
  featureTh.textContent = "feature";
  headRow.appendChild(featureTh);
  STAT_ROWS.forEach(([key, label]) => {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.appendChild(th);
  });
  statsHead.appendChild(headRow);

  statsBody.innerHTML = "";
  columns.forEach((col) => {
    const tr = document.createElement("tr");
    const labelTd = document.createElement("td");
    labelTd.textContent = col;
    tr.appendChild(labelTd);

    STAT_ROWS.forEach(([key]) => {
      const td = document.createElement("td");
      td.textContent = stats[col][key];
      tr.appendChild(td);
    });
    statsBody.appendChild(tr);
  });

  statsTableWrap.hidden = false;
}

// ============================================================
// NEW — Section 04: Visualizations (histogram / box plot / correlation)
// ============================================================
const plotsSectionWrap = document.getElementById("plotsSectionWrap");
const plotsBtn = document.getElementById("plotsBtn");
const plotsError = document.getElementById("plotsError");
const plotsResult = document.getElementById("plotsResult");
const histogramImg = document.getElementById("histogramImg");
const boxplotImg = document.getElementById("boxplotImg");
const correlationCard = document.getElementById("correlationCard");
const correlationImg = document.getElementById("correlationImg");
const correlationNote = document.getElementById("correlationNote");

plotsBtn.addEventListener("click", async () => {
  clearError(plotsError);
  plotsBtn.classList.add("is-loading");
  plotsBtn.disabled = true;

  try {
    const response = await fetch("/plots", { method: "POST" });
    const data = await response.json();

    if (!response.ok) {
      showError(plotsError, data.error || "Could not generate plots.");
      return;
    }

    histogramImg.src = data.histogram;
    boxplotImg.src = data.boxplot;

    if (data.correlation_matrix) {
      correlationImg.hidden = false;
      correlationImg.src = data.correlation_matrix;
      correlationNote.hidden = true;
    } else {
      correlationImg.hidden = true;
      correlationNote.hidden = false;
    }

    plotsResult.hidden = false;
  } catch (err) {
    showError(plotsError, "Could not reach the server. Try again.");
  } finally {
    plotsBtn.classList.remove("is-loading");
    plotsBtn.disabled = false;
  }
});