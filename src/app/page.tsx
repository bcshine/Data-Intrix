'use client';
import React, { useState, useMemo } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine } from 'recharts';
import styles from './page.module.css';


const COLORS = ['#1e3a5f','#2563eb','#0ea5e9','#0d9488','#6366f1','#8b5cf6','#94a3b8'];
const C = { navy:'#1e3a5f', blue:'#2563eb', light:'#eff6ff', border:'#e2e8f0', text:'#0f172a', sub:'#475569', bg:'#f8fafc' };

const wrap: React.CSSProperties = { 
  maxWidth: 960, 
  width: '95%',
  margin: '2rem auto', 
  background: '#fff', 
  padding: '3rem 4rem', 
  boxShadow: '0 10px 40px rgba(0,0,0,0.1)', 
  fontFamily: "'Noto Sans KR','Apple SD Gothic Neo',sans-serif", 
  color: C.text,
  borderRadius: 8,
  position: 'relative',
  zIndex: 1
};

function Divider() { return <hr className="pdf-keep-next" style={{border:'none',borderTop:`2px solid ${C.navy}`,margin:'2rem 0'}} />; }

function SecTitle({ n, t }: { n:string; t:string }) {
  return (
    <div className="pdf-keep-next" style={{display:'flex',alignItems:'center',gap:'0.9rem',margin:'2.5rem 0 1.2rem',borderLeft:`6px solid ${C.blue}`,paddingLeft:'1rem',background:C.light,padding:'0.9rem 1rem',borderRadius:'0 4px 4px 0', pageBreakAfter: 'avoid', pageBreakInside: 'avoid'}}>
      <span style={{background:C.navy,color:'#fff',padding:'0.3rem 0.9rem',borderRadius:3,fontSize:'0.95rem',fontWeight:900,letterSpacing:1}}>{n}</span>
      <h2 style={{margin:0,fontSize:'1.3rem',fontWeight:900,color:C.navy,letterSpacing:'-0.3px'}}>{t}</h2>
    </div>
  );
}

function Box({ title, children, half=false }: { title:string; children:React.ReactNode; half?:boolean }) {
  return (
    <div style={{border:`1px solid ${C.border}`,borderRadius:4,padding:'1.2rem 1.4rem',width:half?'calc(50% - 0.5rem)':'100%',marginBottom:'1rem',boxSizing:'border-box', pageBreakInside: 'avoid'}}>
      <div style={{fontSize:'1.05rem',fontWeight:800,color:C.navy,borderBottom:`2px solid ${C.light}`,paddingBottom:'0.6rem',marginBottom:'1rem',letterSpacing:'-0.2px'}}>{title}</div>
      {children}
    </div>
  );
}

function Caption({ text }: { text:string }) {
  return <p style={{margin:'1rem 0 0',fontSize:'0.88rem',color:C.sub,lineHeight:1.7,borderLeft:`3px solid ${C.blue}`,paddingLeft:'0.8rem',background:C.bg,padding:'0.7rem 0.8rem',borderRadius:'0 4px 4px 0'}}>{text}</p>;
}

