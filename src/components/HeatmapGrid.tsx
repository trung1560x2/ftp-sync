import React from 'react';

interface HeatmapItem {
  date: string;
  count: number;
  bytes: number;
}

interface Props {
  data: HeatmapItem[];
  loading: boolean;
}

const HeatmapGrid: React.FC<Props> = ({ data, loading }) => {
  // Map data to a dictionary by date string (YYYY-MM-DD)
  const dataMap = React.useMemo(() => {
    const map: Record<string, HeatmapItem> = {};
    data.forEach((item) => {
      map[item.date] = item;
    });
    return map;
  }, [data]);

  // Generate 53 weeks of dates starting on Sunday
  const days = React.useMemo(() => {
    const arr: Date[] = [];
    const today = new Date();
    const startDate = new Date(today);
    
    // Go back 364 days (52 weeks)
    startDate.setDate(today.getDate() - 364);
    
    // Shift to the nearest preceding Sunday to align weeks
    const startDay = startDate.getDay();
    startDate.setDate(startDate.getDate() - startDay);

    const tempDate = new Date(startDate);
    for (let i = 0; i < 53 * 7; i++) {
      arr.push(new Date(tempDate));
      tempDate.setDate(tempDate.getDate() + 1);
    }
    return arr;
  }, []);

  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const getFormatDisplayDate = (date: Date): string => {
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Determine color based on sync count
  const getColor = (count: number): string => {
    if (count === 0) return 'fill-neutral-850'; // Level 0
    if (count <= 2) return 'fill-[#0e4429]';   // Level 1 (dark green)
    if (count <= 5) return 'fill-[#006d32]';   // Level 2 (medium green)
    if (count <= 10) return 'fill-[#26a641]';  // Level 3 (light green)
    return 'fill-[#39d353]';                   // Level 4 (bright green)
  };

  // Group days by week (columns)
  const weeks = React.useMemo(() => {
    const cols: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      cols.push(days.slice(i, i + 7));
    }
    return cols;
  }, [days]);

  // Labels for months
  const monthLabels = React.useMemo(() => {
    const labels: { text: string; colIndex: number }[] = [];
    let lastMonth = -1;

    weeks.forEach((week, colIndex) => {
      const firstDayOfWeek = week[0];
      const month = firstDayOfWeek.getMonth();
      if (month !== lastMonth && colIndex % 4 === 0) {
        labels.push({
          text: firstDayOfWeek.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
          colIndex
        });
        lastMonth = month;
      }
    });

    return labels;
  }, [weeks]);

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center border border-neutral-850 bg-neutral-950 font-mono text-xs uppercase tracking-wider text-neutral-500">
        <span className="animate-pulse">Loading activity map...</span>
      </div>
    );
  }

  return (
    <div className="border border-neutral-850 bg-neutral-950 p-4 font-mono select-none">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[10px] font-black text-neutral-450 tracking-widest uppercase">
          ANNUAL SYNC ACTIVITY GRAPH // 365 DAYS
        </span>
      </div>

      <div className="overflow-x-auto custom-scrollbar pb-2">
        <div className="min-w-[690px] flex flex-col">
          {/* SVG Heatmap */}
          <svg width="720" height="110" className="mt-1">
            {/* Month Labels */}
            {monthLabels.map((label, i) => (
              <text
                key={i}
                x={label.colIndex * 13 + 30}
                y="12"
                className="text-[8px] font-bold fill-neutral-500 font-mono"
              >
                {label.text}
              </text>
            ))}

            {/* Weekday Labels (Mon, Wed, Fri) */}
            <text x="5" y="34" className="text-[8px] font-bold fill-neutral-600 font-mono">MON</text>
            <text x="5" y="60" className="text-[8px] font-bold fill-neutral-600 font-mono">WED</text>
            <text x="5" y="86" className="text-[8px] font-bold fill-neutral-600 font-mono">FRI</text>

            {/* Grid Cells */}
            <g transform="translate(30, 20)">
              {weeks.map((week, colIndex) => (
                <g key={colIndex} transform={`translate(${colIndex * 13}, 0)`}>
                  {week.map((day, rowIndex) => {
                    const dateStr = formatDate(day);
                    const item = dataMap[dateStr] || { count: 0, bytes: 0 };
                    const colorClass = getColor(item.count);

                    return (
                      <rect
                        key={rowIndex}
                        y={rowIndex * 12}
                        width="10"
                        height="10"
                        className={`${colorClass} stroke-neutral-950 stroke-[2px] transition-all hover:stroke-orange-500`}
                        rx="1"
                      >
                        <title>
                          {`${item.count} files synced (${formatBytes(item.bytes)}) on ${getFormatDisplayDate(day)}`}
                        </title>
                      </rect>
                    );
                  })}
                </g>
              ))}
            </g>
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-between items-center mt-3 pt-3 border-t border-neutral-900 text-[9px] text-neutral-500 font-bold uppercase">
        <span>Activity stats auto-update</span>
        <div className="flex items-center space-x-1.5">
          <span>Less</span>
          <div className="w-2.5 h-2.5 bg-neutral-850 border border-neutral-950 rounded-[1px]"></div>
          <div className="w-2.5 h-2.5 bg-[#0e4429] border border-neutral-950 rounded-[1px]"></div>
          <div className="w-2.5 h-2.5 bg-[#006d32] border border-neutral-950 rounded-[1px]"></div>
          <div className="w-2.5 h-2.5 bg-[#26a641] border border-neutral-950 rounded-[1px]"></div>
          <div className="w-2.5 h-2.5 bg-[#39d353] border border-neutral-950 rounded-[1px]"></div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
};

export default HeatmapGrid;
