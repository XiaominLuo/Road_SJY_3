import React, { useState, useEffect } from 'react';
import { Compass, Layers, Cpu, ChevronRight, Map as MapIcon, Users, Leaf, ScanSearch, ArrowRight, Activity, Database, ShieldCheck, Lock, MousePointer2, Check, Globe2 } from 'lucide-react';

interface LandingPageProps {
  onStart: () => void;
}

// Background Pattern: Subtle Topographic Lines (Dark on Light)
const TopoPattern = () => (
  <svg className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
    <pattern id="topo" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
      <path d="M0 100 C 20 0 50 0 100 100 Z" fill="none" stroke="#0f172a" strokeWidth="0.5"/>
      <path d="M0 80 C 30 20 70 20 100 80 Z" fill="none" stroke="#0f172a" strokeWidth="0.5"/>
      <path d="M0 60 C 40 40 60 40 100 60 Z" fill="none" stroke="#0f172a" strokeWidth="0.5"/>
    </pattern>
    <rect width="100%" height="100%" fill="url(#topo)" />
  </svg>
);

// --- Hero Map Demo Animation ---
const HeroMapDemo = () => {
  const [cells, setCells] = useState<Record<number, string>>({});
  const [cursor, setCursor] = useState({ x: 50, y: 50, clicking: false });

  useEffect(() => {
    // Grid Configuration: 32 columns x 18 rows (16:9 aspect ratio for square cells)
    const COLS = 32;
    const ROWS = 18;
    
    // Helper to calculate percentage position for a cell
    const getPos = (c: number, r: number) => ({
        x: (c + 0.5) * (100 / COLS),
        y: (r + 0.5) * (100 / ROWS),
        idx: r * COLS + c
    });

    // Define a simulated "Human Annotation Path"
    // Operations:
    // 'road' = Red (Requires 2 clicks now)
    // 'noroad' = Green (Requires 1 click now)
    // 'building' = Yellow (Requires 2 clicks now)
    const operations = [
        // 1. Mark 4 Roads (Red) - forming a path
        { c: 12, r: 9, type: 'road' },
        { c: 13, r: 9, type: 'road' },
        { c: 14, r: 9, type: 'road' },
        { c: 15, r: 9, type: 'road' },
        
        // 2. Mark 2 No Roads (Green) - adjacent areas (Single Click)
        { c: 12, r: 10, type: 'noroad' },
        { c: 13, r: 10, type: 'noroad' },

        // 3. Mark 2 Buildings (Yellow) - near the road (Double Click)
        { c: 15, r: 8, type: 'building' },
        { c: 16, r: 8, type: 'building' },
    ];

    let sequence: any[] = [];
    let currentTime = 800; // Initial delay, slower start

    operations.forEach((op) => {
        const { x, y, idx } = getPos(op.c, op.r);
        
        // --- 1. Move Cursor (Slower) ---
        sequence.push({ t: currentTime, x, y, click: false });
        // Variable movement speed based on distance (simulated simple random variation)
        currentTime += 600 + Math.random() * 200; 

        // --- 2. Click 1 (Down) ---
        sequence.push({ t: currentTime, x, y, click: true });
        currentTime += 200;

        // --- 3. Click 1 (Up) - First State Change ---
        // New Logic:
        // Road Mode: Click 1 -> No Road (Green)
        // Building Mode: Click 1 -> No Building (Blue)
        const firstState = op.type === 'building' ? 'nobuilding' : 'noroad'; 
        
        sequence.push({ 
            t: currentTime, 
            x, y, 
            click: false, 
            action: { idx, type: firstState } 
        });
        currentTime += 400; // Pause after click

        // --- 4. Second Click (For Positive States: Road or Building) ---
        if (op.type === 'road' || op.type === 'building') {
             // Wait a bit
             currentTime += 300;

             // Click 2 (Down)
             sequence.push({ t: currentTime, x, y, click: true });
             currentTime += 200;

             // Click 2 (Up) -> Change to Final Positive State
             sequence.push({ 
                t: currentTime, 
                x, y, 
                click: false, 
                action: { idx, type: op.type } // 'road' or 'building'
            });
            currentTime += 400;
        }
    });

    // Reset loop at the end
    sequence.push({ t: currentTime + 2000, reset: true });

    let timeouts: any[] = [];

    const runSequence = () => {
      setCells({}); // Clear grid
      sequence.forEach(step => {
        const id = setTimeout(() => {
          if (step.reset) {
            runSequence();
            return;
          }
          if (step.x !== undefined) setCursor(prev => ({ ...prev, x: step.x, y: step.y }));
          if (step.click !== undefined) setCursor(prev => ({ ...prev, clicking: step.click }));
          if (step.action) {
            setCells(prev => ({ ...prev, [step.action.idx]: step.action.type }));
          }
        }, step.t);
        timeouts.push(id);
      });
    };

    runSequence();

    return () => timeouts.forEach(clearTimeout);
  }, []);

  return (
    <div className="relative w-full aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-4 border-white/40 group">
      {/* Background Satellite Image */}
      <img 
        src="https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=800&auto=format&fit=crop" 
        alt="Satellite Map" 
        className="absolute inset-0 w-full h-full object-cover opacity-90 transition-transform duration-[2000ms]"
      />
      
      {/* Grid Overlay (32x18) for Square cells in 16:9 container */}
      <div className="absolute inset-0 grid grid-cols-[repeat(32,minmax(0,1fr))] grid-rows-[repeat(18,minmax(0,1fr))]">
        {Array.from({ length: 576 }).map((_, i) => {
          const status = cells[i];
          let styleClass = "border-white/10"; // Light grid for visibility on dark map
          
          if (status === 'road') styleClass = "bg-red-500/50 border-red-400 backdrop-blur-[1px]";
          if (status === 'noroad') styleClass = "bg-green-500/50 border-green-400 backdrop-blur-[1px]";
          
          if (status === 'building') styleClass = "border-yellow-400 border-[2px] shadow-[inset_0_0_10px_rgba(250,204,21,0.3)]";
          if (status === 'nobuilding') styleClass = "border-blue-500 border-[2px]";

          return (
            <div key={i} className={`border ${styleClass} transition-all duration-200 relative`}>
               {/* No labels for high density to keep it clean */}
            </div>
          );
        })}
      </div>

      {/* UI Overlay: Live Badge */}
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg shadow-lg flex flex-col gap-1 z-30">
         <div className="flex items-center gap-2 text-[10px] font-bold text-slate-700">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
            <span>LIVE INPUT</span>
         </div>
      </div>

      {/* UI Overlay: Attribution */}
      <div className="absolute bottom-2 right-2 z-30 pointer-events-none">
          <span className="text-[10px] text-white/90 font-mono drop-shadow-md bg-black/20 px-1 rounded">
            Map Data © Esri World Imagery / Contributors
          </span>
      </div>

      {/* Cursor */}
      <div 
        className="absolute z-20 pointer-events-none transition-all duration-300 ease-in-out"
        style={{ 
          left: `${cursor.x}%`, 
          top: `${cursor.y}%`,
          transform: `translate(-20%, -20%) scale(${cursor.clicking ? 0.9 : 1})`
        }}
      >
        <MousePointer2 className="w-6 h-6 md:w-8 md:h-8 text-white drop-shadow-xl fill-black/40" strokeWidth={1.5} />
        {cursor.clicking && (
          <div className="absolute -top-4 -left-4 w-16 h-16 bg-white rounded-full animate-ping opacity-60"></div>
        )}
      </div>
    </div>
  );
};