function Insights({ text }: { text:string }) {
  // 섹션 레이블 색상 매핑
  const sectionColor: Record<string, string> = {
    '주요': '#d97706', '발견': '#d97706',
    '강점': '#059669', '장점': '#059669',
    '약점': '#dc2626', '단점': '#dc2626',
    '개선': '#2563eb', '방향': '#2563eb', 'Action': '#7c3aed', 'action': '#7c3aed'
  };
  const getColor = (label: string) => {
    for (const key of Object.keys(sectionColor)) {
      if (label.includes(key)) return sectionColor[key];
    }
    return C.navy;
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'0'}}>
      {text.split('\n').map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{height:'0.5rem'}}/>;

        // [섹션명] 소제목 형식 — 예: [강점] 핵심 엔진의 존재
        const sectionMatch = t.match(/^\[([^\]]+)\]\s*(.+)?/);
        if (sectionMatch) {
          const label = sectionMatch[1];
          const subtitle = sectionMatch[2] || '';
          const color = getColor(label);
          return (
            <div key={i} style={{marginTop:'1.6rem',marginBottom:'0.8rem'}}>
              <div style={{display:'flex',alignItems:'baseline',gap:'0.7rem'}}>
                <span style={{background:color,color:'#fff',padding:'0.25rem 0.8rem',borderRadius:3,fontSize:'0.85rem',fontWeight:900,flexShrink:0}}>{label}</span>
                <span style={{fontSize:'1.05rem',fontWeight:900,color:C.navy,letterSpacing:'-0.3px'}}>{subtitle}</span>
              </div>
              <div style={{height:2,background:color,marginTop:'0.5rem',opacity:0.3,borderRadius:1}}/>
            </div>
          );
        }

        // - 항목명: 설명 형식 — 항목명은 볼드, 설명은 일반체
        if (t.startsWith('-') || t.startsWith('•')) {
          const content = t.replace(/^[-•]\s*/, '');
          const colonIdx = content.indexOf(':');
          const hasBoldLabel = colonIdx > 0 && colonIdx < 20;
          return (
            <div key={i} style={{display:'flex',gap:'0.6rem',marginBottom:'0.6rem',paddingLeft:'0.3rem',alignItems:'flex-start'}}>
              <span style={{color:C.blue,fontWeight:900,flexShrink:0,marginTop:'0.15rem'}}>•</span>
              <span style={{fontSize:'0.92rem',lineHeight:1.7,color:C.sub}}>
                {hasBoldLabel ? (
                  <>
                    <strong style={{color:C.text,fontWeight:800}}>{content.slice(0, colonIdx)}</strong>
                    <span style={{color:'#64748b'}}>: {content.slice(colonIdx + 1).trim()}</span>
                  </>
                ) : content}
              </span>
            </div>
          );
        }

        // 일반 텍스트
        return <p key={i} style={{fontSize:'0.9rem',color:C.sub,lineHeight:1.7,margin:'0 0 0.3rem'}}>{t}</p>;
      })}
    </div>
  );
}

// ── 전략 섹션 정의
const STRATEGY_SECTIONS = [
  { key: 'product',     icon: '🍽️', label: '제품 전략' },
  { key: 'customer',   icon: '👥', label: '고객관리 전략' },
  { key: 'event',      icon: '🎉', label: '이벤트 전략' },
  { key: 'price',      icon: '💰', label: '가격 전략' },
  { key: 'operation',  icon: '🏢', label: '조직관리 전략' },
];


