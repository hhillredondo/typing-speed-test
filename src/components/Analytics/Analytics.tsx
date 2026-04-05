import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import BackspaceIcon from "@mui/icons-material/Backspace";
import SpeedIcon from "@mui/icons-material/Speed";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import React, { useEffect, useState } from "react";
import { isUserLoggedIn } from "../../core/isUserLoggedIn";
import { getAnalyticsProfile } from "../../state/scoreServices";
import type { AnalyticsProfile, RollingBackspaceStats } from "../../types/analytics";
import KeyboardHeatmap from "./KeyboardHeatmap";
import FatigueChart from "./FatigueChart";
import ProgressChart from "./ProgressChart";

const ARCHETYPE_INFO: Record<string, { label: string; color: "primary" | "secondary" | "warning" | "error" | "info"; tip: string }> = {
  "fast-starter": {
    label: "Fast Starter",
    color: "info",
    tip: "You start strong but slow down toward the end. Try maintaining a steady pace throughout.",
  },
  "cliff-dropper": {
    label: "Cliff Dropper",
    color: "error",
    tip: "Your speed drops significantly near the end. Practice endurance with longer sessions.",
  },
  "slow-warmer": {
    label: "Slow Warmer",
    color: "warning",
    tip: "You build speed as you go. Consider a brief warm-up before timed tests.",
  },
  "consistent": {
    label: "Consistent Pacer",
    color: "primary",
    tip: "Great job maintaining a consistent pace throughout your tests!",
  },
};

function generateInsights(profile: AnalyticsProfile): string[] {
  const insights: string[] = [];

  if (profile.weakestKeys?.length > 0) {
    const keys = profile.weakestKeys
      .slice(0, 3)
      .map((k) => k.key.toUpperCase())
      .join(", ");
    insights.push(
      `Your most error-prone keys are ${keys}. Focus on accuracy when typing these.`
    );
  }

  if (profile.slowestBigrams?.length > 0) {
    const bg = profile.slowestBigrams[0];
    insights.push(
      `Your slowest key combination is "${bg.bigram}" at ${bg.avgLatencyMs}ms average. Practice words containing this pattern.`
    );
  }

  if (profile.wpmTrend > 0.5) {
    insights.push(
      `Your typing speed is improving by about ${profile.wpmTrend.toFixed(1)} WPM per test. Keep it up!`
    );
  } else if (profile.wpmTrend < -0.5) {
    insights.push(
      "Your recent typing speed has been declining. Take a break and come back refreshed."
    );
  } else if (profile.recentWpm.length >= 3) {
    insights.push(
      "Your typing speed has been stable recently. Try targeted drills to push past your plateau."
    );
  }

  return insights;
}

