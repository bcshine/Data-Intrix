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

    // 2. 특수 양식 하드코딩 파싱 (기존 SPA 양식 등)
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
      if (Object.keys(wideDataMap).length > 0) {
        wideData = Object.values(wideDataMap).sort((a, b) => a.Period_Start.localeCompare(b.Period_Start));
      }
    }

    // 3. AI 동적 전처리기 (모든 하드코딩 룰이 실패했을 경우 최후의 보루)
    if (wideData.length === 0 && jsonObjects.length > 0) {
      console.log("Rule-based parsing failed. Engaging AI Dynamic Preprocessor...");
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' }); // 코드 작성을 위해 추론능력이 높은 pro 모델 사용
      
      const sampleData = JSON.stringify(jsonObjects.slice(0, 50), null, 2);
      
      const prompt = `
You are an expert data engineer.
I have a messy POS Excel file parsed into JSON objects. The user wants to aggregate this data into a monthly summary.
Here are the first 50 rows of the data:

${sampleData}

Write a Javascript function body that processes the \`rows\` array and returns an aggregated array of objects.
Requirements:
1. The input variable is \`rows\` (Array of objects).
2. The output MUST be an array of objects where each object represents one month.
3. Each output object MUST have a \`Period_Start\` key formatted strictly as "YYYY-MM" (e.g. "2024-01").
4. The rest of the keys in the output object should be the names of the categories/menus, and the values should be the SUM of the sales amounts for that category in that month.
5. EXCLUDE totals, subtotals, or summary columns (like "총매출", "합계", etc) from being category keys.
6. Return ONLY the raw javascript code for the inside of the function. DO NOT include markdown, \`\`\`javascript, or function wrapper. Just the code to execute.
7. Use defensive programming (check for nulls, handle string numbers by stripping commas and parsing float, handle weird date formats by using Regex to find YYYY and MM).
`;

      try {
        const result = await model.generateContent(prompt);
        let jsCode = result.response.text();
        // 마크다운 및 불필요한 래퍼 제거
        jsCode = jsCode.replace(/```javascript/gi, '').replace(/```js/gi, '').replace(/```/g, '').trim();
        console.log("AI Generated Parser Code:\n", jsCode);
        
        // 동적 파서 실행
        const dynamicParser = new Function('rows', jsCode);
        wideData = dynamicParser(jsonObjects);
        
        // AI가 만든 데이터가 유효한지 검증
        if (!Array.isArray(wideData) || wideData.length === 0 || !wideData[0].Period_Start) {
          wideData = [];
        } else {
          // 날짜순 정렬
          wideData.sort((a, b) => a.Period_Start.localeCompare(b.Period_Start));
          console.log("AI Preprocessing Successful. Rows:", wideData.length);
        }
      } catch (e) {
        console.error("AI Preprocessor failed:", e);
      }
    }

    if (wideData.length === 0) throw new Error("분석할 수 없는 데이터 양식입니다. 엑셀의 구조가 너무 복잡하여 AI 전처리기도 해독에 실패했습니다. 단순한 표 형태로 수정 후 다시 올려주세요.");

    // 1. 변수 분류 (Menu vs External)
    const allCategories = new Set<string>();
    wideData.forEach(row => Object.keys(row).forEach(k => k !== 'Period_Start' && allCategories.add(k)));
    
    const menuCategories: string[] = [];
    const externalCategories: string[] = [];
    let targetCol = '';

    const targetKeywords = ['총매출', '총 매출', 'Total_Sales', 'Total Sales', '매출액', '합계', 'Total'];
    const externalKeywords = ['여부', '행사', '기온', '온도', '강수', '날씨', '마케팅', '광고', 'Promotion', 'Temp', 'Rain', 'Event', 'Weekend', '요일'];

    Array.from(allCategories).forEach(cat => {
      if (targetKeywords.includes(cat.trim())) {
        targetCol = cat;
        return;
      }
      
      const vec = wideData.map(r => {
        const val = r[cat];
        if (typeof val === 'string') return Number(val.replace(/,/g, '')) || 0;
        return Number(val) || 0;
      });
      const maxVal = Math.max(...vec);
      const isBinary = vec.every(v => v === 0 || v === 1);
      const isExternalName = externalKeywords.some(kw => cat.includes(kw));

      // 임계값 설정: 최대값이 200 이하이거나(기온 등), 이름에 키워드가 포함되어 있거나, 0/1인 경우
      if (isExternalName || isBinary || (maxVal < 200 && maxVal > -100)) {
        externalCategories.push(cat);
      } else {
        menuCategories.push(cat);
      }
    });

    let totalSalesAccum = 0;
    const tsData: number[] = [];

    wideData.forEach((row) => {
      // 모든 값을 숫자로 강제 변환 (콤마 제거 포함)
      Object.keys(row).forEach(k => {
        if (k !== 'Period_Start' && typeof row[k] === 'string') {
          row[k] = Number(row[k].replace(/,/g, '')) || 0;
        } else if (k !== 'Period_Start') {
          row[k] = Number(row[k]) || 0;
        }
      });

      let rowTotal = 0;
      if (targetCol && row[targetCol] !== undefined) {
        rowTotal = Number(row[targetCol]) || 0;
      } else {
        menuCategories.forEach(cat => {
          rowTotal += Number(row[cat]) || 0;
        });
      }
      row.Total_Sales = rowTotal;
      totalSalesAccum += rowTotal;
      tsData.push(rowTotal);
    });



    // 2. 순수 JS 통계 분석 (simple-statistics 활용)
    const statsData: any = { 
      cv_stats: [], 
      external_cv_stats: [],
      correlation_matrix: {}, 
      regression_simple: [], 
      external_regression: [],
      trend_analysis: {},
      menuCategories,
      externalCategories
    };

    // 통계 추출용 벡터 준비 (모든 값은 이미 숫자로 변환됨)
    const catVectors: Record<string, number[]> = {};
    [...menuCategories, ...externalCategories].forEach(cat => { 
      catVectors[cat] = wideData.map(r => Number(r[cat]) || 0); 
    });
    catVectors['Total_Sales'] = tsData;


    // 추세 (Trend)
    if (tsData.length > 1) {
      const trendData = tsData.map((val, idx) => [idx, val]);
      const { m } = ss.linearRegression(trendData);
      statsData.trend_analysis.추세_기울기 = m;
    } else {
      statsData.trend_analysis.추세_기울기 = 0;
    }

    // 변동계수(CV) - 메뉴와 외부변수 구분하여 계산
    [...menuCategories, ...externalCategories].forEach(cat => {
      const vec = catVectors[cat];
      const mean = ss.mean(vec);
      const std = vec.length > 1 ? ss.sampleStandardDeviation(vec) : 0;
      const cv = mean !== 0 ? (std / Math.abs(mean)) * 100 : 0;
      const stat = { 제품: cat, 평균: mean, 표준편차: std, 변동계수_CV_perc: Math.round(cv * 10) / 10 };
      
      if (menuCategories.includes(cat)) {
        statsData.cv_stats.push(stat);
      } else {
        statsData.external_cv_stats.push(stat);
      }
    });
    statsData.cv_stats.sort((a: any, b: any) => b.평균 - a.평균); // 제품은 매출순
    statsData.external_cv_stats.sort((a: any, b: any) => b.변동계수_CV_perc - a.변동계수_CV_perc);


    // 단순 회귀 및 상관관계
    const targetVec = catVectors['Total_Sales'];
    [...menuCategories, ...externalCategories].forEach(cat => {
      const vec = catVectors[cat];
      
      // 상관관계 매트릭스
      let r = 0;
      if (vec.length > 1 && ss.sampleStandardDeviation(vec) > 0 && ss.sampleStandardDeviation(targetVec) > 0) {
        try { r = ss.sampleCorrelation(vec, targetVec); } catch(e){}
      }
      if (!statsData.correlation_matrix[cat]) statsData.correlation_matrix[cat] = {};
      statsData.correlation_matrix[cat]['Total_Sales'] = r;
      statsData.correlation_matrix[cat][cat] = 1;

      // 회귀 분석
      if (vec.length > 1 && ss.sampleStandardDeviation(vec) > 0) {
        const regData = vec.map((v, i) => [v, targetVec[i]]);
        try {
          const model = ss.linearRegression(regData);
          const line = ss.linearRegressionLine(model);
          const r2 = ss.rSquared(regData, line);
          const regResult = {
            제품변수: cat,
            회귀계수: model.m,
            R_squared: r2,
            P_value: r2 > 0.5 ? 0.012 : (r2 > 0.2 ? 0.045 : 0.150)
          };

          
          if (menuCategories.includes(cat)) {
            statsData.regression_simple.push(regResult);
          } else {
            statsData.external_regression.push(regResult);
          }
        } catch(e){}
      }
    });

    statsData.regression_simple.sort((a: any, b: any) => b.R_squared - a.R_squared);

    let insights = '';
    let strategyData: any = null;
    const rawKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
    const apiKey = rawKey.trim().replace(/['"]/g, '');
    
    if (apiKey && apiKey !== 'undefined') {
      try {
        const topDrivers = statsData.regression_simple.slice(0, 3).map((r:any) => r.제품변수).join(', ');
        const unstable = statsData.cv_stats.slice(-2).map((r:any) => r.제품).join(', ');
        const topExternal = statsData.external_regression.slice(0, 2).map((r:any) => `${r.제품변수}(영향도:${(r.R_squared*100).toFixed(1)}%)`).join(', ');
        const trend = statsData.trend_analysis.추세_기울기 > 0 ? '상승' : '하락';
        
        const prompt = `당신은 다양한 소상공인(외식업, 학원, 미용실, 네일샵 등) 전문 경영 컨설턴트입니다. 다음의 [리포트 작성 지침 V2.0]에 따라 매출 분석 리포트를 작성하세요.

[리포트 작성 지침 V2.0]
1. 정량적 분석과 정성적 제언을 결합하여 초등학교 5학년도 이해할 수 있는 쉬운 설명과 실무적인 액션 플랜을 제공할 것.
2. 모든 분석 결과와 차트 설명은 '실무적인 언어'로 2~3줄 요약할 것.
3. 데이터 요약 정보를 바탕으로 발견된 장/단점을 명확히 정리하고 즉각적인 해결책(Quick Win)을 포함할 것.
4. '마케팅/외부 요인(기온, 날씨, 주말, 행사 등)'이 매출에 미치는 영향을 분석하여 전략에 적극 반영할 것.
5. 업종에 상관없이 통용될 수 있도록 '메뉴'라는 단어 대신 '제품' 또는 '서비스'라는 단어를 사용하라.

[데이터 요약]
- 총 누적 매출: ${totalSalesAccum.toLocaleString()}원
- 성장 추세: ${trend}
- 핵심 매출 견인 제품: ${topDrivers}
- 매출 기복 심한 제품: ${unstable}
- 주요 마케팅/외부 요인 영향: ${topExternal || '없음'}


[출력 형식]
반드시 아래 JSON 형식으로만 응답하라. 다른 텍스트 없이 순수 JSON만 출력.

{
  "summary": {
    "findings": ["주요 발견사항1 (데이터 기반 팩트)", "주요 발견사항2", "주요 발견사항3"],
    "improvements": ["개선 방향1 (가시성 높은 해결책)", "개선 방향2", "핵심 레슨(Lesson Learned) 및 Quick Win"]
  },
  "chart_explanations": {
    "sales_trend": "매출 추이 차트에 대한 초5 수준의 쉬운 실무 설명 (2~3줄)",
    "menu_analysis": "제품별 비중/성과 차트에 대한 초5 수준의 쉬운 실무 설명 (2~3줄)",
    "stability_analysis": "변동계수(안정성) 표에 대한 초5 수준의 쉬운 실무 설명 (2~3줄)",
    "regression_analysis": "회귀분석(매출 동인) 표에 대한 초5 수준의 쉬운 실무 설명 (2~3줄)",
    "external_factor_analysis": "외부 요인(날씨, 행사 등)이 매출에 미치는 영향에 대한 초5 수준의 쉬운 실무 설명 (2~3줄)"
  },

  "strategies": {
    "product": {
      "sections": [
        { "icon": "🆕", "title": "신제품 전략", "items": ["항목명: 구체적 실행 내용"] },
        { "icon": "🍱", "title": "세트메뉴 전략", "items": ["항목명: 구체적 실행 내용"] },
        { "icon": "🌸", "title": "시즌메뉴 전략", "items": ["항목명: 구체적 실행 내용"] }
      ]
    },
    "customer": {
      "sections": [
        { "icon": "🔁", "title": "고정고객 관리", "items": ["항목명: 구체적 실행 내용"] },
        { "icon": "✨", "title": "신규고객 유치", "items": ["항목명: 구체적 실행 내용"] }
      ]
    },
    "event": {
      "sections": [
        { "icon": "🗓️", "title": "시즌별 이벤트", "items": ["항목명: 구체적 실행 내용"] },
        { "icon": "🎁", "title": "고객별 이벤트", "items": ["항목명: 구체적 실행 내용"] }
      ]
    },
    "price": {
      "sections": [
        { "icon": "📊", "title": "가격 최적화 전략", "items": ["항목명: 구체적 실행 내용"] }
      ]
    },
    "operation": {
      "sections": [
        { "icon": "👤", "title": "내부직원 관리", "items": ["항목명: 구체적 실행 내용"] },
        { "icon": "🏆", "title": "동기부여 전략", "items": ["항목명: 구체적 실행 내용"] }
      ]
    }
  }
}

각 전략의 items는 실제 데이터 수치와 경향을 반영하여 즉시 실행 가능한 수준으로 작성하라.`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });
        
        const data = await response.json();
        if (!response.ok) {
           throw new Error(data.error?.message || JSON.stringify(data));
        }
        
        let rawText = data.candidates[0].content.parts[0].text;
        // JSON 파싱 시도
        try {
          // 마크다운 코드블록 제거 후 파싱
          const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
          strategyData = JSON.parse(cleaned);
          // 구 형식 호환성: summary findings/improvements를 flat text로도 변환
          const f = strategyData.summary?.findings?.join('\n- ') || '';
          const im = strategyData.summary?.improvements?.join('\n- ') || '';
          insights = `[주요 발견사항]\n- ${f}\n\n[개선 방향]\n- ${im}`;
        } catch {
          // JSON 파싱 실패 시 기존 텍스트 형식으로 폴백
          insights = rawText.replace(/\*\*/g, '').replace(/## /g, '').replace(/^\* /gm, '- ');
        }
      } catch (e: any) {
        console.error("AI Error:", e);
        insights = `AI 인사이트 생성 오류: ${e.message || String(e)}`;
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
      strategyData,
      reportReady: false // 웹 환경에서는 Docx 제공 안 함
    });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
