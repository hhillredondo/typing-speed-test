import { Box, Typography, useTheme } from "@mui/material";
import React from "react";

interface Props {
  recentWpm: number[];
}

const ProgressChart: React.FC<Props> = ({ recentWpm }) => {
  const theme = useTheme();

  if (recentWpm.length < 2) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 3 }}>
        Need at least 2 tests to show progress
      </Typography>
    );
  }

  const pad = { top: 20, right: 20, bottom: 30, left: 45 };
  const width = 500;
  const height = 180;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const minVal = Math.min(...recentWpm) - 5;
  const maxVal = Math.max(...recentWpm) + 5;
  const range = maxVal - minVal || 1;

  function toX(i: number) {
    return pad.left + (i / (recentWpm.length - 1)) * plotW;
  }

  function toY(val: number) {
    return pad.top + plotH - ((val - minVal) / range) * plotH;
  }

  const points = recentWpm.map((wpm, i) => `${toX(i)},${toY(wpm)}`).join(" ");

  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) =>
    Math.round(minVal + (range * i) / yTicks)
  );

  return (
    <Box sx={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ minWidth: 280 }}>
        {yLabels.map((val) => (
          <g key={val}>
            <line
              x1={pad.left}
              y1={toY(val)}
              x2={width - pad.right}
              y2={toY(val)}
              stroke={theme.palette.divider}
              strokeDasharray="4 4"
            />
            <text
              x={pad.left - 8}
              y={toY(val) + 4}
              textAnchor="end"
              fontSize={10}
              fill={theme.palette.text.secondary}
            >
              {val}
            </text>
          </g>
        ))}

        <polyline
          points={points}
          fill="none"
          stroke={theme.palette.primary.main}
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {recentWpm.map((wpm, i) => (
          <circle
            key={i}
            cx={toX(i)}
            cy={toY(wpm)}
            r={3}
            fill={theme.palette.primary.main}
          />
        ))}

        <text
          x={width / 2}
          y={height - 4}
          textAnchor="middle"
          fontSize={10}
          fill={theme.palette.text.secondary}
        >
          Test number
        </text>
      </svg>
    </Box>
  );
};

export default ProgressChart;
