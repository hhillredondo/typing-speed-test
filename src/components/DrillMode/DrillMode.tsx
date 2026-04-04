import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { isUserLoggedIn } from "../../core/isUserLoggedIn";
import { getAnalyticsProfile } from "../../state/scoreServices";
import type { AnalyticsProfile } from "../../types/analytics";
import Timer from "../Test/components/Timer";
import { generateDrillWords } from "./generateDrillWords";

const DRILL_DURATION = 30;

const cursorKeyframes = `
@keyframes blink-cursor {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}`;

const DrillMode: React.FC = () => {
  const [profile, setProfile] = useState<AnalyticsProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const loggedIn = isUserLoggedIn();

  const [words, setWords] = useState<string[]>([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [correctKeys, setCorrectKeys] = useState(0);
  const [totalKeys, setTotalKeys] = useState(0);
  const [timer, setTimer] = useState(DRILL_DURATION);
  const [testRunning, setTestRunning] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const finalScoreRef = useRef(0);
  const finalMistakesRef = useRef(0);
  const finalAccuracyRef = useRef(100);
  const scoreRef = useRef(0);
  const mistakesRef = useRef(0);
  const correctKeysRef = useRef(0);
  const totalKeysRef = useRef(0);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);
  useEffect(() => {
    mistakesRef.current = mistakes;
  }, [mistakes]);
  useEffect(() => {
    correctKeysRef.current = correctKeys;
  }, [correctKeys]);
  useEffect(() => {
    totalKeysRef.current = totalKeys;
  }, [totalKeys]);

  useEffect(() => {
    if (!loggedIn) {
      setLoading(false);
      return;
    }
    getAnalyticsProfile()
      .then((data) => {
        setProfile(data);
        if (data && data.totalTests > 0) {
          setWords(generateDrillWords(data));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [loggedIn]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [loading]);

  const finishTest = useCallback(() => {
    setTestRunning(false);
    finalScoreRef.current = scoreRef.current;
    finalMistakesRef.current = mistakesRef.current;
    finalAccuracyRef.current =
      totalKeysRef.current > 0
        ? Math.round((correctKeysRef.current / totalKeysRef.current) * 100)
        : 100;
    setShowModal(true);
  }, []);

  useEffect(() => {
    if (!testRunning) return;
    if (timer <= 0) {
      finishTest();
      return;
    }
    const id = setTimeout(() => setTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timer, testRunning, finishTest]);

  const resetDrill = () => {
    if (profile && profile.totalTests > 0) {
      setWords(generateDrillWords(profile));
    }
    setWordIndex(0);
    setTyped("");
    setScore(0);
    setMistakes(0);
    setCorrectKeys(0);
    setTotalKeys(0);
    setTimer(DRILL_DURATION);
    setTestRunning(false);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetDrill();
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleQuit = () => {
    resetDrill();
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const currentWord = words[wordIndex] || "";

  const startDrillWithKey = (key: string) => {
    setTestRunning(true);
    setTimer(DRILL_DURATION);
    setScore(0);
    setMistakes(0);
    setCorrectKeys(0);
    setTotalKeys(0);
    const target = currentWord[0];
    const isCorrect = target !== undefined && key === target;
    setTotalKeys(1);
    setCorrectKeys(isCorrect ? 1 : 0);
    setTyped(key);
  };

  const handleRunningKey = (key: string) => {
    if (key === " ") {
      if (typed.length === 0) return;
      if (typed === currentWord) setScore((s) => s + 1);
      else setMistakes((m) => m + 1);
      setWordIndex((i) => i + 1);
      setTyped("");
    } else if (key === "Backspace") {
      setTyped((t) => t.slice(0, -1));
    } else if (key.length === 1) {
      const pos = typed.length;
      const target = currentWord[pos];
      setTotalKeys((t) => t + 1);
      if (target !== undefined && key === target) {
        setCorrectKeys((c) => c + 1);
      }
      setTyped((t) => t + key);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "Backspace") e.preventDefault();

    if (!testRunning) {
      if (e.key.length === 1 && e.key !== " ") startDrillWithKey(e.key);
      return;
    }
    handleRunningKey(e.key);
  };

  const focusInput = () => inputRef.current?.focus();

  const accuracy =
    totalKeys > 0 ? Math.round((correctKeys / totalKeys) * 100) : 100;

  if (!loggedIn) {
    return (
      <Box sx={{ maxWidth: 600, mx: "auto", textAlign: "center", mt: 6 }}>
        <Typography variant="h5" gutterBottom>
          Weakness Drill
        </Typography>
        <Typography color="text.secondary">
          Log in to access personalized drills.
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
          Weakness Drill
        </Typography>
        <Typography color="text.secondary">
          Complete some regular tests first so we can identify your weaknesses.
        </Typography>
      </Box>
    );
  }

  const renderTypedChars = () => {
    if (typed.length === 0) return null;
    const chars: React.ReactNode[] = [];
    for (let i = 0; i < typed.length; i++) {
      const target = currentWord[i];
      const typedChar = typed[i];
      const isCorrect = target !== undefined && typedChar === target;
      chars.push(
        <span
          key={i}
          style={{
            color: isCorrect ? "#66bb6a" : "#f44336",
            textDecoration: isCorrect ? undefined : "line-through",
          }}
        >
          {typedChar}
        </span>
      );
    }
    return <span>{chars}</span>;
  };

  const untypedPortion = currentWord.slice(typed.length);
  const upcomingWords = words.slice(wordIndex + 1, wordIndex + 30).join(" ");
  const remainingText =
    untypedPortion + (upcomingWords ? " " + upcomingWords : "");

  const targetingKeys = (profile.weakestKeys || []).slice(0, 3);
  const targetingBigrams = (profile.slowestBigrams || []).slice(0, 3);

  return (
    <>
      <style>{cursorKeyframes}</style>
      <Box sx={{ width: "100%", maxWidth: 800, px: { xs: 2, sm: 3 } }}>
        {!testRunning && timer === DRILL_DURATION && (
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", gap: 1 }}>
                <Typography variant="body2" fontWeight="bold">
                  Targeting:
                </Typography>
                {targetingKeys.map((k) => (
                  <Chip
                    key={k.key}
                    label={k.key.toUpperCase()}
                    size="small"
                    color="error"
                    variant="outlined"
                  />
                ))}
                {targetingBigrams.map((bg) => (
                  <Chip
                    key={bg.bigram}
                    label={`"${bg.bigram}"`}
                    size="small"
                    color="warning"
                    variant="outlined"
                  />
                ))}
              </Stack>
            </CardContent>
          </Card>
        )}

        <Stack direction="column" spacing={3} alignItems="center">
          <Stack direction="row" spacing={2} alignItems="center">
            <Chip label="30s Drill" color="secondary" size="small" />
            <Timer time={timer} />
          </Stack>

          <Stack
            direction="row"
            onClick={focusInput}
            sx={{ width: "100%", cursor: "text" }}
          >
            <Box
              sx={{
                width: "50%",
                fontSize: { xs: 20, sm: 28, md: 32 },
                textAlign: "right",
                borderBottom: "1px solid",
                borderColor: "text.secondary",
                whiteSpace: "nowrap",
                overflow: "hidden",
                lineHeight: "1.4375em",
                py: "4px",
              }}
            >
              {renderTypedChars()}
              {inputFocused && (
                <span
                  style={{
                    borderRight: "2px solid",
                    animation: "blink-cursor 1s step-end infinite",
                  }}
                >
                  &#8203;
                </span>
              )}
            </Box>
            <TextField
              disabled
              variant="standard"
              InputProps={{ style: { fontSize: "inherit" } }}
              sx={{ width: "50%", fontSize: { xs: 20, sm: 28, md: 32 } }}
              value={remainingText}
            />
          </Stack>
        </Stack>

        <input
          ref={inputRef}
          onKeyDown={handleKeyDown}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          style={{
            position: "fixed",
            left: "-9999px",
            top: "-9999px",
            opacity: 0,
          }}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />

        <Stack alignItems="center" sx={{ mt: { xs: 8, sm: 12, md: 16 } }}>
          <Typography
            variant="h2"
            fontWeight="bold"
            sx={{ fontSize: { xs: "2.5rem", sm: "3.75rem" } }}
          >
            {score}
          </Typography>
          {!testRunning && timer === DRILL_DURATION && (
            <Typography variant="body2" color="text.secondary">
              words per minute
            </Typography>
          )}
        </Stack>

        <Stack
          direction="row"
          spacing={5}
          justifyContent="center"
          sx={{ mt: 8 }}
        >
          <Stack alignItems="center">
            <Typography variant="h5" fontWeight="bold" color="error">
              {mistakes}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              mistakes
            </Typography>
          </Stack>
          <Stack alignItems="center">
            <Typography variant="h5" fontWeight="bold">
              {accuracy}%
            </Typography>
            <Typography variant="body2" color="text.secondary">
              accuracy
            </Typography>
          </Stack>
        </Stack>

        {testRunning && (
          <Stack alignItems="center" sx={{ mt: 3 }}>
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={handleQuit}
            >
              Quit
            </Button>
          </Stack>
        )}
      </Box>

      <Dialog
        open={showModal}
        onClose={handleCloseModal}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ textAlign: "center" }}>Drill Complete</DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: "center", py: 2 }}>
            <Typography variant="h1" fontWeight="bold" color="secondary">
              {finalScoreRef.current}
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ mt: 1 }}>
              words in 30 seconds
            </Typography>
            <Stack
              direction="row"
              spacing={4}
              justifyContent="center"
              sx={{ mt: 3 }}
            >
              <Stack alignItems="center">
                <Typography variant="h5" fontWeight="bold" color="error">
                  {finalMistakesRef.current}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  mistake{finalMistakesRef.current === 1 ? "" : "s"}
                </Typography>
              </Stack>
              <Stack alignItems="center">
                <Typography variant="h5" fontWeight="bold">
                  {finalAccuracyRef.current}%
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  accuracy
                </Typography>
              </Stack>
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center", pb: 3 }}>
          <Button variant="contained" color="secondary" onClick={handleCloseModal}>
            Drill Again
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DrillMode;
