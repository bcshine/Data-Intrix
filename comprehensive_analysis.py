import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt
from scipy import stats

# 폰트 설정 (한글 깨짐 방지)
plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False

def run_comprehensive_analysis(csv_path):
    df = pd.read_csv(csv_path)
    
    # 1. 파생 변수 생성: 월별 총 매출
    amt_cols = [c for c in df.columns if c.startswith('Amt_')]
    df['Total_Revenue'] = df[amt_cols].sum(axis=1)
    
    with open('analysis_results.txt', 'w', encoding='utf-8') as f:
        f.write("=== 1. 기술통계 (월 평균 매출 현황) ===\n")
        mean_rev = df[amt_cols].mean().sort_values(ascending=False)
        f.write(mean_rev.to_string() + "\n\n")
        
        f.write("=== 2. 주요 상관관계 (상관계수 r) ===\n")
        corr = df[amt_cols].corr()
        # 프로모션과 다른 변수 간의 상관관계만 추출
        if 'Amt_프로모션' in corr.columns:
            promo_corr = corr['Amt_프로모션'].drop('Amt_프로모션').sort_values(ascending=False)
            f.write("[프로모션 매출과 다른 상품의 상관관계]\n")
            f.write(promo_corr.to_string() + "\n\n")
            
        if 'Amt_THE_BELLE_SIGNATURE' in corr.columns:
            sig_corr = corr['Amt_THE_BELLE_SIGNATURE'].drop('Amt_THE_BELLE_SIGNATURE').sort_values(ascending=False)
            f.write("[시그니처 코스와 다른 상품의 상관관계]\n")
            f.write(sig_corr.to_string() + "\n\n")

        # 상관관계 히트맵 이미지 저장
        plt.figure(figsize=(10, 8))
        sns.heatmap(corr, annot=True, cmap='coolwarm', fmt=".2f", linewidths=.5)
        plt.title('서비스 카테고리 간 매출 상관관계')
        plt.tight_layout()
        plt.savefig('correlation_wide.png')
        plt.close()
        
        f.write("=== 3. 단일 회귀분석 결과 ===\n")
        # [모델 1] 프로모션이 시그니처에 미치는 영향
        if 'Amt_프로모션' in df.columns and 'Amt_THE_BELLE_SIGNATURE' in df.columns:
            slope, intercept, r_val, p_val, std_err = stats.linregress(df['Amt_프로모션'], df['Amt_THE_BELLE_SIGNATURE'])
            f.write("[가설 1] 프로모션 매출이 오르면 시그니처 매출도 오를까?\n")
            f.write(f"- 회귀식: 시그니처 매출 = {slope:.2f} * 프로모션 매출 + {intercept:,.0f}\n")
            f.write(f"- 설명력(R-square): {r_val**2:.3f}\n")
            f.write(f"- 유의확률(P-value): {p_val:.3f}\n")
            if p_val < 0.05:
                f.write("-> (통계적 유의함) 프로모션 매출 증가는 시그니처 매출 증가로 이어집니다.\n\n")
            else:
                f.write("-> (통계적 유의성 부족) 데이터가 적어 단정할 수 없거나 선형 관계가 뚜렷하지 않습니다.\n\n")
                
        # [모델 2] 페이스 케어가 바디 케어에 미치는 영향
        if 'Amt_FACE' in df.columns and 'Amt_BODY' in df.columns:
            slope, intercept, r_val, p_val, std_err = stats.linregress(df['Amt_FACE'], df['Amt_BODY'])
            f.write("[가설 2] 페이스 관리를 받은 사람이 바디 관리도 많이 받는가?\n")
            f.write(f"- 회귀식: 바디 매출 = {slope:.2f} * 페이스 매출 + {intercept:,.0f}\n")
            f.write(f"- 설명력(R-square): {r_val**2:.3f}\n")
            f.write(f"- 유의확률(P-value): {p_val:.3f}\n")
            if p_val < 0.05:
                f.write("-> (통계적 유의함) 페이스 매출과 바디 매출은 비례하여 증가합니다.\n")
            else:
                f.write("-> (통계적 유의성 부족) 두 서비스의 매출은 서로 큰 영향을 주고받지 않거나 독립적입니다.\n")

if __name__ == "__main__":
    run_comprehensive_analysis('regression_ready_data.csv')
    print("분석이 완료되었습니다.")
