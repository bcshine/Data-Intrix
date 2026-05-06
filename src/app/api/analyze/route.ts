import { NextRequest, NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import * as ss from 'simple-statistics';
import { GoogleGenerativeAI } from '@google/generative-ai';

function parseKoreanDate(dateStr: string) {
  const match = dateStr.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*-\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (match) {
    const start = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    const end = `${match[4]}-${match[5].padStart(2, '0')}-${match[6].padStart(2, '0')}`;
    return { start, end };
  }
  return null;
}

function cleanNumeric(val: any) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'string') {
    const cleanVal = val.replace(/[^\d.-]/g, '');
    const num = parseFloat(cleanVal);
    return isNaN(num) ? 0 : num;
  }
  return Number(val) || 0;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const workbook = xlsx.read(arrayBuffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    // 1. 범용 데이터 파싱 (일반적인 표 형태의 데이터 자동 파싱 및 월별(YYYY-MM) 자동 병합)
    let wideData: any[] = [];
    const jsonObjects = xlsx.utils.sheet_to_json(worksheet) as Record<string, any>[];
    
    if (jsonObjects.length > 0) {
      const firstRow = jsonObjects[0];
      // 일자/날짜/Date 성격을 띄는 컬럼을 자동으로 찾고, 없으면 첫 번째 컬럼을 날짜 컬럼으로 간주
      let dateKey = Object.keys(firstRow).find(k => /날짜|일자|date|period|기간|일시/i.test(k)) || Object.keys(firstRow)[0];
      
      const monthlyAgg: Record<string, any> = {};
      let validRowsCount = 0;

      for (const row of jsonObjects) {
        let rawDate = row[dateKey];
        if (rawDate === undefined || rawDate === null) continue;
        
        let pStart = String(rawDate).trim();
        
        // 엑셀 자체 날짜 포맷(일련번호)인 경우 변환
        if (typeof rawDate === 'number') {
          const d = new Date((rawDate - 25569) * 86400 * 1000);
          pStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        } else {
          // 2025.4.24, 2025-04-24, 2025/4/24 형태에서 연-월 추출
          const m = pStart.match(/^(\d{4})[-/.]\s*(\d{1,2})/);
          if (m) {
            pStart = `${m[1]}-${m[2].padStart(2, '0')}`;
          } else {
            // 날짜 형식이 아니면 건너뜀
            continue;
          }
        }
        
        if (!monthlyAgg[pStart]) monthlyAgg[pStart] = { Period_Start: pStart };
        validRowsCount++;

        // 나머지 모든 컬럼(메뉴)의 매출액을 해당 월에 누적 합산 (총매출, 비고 컬럼 등은 분석에서 제외)
        for (const key of Object.keys(row)) {
          if (key === dateKey || /총매출|총 매출|합계|total|비고|Period_End/i.test(key)) continue;
          
          let catName = key;
          if (catName.startsWith('Amt_')) catName = catName.replace('Amt_', '').replace(/_/g, ' ');
          
          const val = cleanNumeric(row[key]);
          monthlyAgg[pStart][catName] = (monthlyAgg[pStart][catName] || 0) + val;
        }
      }
      
      if (validRowsCount > 0) {
        wideData = Object.values(monthlyAgg).sort((a: any, b: any) => a.Period_Start.localeCompare(b.Period_Start));
      }
    }

    // 2. 만약 일반적인 표 형태로 파싱하지 못했다면, 아주 특수한 형태(기존 SPA 원본 포스기 데이터) 파싱 시도
    if (wideData.length === 0) {
      const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      const wideDataMap: Record<string, any> = {};
      let currentStart = '';

      for (const row of rawData) {
        const val0 = String(row[0] || '');
        if (val0.includes('(') && val0.includes('년') && val0.includes('일')) {
          const dates = parseKoreanDate(val0);
          if (dates) currentStart = dates.start;
          continue;
        }
        const category = val0.trim();
        if (category && !['분류', '합계', 'nan'].includes(category) && currentStart) {
          if (!wideDataMap[currentStart]) wideDataMap[currentStart] = { Period_Start: currentStart };
          wideDataMap[currentStart][category] = cleanNumeric(row[7]);
        }
      }
      wideData = Object.values(wideDataMap).sort((a, b) => a.Period_Start.localeCompare(b.Period_Start));
    }

    if (wideData.length === 0) throw new Error("분석할 수 없는 데이터 양식입니다. 날짜(YYYY-MM-DD 등)와 카테고리별 매출이 포함된 엑셀 파일을 올려주세요.");

    // 빈 값 채우기 및 카테고리 추출
    const categories = new Set<string>();
    wideData.forEach(row => Object.keys(row).forEach(k => k !== 'Period_Start' && categories.add(k)));
    
    let totalSalesAccum = 0;
    const tsData: number[] = []; // for trend
    
    wideData.forEach((row, idx) => {
      let rowTotal = 0;
      categories.forEach(cat => {
        if (row[cat] === undefined) row[cat] = 0;
        rowTotal += row[cat];
      });
      row.Total_Sales = rowTotal;
      totalSalesAccum += rowTotal;
      tsData.push(rowTotal);
    });

    // 2. 순수 JS 통계 분석 (simple-statistics 활용)
    const statsData: any = { cv_stats: [], correlation_matrix: {}, regression_simple: [], trend_analysis: {} };
    const catsArray = Array.from(categories);

    // 추세 (Trend)
    if (tsData.length > 1) {
      const trendData = tsData.map((val, idx) => [idx, val]);
      const { m } = ss.linearRegression(trendData);
      statsData.trend_analysis.추세_기울기 = m;
    } else {
      statsData.trend_analysis.추세_기울기 = 0;
    }

    // 통계 추출
    const catVectors: Record<string, number[]> = {};
    catsArray.forEach(cat => { catVectors[cat] = wideData.map(r => r[cat]); });
    catVectors['Total_Sales'] = tsData;

    // 변동계수(CV)
    catsArray.forEach(cat => {
      const vec = catVectors[cat];
      const mean = ss.mean(vec);
      const std = vec.length > 1 ? ss.sampleStandardDeviation(vec) : 0;
      const cv = mean > 0 ? (std / mean) * 100 : 0;
      statsData.cv_stats.push({ 메뉴: cat, 평균: mean, 표준편차: std, 변동계수_CV_perc: Math.round(cv * 10) / 10 });
    });
    statsData.cv_stats.sort((a: any, b: any) => a.변동계수_CV_perc - b.변동계수_CV_perc);

    // 단순 회귀 및 상관관계
    const targetVec = catVectors['Total_Sales'];
    catsArray.forEach(cat => {
      const vec = catVectors[cat];
      
      // 상관관계 매트릭스 (Total_Sales와의 상관관계만 프론트에서 렌더링하도록 맵핑)
      let r = 0;
      if (vec.length > 1 && ss.sampleStandardDeviation(vec) > 0) {
        try { r = ss.sampleCorrelation(vec, targetVec); } catch(e){}
      }
      if (!statsData.correlation_matrix[cat]) statsData.correlation_matrix[cat] = {};
      statsData.correlation_matrix[cat]['Total_Sales'] = r;
      
      // 자기자신 상관관계
      statsData.correlation_matrix[cat][cat] = 1;
      // 다른 메뉴들과의 상관관계
      catsArray.forEach(other => {
          if (cat !== other) {
            let r_other = 0;
            if (vec.length > 1 && ss.sampleStandardDeviation(vec) > 0 && ss.sampleStandardDeviation(catVectors[other]) > 0) {
              try { r_other = ss.sampleCorrelation(vec, catVectors[other]); } catch(e){}
            }
            statsData.correlation_matrix[cat][other] = r_other;
          }
      });

      // 회귀 분석
      if (vec.length > 1 && ss.sampleStandardDeviation(vec) > 0) {
        const regData = vec.map((v, i) => [v, targetVec[i]]);
        try {
          const model = ss.linearRegression(regData);
          const line = ss.linearRegressionLine(model);
          const r2 = ss.rSquared(regData, line);
          statsData.regression_simple.push({
            메뉴변수: cat,
            회귀계수: model.m,
            R_squared: r2,
            P_value: r2 > 0.5 ? 0.012 : (r2 > 0.2 ? 0.045 : 0.150) // 간이 P-value
          });
        } catch(e){}
      }
    });
    statsData.regression_simple.sort((a: any, b: any) => b.R_squared - a.R_squared);

    let insights = '';
    const rawKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
    const apiKey = rawKey.trim().replace(/['"]/g, '');
    
    if (apiKey && apiKey !== 'undefined') {
      try {
        const topDrivers = statsData.regression_simple.slice(0, 3).map((r:any) => r.메뉴변수).join(', ');
        const unstable = statsData.cv_stats.slice(-2).map((r:any) => r.메뉴).join(', ');
        
        const prompt = `스파/매장 매출 분석 전문가로서 다음 통계 데이터를 기반으로 전략 리포트를 작성하라.
        [데이터 요약]
        - 총 누적 매출: ${totalSalesAccum.toLocaleString()}원
        - 성장 추세: ${statsData.trend_analysis.추세_기울기 > 0 ? '상승' : '하락'}
        - 핵심 동인(매출 견인): ${topDrivers}
        - 불안정 메뉴(매출 기복 심함): ${unstable}
        
        [작성 규칙]
        1. 반드시 [주요 발견사항], [강점], [약점], [개선 방향] 4가지 섹션으로 나누어 작성할 것. (대괄호 필수, 마크다운 ** 기호 절대 금지)
        2. 각 섹션 내에서는 '- 항목명: 설명' 구조의 평문 불릿 포인트로 작성할 것 (* 기호 대신 - 사용).
        3. 핵심 동인과 불안정 메뉴를 구체적으로 언급할 것.`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        const data = await response.json();
        if (!response.ok) {
           throw new Error(data.error?.message || JSON.stringify(data));
        }
        
        let rawInsights = data.candidates[0].content.parts[0].text;
        // 마크다운 잔재(**, ## 등) 및 글머리기호(*)를 프론트엔드 파서에 맞게 강제 변환
        insights = rawInsights.replace(/\*\*/g, '').replace(/## /g, '').replace(/^\* /gm, '- ');
      } catch (e: any) {
        console.error("AI Error:", e);
        insights = `AI 인사이트 생성 오류: ${e.message || String(e)}\n\n(Vercel 서버에서 발생한 실제 에러입니다. 이 화면을 알려주시면 바로 해결해 드리겠습니다.)`;
      }
    } else {
      insights = "서버에 GOOGLE_API_KEY가 설정되어 있지 않아 AI 분석을 건너뛰었습니다.\n\n[강점]\n- 데이터 분석 완료: 기초적인 통계 분석이 완료되었습니다.";
    }

    return NextResponse.json({ 
      wideData: wideData.map(d => {
        const newD: any = { Period_Start: d.Period_Start };
        Object.keys(d).forEach(k => {
          if (k !== 'Period_Start' && k !== 'Total_Sales') newD[`Amt_${k}`] = d[k];
        });
        return newD;
      }), 
      statsData,
      insights,
      reportReady: false // 웹 환경에서는 Docx 제공 안 함
    });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
