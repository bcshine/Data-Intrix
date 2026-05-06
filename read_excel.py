import pandas as pd

file_path = r'c:\Users\USER\Desktop\11.projects\Data-Intrix\몬래드수동분석결과.xlsx'
xl = pd.ExcelFile(file_path)

with open('monrad_manual_analysis.txt', 'w', encoding='utf-8') as f:
    for sheet in xl.sheet_names:
        f.write(f"\n--- {sheet} ---\n")
        df = pd.read_excel(xl, sheet)
        f.write(df.head(100).to_string())
