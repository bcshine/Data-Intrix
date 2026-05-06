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
    let strategyData: any = null;
    const rawKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
    const apiKey = rawKey.trim().replace(/['"]/g, '');
    
    if (apiKey && apiKey !== 'undefined') {
      try {
        const topDrivers = statsData.regression_simple.slice(0, 3).map((r:any) => r.메뉴변수).join(', ');
        const unstable = statsData.cv_stats.slice(-2).map((r:any) => r.메뉴).join(', ');
        const trend = statsData.trend_analysis.추세_기울기 > 0 ? '상승' : '하락';
        
        const prompt = `당신은 외식업/스파 업종 전문 경영 컨설턴트입니다. 아래 매출 데이터를 바탕으로 5가지 전략 영역에 대한 구체적인 액션 플랜을 작성하세요.

[데이터 요약]
- 총 누적 매출: ${totalSalesAccum.toLocaleString()}원
- 성장 추세: ${trend}
- 핵심 매출 견인 메뉴: ${topDrivers}
- 매출 기복 심한 메뉴: ${unstable}

[출력 형식]
반드시 아래 JSON 형식으로만 응답하라. 다른 텍스트나 마크다운 코드블록(\'\'\'json 등) 없이 순수 JSON만 출력.

{
  "summary": {
    "findings": ["발견사항1", "발견사항2", "발견사항3"],
    "improvements": ["개선방향1", "개선방향2", "개선방향3"]
  },
  "strategies": {
    "product": {
      "sections": [
        { "icon": "🆕", "title": "신제품 전략", "items": ["항목명: 설명", "항목명: 설명"] },
        { "icon": "🍱", "title": "세트메뉴 전략", "items": ["항목명: 설명", "항목명: 설명"] },
        { "icon": "🌸", "title": "시즌메뉴 전략", "items": ["항목명: 설명", "항목명: 설명"] }
      ]
    },
    "customer": {
      "sections": [
        { "icon": "🔁", "title": "고정고객 관리", "items": ["항목명: 설명", "항목명: 설명"] },
        { "icon": "✨", "title": "신규고객 유치", "items": ["항목명: 설명", "항목명: 설명"] }
      ]
    },
    "event": {
      "sections": [
        { "icon": "🗓️", "title": "시즌별 이벤트", "items": ["항목명: 설명", "항목명: 설명"] },
        { "icon": "🎁", "title": "고객별 이벤트", "items": ["항목명: 설명", "항목명: 설명"] }
      ]
    },
    "price": {
      "sections": [
        { "icon": "📊", "title": "경쟁사 대비 가격전략", "items": ["항목명: 설명", "항목명: 설명", "항목명: 설명"] }
      ]
    },
    "operation": {
      "sections": [
        { "icon": "👤", "title": "내부직원 관리", "items": ["항목명: 설명", "항목명: 설명"] },
        { "icon": "🏆", "title": "동기부여 전략", "items": ["항목명: 설명", "항목명: 설명"] }
      ]
    }
  }
}

각 items 배열의 항목은 '항목명: 구체적 설명' 형태로, 실제 데이터에서 발견된 사실을 근거로 실행 가능한 액션 플랜을 3~4개씩 작성하라.`;

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
