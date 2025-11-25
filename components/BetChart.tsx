import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { ChartDataPoint } from '../types';

interface BetChartProps {
  data: ChartDataPoint[];
}

export const BetChart: React.FC<BetChartProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="h-[300px] w-full flex items-center justify-center border border-dashed border-slate-700 rounded-xl bg-slate-900/30">
        <p className="text-slate-500 font-display">Sem dados suficientes para o gráfico</p>
      </div>
    );
  }

  return (
    <div className="h-[350px] w-full bg-surface/50 border border-slate-800 rounded-2xl p-4 shadow-lg backdrop-blur-sm relative">
      <div style={{ width: '100%', height: '100%' }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart
            data={data}
            margin={{
              top: 10,
              right: 10,
              left: -20,
              bottom: 0,
            }}
          >
            <defs>
              <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#9bea0d" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#9bea0d" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis 
              dataKey="date" 
              tick={{ fill: '#64748b', fontSize: 12 }} 
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis 
              tick={{ fill: '#64748b', fontSize: 12 }} 
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => `R$${value}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                borderColor: '#9bea0d',
                borderRadius: '8px',
                color: '#fff',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
              }}
              itemStyle={{ color: '#9bea0d' }}
              formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Saldo']}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="#9bea0d"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorBalance)"
              animationDuration={1500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};