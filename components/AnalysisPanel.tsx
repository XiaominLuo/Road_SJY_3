import React from 'react';
import { Bot, MapPin, Loader2, AlertCircle, X } from 'lucide-react';
import { AnalysisResult, MapLocation } from '../types';

interface AnalysisPanelProps {
  location: MapLocation;
  analysis: AnalysisResult;
  onAnalyze: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  location,
  analysis,
  onAnalyze,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute top-4 right-4 z-[1000] w-80 md:w-96 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-2xl text-slate-800 flex flex-col max-h-[calc(100vh-2rem)] transition-all duration-300">
      
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-xl">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-emerald-600" />
          <h2 className="font-semibold text-sm tracking-wide text-slate-800">AI 地理分析助手</h2>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
        <div className="mb-4 bg-slate-50 rounded-lg p-3 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wider mb-1">
            <MapPin className="w-3 h-3" />
            当前视野中心
          </div>
          <div className="font-mono text-sm text-emerald-700 font-medium">
            {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
          </div>
        </div>

        {analysis.loading ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            <p className="text-sm">正在分析地形与地表特征...</p>
          </div>
        ) : analysis.error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
            <p>{analysis.error}</p>
          </div>
        ) : analysis.text ? (
          <div className="prose prose-sm max-w-none prose-p:text-slate-600 prose-headings:text-slate-800">
            <div className="whitespace-pre-wrap leading-relaxed">
              {analysis.text}
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-slate-500 text-sm">
            <p>准备就绪。</p>
            <p className="mt-1">点击下方按钮请求 Gemini AI 分析当前区域。</p>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
        <button
          onClick={onAnalyze}
          disabled={analysis.loading}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white py-2.5 px-4 rounded-lg font-medium transition-all shadow-lg shadow-emerald-900/10 active:scale-95"
        >
          {analysis.loading ? '正在处理...' : '开始智能分析'}
        </button>
      </div>
    </div>
  );
};