export const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
  const scrollToScience = () => {
    const section = document.getElementById('science');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="relative w-full h-full bg-white overflow-y-auto overflow-x-hidden text-slate-900 font-sans custom-scrollbar selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* --- Section 1: Hero --- */}
      <div className="relative w-full min-h-[90vh] flex flex-col">
        
        {/* Abstract Background */}
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40">
          <TopoPattern />
        </div>

        {/* Navbar */}
        <nav className="relative z-20 w-full px-6 py-6 flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3 cursor-pointer group">
              <div className="bg-emerald-600 text-white p-2.5 rounded-xl shadow-lg shadow-emerald-600/20 group-hover:scale-105 transition-transform">
                  <Compass className="w-6 h-6 rotate-[-135deg]" />
              </div>
              <div className="flex flex-col">
                  <span className="text-xl font-bold tracking-tight text-slate-900">RoadFinder <span className="font-light text-emerald-600">寻路者</span></span>
              </div>
          </div>
        </nav>

        {/* Hero Content (Split Layout) */}
        <div className="relative z-10 flex-1 flex flex-col lg:flex-row items-center lg:items-center justify-between px-6 max-w-7xl mx-auto w-full gap-12 lg:gap-20 mt-8 lg:mt-0 mb-12">
           
           {/* Left Column: Text */}
           <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left space-y-8 animate-in slide-in-from-bottom fade-in duration-700">
              
              {/* Main Title */}
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-slate-900 tracking-tight leading-[1.1]">
                汇聚大众智慧<br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-800 to-teal-700">共建数字地球</span>
              </h1>

              <p className="text-lg text-slate-600 max-w-xl leading-relaxed font-light">
                连接高精度卫星遥感与全民科学力量。每一个网格的人工标注，都是对地理环境的一次深情凝视与精准记录。
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 w-full justify-center lg:justify-start">
                  <button 
                      onClick={onStart}
                      className="group px-8 py-4 bg-emerald-800 text-white rounded-full font-bold text-lg transition-all hover:bg-emerald-700 hover:scale-105 active:scale-95 shadow-xl shadow-emerald-800/30 flex items-center gap-2 justify-center"
                  >
                      <ScanSearch className="w-5 h-5" />
                      开始探索
                  </button>
                  <button 
                      onClick={scrollToScience}
                      className="px-8 py-4 bg-white text-slate-700 border border-slate-200 rounded-full font-bold text-lg transition-all hover:bg-slate-50 hover:border-slate-300 active:scale-95 flex items-center gap-2 justify-center shadow-sm"
                  >
                      <Activity className="w-5 h-5 text-emerald-700" />
                      了解科学贡献
                  </button>
              </div>
           </div>

           {/* Right Column: Dynamic Map Demo */}
           {/* REMOVED 'hidden lg:block' so it shows on all devices */}
           <div className="flex-1 w-full max-w-lg lg:max-w-2xl mt-10 lg:mt-0 animate-in slide-in-from-right fade-in duration-1000 delay-200">
              <HeroMapDemo />
              {/* Decoration Elements around the map */}
              <div className="absolute -z-10 -top-10 -right-10 w-64 h-64 bg-emerald-100 rounded-full blur-3xl opacity-50"></div>
              <div className="absolute -z-10 -bottom-10 -left-10 w-64 h-64 bg-blue-100 rounded-full blur-3xl opacity-50"></div>
           </div>

        </div>

        {/* Stats Strip */}
        <div className="relative z-10 w-full bg-white border-y border-slate-100">
           <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
               {[
                 { label: "全球全域覆盖", value: "Global Scope", icon: Globe2 },
                 { label: "专业志愿者体系", value: "Expert Team", icon: Users },
                 { label: "高精度遥感数据", value: "High-Fidelity", icon: ScanSearch },
                 { label: "数据隐私与合规", value: "Data Privacy", icon: ShieldCheck },
               ].map((stat, idx) => (
                 <div key={idx} className="flex items-center gap-4 justify-center md:justify-start group">
                    <div className="p-3 rounded-full bg-emerald-50 text-emerald-800 group-hover:bg-emerald-100 transition-colors">
                        <stat.icon className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-slate-900 tabular-nums">{stat.value}</div>
                        <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">{stat.label}</div>
                    </div>
                 </div>
               ))}
           </div>
        </div>
      </div>

      {/* --- Section 2: Science Explanation --- */}
      <div id="science" className="relative py-24 bg-slate-50 scroll-mt-0">
        <div className="max-w-6xl mx-auto px-6 relative z-10">
           
           {/* Header Section */}
           <div className="text-center mb-16">
               <div className="flex justify-center mb-5 animate-in slide-in-from-bottom duration-500">
                   <div className="p-4 bg-white rounded-2xl shadow-lg shadow-emerald-100 border border-slate-100 text-emerald-700 rotate-3 hover:rotate-0 transition-transform duration-300">
                       <Leaf className="w-10 h-10" />
                   </div>
               </div>

               <h3 className="text-3xl md:text-5xl font-extrabold text-emerald-800 mb-6 tracking-tight animate-in zoom-in delay-100 duration-500">
                 为什么需要人工标注？
               </h3>

               <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-8 leading-tight tracking-wide">
                 在数据迷失的荒野，我们需要您的眼睛
               </h2>
               
               <div className="text-lg md:text-xl text-slate-600 leading-relaxed max-w-3xl mx-auto font-light space-y-4">
                 <p>浩瀚的地球表面，每一寸肌理都藏着生态的秘密。</p>
                 <p>然而，想要读懂这些秘密，我们正面临着前所未有的挑战。</p>
               </div>
           </div>
           
           {/* Content Grid */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
              {/* Card 1 */}
              <div className="p-8 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col">
                 <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-700 mb-6 shrink-0">
                    <ScanSearch className="w-6 h-6" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 mb-4 leading-snug">
                   跨越“看见”的代价：<br/>当高精度视野成为稀缺资源
                 </h3>
                 <p className="text-slate-600 leading-relaxed text-sm md:text-base flex-1 text-justify">
                   在生态保护领域，高精度的地表数据如同稀缺的宝石。然而，亚米级高清影像的获取，如同在信息荒野中淘金——技术艰深，代价高昂。对于无数至关重要的生态区域，我们常常陷入“有图无真相”的困境：图不够清，细节不够真。我们需要一种创新的方式，用可负担的成本，去构建最珍贵的样本库。
                 </p>
              </div>

              {/* Card 2 */}
              <div className="p-8 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col">
                 <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-700 mb-6 shrink-0">
                    <Cpu className="w-6 h-6" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 mb-4 leading-snug">
                   弥合“理解”的断层：<br/>当算法在自然伪装前失灵
                 </h3>
                 <p className="text-slate-600 leading-relaxed text-sm md:text-base flex-1 text-justify">
                   现有的算法在城市任务上或许游刃有余，但一旦进入复杂的自然环境，便显得捉襟见肘。高山草甸的非铺装道路、雨林深处的人迹罕至小径、雪地上依稀可辨的野生动物足迹——这些在机器眼中只是杂乱的像素噪点。它提醒我们，在最细微处，人类的情景智能与经验判断，仍无法被替代。
                 </p>
              </div>

              {/* Card 3 */}
              <div className="p-8 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col">
                 <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 mb-6 shrink-0">
                    <Users className="w-6 h-6" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 mb-4 leading-snug">
                   共筑“守护”的答案：<br/>当公民智慧打开全新图景
                 </h3>
                 <p className="text-slate-600 leading-relaxed text-sm md:text-base flex-1 text-justify">
                   因此，RoadFinder寻路者应运而生。我们坚信，答案不在于取代人类，而在于联结万众。我们需要借助“全民科学”的力量，汇聚成千上万双敏锐的眼睛。您不仅仅是在点击，您是在利用人类独有的视觉经验与逻辑判断，为AI标注出最难辨认的“真值”。每一次的辨识，都在直接帮助科学家更精准地绘制生物栖息地、监测生态健康。
                 </p>
              </div>
           </div>

           {/* Conclusion */}
           <div className="w-full text-center bg-emerald-50/50 rounded-3xl p-8 md:p-12 border border-emerald-100">
               <p className="text-lg md:text-xl text-slate-700 leading-relaxed font-medium mb-6">
                 保护始于看见与理解。通过邀请您参与影像标注，我们将人类独有的模式识别能力与同理心，转化为科研的宝贵数据。这不仅是算法的训练课，更是一场规模宏大的公民科学行动，让每位参与者都成为地球生态的知情守护者。
               </p>
               <p className="text-xl md:text-2xl font-bold text-emerald-900">
                 加入我们，以您独一无二的双眼，为地球的生命地图，标注出最真实的细节。
               </p>
           </div>

        </div>
      </div>

      {/* --- Section 3: Data Value --- */}
      <div id="data" className="py-24 bg-white border-t border-slate-100">
         <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col md:flex-row items-center gap-8 lg:gap-16">
                <div className="flex-1 md:flex-[1.6] space-y-6">
                    <span className="text-emerald-700 font-bold tracking-wider uppercase text-sm">Scientific Data Value</span>
                    <h2 className="text-4xl font-bold text-slate-900">每一份贡献都将被珍存</h2>
                    <p className="text-slate-600 text-lg leading-relaxed tracking-tighter">
                        数据安全与科学价值是我们的基石。RoadFinder 平台汇聚的所有标注数据，
                        将加密存储于云端数据库，定向服务于<span className="font-bold text-slate-800">生态监测</span>与<span className="font-bold text-slate-800">地理科学研究</span>项目。
                    </p>
                    <ul className="space-y-4 pt-4">
                        {[
                            "数据加密存储与多重备份，保障信息安全",
                            "服务于国家重大生态科研与环境保护项目",
                            "严格的数据访问权限控制，防止商业滥用"
                        ].map((point, idx) => (
                            <li key={idx} className="flex items-center gap-3 text-slate-700 font-medium">
                                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                </div>
                                {point}
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="flex-1 w-full relative group">
                    <div className="absolute inset-0 bg-emerald-700 rounded-3xl rotate-6 opacity-10 group-hover:rotate-3 transition-transform duration-500"></div>
                    <div className="relative bg-white border border-slate-100 rounded-3xl shadow-xl overflow-hidden aspect-[4/3] flex items-center justify-center bg-slate-900">
                        {/* Abstract Data Visualization */}
                        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=800&auto=format&fit=crop')] bg-cover opacity-20"></div>
                        <div className="relative text-center p-8 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
                           <Database className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                           <div className="text-3xl font-bold text-white mb-1">20万+</div>
                           <div className="text-emerald-200 text-sm font-bold uppercase tracking-widest">Valid Annotations</div>
                        </div>
                    </div>
                </div>
            </div>
         </div>
      </div>

      {/* --- Footer --- */}
      <footer className="bg-slate-900 text-slate-400 py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-emerald-500 rotate-[-135deg]" />
                <span className="text-slate-200 font-bold">RoadFinder <span className="font-light text-emerald-500">寻路者</span></span>
            </div>
            <div className="text-sm">
                &copy; {new Date().getFullYear()} RoadFinder Project. All rights reserved.
            </div>
        </div>
      </footer>
    </div>
  );
};