import { Box, Tooltip, Typography, useTheme } from "@mui/material";
import React from "react";

interface KeyStat {
  correct: number;
  errors: number;
  totalLatencyMs: number;
  count: number;
}

interface Props {
  rollingKeyStats: Record<string, KeyStat>;
}

const ROWS = [
  { keys: "qwertyuiop", xOffset: 0 },
  { keys: "asdfghjkl", xOffset: 20 },
  { keys: "zxcvbnm", xOffset: 45 },
];

function heatmapColor(errorRate: number | null): string {
  if (errorRate === null) return "rgba(128,128,128,0.2)";
  const t = Math.min(errorRate / 0.25, 1);
  const h = 120 * (1 - t);
  return `hsl(${h}, 65%, 48%)`;
}

const KeyboardHeatmap: React.FC<Props> = ({ rollingKeyStats }) => {
  const theme = useTheme();

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "5px", alignItems: "center" }}>
      {ROWS.map((row, ri) => (
        <Box key={ri} sx={{ display: "flex", gap: "5px", ml: `${row.xOffset}px` }}>
          {row.keys.split("").map((key) => {
            const stats = rollingKeyStats[key];
            const total = stats ? stats.correct + stats.errors : 0;
            const errorRate = total > 0 ? stats.errors / total : null;
            const avgLatency = stats && stats.count > 0 ? Math.round(stats.totalLatencyMs / stats.count) : null;

            const tip = total > 0
              ? `${key.toUpperCase()}: ${(errorRate! * 100).toFixed(1)}% error rate (${total} presses)${avgLatency ? `, ${avgLatency}ms avg` : ""}`
              : `${key.toUpperCase()}: no data yet`;

            return (
              <Tooltip key={key} title={tip} arrow>
                <Box
                  sx={{
                    width: { xs: 28, sm: 36, md: 40 },
                    height: { xs: 28, sm: 36, md: 40 },
                    borderRadius: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: heatmapColor(errorRate),
                    color: errorRate !== null ? "#fff" : theme.palette.text.disabled,
                    fontWeight: "bold",
                    fontSize: { xs: 11, sm: 14 },
                    fontFamily: "'Fira Code', monospace",
                    cursor: "default",
                    transition: "transform 0.15s",
                    "&:hover": { transform: "scale(1.15)" },
                  }}
                >
                  {key.toUpperCase()}
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      ))}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
        <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: "hsl(120,65%,48%)" }} />
        <Typography variant="caption" color="text.secondary">Accurate</Typography>
        <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: "hsl(60,65%,48%)", ml: 1 }} />
        <Typography variant="caption" color="text.secondary">Moderate</Typography>
        <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: "hsl(0,65%,48%)", ml: 1 }} />
        <Typography variant="caption" color="text.secondary">Error-prone</Typography>
      </Box>
    </Box>
  );
};

export default KeyboardHeatmap;
