import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

# 폰트 설정 (한글 깨짐 방지)
plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False

def perform_analysis(csv_path):
    df = pd.read_csv(csv_path)
    
    # 1. 카테고리별 총 매출 요약
    summary = df.groupby('Category')['Total_Amt'].sum().sort_values(ascending=False)
    
    # 2. 기간별 매출 추이 (피벗 테이블)
    pivot_df = df.pivot_table(index='Period_Start', columns='Category', values='Total_Amt', aggfunc='sum').fillna(0)
    
    # 3. 상관관계 분석
    correlation = pivot_df.corr()
    
    print("=== 카테고리별 총 매출 요약 ===")
    print(summary)
    print("\n=== 카테고리 간 매출 상관계수 (Correlation) ===")
    print(correlation)
    
    # 상관관계 히트맵 시각화
    plt.figure(figsize=(10, 8))
    sns.heatmap(correlation, annot=True, cmap='coolwarm', fmt=".2f")
    plt.title('서비스 카테고리별 매출 상관관계')
    plt.savefig('correlation_heatmap.png')
    
    return summary, correlation

if __name__ == "__main__":
    perform_analysis('refined_sales_data.csv')
