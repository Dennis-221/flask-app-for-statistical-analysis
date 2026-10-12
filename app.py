# import csv
# import io
# import os
# from flask import Flask, render_template, request, jsonify
#
# ALLOWED_EXTENSIONS = {"csv"}
# MAX_PREVIEW_ROWS = 15
#
#
# def allowed_file(filename: str) -> bool:
#     return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
#
# app = Flask(__name__)
#
#
# @app.route("/")
# def index():
#     return render_template('index_main.html')
#
#
# @app.route("/upload", methods=["POST"])
# def upload():
#     if "file" not in request.files:
#         return jsonify({"error": "No file part in the request."}), 400
#
#     file = request.files["file"]
#
#     if file.filename == "":
#         return jsonify({"error": "No file selected."}), 400
#
#     if not allowed_file(file.filename):
#         return jsonify({"error": "Only .csv files are accepted."}), 400
#
#     try:
#         stream = io.StringIO(file.stream.read().decode("utf-8"), newline=None)
#         reader = csv.reader(stream)
#         rows = list(reader)
#     except UnicodeDecodeError:
#         return jsonify({"error": "Could not read file. Make sure it's UTF-8 encoded CSV."}), 400
#
#     if not rows:
#         return jsonify({"error": "The file is empty."}), 400
#
#     header, data_rows = rows[0], rows[1:]
#
#     return jsonify({
#         "filename": file.filename,
#         "columns": header,
#         "row_count": len(data_rows),
#
#         "preview": data_rows[:MAX_PREVIEW_ROWS],
#     })
#
#
# def print_hi(name):
#     # Use a breakpoint in the code line below to debug your script.
#     print(f'Hi, {name}')  # Press F9 to toggle the breakpoint.
#
#
# # Press the green button in the gutter to run the script.
# if __name__ == '__main__':
#     print_hi('PyCharm')
#     app.run(debug=True)
#
#
# # See PyCharm help at https://www.jetbrains.com/help/pycharm/


import os
import time

import matplotlib
matplotlib.use("Agg")  # NEW: headless backend, required for server-side plotting
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

ALLOWED_EXTENSIONS = {"csv"}
MAX_PREVIEW_ROWS = 15
PLOTS_DIR = os.path.join(app.static_folder, "plots")  # NEW: static/plots/

# --- NEW: server-side state -------------------------------------------------
# Holds the single "current" dataset in memory so the Clean / Stats / Plots
# sections can act on it independently after upload, without re-sending the
# file each time. This is fine for local/single-user use; a multi-user
# deployment would swap this for a per-session store (Flask session + a
# server-side cache, or a database) instead of a bare global.
STATE = {"df": None, "filename": None}
# -----------------------------------------------------------------------------


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def require_dataset():
    """Returns (df, error_response). error_response is None if a dataset is loaded."""
    if STATE["df"] is None:
        return None, (jsonify({"error": "Upload a CSV file first."}), 400)
    return STATE["df"], None


def format_cell(value):
    """NEW: display whole-number floats (e.g. from int columns that had NaN
    and got upcast to float64) without a trailing '.0'."""
    if pd.isna(value):
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def dataframe_quality_report(df: pd.DataFrame):
    """Computes missing/duplicate row flags and a JSON-friendly preview."""
    is_missing_row = df.isna().any(axis=1)
    is_duplicate_row = df.duplicated(keep="first")

    missing_row_numbers = [i + 1 for i in df.index[is_missing_row]]
    duplicate_row_numbers = [i + 1 for i in df.index[is_duplicate_row]]

    preview = []
    preview_df = df.head(MAX_PREVIEW_ROWS)
    for pos, (idx, row) in enumerate(preview_df.iterrows()):
        preview.append({
            "row_number": pos + 1,
            "cells": [format_cell(v) for v in row.tolist()],
            "is_missing": bool(is_missing_row.iloc[pos]),
            "is_duplicate": bool(is_duplicate_row.iloc[pos]),
        })

    return {
        "row_count": int(len(df)),
        "missing_row_count": int(is_missing_row.sum()),
        "duplicate_row_count": int(is_duplicate_row.sum()),
        "missing_row_numbers": missing_row_numbers[:50],
        "duplicate_row_numbers": duplicate_row_numbers[:50],
        "preview": preview,
    }


def numeric_columns_of(df: pd.DataFrame):
    return df.select_dtypes(include="number").columns.tolist()


@app.route("/")
def home():
    return render_template("index_main.html")


@app.route("/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "No file part in the request."}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"error": "No file selected."}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Only .csv files are accepted."}), 400

    try:
        df = pd.read_csv(file)
    except pd.errors.EmptyDataError:
        return jsonify({"error": "The file is empty."}), 400
    except (UnicodeDecodeError, pd.errors.ParserError):
        return jsonify({"error": "Could not read file. Make sure it's a valid UTF-8 CSV."}), 400

    if df.shape[1] == 0:
        return jsonify({"error": "The file is empty."}), 400

    STATE["df"] = df
    STATE["filename"] = file.filename

    report = dataframe_quality_report(df)

    return jsonify({
        "filename": file.filename,
        "columns": df.columns.tolist(),
        "numeric_columns": numeric_columns_of(df),  # NEW
        **report,
    })


