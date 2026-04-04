import { Box, Typography, useTheme } from "@mui/material";
import React from "react";

interface WindowData {
  startSec: number;
  avgWpm: number;
  avgAccuracy: number;
  count: number;
}

interface Props {
  windows: WindowData[];
}

const FatigueChart: React.FC<Props> = ({ windows }) => {
  const theme = useTheme();

  if (!windows || windows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 3 }}>
        Take a test to see your pacing breakdown
      </Typography>
    );
  }

  const maxWpm = Math.max(...windows.map((w) => w.avgWpm), 1);
  const barWidth = 48;
  const gap = 10;
  const chartWidth = windows.length * (barWidth + gap);
  const chartHeight = 120;
  const topPad = 22;
  const bottomPad = 22;

  return (
    <Box sx={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight + topPad + bottomPad}`}
        width="100%"
        style={{ minWidth: 280 }}
      >
        {windows.map((w, i) => {
          const barHeight = maxWpm > 0 ? (w.avgWpm / maxWpm) * chartHeight : 0;
          const x = i * (barWidth + gap);
          const y = topPad + chartHeight - barHeight;

          return (
            <g key={w.startSec}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={4}
                fill={theme.palette.primary.main}
                opacity={0.7 + 0.3 * (i / Math.max(windows.length - 1, 1))}
              />
              <text
                x={x + barWidth / 2}
                y={y - 5}
                textAnchor="middle"
                fontSize={11}
                fontWeight="bold"
                fill={theme.palette.text.primary}
              >
                {w.avgWpm}
              </text>
              <text
                x={x + barWidth / 2}
                y={topPad + chartHeight + 14}
                textAnchor="middle"
                fontSize={10}
                fill={theme.palette.text.secondary}
              >
                {w.startSec}–{w.startSec + 10}s
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
};

export default FatigueChart;
