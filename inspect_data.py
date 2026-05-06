import pandas as pd
import sys

def inspect_excel(file_path):
    try:
        # Try reading the excel file
        xls = pd.ExcelFile(file_path)
        sheet_names = xls.sheet_names
        
        with open('data_inspection.txt', 'w', encoding='utf-8') as f:
            f.write(f"File: {file_path}\n")
            f.write(f"Sheets: {sheet_names}\n\n")
            
            for sheet in sheet_names:
                f.write(f"{'='*20} Sheet: {sheet} {'='*20}\n")
                df = pd.read_excel(file_path, sheet_name=sheet)
                f.write(f"Shape: {df.shape}\n")
                f.write("First 15 rows:\n")
                f.write(df.head(15).to_string())
                f.write("\n\n")
                
                # Check for columns and types
                f.write("Column Types:\n")
                f.write(df.dtypes.to_string())
                f.write("\n\n")

        print("Inspection completed. Results saved to data_inspection.txt")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_excel('더벨스파콘래드.xlsx')
