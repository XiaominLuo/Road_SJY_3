
import React, { useState, useLayoutEffect, useEffect, useRef } from 'react';
import { ShieldCheck, Layers, UploadCloud, Milestone, MousePointerClick, ChevronRight, Check, MousePointer2, Table2, Info } from 'lucide-react';

interface OnboardingTourProps {
  onComplete: () => void;
}

// --- Animation Component for Step 5 ---
const InteractionDemo = () => {
    /**
     * Sequence Steps:
     * 0: Initial State (Invisible/Hidden)
     * 1: Cursor moves to Table (Bottom Left)
     * 2: Click Table Row -> SHOW PINK HIGHLIGHT + OPACITY 100
     * 3: Map Fly Animation (Background pans/scales) -> KEEP PINK HIGHLIGHT
     * 4: Map Focused, Cursor moves to Grid Cell in center -> KEEP PINK HIGHLIGHT
     * 5: Click 1 (Single Click) -> State: No Road (Bright Green/0)
     * 6: Click 2 (Second Click) -> State: Road (Bright Red/1)
     * 7: Reset Loop after a delay
     */
    const [step, setStep] = useState(0);

    useEffect(() => {
        const sequence = [
            { t: 800, s: 1 },  // Move to table
            { t: 400, s: 2 },  // Click table (Pink highlight starts)
            { t: 200, s: 3 },  // Pan animation start
            { t: 1000, s: 4 }, // Arrived, cursor moves to cell center
            { t: 800, s: 5 },  // Click 1 (No Road - Green 0)
            { t: 1000, s: 6 }, // Click 2 (Road - Red 1)
            { t: 2000, s: 0 }, // Reset
        ];

        let timeoutId: any;
        const run = (idx: number) => {
            if (idx >= sequence.length) {
                run(0);
                return;
            }
            timeoutId = setTimeout(() => {
                setStep(sequence[idx].s);
                run(idx + 1);
            }, sequence[idx].t);
        };
        run(0);
        return () => clearTimeout(timeoutId);
    }, []);

    const isCursorOnTable = step === 1 || step === 2;
    const isClickDown = step === 2 || step === 5 || step === 6;
    const isPanning = step >= 3;
    const isAtCell = step >= 4;
    const isActive = step >= 2; // When cell is "active" (clicked in table)

    // Cell Styling Variables
    let cellBorderStyle = "rgba(255,255,255,0.2)";
    let cellBgStyle = "rgba(255,255,255,0.05)";
    let cellShadow = "none";
    let cellText = "";
    let borderWidth = "1px";

    // Step 2, 3, 4: Selected Highlight (Pink)
    if (step >= 2 && step <= 4) {
        cellBorderStyle = "#ec4899";
        cellBgStyle = "rgba(236,72,153,0.3)";
        cellShadow = "0 0 25px rgba(236,72,153,0.6)";
        borderWidth = "6px";
    } 
    // Step 5: No Road (Solid Bright Green)
    else if (step === 5) {
        cellBorderStyle = "#22c55e";
        cellBgStyle = "#22c55e"; // Solid for clarity in demo
        cellShadow = "0 0 20px rgba(34,197,94,0.5)";
        cellText = "0";
        borderWidth = "2px";
    } 
    // Step 6+: Road (Solid Bright Red)
    else if (step >= 6) {
        cellBorderStyle = "#ef4444";
        cellBgStyle = "#ef4444"; // Solid for clarity in demo
        cellShadow = "0 0 20px rgba(239,68,68,0.5)";
        cellText = "1";
        borderWidth = "2px";
    }

    return (
        <div className="flex flex-col gap-3 mb-6">
            {/* Simulated Map View Container */}
            <div className="w-full h-56 bg-slate-950 rounded-2xl relative overflow-hidden border border-slate-800 shadow-2xl group">
                {/* Background Grid - Panning Animation */}
                <div className={`absolute inset-0 opacity-10 transition-transform duration-1000 cubic-bezier(0.4, 0, 0.2, 1) ${isPanning ? 'translate-x-[-120px] translate-y-[40px] scale-125' : ''}`} 
                    style={{ 
                        backgroundImage: 'linear-gradient(#4ADE80 1px, transparent 1px), linear-gradient(90deg, #4ADE80 1px, transparent 1px)', 
                        backgroundSize: '24px 24px' 
                    }}
                ></div>

                {/* Target Cell (ID: 88) */}
                <div 
                    className={`absolute w-24 h-24 transition-all duration-300 flex flex-col items-center justify-center gap-1 z-10 
                        ${isPanning ? 'translate-x-[calc(50%-48px-120px)] translate-y-[calc(50%-48px+40px)] scale-125' : 'translate-x-[120px] translate-y-[40px]'} 
                        ${isActive ? 'opacity-100' : 'opacity-20'}`}
                    style={{
                        top: '0',
                        left: '0',
                        border: `${borderWidth} solid ${cellBorderStyle}`,
                        backgroundColor: cellBgStyle,
                        boxShadow: cellShadow
                    }}
                >
                    <span className="text-[10px] text-white font-black bg-black/70 px-1.5 py-0.5 rounded leading-none shadow-sm">ID: 88</span>
                    {cellText && (
                        <span className="text-4xl font-mono font-black animate-in zoom-in duration-300 text-white drop-shadow-lg">
                            {cellText}
                        </span>
                    )}
                    {step === 3 && <div className="absolute inset-0 border-4 border-white animate-ping"></div>}
                </div>

                {/* Mock Attribute Table (Left Bottom Floating Window) */}
                <div className={`absolute bottom-3 left-3 w-32 bg-slate-900/95 backdrop-blur-md border rounded-lg overflow-hidden transition-all duration-300 z-20 ${isCursorOnTable ? 'border-emerald-500 ring-4 ring-emerald-500/20 scale-105 shadow-xl' : 'border-slate-700'}`}>
                    <div className="bg-slate-800 px-2 py-1.5 text-[9px] font-black text-slate-300 flex items-center gap-1.5">
                        <Table2 className="w-3 h-3 text-emerald-500" /> 属性表
                    </div>
                    <div className="p-1.5 space-y-1.5">
                        {[87, 88, 89].map((id) => (
                            <div key={id} className={`px-2 py-1 rounded text-[10px] font-mono flex items-center justify-between transition-colors ${id === 88 && isCursorOnTable ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/30' : 'text-slate-500'}`}>
                                <span>#{id}</span>
                                {id === 88 && isCursorOnTable && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.7)]" />}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Status Toast */}
                {step === 5 && (
                    <div className="absolute top-4 right-4 bg-green-500 text-white text-[11px] font-black px-4 py-1.5 rounded-full shadow-xl animate-in slide-in-from-right ring-4 ring-white/30 z-30">
                        标注状态: 0 (无路)
                    </div>
                )}
                {step === 6 && (
                    <div className="absolute top-4 right-4 bg-red-500 text-white text-[11px] font-black px-4 py-1.5 rounded-full shadow-xl animate-in slide-in-from-right ring-4 ring-white/30 z-30">
                        标注状态: 1 (有路)
                    </div>
                )}

                {/* Cursor */}
                <div 
                    className="absolute transition-all duration-500 ease-in-out z-40"
                    style={{
                        top: isCursorOnTable ? '82%' : (isAtCell ? '50%' : '15%'),
                        left: isCursorOnTable ? '18%' : (isAtCell ? '50%' : '15%'),
                        transform: `translate(-10%, -10%) scale(${isClickDown ? 0.75 : 1})`,
                        opacity: step === 0 ? 0 : 1
                    }}
                >
                    <MousePointer2 className="w-10 h-10 text-white drop-shadow-2xl fill-black" strokeWidth={1.5} />
                    {isClickDown && <div className="absolute -top-4 -left-4 w-16 h-16 bg-white/60 rounded-full animate-ping"></div>}
                </div>
            </div>
        </div>
    );
};

type Step = {
  id: number;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  content: React.ReactNode;
  targetSelector?: string; 
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
};

const STEPS: Step[] = [
  {
    id: 1,
    title: '明确数据保密性',
    subtitle: 'Data Confidentiality',
    icon: ShieldCheck,
    position: 'center',
    content: (
      <div className="space-y-3 text-left">
        <p className="leading-relaxed text-slate-600 text-sm">
          本平台涉及高精度地理敏感数据及未公开的生态监测信息。作为志愿者，您需严格遵守以下保密协议：
        </p>
        <ul className="list-disc pl-5 space-y-1 text-slate-700 text-xs font-medium">
            <li>严禁对敏感区域进行截图、录屏或外传。</li>
            <li>严禁将 SHP 数据用于非授权的商业用途。</li>
            <li>请在安全网络环境下操作，账号仅限本人使用。</li>
        </ul>
        <div className="p-2.5 bg-red-50 rounded border border-red-100 text-xs text-red-600 font-bold mt-2">
            点击下一步即代表您已阅读并承诺遵守上述保密规定。
        </div>
      </div>
    )
  },
  {
    id: 2,
    title: '地图切换',
    subtitle: 'Base Maps',
    icon: Layers,
    targetSelector: '.leaflet-control-layers', 
    position: 'left',
    content: (
      <div className="space-y-2 text-left">
        <p className="text-slate-600 text-sm">
          点击此处可切换不同的卫星底图。
        </p>
        <p className="text-xs text-slate-500">
            支持 谷歌卫星、Esri World Imagery、天地图及吉林一号。遇到云层遮挡时，切换底图源往往能获得更清晰的视野。
        </p>
      </div>
    )
  },
  {
    id: 3,
    title: '数据导入',
    subtitle: 'Data Import',
    icon: UploadCloud,
    targetSelector: '#tour-tools-toggle',
    position: 'left',
    content: (
      <div className="space-y-2 text-left">
        <p className="text-slate-600 text-sm">
          点击工具箱按钮，展开侧边栏进行数据导入。
        </p>
        <ul className="space-y-1.5 text-xs text-slate-700">
            <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                <span>上传 SHP 进行叠加对比</span>
            </li>
        </ul>
      </div>
    )
  },
  {
    id: 4,
    title: '模式介绍',
    subtitle: 'Working Modes',
    icon: Milestone,
    targetSelector: '#tour-mode-switch',
    position: 'bottom',
    content: (
      <div className="space-y-2 text-left">
        <p className="text-slate-600 text-sm">
          根据当前任务需求，在此处快速切换标注模式：
        </p>
        <div className="grid grid-cols-2 gap-2 mt-1">
             <div className="bg-red-50 p-2 rounded border border-red-100">
                 <div className="text-red-700 font-bold text-xs">标路模式</div>
                 <div className="text-[10px] text-red-600">标记道路痕迹</div>
             </div>
             <div className="bg-yellow-50 p-2 rounded border border-yellow-100">
                 <div className="text-yellow-700 font-bold text-xs">标建筑模式</div>
                 <div className="text-[10px] text-yellow-600">标记人造设施</div>
             </div>
        </div>
      </div>
    )
  },
  {
    id: 5,
    title: '高效交互技巧',
    subtitle: 'Interaction & Jump',
    icon: MousePointerClick,
    position: 'center',
    content: (
      <div className="space-y-2 text-left">
        <DemoContentWrapper />
      </div>
    )
  }
];

function DemoContentWrapper() {
    return (
        <>
            <InteractionDemo />
            <div className="space-y-4">
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 shadow-sm">
                    <div className="flex items-center gap-2 text-emerald-800 font-black text-[13px] mb-2">
                        <Table2 className="w-5 h-5" />
                        定位技巧：点击属性表行
                    </div>
                    <p className="text-[11px] text-emerald-700 leading-relaxed font-medium">
                        在左侧<b>属性表</b>中点击任何一行，地图会自动平滑定位目标网格并将其高亮，助您精准定位任务目标。
                    </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-inner">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Road Mode Column */}
                        <div className="space-y-3">
                            <div className="text-[11px] font-black text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-100 inline-block">道路标注模式</div>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-[10px] text-slate-600 font-bold">
                                    <div className="w-6 h-2 rounded-sm bg-green-500 shadow-sm"></div> 1次: 无路 (0)
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-slate-600 font-bold">
                                    <div className="w-6 h-2 rounded-sm bg-red-500 shadow-sm"></div> 2次: 有路 (1)
                                </div>
                            </div>
                        </div>

                        {/* Building Mode Column */}
                        <div className="space-y-3">
                            <div className="text-[11px] font-black text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded border border-yellow-100 inline-block">建筑标注模式</div>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-[10px] text-slate-600 font-bold">
                                    <div className="w-6 h-2 border-2 border-blue-500 bg-transparent rounded-[2px] shadow-sm"></div> 1次: 无建筑 (0)
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-slate-600 font-bold">
                                    <div className="w-6 h-2 border-2 border-yellow-400 bg-transparent rounded-[2px] shadow-sm"></div> 2次: 有建筑 (1)
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200 text-[10px] text-slate-400 italic font-medium flex items-center gap-1">
                        <span className="text-red-500">*</span>
                        第三次点击均会清除该网格的当前标注状态。
                    </div>
                </div>
            </div>
        </>
    )
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;

  useLayoutEffect(() => {
    const updatePosition = () => {
        if (step.targetSelector) {
            const el = document.querySelector(step.targetSelector);
            if (el) { setTargetRect(el.getBoundingClientRect()); return; }
        }
        setTargetRect(null);
    };
    const timer = setTimeout(updatePosition, 100);
    window.addEventListener('resize', updatePosition);
    return () => { window.removeEventListener('resize', updatePosition); clearTimeout(timer); };
  }, [currentStep, step.targetSelector]);

  const handleNext = () => { if (isLast) onComplete(); else setCurrentStep(prev => prev + 1); };

  const renderOverlay = () => {
    if (!targetRect || step.position === 'center') return <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[4000]" />;
    return <div className="fixed z-[4000] rounded-lg transition-all duration-300 pointer-events-none" style={{ top: targetRect.top - 4, left: targetRect.left - 4, width: targetRect.width + 8, height: targetRect.height + 8, boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.75)' }} />;
  };

  const getPopoverStyle = () => {
    if (!targetRect || step.position === 'center') return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '30rem' };
    const gap = 16; const popoverWidth = 320; const winW = window.innerWidth; const winH = window.innerHeight;
    let top = 0; let left = 0;
    switch (step.position) {
        case 'left': top = targetRect.top + (targetRect.height / 2) - 100; left = targetRect.left - popoverWidth - gap; break;
        case 'right': top = targetRect.top; left = targetRect.right + gap; break;
        case 'bottom': top = targetRect.bottom + gap; left = targetRect.left + (targetRect.width / 2) - (popoverWidth / 2); break;
        case 'top': top = targetRect.top - gap - 200; left = targetRect.left + (targetRect.width / 2) - (popoverWidth / 2); break;
    }
    if (left < 10) left = 10; if (left + popoverWidth > winW) left = winW - popoverWidth - 10;
    if (top < 10) top = 10; if (top + 400 > winH) top = winH - 410;
    return { top, left, position: 'absolute' as const, maxWidth: '22rem' };
  };

  return (
    <>
      {renderOverlay()}
      <div ref={popoverRef} className={`fixed z-[4001] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-500 border border-slate-100 ${step.position === 'center' ? 'w-full' : 'w-80'}`} style={getPopoverStyle()}>
          <div className="flex items-center gap-3 p-4 border-b border-slate-50 bg-slate-50/50">
             <div className={`p-2 rounded-lg ${currentStep === 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}><step.icon className="w-5 h-5" /></div>
             <div><h3 className="font-bold text-slate-900 leading-tight">{step.title}</h3><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{step.subtitle}</p></div>
             <div className="ml-auto text-xs font-medium text-slate-400 bg-white px-2 py-1 rounded border border-slate-100">{currentStep + 1} / {STEPS.length}</div>
          </div>
          <div className="p-4 bg-white overflow-y-auto max-h-[70vh] custom-scrollbar">{step.content}</div>
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
             <button onClick={handleNext} className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-lg transition-transform active:scale-95">
                {isLast ? '进入系统' : '下一步'}{isLast ? <Check className="w-4 h-4 ml-1" /> : <ChevronRight className="w-4 h-4 ml-1" />}
             </button>
          </div>
      </div>
    </>
  );
};
