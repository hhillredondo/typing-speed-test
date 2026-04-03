import { Box, createTheme, CssBaseline, Stack, ThemeProvider } from "@mui/material";
import React, { useCallback, useState } from "react";
import AppHeader from "../components/AppHeader";
import Account from "../components/Account";
import Profile from "../components/Profile";
import Scores from "../components/Scores/Scores";
import Test from "../components/Test/Test";
import { isUserLoggedIn } from "../core/isUserLoggedIn";

const sharedTypography = {
  fontFamily: "'Inter', sans-serif",
  h1: { fontFamily: "'Fira Code', monospace" },
  h2: { fontFamily: "'Fira Code', monospace" },
  h3: { fontFamily: "'Fira Code', monospace" },
  h4: { fontFamily: "'Inter', sans-serif", fontWeight: 600 },
  h5: { fontFamily: "'Inter', sans-serif", fontWeight: 600 },
  h6: { fontFamily: "'Inter', sans-serif", fontWeight: 500 },
  button: { fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: "0.02em" },
};

const lightTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#6366f1" },
    secondary: { main: "#f59e0b" },
    error: { main: "#ef4444" },
    background: { default: "#f5f3ff", paper: "rgba(255,255,255,0.8)" },
    text: { primary: "#1e1b4b", secondary: "#6b7280" },
  },
  typography: sharedTypography,
  shape: { borderRadius: 12 },
});

const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#818cf8" },
    secondary: { main: "#fbbf24" },
    error: { main: "#f87171" },
    background: { default: "#0c0a1a", paper: "rgba(30,27,75,0.6)" },
    text: { primary: "#e0def4", secondary: "#9ca3af" },
  },
  typography: sharedTypography,
  shape: { borderRadius: 12 },
});

const bgStyles = `
@keyframes blob-drift-1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25%      { transform: translate(12vw, -8vh) scale(1.15); }
  50%      { transform: translate(-6vw, 14vh) scale(0.9); }
  75%      { transform: translate(8vw, 6vh) scale(1.05); }
}
@keyframes blob-drift-2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%      { transform: translate(-14vw, 10vh) scale(1.1); }
  66%      { transform: translate(10vw, -12vh) scale(0.95); }
}
@keyframes blob-drift-3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  20%      { transform: translate(6vw, 12vh) scale(1.08); }
  40%      { transform: translate(-10vw, -6vh) scale(0.92); }
  60%      { transform: translate(14vw, 4vh) scale(1.12); }
  80%      { transform: translate(-4vw, -10vh) scale(0.97); }
}
.bg-canvas { position: fixed; inset: 0; z-index: -1; overflow: hidden; }
.bg-canvas.paused .blob { animation-play-state: paused; }
.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.45;
  will-change: transform;
}
.blob-1 {
  width: 50vw; height: 50vw;
  top: -10%; left: -10%;
  animation: blob-drift-1 28s ease-in-out infinite;
}
.blob-2 {
  width: 45vw; height: 45vw;
  bottom: -15%; right: -10%;
  animation: blob-drift-2 32s ease-in-out infinite;
}
.blob-3 {
  width: 35vw; height: 35vw;
  top: 40%; left: 50%;
  animation: blob-drift-3 36s ease-in-out infinite;
}

.theme-light .blob-1 { background: radial-gradient(circle, #c4b5fd, #a78bfa); }
.theme-light .blob-2 { background: radial-gradient(circle, #fde68a, #fbbf24); }
.theme-light .blob-3 { background: radial-gradient(circle, #99f6e4, #5eead4); }

.theme-dark .blob-1 { background: radial-gradient(circle, #4338ca, #6366f1); }
.theme-dark .blob-2 { background: radial-gradient(circle, #7c3aed, #a855f7); }
.theme-dark .blob-3 { background: radial-gradient(circle, #0e7490, #06b6d4); }
`;

const Main: React.FC<{ view: string }> = (props) => {
  const mode: number = localStorage.getItem("theme") === "dark" ? 1 : 0;
  const [theme, setTheme] = useState<number>(mode);
  const [testActive, setTestActive] = useState(false);

  const toggleTheme = () => {
    const next = theme === 0 ? 1 : 0;
    setTheme(next);
    localStorage.setItem("theme", next === 1 ? "dark" : "light");
  };

  const handleTestRunning = useCallback((running: boolean) => {
    setTestActive(running);
  }, []);

  const isDark = theme === 1;
  const themeClass = isDark ? "theme-dark" : "theme-light";

  return (
    <ThemeProvider theme={isDark ? darkTheme : lightTheme}>
      <CssBaseline />
      <style>{bgStyles}</style>

      <Box
        className={`bg-canvas ${themeClass} ${testActive ? "paused" : ""}`}
      >
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </Box>

      <AppHeader theme={theme} onToggleTheme={toggleTheme} />

      {props.view === "" && (
        <Stack alignItems="center" sx={{ mt: { xs: 6, sm: 10, md: 12 } }}>
          <Test onTestRunning={handleTestRunning} />
        </Stack>
      )}

      {props.view === "scores" && (
        <Stack alignItems="center" sx={{ mt: 5 }}>
          <Scores />
        </Stack>
      )}

      {props.view === "profile" && isUserLoggedIn() && (
        <Stack alignItems="center" sx={{ mt: 5 }}>
          <Profile />
        </Stack>
      )}

      {props.view === "account" && !isUserLoggedIn() && (
        <Stack alignItems="center" sx={{ mt: 10 }}>
          <Account />
        </Stack>
      )}
    </ThemeProvider>
  );
};

export default Main;
