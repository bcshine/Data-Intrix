import pandas as pd
import re
from datetime import datetime

def parse_korean_date(date_str):
    """(2025년 8월 15일 - 2025년 8월 31일) 형태에서 날짜 추출"""
    match = re.search(r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*-\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일', date_str)
    if match:
        start_date = f"{match.group(1)}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"
        end_date = f"{match.group(4)}-{int(match.group(5)):02d}-{int(match.group(6)):02d}"
        return start_date, end_date
    return None, None

def clean_numeric(value):
    """콤마 제거 및 숫자 변환"""
    if pd.isna(value) or value == '':
        return 0
    if isinstance(value, str):
        # 숫자가 아닌 문자 제거 (콤마 등)
        clean_val = re.sub(r'[^\d.-]', '', value)
        try:
            return float(clean_val)
        except ValueError:
            return 0
    return value

def preprocess_sales_data(file_path):
    # 엑셀 읽기
    df = pd.read_excel(file_path)
    
    refined_data = []
    current_start = None
    current_end = None
    
    # 표준 컬럼명 정의
    columns = [
        'Period_Start', 'Period_End', 'Category', 
        'Sales_Qty', 'Sales_Amt', 
        'Sub_Deduction_Qty', 'Sub_Deduction_Amt', 
        'Ticket_Deduction_Qty', 'Ticket_Deduction_Amt', 
        'Total_Amt', 'Avg_Price', 'Point_Deduction'
    ]
    
    for idx, row in df.iterrows():
        # 첫 번째 열의 값 확인 (날짜 구분자인지 확인)
        val0 = str(row.iloc[0]) if not pd.isna(row.iloc[0]) else ""
        
        # 날짜 행 인식
        if '(' in val0 and '년' in val0 and '일' in val0:
            current_start, current_end = parse_korean_date(val0)
            continue
            
        # 데이터 행 인식 (분류 정보가 있고, '분류'나 '합계'가 아닌 경우)
        category = val0.strip()
        if category and category not in ['분류', '합계', 'nan'] and current_start:
            # 수치 데이터 정제
            data_row = [
                current_start,
                current_end,
                category,
                clean_numeric(row.iloc[1]), # Sales_Qty
                clean_numeric(row.iloc[2]), # Sales_Amt
                clean_numeric(row.iloc[3]), # Sub_Qty
                clean_numeric(row.iloc[4]), # Sub_Amt
                clean_numeric(row.iloc[5]), # Ticket_Qty
                clean_numeric(row.iloc[6]), # Ticket_Amt
                clean_numeric(row.iloc[7]), # Total_Amt
                clean_numeric(row.iloc[8]), # Avg_Price
                clean_numeric(row.iloc[9])  # Point_Deduction
            ]
            refined_data.append(data_row)
            
    # 결과 데이터프레임 생성
    result_df = pd.DataFrame(refined_data, columns=columns)
    
    # CSV 저장
    output_path = 'refined_sales_data.csv'
    result_df.to_csv(output_path, index=False, encoding='utf-8-sig')
    return output_path, result_df

if __name__ == "__main__":
    output, result = preprocess_sales_data('더벨스파콘래드.xlsx')
    print(f"Processed file saved to: {output}")
    print("\nSample Data (First 5 rows):")
    print(result.head())
    print(f"\nTotal Records: {len(result)}")
