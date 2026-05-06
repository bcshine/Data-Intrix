import pandas as pd

def create_wide_matrix(csv_path):
    df = pd.read_csv(csv_path)
    
    # 매출(Total_Amt)을 기준으로 피벗 테이블 생성
    # 인덱스는 날짜(Period_Start), 컬럼은 카테고리(Category)
    wide_df = df.pivot_table(
        index=['Period_Start', 'Period_End'], 
        columns='Category', 
        values='Total_Amt', 
        aggfunc='sum'
    ).fillna(0)
    
    # 컬럼명 정리 (예: BODY -> Category_BODY_Amt)
    wide_df.columns = [f'Amt_{col.replace(" ", "_")}' for col in wide_df.columns]
    
    # 인덱스 초기화하여 일반 컬럼으로 변경
    wide_df = wide_df.reset_index()
    
    # 결과 저장
    output_path = 'regression_ready_data.csv'
    wide_df.to_csv(output_path, index=False, encoding='utf-8-sig')
    return output_path, wide_df

if __name__ == "__main__":
    output, result = create_wide_matrix('refined_sales_data.csv')
    print(f"Regression-ready wide data saved to: {output}")
    print("\n--- Wide Format Data (First 5 months) ---")
    print(result.head())
