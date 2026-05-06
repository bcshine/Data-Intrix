import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import statsmodels.api as sm
from sklearn.linear_model import LassoCV
import os
import json
import warnings
warnings.filterwarnings('ignore')

# 윈도우 환경 한글 폰트 설정 (가독성 높은 맑은 고딕 사용)
plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False

def create_charts_and_stats(data_path):
    # 1. 데이터 로드
    df = pd.read_csv(data_path)
    df['Period_Start'] = pd.to_datetime(df['Period_Start'])
    df = df.sort_values('Period_Start').reset_index(drop=True)

    # Wide 형식 확인: Period_Start + 메뉴컬럼들
    # Category/Total_Amt 방식이면 pivot, 아니면 그대로 사용
    if 'Category' in df.columns and 'Total_Amt' in df.columns:
        # Long → Wide 변환
        pivot_df = df.pivot_table(index='Period_Start', columns='Category', values='Total_Amt', aggfunc='sum').fillna(0)
    else:
        # 이미 Wide 형식
        pivot_df = df.set_index('Period_Start')
        pivot_df = pivot_df.fillna(0)

    pivot_df['Total_Sales'] = pivot_df.sum(axis=1)
    categories = [c for c in pivot_df.columns if c != 'Total_Sales']

    # 월별 총매출 시리즈
    monthly_sales = pivot_df[['Total_Sales']].reset_index()
    monthly_sales.columns = ['Period_Start', 'Total_Amt']
    monthly_sales['Period_Str'] = monthly_sales['Period_Start'].dt.strftime('%Y-%m')

    results = {
        'insights': [],
        'regression_simple': {},
        'regression_multiple': {},
        'correlation_matrix': {}
    }

    os.makedirs('output_charts', exist_ok=True)

    # ---------------------------------------------------------
    # 1. 월별 총매출 차트
    # ---------------------------------------------------------
    plt.figure(figsize=(10, 6), facecolor='white')
    ax = sns.barplot(x='Period_Str', y='Total_Amt', data=monthly_sales, color='royalblue')
    plt.title('월별 총매출 추이', fontsize=16, fontweight='bold')
    plt.xlabel('월', fontsize=12)
    plt.ylabel('총매출 (원)', fontsize=12)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: format(int(x), ',')))
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.savefig('output_charts/monthly_trend.png', dpi=300, bbox_inches='tight')
    plt.close()
    results['insights'].append("월별 총매출 추이 분석 완료.")

    # ---------------------------------------------------------
    # 2. 카테고리별 누적 매출 차트 (상위 10개)
    # ---------------------------------------------------------
    cat_totals = pivot_df[categories].sum().sort_values(ascending=False).head(10)

    plt.figure(figsize=(10, 6), facecolor='white')
    ax2 = sns.barplot(x=cat_totals.index.tolist(), y=cat_totals.values.tolist(), palette='viridis')
    plt.title('상위 메뉴별 총매출', fontsize=16, fontweight='bold')
    plt.xlabel('메뉴 분류', fontsize=12)
    plt.ylabel('총매출 (원)', fontsize=12)
    ax2.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: format(int(x), ',')))
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.savefig('output_charts/top_categories.png', dpi=300, bbox_inches='tight')
    plt.close()
    results['insights'].append("메뉴별 총매출 시각화 완료.")

    # ---------------------------------------------------------
    # 3. 상관관계 분석
    # ---------------------------------------------------------
    correlation_matrix = pivot_df[categories + ['Total_Sales']].corr().round(4).to_dict()
    results['correlation_matrix'] = correlation_matrix

    # ---------------------------------------------------------
    # 4. 단순회귀분석
    # ---------------------------------------------------------
    simple_reg_results = []
    for cat in categories:
        X = pivot_df[cat]
        y = pivot_df['Total_Sales']
        if X.var() == 0:
            continue
        X_sm = sm.add_constant(X)
        model = sm.OLS(y, X_sm).fit()
        simple_reg_results.append({
            '메뉴변수': cat,
            'R_squared': round(model.rsquared, 4),
            '계수(Coefficient)': round(model.params[cat], 4),
            'R_squared': round(model.rsquared, 4),
            'P_value': round(model.pvalues[cat], 4),
            '회귀계수': round(model.params[cat], 4),
        })
    simple_reg_results = sorted(simple_reg_results, key=lambda x: x['P_value'])
    results['regression_simple'] = simple_reg_results

    # ---------------------------------------------------------
    # 5. 다중회귀분석 (LASSO)
    # ---------------------------------------------------------
    X_multi = pivot_df[categories]
    y_multi = pivot_df['Total_Sales']
    if len(X_multi) > 3:
        lasso = LassoCV(cv=min(3, len(X_multi)), random_state=42)
        lasso.fit(X_multi, y_multi)
        coef_dict = {cat: round(coef, 4) for cat, coef in zip(categories, lasso.coef_) if coef != 0}
        results['regression_multiple'] = {
            'R_squared_score': round(lasso.score(X_multi, y_multi), 4),
            '선택된_유의미한_변수_및_계수': coef_dict
        }
    else:
        results['regression_multiple'] = "데이터 샘플 수가 적어 다중회귀분석을 생략합니다."

    # ---------------------------------------------------------
    # 6. 기초 통계량 (CV%)
    # ---------------------------------------------------------
    cv_stats = []
    for cat in categories:
        mean_val = pivot_df[cat].mean()
        std_val = pivot_df[cat].std()
        cv_val = (std_val / mean_val * 100) if mean_val != 0 else 0
        cv_stats.append({
            '메뉴': cat,
            '평균': round(mean_val, 2),
            '최소값': round(pivot_df[cat].min(), 2),
            '최대값': round(pivot_df[cat].max(), 2),
            '표준편차': round(std_val, 2),
            '변동계수_CV_perc': round(cv_val, 2)
        })
    results['cv_stats'] = sorted(cv_stats, key=lambda x: x['변동계수_CV_perc'], reverse=True)

    # ---------------------------------------------------------
    # 7. 성장 추세선 (선형회귀)
    # ---------------------------------------------------------
    if len(monthly_sales) > 1:
        X_trend = np.arange(len(monthly_sales)).reshape(-1, 1)
        y_trend = monthly_sales['Total_Amt'].values
        X_trend_sm = sm.add_constant(X_trend)
        model_trend = sm.OLS(y_trend, X_trend_sm).fit()
        results['trend_analysis'] = {
            '추세_기울기': round(model_trend.params[1], 2),
            '추세_절편': round(model_trend.params[0], 2),
            '결정계수_R2': round(model_trend.rsquared, 4)
        }
    else:
        results['trend_analysis'] = None

    class NumpyEncoder(json.JSONEncoder):
        def default(self, obj):
            import numpy as np
            if isinstance(obj, (np.integer,)): return int(obj)
            if isinstance(obj, (np.floating,)): return float(obj)
            if isinstance(obj, np.ndarray): return obj.tolist()
            return super().default(obj)

    with open('analysis_results.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=4, cls=NumpyEncoder)

    print("분석 완료: analysis_results.json 저장됨")

if __name__ == '__main__':
    import sys
    data_file = sys.argv[1] if len(sys.argv) > 1 else 'refined_sales_data.csv'
    if os.path.exists(data_file):
        create_charts_and_stats(data_file)
    else:
        print(f"{data_file} 파일을 찾을 수 없습니다.")