// ── 전략 컨텐츠 렌더러
function StrategyCard({ icon, title, items }: { icon: string; title: string; items: string[] }) {
  return (
    <div style={{border:`1px solid ${C.border}`,borderRadius:6,padding:'1.2rem 1.4rem',marginBottom:'0.9rem',background:'#fff',boxSizing:'border-box'}}>
      <div style={{display:'flex',alignItems:'center',gap:'0.6rem',marginBottom:'0.8rem'}}>
        <span style={{fontSize:'1.2rem'}}>{icon}</span>
        <span style={{fontWeight:800,fontSize:'1rem',color:C.navy}}>{title}</span>
      </div>
      <ul style={{margin:0,padding:0,listStyle:'none',display:'flex',flexDirection:'column',gap:'0.5rem'}}>
        {items.map((item, i) => {
          const colonIdx = item.indexOf(':');
          const hasBold = colonIdx > 0 && colonIdx < 25;
          return (
            <li key={i} style={{display:'flex',gap:'0.5rem',alignItems:'flex-start',fontSize:'0.9rem',lineHeight:1.7,color:C.sub}}>
              <span style={{color:C.blue,fontWeight:900,flexShrink:0,marginTop:'0.15rem'}}>•</span>
              <span>
                {hasBold ? (<><strong style={{color:C.text,fontWeight:800}}>{item.slice(0,colonIdx)}</strong><span style={{color:'#64748b'}}>: {item.slice(colonIdx+1).trim()}</span></>) : item}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StrategyTabPanel({ tabKey, strategyData }: { tabKey: string; strategyData: any }) {
  if (!strategyData || !strategyData[tabKey]) {
    return <p style={{color:C.sub,fontSize:'0.9rem',textAlign:'center',padding:'2rem 0'}}>분석 데이터를 불러오는 중입니다...</p>;
  }
  const d = strategyData[tabKey];
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'0'}}>
      {(d.sections||[]).map((sec: any, i: number) => (
        <StrategyCard key={i} icon={sec.icon||'📌'} title={sec.title} items={sec.items||[]} />
      ))}
    </div>
  );
}

export default function Home() {
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const processFile = async (file: File) => {
    setFileName(file.name); setUploading(true); setError('');
    const fd = new FormData(); fd.append('file', file);
    try {
      const res = await fetch('/api/analyze',{method:'POST',body:fd});
      if(!res.ok) throw new Error('분석 오류');
      setResult(await res.json());
    } catch(e:any){setError(e.message);}
    finally{setUploading(false);}
  };

  const derived = useMemo(()=>{
    if(!result?.wideData?.length) return null;
    const data = result.wideData;
    const cats = Object.keys(data[0]).filter(k=>k.startsWith('Amt_'));
    const catTotals = cats.map(k=>({name:k.replace('Amt_',''),value:data.reduce((s:number,r:any)=>s+(r[k]||0),0)})).sort((a:any,b:any)=>b.value-a.value);
    const monthlyTotal = data.map((r:any)=>({period:r.Period_Start,total:cats.reduce((s:number,k:string)=>s+(r[k]||0),0)}));
    const growthRate = monthlyTotal.map((r:any,i:number)=>({period:r.period,growth:i===0?0:Number((((r.total-monthlyTotal[i-1].total)/monthlyTotal[i-1].total)*100).toFixed(1))}));
    const regSimple:any[] = result.statsData?.regression_simple||[];
    const corrMatrix = result.statsData?.correlation_matrix||{};
    const cvStats = result.statsData?.cv_stats||[];
    const trend = result.statsData?.trend_analysis||{};
    const totalSales = monthlyTotal.reduce((s:number,r:any)=>s+r.total,0);
    const avgMonthly = totalSales/monthlyTotal.length;
    return {catTotals,monthlyTotal,growthRate,regSimple,corrMatrix,cvStats,trend,totalSales,avgMonthly};
  },[result]);

  /* ── 업로드 화면 ── */
  if(!result) return (
    <main style={{background:'#f1f5f9',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#fff',padding:'3rem',borderRadius:8,boxShadow:'0 4px 20px rgba(0,0,0,0.06)',textAlign:'center',maxWidth:480,width:'100%'}}>
        <div style={{width:64,height:64,background:C.navy,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 1.5rem',fontSize:'1.8rem',boxShadow:'0 4px 12px rgba(30,58,95,0.2)'}}>📊</div>
        <h1 style={{fontSize:'1.6rem',fontWeight:900,color:C.navy,margin:'0 0 0.8rem',letterSpacing:'-0.5px'}}>매출 분석 리포트 생성기</h1>
        <p style={{color:C.sub,fontSize:'0.95rem',margin:'0 0 2.5rem',lineHeight:1.7}}>POS 매출 엑셀 데이터를 업로드하시면<br/>AI가 자동으로 전문 분석 리포트를 생성합니다.</p>
        {uploading ? (
          <div><div className={styles.spinner} style={{margin:'0 auto 1rem'}}/><p style={{color:C.sub,fontSize:'0.88rem'}}>{fileName} 분석 중... (약 30초 소요)</p></div>
        ):(
          <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)processFile(f);}}
            style={{border:`2px dashed ${dragging?C.blue:'#cbd5e1'}`,borderRadius:8,padding:'2rem',background:dragging?C.light:C.bg,transition:'all 0.2s'}}>
            <label style={{cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:'0.8rem'}}>
              <span style={{background:C.navy,color:'#fff',padding:'0.6rem 1.8rem',borderRadius:99,fontSize:'0.9rem',fontWeight:700}}>파일 선택</span>
              <span style={{color:'#94a3b8',fontSize:'0.8rem'}}>또는 여기에 드래그</span>
              <input type="file" style={{display:'none'}} accept=".xlsx,.csv" onChange={e=>{const f=e.target.files?.[0];if(f)processFile(f);}}/>
            </label>
          </div>
        )}
        {error&&<p style={{color:'#ef4444',marginTop:'1rem',fontSize:'0.88rem'}}>{error}</p>}
      </div>
    </main>
  );

  const exportToPDF = async () => {
    const btn = document.getElementById('export-btn');
    if (btn) btn.innerText = 'PDF 굽는 중... ⏳';

    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 12; // 12mm 여백
      const contentWidth = pdfWidth - margin * 2;
      let currentY = margin;
      
      // 버튼 숨기기
      if (btn) btn.style.display = 'none';

      // 껍데기가 아닌 안쪽 블록(Box, Title 등)들을 하나씩 찰칵 찍어서 조립
      const elements = document.getElementById("report-wrapper")?.children;
      if (!elements) return;

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i] as HTMLElement;
        if (el.tagName === 'STYLE' || el.tagName === 'BUTTON') continue;
        
        // 요소 높이가 0이면 건너뜀 (빈 조각 방지)
        if (el.offsetHeight === 0) continue;

        // 투명 배경 방지를 위해 캔버스를 흰색으로 고정
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        
        const elHeightMm = (canvas.height * contentWidth) / canvas.width;
        
        let spaceNeeded = elHeightMm;
        // 제목이나 구분선일 때 남은 공간이 75mm(약 1/4) 미만이면, 제목만 덩그러니 남는 고아(Orphan) 현상을 막기 위해 통째로 다음 장으로 넘김
        if ((el.className || '').includes('pdf-keep-next') && (pdfHeight - margin - currentY) < 75) {
          spaceNeeded = 9999;
        }
        
        // 현재 조각이 남은 페이지 공간을 넘어서면 새 페이지로 넘김 (차트 두동강 완벽 방지)
        if (currentY + spaceNeeded > pdfHeight - margin) {
          pdf.addPage();
          currentY = margin;
        }
        
        pdf.addImage(imgData, 'JPEG', margin, currentY, contentWidth, elHeightMm);
        currentY += elHeightMm + 4; // 요소 간 4mm 간격
      }

      // 페이지 번호 및 푸터 추가
      const totalPages = pdf.internal.getNumberOfPages();
      for (let j = 1; j <= totalPages; j++) {
        pdf.setPage(j);
        pdf.setFontSize(9);
        pdf.setTextColor(100);
        // 중앙 하단: - 1 / 3 -
        pdf.text(`- ${j} / ${totalPages} -`, pdfWidth / 2, pdfHeight - 8, { align: 'center' });
        
        // 우측 하단: 분석 기관 (작게)
        pdf.setFontSize(7);
        pdf.setTextColor(150);
        pdf.text('중간계 인트릭스 연구소', pdfWidth - margin, pdfHeight - 8, { align: 'right' });
      }

      pdf.save(`${fileName.replace(/\.[^/.]+$/, '')}_AI_전략리포트.pdf`);
      
      // 버튼 복구
      if (btn) btn.style.display = 'inline-block';
      
    } catch(e) {
      alert("PDF 변환 중 오류가 발생했습니다.");
    } finally {
      if (btn) btn.innerText = 'PDF로 내보내기 📄';
    }
  };

  /* ── 리포트 화면 ── */
  return (
    <main style={{background:'#e2e8f0',padding:'2rem 1rem',minHeight:'100vh'}}>
      <div id="report-wrapper" style={wrap}>

        {/* 표지 */}
        <div className="print-avoid-break" style={{position: 'relative', textAlign:'center',padding:'3rem 0 2rem',borderBottom:`4px solid ${C.navy}`}}>
          <button id="export-btn" onClick={exportToPDF} style={{position: 'absolute', top: '1.5rem', right: '0', background: C.navy, color: '#fff', border: 'none', padding: '0.6rem 1rem', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}}>PDF로 내보내기 📄</button>
          <p style={{color:C.sub,fontSize:'0.85rem',fontWeight:600,margin:'0 0 0.8rem',letterSpacing:2}}>CONFIDENTIAL · BUSINESS INTELLIGENCE REPORT</p>
          <h1 style={{fontSize:'2.2rem',fontWeight:900,color:C.navy,margin:'0 0 0.5rem',lineHeight:1.3}}>매출 데이터 분석 및<br/>전략 리포트</h1>
          <p style={{color:C.blue,fontSize:'1rem',fontWeight:700,margin:'0 0 2rem'}}>{fileName.replace(/\.[^/.]+$/,'')}</p>
          <div style={{display:'inline-flex',gap:'2rem',background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,padding:'1rem 2rem',fontSize:'0.85rem',color:C.sub}}>
            <span><strong>작성일:</strong> {new Date().toLocaleDateString('ko-KR')}</span>
            <span><strong>분석 기간:</strong> {derived?.monthlyTotal?.[0]?.period} ~ {derived?.monthlyTotal?.slice(-1)[0]?.period}</span>
            <span><strong>분석:</strong> 중간계 인트릭스 연구소</span>
          </div>
          {/* Executive Summary */}
          <div style={{marginTop:'2rem',background:C.light,border:`1px solid #bfdbfe`,borderRadius:4,padding:'1.2rem 2rem',textAlign:'left'}}>
            <div style={{fontWeight:800,color:C.navy,fontSize:'0.9rem',marginBottom:'0.6rem'}}>▶ Executive Summary</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'1rem'}}>
              {[
                {label:'총 누적 매출',value:`${((derived?.totalSales||0)/100000000).toFixed(2)}억원`},
                {label:'평균 월 매출',value:`${((derived?.avgMonthly||0)/10000).toFixed(0)}만원`},
                {label:'성장 추세',value:derived?.trend?.추세_기울기>0?`▲ 월 +${((derived?.trend?.추세_기울기||0)/10000).toFixed(0)}만`:`▼ 월 ${((derived?.trend?.추세_기울기||0)/10000).toFixed(0)}만`},
              ].map((item,i)=>(
                <div key={i} style={{textAlign:'center',padding:'0.8rem',background:'#fff',borderRadius:4,border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:'0.78rem',color:C.sub,marginBottom:'0.3rem'}}>{item.label}</div>
                  <div style={{fontSize:'1.3rem',fontWeight:900,color:C.navy}}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {derived && (<>
          <Divider/>

          {/* 1. 월별 매출 */}
          <SecTitle n="Ⅰ" t="월별 총매출 현황"/>
          <Box title="월별 총매출 추이 (단위: 만원)">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={derived.monthlyTotal} margin={{top:10,right:20,left:10,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                <XAxis dataKey="period" tick={{fontSize:10,fill:C.sub}}/>
                <YAxis tick={{fontSize:10,fill:C.sub}} tickFormatter={v=>`${(v/10000).toFixed(0)}만`}/>
                <Tooltip formatter={(v:any)=>[Number(v).toLocaleString()+'원','매출']}/>
                <Bar dataKey="total" fill={C.navy} radius={[2,2,0,0]} maxBarSize={60}/>
              </BarChart>
            </ResponsiveContainer>
            <Caption text={result.strategyData?.chart_explanations?.sales_trend || '월별 총매출 추이입니다. 계절성 및 성장 패턴을 확인하세요.'}/>
          </Box>


          <Box title="전월 대비 매출 성장률 (%)">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={derived.growthRate.slice(1)} margin={{top:10,right:20,left:10,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                <XAxis dataKey="period" tick={{fontSize:10,fill:C.sub}}/>
                <YAxis tick={{fontSize:10,fill:C.sub}} unit="%"/>
                <Tooltip formatter={(v:any)=>[`${v}%`,'성장률']}/>
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4"/>
                <Line type="monotone" dataKey="growth" stroke={C.blue} strokeWidth={2} dot={{r:4,fill:C.blue}}/>
              </LineChart>
            </ResponsiveContainer>
            <Caption text="전월 대비 매출 성장률입니다. 양수는 성장, 음수는 하락을 의미합니다."/>
          </Box>

          <Divider/>

          {/* 2. 메뉴별 매출 */}
          <SecTitle n="Ⅱ" t="메뉴별 매출 분석"/>
          <div style={{display:'flex',gap:'1rem',flexWrap:'wrap'}}>
            <Box title="메뉴별 누적 매출 (단위: 만원)" half={true}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={derived.catTotals.slice(0,8)} layout="vertical" margin={{left:10,right:10}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:9,fill:C.sub}} tickFormatter={v=>`${(v/10000).toFixed(0)}만`}/>
                  <YAxis dataKey="name" type="category" tick={{fontSize:9,fill:C.sub,fontWeight:600}} width={90}/>
                  <Tooltip formatter={(v:any)=>[Number(v).toLocaleString()+'원']}/>
                  <Bar dataKey="value" radius={[0,2,2,0]} maxBarSize={20}>
                    {derived.catTotals.slice(0,8).map((_:any,i:number)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <Caption text={result.strategyData?.chart_explanations?.menu_analysis || '메뉴별 누적 매출 비중을 나타냅니다.'}/>
            </Box>

            <Box title="메뉴별 매출 비중 (파이차트)" half={true}>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={derived.catTotals.slice(0,6)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                    label={({name,percent}:{name?:string;percent?:number})=>`${(name??'').slice(0,6)} ${((percent??0)*100).toFixed(0)}%`}
                    labelLine={true} fontSize={9}>
                    {derived.catTotals.slice(0,6).map((_:any,i:number)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Pie>
                  <Tooltip formatter={(v:any)=>[Number(v).toLocaleString()+'원']}/>
                </PieChart>
              </ResponsiveContainer>
              <Caption text={result.strategyData?.chart_explanations?.menu_analysis || '전체 매출에서 각 메뉴가 차지하는 비중입니다.'}/>
            </Box>

          </div>

          {/* 변동계수 표 */}
          {derived.cvStats.length>0&&(
            <Box title="메뉴별 매출 안정성 분석 (변동계수 CV%)">
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
                <thead>
                  <tr style={{background:C.navy,color:'#fff'}}>
                    {['메뉴','평균 매출','표준편차','변동계수(CV%)','안정성 판정'].map(h=><th key={h} style={{padding:'0.5rem 0.8rem',textAlign:'left',fontWeight:700}}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {derived.cvStats.slice(0,7).map((s:any,i:number)=>{
                    const unstable=s.변동계수_CV_perc>50;
                    return(
                      <tr key={i} style={{borderBottom:`1px solid ${C.border}`,background:i%2?C.bg:'#fff'}}>
                        <td style={{padding:'0.5rem 0.8rem',fontWeight:600}}>{s.메뉴}</td>
                        <td style={{padding:'0.5rem 0.8rem'}}>{(s.평균/10000).toFixed(0)}만원</td>
                        <td style={{padding:'0.5rem 0.8rem'}}>{(s.표준편차/10000).toFixed(0)}만원</td>
                        <td style={{padding:'0.5rem 0.8rem',fontWeight:700}}>{s.변동계수_CV_perc}%</td>
                        <td style={{padding:'0.5rem 0.8rem'}}>
                          <span style={{color:unstable?'#dc2626':'#059669',fontWeight:700,background:unstable?'#fef2f2':'#ecfdf5',padding:'0.2rem 0.6rem',borderRadius:3,fontSize:'0.8rem'}}>{unstable?'불안정':'안정'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Caption text={result.strategyData?.chart_explanations?.stability_analysis || '변동계수(CV%)가 50% 이상인 메뉴는 매출 기복이 심하여 안정적 수익 확보에 주의가 필요합니다.'}/>
            </Box>

          )}

          <Divider/>

          {/* 3. 회귀분석 */}
          {derived.regSimple.length>0&&(<>
            <SecTitle n="Ⅲ" t="회귀분석 결과"/>
            <Box title="메뉴변수 단순회귀분석 결과 (독립변수 → 총매출)">
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
                <thead>
                  <tr style={{background:C.navy,color:'#fff'}}>
                    {['메뉴 변수','회귀계수(β)','R² (설명력)','P-value','유의성'].map(h=><th key={h} style={{padding:'0.5rem 0.8rem',textAlign:'left',fontWeight:700}}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {derived.regSimple.map((r:any,i:number)=>{
                    const sig=r.P_value<0.05;
                    return(
                      <tr key={i} style={{borderBottom:`1px solid ${C.border}`,background:i%2?C.bg:'#fff'}}>
                        <td style={{padding:'0.5rem 0.8rem',fontWeight:600}}>{r.메뉴변수}</td>
                        <td style={{padding:'0.5rem 0.8rem'}}>{r.회귀계수?.toFixed(3)??'-'}</td>
                        <td style={{padding:'0.5rem 0.8rem',fontWeight:700,color:r.R_squared>0.5?C.navy:C.sub}}>{(r.R_squared*100).toFixed(1)}%</td>
                        <td style={{padding:'0.5rem 0.8rem'}}>{r.P_value?.toFixed(4)??'-'}</td>
                        <td style={{padding:'0.5rem 0.8rem'}}><span style={{color:sig?'#059669':'#94a3b8',fontWeight:700,fontSize:'0.8rem',background:sig?'#ecfdf5':'#f8fafc',padding:'0.2rem 0.5rem',borderRadius:3}}>{sig?'✓ 유의미':'—'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Caption text={result.strategyData?.chart_explanations?.regression_analysis || 'R²(결정계수)는 해당 메뉴 매출이 총매출 변동을 얼마나 설명하는지를 나타냅니다. P<0.05인 항목이 통계적으로 유의미한 핵심 매출 동인입니다.'}/>
            </Box>

          </>)}

          {/* 상관관계 매트릭스 */}
          {Object.keys(derived.corrMatrix).length>0&&(
            <Box title="메뉴 간 상관관계 매트릭스 (Pearson r)">
              <div style={{overflowX:'auto'}}>
                <table style={{borderCollapse:'collapse',fontSize:'0.8rem',margin:'0 auto'}}>
                  <thead>
                    <tr>
                      <th style={{padding:'0.4rem 0.7rem',background:C.navy,color:'#fff'}}></th>
                      {Object.keys(derived.corrMatrix).filter(k=>k!=='Total_Sales').slice(0,5).map(k=>(
                        <th key={k} style={{padding:'0.4rem 0.7rem',background:C.navy,color:'#fff',fontWeight:700}}>{k.slice(0,8)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(derived.corrMatrix).filter(k=>k!=='Total_Sales').slice(0,5).map((rowKey,i)=>(
                      <tr key={rowKey}>
                        <td style={{padding:'0.4rem 0.7rem',fontWeight:700,background:C.bg,borderRight:`1px solid ${C.border}`}}>{rowKey.slice(0,8)}</td>
                        {Object.keys(derived.corrMatrix).filter(k=>k!=='Total_Sales').slice(0,5).map(colKey=>{
                          const val=derived.corrMatrix[colKey]?.[rowKey];
                          if(val===undefined) return <td key={colKey}></td>;
                          const hi=val>0.7&&val<1; const neg=val<-0.3;
                          return <td key={colKey} style={{padding:'0.4rem 0.7rem',textAlign:'center',background:val===1?C.bg:(hi?'#ecfdf5':(neg?'#fef2f2':'#fff')),color:val===1?'#94a3b8':(hi?'#059669':(neg?'#dc2626':C.sub)),fontWeight:hi||neg?700:400,borderBottom:`1px solid ${C.border}`}}>{val===1?'—':val.toFixed(2)}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Caption text="초록(r>0.7): 강한 동반성장 관계. 빨강(r<-0.3): 대체재 관계(카니발리제이션 주의). 두 메뉴를 동시에 프로모션 시 효과 반감 가능성이 있습니다."/>
            </Box>
          )}

          <Divider/>

          {/* 4. AI 전략적 제언 */}
          <SecTitle n="Ⅳ" t="전략적 제언 및 Action Plan"/>

          {/* 4-0. 주요 발견사항 & 개선 방향 요약 카드 */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginBottom:'1.5rem'}}>
            {/* 주요 발견사항 */}
            <div style={{border:`2px solid #d97706`,borderRadius:6,padding:'1.4rem 1.6rem',background:'#fffbeb',position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:4,background:'#d97706'}}/>
              <div style={{display:'flex',alignItems:'center',gap:'0.6rem',marginBottom:'1rem'}}>
                <span style={{background:'#d97706',color:'#fff',padding:'0.25rem 0.8rem',borderRadius:3,fontSize:'0.9rem',fontWeight:900}}>주요 발견사항 (Findings)</span>
              </div>

              {result.strategyData?.summary?.findings?.length > 0 ? (
                <ul style={{margin:0,padding:0,listStyle:'none',display:'flex',flexDirection:'column',gap:'0.5rem'}}>
                  {result.strategyData.summary.findings.map((f: string, i: number) => (
                    <li key={i} style={{display:'flex',gap:'0.5rem',alignItems:'flex-start',fontSize:'0.9rem',lineHeight:1.7,color:'#92400e'}}>
                      <span style={{color:'#d97706',fontWeight:900,flexShrink:0}}>•</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Insights text={result.insights?.split('[개선')[0] || ''} />
              )}
            </div>
            {/* 개선 방향 */}
            <div style={{border:`2px solid ${C.blue}`,borderRadius:6,padding:'1.4rem 1.6rem',background:C.light,position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:4,background:C.blue}}/>
              <div style={{display:'flex',alignItems:'center',gap:'0.6rem',marginBottom:'1rem'}}>
                <span style={{background:C.blue,color:'#fff',padding:'0.25rem 0.8rem',borderRadius:3,fontSize:'0.9rem',fontWeight:900}}>개선 방향 (Improvements)</span>
              </div>

              {result.strategyData?.summary?.improvements?.length > 0 ? (
                <ul style={{margin:0,padding:0,listStyle:'none',display:'flex',flexDirection:'column',gap:'0.5rem'}}>
                  {result.strategyData.summary.improvements.map((f: string, i: number) => (
                    <li key={i} style={{display:'flex',gap:'0.5rem',alignItems:'flex-start',fontSize:'0.9rem',lineHeight:1.7,color:'#1e40af'}}>
                      <span style={{color:C.blue,fontWeight:900,flexShrink:0}}>•</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Insights text={result.insights?.split('[개선')[1] ? '[개선' + result.insights.split('[개선')[1] : ''} />
              )}
            </div>
          </div>

          {/* 4-1. 5대 전략 상세 (세로 나열) */}
          {STRATEGY_SECTIONS.map(section => (
            <div key={section.key} className="pdf-keep-next" style={{border:`2px solid ${C.navy}`,borderRadius:6,marginBottom:'1.5rem',overflow:'hidden', pageBreakInside: 'avoid', background: '#fff'}}>
              {/* 섹션 헤더 */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:C.navy,padding:'1rem 1.6rem'}}>
                <div style={{display:'flex',alignItems:'center',gap:'0.7rem'}}>
                  <span style={{fontSize:'1.5rem'}}>{section.icon}</span>
                  <div style={{fontSize:'1.15rem',fontWeight:900,color:'#fff'}}>{section.label}</div>
                </div>
                <div style={{width:40,height:40,borderRadius:'50%',border:`2px solid rgba(255,255,255,0.8)`,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,0.9)',fontWeight:900,fontSize:'0.65rem',transform:'rotate(-10deg)',flexShrink:0}}>승&nbsp;인</div>
              </div>
              {/* 섹션 바디 */}
              <div style={{padding:'1.6rem',background:'#f8fafc'}}>
                <StrategyTabPanel tabKey={section.key} strategyData={result.strategyData?.strategies} />
              </div>
            </div>
          ))}


          {/* 리포트 하단 */}
          <div style={{marginTop:'3rem',borderTop:`1px solid ${C.border}`,paddingTop:'1rem',display:'flex',justifyContent:'space-between',fontSize:'0.78rem',color:'#94a3b8'}}>
            <span>분석: 중간계 인트릭스 연구소</span>
            <span>본 보고서는 POS 매출 데이터 기반 정량 분석 결과물입니다.</span>
            <span>© 2026 Data Intrix</span>
          </div>
        </>)}
      </div>
    </main>
  );
}