# --- NEW: Section 1 — remove duplicates + handle missing values ------------
@app.route("/clean", methods=["POST"])
def clean():
    df, error = require_dataset()
    if error:
        return error

    rows_before = len(df)
    missing_cells_before = int(df.isna().sum().sum())
    duplicates_removed = int(df.duplicated(keep="first").sum())

    cleaned = df.drop_duplicates(keep="first").reset_index(drop=True)

    for col in cleaned.columns:
        if cleaned[col].isna().any():
            if pd.api.types.is_numeric_dtype(cleaned[col]):
                fill_value = cleaned[col].mean()
            else:
                mode = cleaned[col].mode(dropna=True)
                fill_value = mode.iloc[0] if not mode.empty else "Unknown"
            cleaned[col] = cleaned[col].fillna(fill_value)

    STATE["df"] = cleaned

    return jsonify({
        "rows_before": rows_before,
        "rows_after": int(len(cleaned)),
        "duplicates_removed": duplicates_removed,
        "missing_values_handled": missing_cells_before,
        "columns": cleaned.columns.tolist(),
        "numeric_columns": numeric_columns_of(cleaned),
        **dataframe_quality_report(cleaned),
    })


# --- NEW: Section 2 — statistical analysis on selected numeric columns -----
@app.route("/stats", methods=["POST"])
def stats():
    df, error = require_dataset()
    if error:
        return error

    payload = request.get_json(silent=True) or {}
    requested_columns = payload.get("columns", [])

    numeric_columns = set(numeric_columns_of(df))
    selected = [c for c in requested_columns if c in numeric_columns]

    if not selected:
        return jsonify({"error": "Select at least one numeric column."}), 400

    results = {}
    for col in selected:
        series = df[col].dropna()
        if series.empty:
            continue
        q1 = float(series.quantile(0.25))
        q2 = float(series.quantile(0.50))
        q3 = float(series.quantile(0.75))
        results[col] = {
            "count": int(series.count()),
            "mean": round(float(series.mean()), 3),
            "std": round(float(series.std()), 3) if series.count() > 1 else 0.0,
            "min": round(float(series.min()), 3),
            "max": round(float(series.max()), 3),
            "q1": round(q1, 3),
            "median": round(q2, 3),
            "q3": round(q3, 3),
            "iqr": round(q3 - q1, 3),
        }

    return jsonify({"stats": results})


# --- NEW: Section 3 — histogram, box plot, correlation matrix --------------
@app.route("/plots", methods=["POST"])
def plots():
    df, error = require_dataset()
    if error:
        return error

    numeric_cols = numeric_columns_of(df)
    if not numeric_cols:
        return jsonify({"error": "No numeric columns available to plot."}), 400

    os.makedirs(PLOTS_DIR, exist_ok=True)
    stamp = int(time.time())  # cache-busting token for the browser
    numeric_df = df[numeric_cols].dropna()

    urls = {}

    # Histogram grid — one subplot per numeric column
    n = len(numeric_cols)
    ncols = min(3, n)
    nrows = -(-n // ncols)
    fig, axes = plt.subplots(nrows, ncols, figsize=(4.2 * ncols, 3.4 * nrows))
    axes = np.array(axes).reshape(-1)
    for i, col in enumerate(numeric_cols):
        axes[i].hist(df[col].dropna(), bins=20, color="#1f6f54", edgecolor="white")
        axes[i].set_title(col, fontsize=10)
    for i in range(n, len(axes)):
        axes[i].axis("off")
    fig.tight_layout()
    hist_name = f"histogram_{stamp}.png"
    fig.savefig(os.path.join(PLOTS_DIR, hist_name), dpi=130)
    plt.close(fig)
    urls["histogram"] = f"/static/plots/{hist_name}"

    # Box plot — one subplot per numeric column, so columns on very
    # different scales (e.g. salary vs. rating) don't squash each other.
    fig, axes = plt.subplots(nrows, ncols, figsize=(3.2 * ncols, 3.6 * nrows))
    axes = np.array(axes).reshape(-1)
    for i, col in enumerate(numeric_cols):
        axes[i].boxplot(df[col].dropna(), patch_artist=True,
                         boxprops=dict(facecolor="#eef6f2", color="#1f6f54"),
                         medianprops=dict(color="#b5762b"))
        axes[i].set_title(col, fontsize=10)
        axes[i].set_xticks([])
    for i in range(n, len(axes)):
        axes[i].axis("off")
    fig.tight_layout()
    box_name = f"boxplot_{stamp}.png"
    fig.savefig(os.path.join(PLOTS_DIR, box_name), dpi=130)
    plt.close(fig)
    urls["boxplot"] = f"/static/plots/{box_name}"

    # Correlation matrix — needs at least 2 numeric columns
    if len(numeric_cols) >= 2 and len(numeric_df) >= 2:
        corr = numeric_df.corr()
        fig, ax = plt.subplots(figsize=(1.1 * len(numeric_cols) + 2, 1.1 * len(numeric_cols) + 2))
        im = ax.imshow(corr, vmin=-1, vmax=1, cmap="RdYlGn")
        ax.set_xticks(range(len(corr.columns)))
        ax.set_xticklabels(corr.columns, rotation=45, ha="right", fontsize=9)
        ax.set_yticks(range(len(corr.columns)))
        ax.set_yticklabels(corr.columns, fontsize=9)
        for i in range(len(corr.columns)):
            for j in range(len(corr.columns)):
                ax.text(j, i, f"{corr.iloc[i, j]:.2f}", ha="center", va="center", fontsize=8)
        fig.colorbar(im, ax=ax, shrink=0.8)
        fig.tight_layout()
        corr_name = f"correlation_{stamp}.png"
        fig.savefig(os.path.join(PLOTS_DIR, corr_name), dpi=130)
        plt.close(fig)
        urls["correlation_matrix"] = f"/static/plots/{corr_name}"
    else:
        urls["correlation_matrix"] = None

    return jsonify(urls)


if __name__ == "__main__":
    app.run(debug=True)