const BackspaceSection: React.FC<{
  stats: RollingBackspaceStats;
  totalTests: number;
}> = ({ stats, totalTests }) => {
  const avgPerTest = totalTests > 0 ? (stats.totalBackspaces / totalTests).toFixed(1) : "0";
  const avgConsecutive =
    stats.totalConsecutiveRuns > 0
      ? (stats.totalConsecutiveLength / stats.totalConsecutiveRuns).toFixed(1)
      : "0";
  const submittedWithBs = stats.wordsRecovered + stats.wordsFailed;
  // Recovery is only defined for *submitted* words that used backspace. `wordsWithBackspace`
  // also counts words you were still editing when the timer ran out (no WordEvent), which
  // would wrongly lower the % if we divided by it.
  const recoveryRate =
    submittedWithBs > 0
      ? Math.round((stats.wordsRecovered / submittedWithBs) * 100)
      : null;

  const items = [
    { label: "Avg backspaces / test", value: avgPerTest },
    { label: "Words recovered with backspace", value: String(stats.wordsRecovered) },
    { label: "Words still wrong despite backspace", value: String(stats.wordsFailed) },
    {
      label: "Recovery rate",
      value:
        recoveryRate === null ? "—" : `${recoveryRate}%`,
    },
    { label: "Consecutive backspace bursts", value: String(stats.totalConsecutiveRuns) },
    { label: "Avg consecutive backspaces / burst", value: avgConsecutive },
  ];

  return (
    <Grid container spacing={1}>
      {items.map((item) => (
        <Grid item xs={6} sm={4} key={item.label}>
          <Box sx={{ textAlign: "center", py: 0.5 }}>
            <Typography variant="h5" fontWeight="bold">
              {item.value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {item.label}
            </Typography>
          </Box>
        </Grid>
      ))}
    </Grid>
  );
};

const Analytics: React.FC = () => {
  const [profile, setProfile] = useState<AnalyticsProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const loggedIn = isUserLoggedIn();

  useEffect(() => {
    if (!loggedIn) {
      setLoading(false);
      return;
    }
    getAnalyticsProfile()
      .then((data) => setProfile(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [loggedIn]);

  if (!loggedIn) {
    return (
      <Box sx={{ maxWidth: 600, mx: "auto", textAlign: "center", mt: 6 }}>
        <Typography variant="h5" gutterBottom>
          Analytics
        </Typography>
        <Typography color="text.secondary">
          Log in to see your typing analytics.
        </Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!profile || profile.totalTests === 0) {
    return (
      <Box sx={{ maxWidth: 600, mx: "auto", textAlign: "center", mt: 6 }}>
        <Typography variant="h5" gutterBottom>
          Analytics
        </Typography>
        <Typography color="text.secondary">
          Complete some typing tests to start seeing your analytics here.
        </Typography>
      </Box>
    );
  }

  const avgWpm =
    profile.recentWpm.length > 0
      ? Math.round(
          profile.recentWpm.reduce((a, b) => a + b, 0) /
            profile.recentWpm.length
        )
      : 0;

  const avgAccuracy =
    profile.recentAccuracy.length > 0
      ? Math.round(
          profile.recentAccuracy.reduce((a, b) => a + b, 0) /
            profile.recentAccuracy.length
        )
      : 100;

  const archetype = ARCHETYPE_INFO[profile.fatigueArchetype];
  const insights = generateInsights(profile);

  let trendIcon = <TrendingFlatIcon color="action" />;
  if (profile.wpmTrend > 0.5) {
    trendIcon = <TrendingUpIcon color="success" />;
  } else if (profile.wpmTrend < -0.5) {
    trendIcon = <TrendingDownIcon color="error" />;
  }

  return (
    <Box sx={{ maxWidth: 900, width: "100%", mx: "auto", px: { xs: 2, sm: 3 } }}>
      <Typography
        variant="h4"
        fontWeight="bold"
        sx={{ mb: 3, textAlign: "center" }}
      >
        Analytics
      </Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={4}>
          <Card>
            <CardContent sx={{ textAlign: "center", py: 2, "&:last-child": { pb: 2 } }}>
              <Typography variant="h4" fontWeight="bold">
                {profile.totalTests}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Tests taken
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={4}>
          <Card>
            <CardContent sx={{ textAlign: "center", py: 2, "&:last-child": { pb: 2 } }}>
              <Stack direction="row" justifyContent="center" alignItems="center" gap={0.5}>
                <Typography variant="h4" fontWeight="bold">
                  {avgWpm}
                </Typography>
                {trendIcon}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Avg WPM
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={4}>
          <Card>
            <CardContent sx={{ textAlign: "center", py: 2, "&:last-child": { pb: 2 } }}>
              <Typography variant="h4" fontWeight="bold">
                {avgAccuracy}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Avg accuracy
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {archetype && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <SpeedIcon color="primary" />
              <Typography variant="h6" fontWeight="bold">
                Typing Profile
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Chip label={archetype.label} color={archetype.color} size="small" />
              <Typography variant="body2" color="text.secondary">
                {archetype.tip}
              </Typography>
            </Stack>
            {insights.length > 0 && (
              <Box
                sx={{
                  mt: 1.5,
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: "action.hover",
                }}
              >
                {insights.map((text) => (
                  <Typography key={text} variant="body2" sx={{ mb: 0.5 }}>
                    {text}
                  </Typography>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" sx={{ mb: 2, textAlign: "center" }}>
            Keyboard Heatmap
          </Typography>
          <KeyboardHeatmap rollingKeyStats={profile.rollingKeyStats || {}} />
        </CardContent>
      </Card>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
                Weakest Keys
              </Typography>
              {profile.weakestKeys?.length > 0 ? (
                <Stack spacing={0.5}>
                  {profile.weakestKeys.map((k) => (
                    <Stack key={k.key} direction="row" justifyContent="space-between" alignItems="center">
                      <Typography
                        sx={{
                          fontFamily: "'Fira Code', monospace",
                          fontWeight: "bold",
                          fontSize: 16,
                        }}
                      >
                        {k.key.toUpperCase()}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {(k.errorRate * 100).toFixed(1)}% errors
                        {k.avgLatencyMs > 0 && ` · ${k.avgLatencyMs}ms`}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Not enough data yet
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
                Slowest Bigrams
              </Typography>
              {profile.slowestBigrams?.length > 0 ? (
                <Stack spacing={0.5}>
                  {profile.slowestBigrams.map((bg) => (
                    <Stack key={bg.bigram} direction="row" justifyContent="space-between" alignItems="center">
                      <Typography
                        sx={{
                          fontFamily: "'Fira Code', monospace",
                          fontWeight: "bold",
                          fontSize: 16,
                        }}
                      >
                        {bg.bigram}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {bg.avgLatencyMs}ms avg · {bg.count} occurrences
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Not enough data yet
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {profile.rollingBackspaceStats && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <BackspaceIcon color="secondary" />
              <Typography variant="h6" fontWeight="bold">
                Backspace Analysis
              </Typography>
            </Stack>
            <BackspaceSection
              stats={profile.rollingBackspaceStats}
              totalTests={profile.totalTests}
            />
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
                Average Pacing
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Average WPM per 10-second window across all tests
              </Typography>
              <FatigueChart windows={profile.avgWindows || []} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
                WPM Progress
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Recent test history
              </Typography>
              <ProgressChart recentWpm={profile.recentWpm || []} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Analytics;
