import React from 'react';

interface SummaryCardProps {
  title: string;
  value: string;
  subValue?: string;
  type: 'gain' | 'loss' | 'neutral' | 'info';
  icon?: React.ReactNode;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, subValue, type, icon }) => {
  const getColors = () => {
    switch (type) {
      case 'gain':
        // Updated shadow to rgba(21, 213, 78, 0.15) for #15d54e
        return 'border-primary/30 bg-primary/5 text-primary shadow-[0_0_15px_rgba(21,213,78,0.15)]';
      case 'loss':
        return 'border-red-500/30 bg-red-500/5 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]';
      case 'neutral':
        return 'border-blue-500/30 bg-blue-500/5 text-blue-400';
      default:
        return 'border-slate-700 bg-slate-800/50 text-slate-200';
    }
  };

  return (
    <div className={`relative p-6 rounded-2xl border backdrop-blur-md transition-all duration-300 hover:-translate-y-1 ${getColors()}`}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1 font-display">{title}</h3>
          <div className="text-2xl font-bold font-display tracking-tight">{value}</div>
          {subValue && <div className="text-xs mt-2 opacity-80 font-mono">{subValue}</div>}
        </div>
        {icon && <div className="opacity-80">{icon}</div>}
      </div>
    </div>
  );
};