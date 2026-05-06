import { NextRequest, NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

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
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    // 1. 데이터 파싱
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
        if (!wideDataMap[currentStart]) {
          wideDataMap[currentStart] = { Period_Start: currentStart };
        }
        const totalAmt = cleanNumeric(row[7]);
        wideDataMap[currentStart][category] = totalAmt;
      }
    }

    const wideData = Object.values(wideDataMap).sort((a, b) => a.Period_Start.localeCompare(b.Period_Start));

    // 빈 값 0으로 채우기
    const allCategories = new Set<string>();
    wideData.forEach(row => Object.keys(row).forEach(k => k !== 'Period_Start' && allCategories.add(k)));
    wideData.forEach(row => {
      allCategories.forEach(cat => {
        if (row[cat] === undefined) row[cat] = 0;
      });
    });

    // 2. 파이썬 분석을 위해 CSV로 임시 저장
    const projectRoot = process.cwd(); // 최상위 폴더 사용
    const tempCsvPath = path.join(projectRoot, 'temp_widedata.csv');
    
    if (wideData.length > 0) {
      const headers = ['Period_Start', ...Array.from(allCategories)];
      const csvRows = [headers.join(',')];
      for (const row of wideData) {
        const values = headers.map(h => row[h]);
        csvRows.push(values.join(','));
      }
      fs.writeFileSync(tempCsvPath, csvRows.join('\n'), 'utf-8');
    }

    // 3. 파이썬 스크립트 실행 (통계 분석 및 워드 파일 생성)
    let pythonOutput = '';
    try {
      // 가상환경이나 글로벌 파이썬 호출
      const analyzerCmd = `python analyzer.py temp_widedata.csv`;
      const reportCmd = `python report_generator.py analysis_results.json DataIntrix_Consulting_Report.docx`;
      
      console.log('Running python scripts...');
      await execAsync(analyzerCmd, { cwd: projectRoot });
      await execAsync(reportCmd, { cwd: projectRoot });
      pythonOutput = '분석 리포트 생성 완료';
    } catch (e: any) {
      console.error('Python execution error:', e);
      pythonOutput = `Python Error: ${e.message}`;
    }

    // 4. 결과 JSON 읽어오기
    let insights = '';
    let monthlyCaption = '';
    let categoryCaption = '';
    let statsData = null;
    const jsonPath = path.join(projectRoot, 'analysis_results.json');
    if (fs.existsSync(jsonPath)) {
      const resultData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      statsData = resultData;
      if (resultData.ai_insights) {
          insights = resultData.ai_insights;
          monthlyCaption = resultData.ai_monthly_caption || '';
          categoryCaption = resultData.ai_category_caption || '';
      } else {
          insights = "✅ 심층 회귀분석 및 증권사 리포트용 워드 파일(.docx) 생성이 완료되었습니다.\n아래에서 상세 분석 결과를 먼저 확인하실 수 있습니다.";
      }
    } else {
      insights = "⚠️ 분석 결과를 불러오지 못했습니다. 파이썬 스크립트 오류를 확인하세요.\n" + pythonOutput;
    }

    return NextResponse.json({ 
      wideData: wideData.map(d => {
        const newD: any = { Period_Start: d.Period_Start };
        Object.keys(d).forEach(k => {
          if (k !== 'Period_Start') newD[`Amt_${k}`] = d[k];
        });
        return newD;
      }), 
      statsData,
      insights,
      monthlyCaption,
      categoryCaption,
      reportReady: fs.existsSync(path.join(projectRoot, 'DataIntrix_Consulting_Report.docx'))
    });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
