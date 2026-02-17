"""
Trust Accountant — HawkSoft Receipt → Deposit Report

Takes the raw hawksoft_receipts.csv and produces a formatted Excel report:
  - Filters to Receipts only
  - Drops unnecessary columns (Status, Item Type, Agent Name, etc.)
  - Converts money text → real numbers
  - Separates Cash vs Check deposits using "Pay Method" column
  - Landscape layout, auto-fit, color-coded headers & totals
  - Auto-opens the file when done

Usage:
    python trust_accountant.py
    python trust_accountant.py --input hawksoft_receipts.csv --output Trust_Deposit_Report.xlsx
"""

import argparse
import os
import platform
import sys

# Fix Windows console encoding for unicode characters
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

try:
    import pandas as pd
except ImportError:
    print(
        "ERROR: pandas is not installed.\n"
        "  Run:  pip install pandas xlsxwriter",
        file=sys.stderr,
    )
    sys.exit(1)


def generate_trust_report(input_file, output_file):
    print("--- Trust Accountant Starting ---")
    print(f"Reading: {input_file}")

    # 1. Load the CSV Data
    try:
        df = pd.read_csv(input_file)
    except FileNotFoundError:
        print(f"ERROR: Could not find '{input_file}'.")
        print("Make sure you have run the HawkSoft export first.")
        sys.exit(1)

    # 2. Filter: Keep ONLY Receipts
    if 'Item Type' in df.columns:
        initial_count = len(df)
        df = df[df['Item Type'].str.contains("Receipt", case=False, na=False)]
        print(f"Filtered {initial_count} rows down to {len(df)} Receipts.")

    # 3. Clean Up: Remove Specific Columns
    cols_to_remove = [
        "Status",
        "Item Type",
        "Created By Receipt",
        "Created Name",
        "Agent Name",
        "Bank",
        "Amount Due",
        "Reporting Account",
        "Integration",
        "Exported Date"
    ]
    existing_cols_to_drop = [c for c in cols_to_remove if c in df.columns]
    df.drop(columns=existing_cols_to_drop, inplace=True)
    print(f"Removed {len(existing_cols_to_drop)} unnecessary columns.")

    # 4. Money Math: Convert Text ('$1,200.00') to Numbers (1200.00)
    money_cols = ['Invoiced', 'Tendered', 'Disbursement', 'Credit Us', 'Commission']
    target_cols = [c for c in money_cols if c in df.columns]

    for col in target_cols:
        df[col] = df[col].astype(str).str.replace('$', '', regex=False).str.replace(',', '', regex=False)
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

    # 5. Calculate Grand Totals
    grand_totals = df[target_cols].sum()

    # ---------------------------------------------------------
    # 6. CASH vs. CHECK SEPARATION (Using 'Pay Method')
    # ---------------------------------------------------------
    cash_total = 0.0
    check_total = 0.0
    pay_col = "Pay Method"

    if pay_col in df.columns:
        print(f"Separating Cash & Checks using '{pay_col}' column...")

        cash_rows = df[df[pay_col].astype(str).str.contains("Cash", case=False, na=False)]
        if 'Tendered' in df.columns:
            cash_total = cash_rows['Tendered'].sum()

        check_rows = df[df[pay_col].astype(str).str.contains("Check", case=False, na=False)]
        if 'Tendered' in df.columns:
            check_total = check_rows['Tendered'].sum()

        print(f"  > Cash: ${cash_total:,.2f}")
        print(f"  > Checks: ${check_total:,.2f}")
    else:
        print(f"WARNING: '{pay_col}' column not found! Skipping Cash/Check split.")

    # ---------------------------------------------------------
    # 7. EXCEL GENERATION (Landscape & Formatting)
    # ---------------------------------------------------------
    print(f"Generating Excel Report: {output_file}...")

    writer = pd.ExcelWriter(output_file, engine='xlsxwriter')
    df.to_excel(writer, sheet_name='Deposit Report', index=False, startrow=1, header=False)

    workbook = writer.book
    worksheet = writer.sheets['Deposit Report']

    # --- Formats ---
    money_fmt = workbook.add_format({'num_format': '$#,##0.00'})
    header_fmt = workbook.add_format({
        'bold': True, 'fg_color': '#003366', 'font_color': 'white',
        'border': 1, 'align': 'center'
    })
    total_fmt = workbook.add_format({
        'bold': True, 'bg_color': '#FFFF00',
        'num_format': '$#,##0.00', 'border': 1
    })
    date_fmt = workbook.add_format({'num_format': 'mm/dd/yyyy'})
    label_fmt = workbook.add_format({'bold': True, 'align': 'right'})

    # --- Page Setup (LANDSCAPE) ---
    worksheet.set_landscape()
    worksheet.fit_to_pages(1, 0)  # Fit 1 page wide, infinite pages tall
    worksheet.set_paper(1)  # US Letter

    # --- Write Headers ---
    for col_num, value in enumerate(df.columns.values):
        worksheet.write(0, col_num, value, header_fmt)

    # --- Column Widths & Formatting ---
    for i, col in enumerate(df.columns):
        if col in target_cols:
            worksheet.set_column(i, i, 15, money_fmt)
        elif "Date" in col or "Time" in col:
            worksheet.set_column(i, i, 12, date_fmt)
        else:
            worksheet.set_column(i, i, 20)

    # --- Write GRAND TOTALS Row ---
    last_row = len(df) + 2
    worksheet.write(last_row, 0, "GRAND TOTALS:", label_fmt)

    for i, col in enumerate(df.columns):
        if col in target_cols:
            worksheet.write(last_row, i, grand_totals[col], total_fmt)

    # --- Write DEPOSIT SLIP (Cash/Check Breakdown) ---
    if pay_col in df.columns:
        slip_row = last_row + 3

        worksheet.write(slip_row, 0, "CASH DEPOSIT:", label_fmt)
        worksheet.write(slip_row, 1, cash_total, money_fmt)

        worksheet.write(slip_row + 1, 0, "CHECK DEPOSIT:", label_fmt)
        worksheet.write(slip_row + 1, 1, check_total, money_fmt)

        total_tendered = grand_totals.get('Tendered', 0)
        diff = total_tendered - (cash_total + check_total)

        if abs(diff) > 0.01:
            diff_fmt = workbook.add_format({
                'bold': True, 'font_color': 'red', 'align': 'right'
            })
            worksheet.write(slip_row + 2, 0, "DIFFERENCE:", diff_fmt)
            worksheet.write(slip_row + 2, 1, diff, money_fmt)

    writer.close()
    print("SUCCESS: Report saved.")

    # ---------------------------------------------------------
    # 8. AUTO-OPEN THE FILE
    # ---------------------------------------------------------
    try:
        if platform.system() == 'Darwin':
            os.system(f"open '{output_file}'")
        elif platform.system() == 'Windows':
            os.startfile(output_file)
        print("Opened file automatically.")
    except Exception as e:
        print(f"Note: Could not auto-open file ({e}). You can open it manually.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Process Trust Accounting CSV.')
    parser.add_argument('--input', default='hawksoft_receipts.csv', help='Input CSV filename')
    parser.add_argument('--output', default='Trust_Deposit_Report.xlsx', help='Output Excel filename')

    args = parser.parse_args()
    generate_trust_report(args.input, args.output)
