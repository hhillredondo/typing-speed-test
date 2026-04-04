import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createScore } from "../../state/scoreServices";
import englishWords from "../../assets/words/en.json";
import Timer from "./components/Timer";
import { shuffleArray } from "./utils";
import { computeTestAnalytics } from "./utils/computeAnalytics";
import type { BackspaceEvent, KeystrokeEvent, WordEvent } from "../../types/analytics";

const TEST_DURATION = 60;

const cursorKeyframes = `
@keyframes blink-cursor {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}`;

const Test: React.FC<{ onTestRunning?: (running: boolean) => void }> = ({
  onTestRunning,
}) => {
  const loggedUser = localStorage.getItem("user");
  const user = loggedUser ? JSON.parse(loggedUser) : null;
  const userId = user?._id || "";
  const userName = user?.name || "";

  const [words, setWords] = useState<string[]>(() =>
    shuffleArray([...englishWords])
  );
  const [wordIndex, setWordIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [correctKeys, setCorrectKeys] = useState(0);
  const [totalKeys, setTotalKeys] = useState(0);
  const [timer, setTimer] = useState(TEST_DURATION);
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
  const testStartTimeRef = useRef(0);
  const keystrokesRef = useRef<KeystrokeEvent[]>([]);
  const backspaceEventsRef = useRef<BackspaceEvent[]>([]);
  const wordEventsRef = useRef<WordEvent[]>([]);
  const consecutiveRunsRef = useRef<number[]>([]);
  const currentRunRef = useRef(0);

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
    onTestRunning?.(testRunning);
  }, [testRunning, onTestRunning]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const finishTest = useCallback(() => {
    setTestRunning(false);
    finalScoreRef.current = scoreRef.current;
    finalMistakesRef.current = mistakesRef.current;
    finalAccuracyRef.current =
      totalKeysRef.current > 0
        ? Math.round((correctKeysRef.current / totalKeysRef.current) * 100)
        : 100;

    if (currentRunRef.current > 0) {
      consecutiveRunsRef.current.push(currentRunRef.current);
      currentRunRef.current = 0;
    }

    const analytics = computeTestAnalytics(
      keystrokesRef.current,
      backspaceEventsRef.current,
      wordEventsRef.current,
      consecutiveRunsRef.current,
      TEST_DURATION
    );

    if (userId) {
      createScore({
        user: userId,
        score: scoreRef.current,
        userName,
        accuracy: finalAccuracyRef.current,
        mistakes: mistakesRef.current,
        analytics,
      }).catch(console.error);
    }

    setShowModal(true);
  }, [userId, userName]);

  useEffect(() => {
    if (!testRunning) return;
    if (timer <= 0) {
      finishTest();
      return;
    }
    const id = setTimeout(() => setTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timer, testRunning, finishTest]);

  const resetTest = () => {
    setWords(shuffleArray([...englishWords]));
    setWordIndex(0);
    setTyped("");
    setScore(0);
    setMistakes(0);
    setCorrectKeys(0);
    setTotalKeys(0);
    setTimer(TEST_DURATION);
    setTestRunning(false);
    keystrokesRef.current = [];
    backspaceEventsRef.current = [];
    wordEventsRef.current = [];
    consecutiveRunsRef.current = [];
    currentRunRef.current = 0;
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetTest();
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleQuit = () => {
    resetTest();
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const currentWord = words[wordIndex] || "";

  const trackKeystroke = (key: string, typedSoFar: string) => {
    const pos = typedSoFar.length;
    const target = currentWord[pos];
    const isCorrect = target !== undefined && key === target;
    setTotalKeys((t) => t + 1);
    if (isCorrect) {
      setCorrectKeys((c) => c + 1);
    }
    const ts = performance.now() - testStartTimeRef.current;
    keystrokesRef.current.push({
      key,
      expected: target || "",
      ts,
      correct: isCorrect,
      wordIdx: wordIndex,
      pos,
    });
  };

  const flushBackspaceRun = () => {
    if (currentRunRef.current > 0) {
      consecutiveRunsRef.current.push(currentRunRef.current);
      currentRunRef.current = 0;
    }
  };

  const startTestWithKey = (key: string) => {
    setTestRunning(true);
    setTimer(TEST_DURATION);
    setScore(0);
    setMistakes(0);
    setCorrectKeys(0);
    setTotalKeys(0);

    testStartTimeRef.current = performance.now();
    keystrokesRef.current = [];
    backspaceEventsRef.current = [];
    wordEventsRef.current = [];
    consecutiveRunsRef.current = [];
    currentRunRef.current = 0;

    const target = currentWord[0];
    const isCorrect = target !== undefined && key === target;
    setTotalKeys(1);
    setCorrectKeys(isCorrect ? 1 : 0);
    keystrokesRef.current.push({
      key,
      expected: target || "",
      ts: 0,
      correct: isCorrect,
      wordIdx: wordIndex,
      pos: 0,
    });
    setTyped(key);
  };

  const handleRunningKey = (key: string) => {
    if (key === " ") {
      if (typed.length === 0) return;
      flushBackspaceRun();
      const isWordCorrect = typed === currentWord;
      if (isWordCorrect) setScore((s) => s + 1);
      else setMistakes((m) => m + 1);
      wordEventsRef.current.push({
        word: currentWord,
        typed,
        correct: isWordCorrect,
        ts: performance.now() - testStartTimeRef.current,
        wordIdx: wordIndex,
      });
      setWordIndex((i) => i + 1);
      setTyped("");
    } else if (key === "Backspace") {
      currentRunRef.current += 1;
      backspaceEventsRef.current.push({
        ts: performance.now() - testStartTimeRef.current,
        wordIdx: wordIndex,
      });
      setTyped((t) => t.slice(0, -1));
    } else if (key.length === 1) {
      flushBackspaceRun();
      trackKeystroke(key, typed);
      setTyped((t) => t + key);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "Backspace") e.preventDefault();

    if (!testRunning) {
      if (e.key.length === 1 && e.key !== " ") startTestWithKey(e.key);
      return;
    }
    handleRunningKey(e.key);
  };

  const focusInput = () => inputRef.current?.focus();

  const accuracy =
    totalKeys > 0 ? Math.round((correctKeys / totalKeys) * 100) : 100;

  const renderTypedChars = () => {
    if (typed.length === 0) return null;

    const chars: React.ReactNode[] = [];
    for (let i = 0; i < typed.length; i++) {
      const target = currentWord[i];
      const typedChar = typed[i];

      if (target === undefined) {
        chars.push(
          <span
            key={i}
            style={{ color: "#f44336", textDecoration: "line-through" }}
          >
            {typedChar}
          </span>
        );
      } else if (typedChar === target) {
        chars.push(
          <span key={i} style={{ color: "#66bb6a" }}>
            {typedChar}
          </span>
        );
      } else {
        chars.push(
          <span
            key={i}
            style={{ color: "#f44336", textDecoration: "line-through" }}
          >
            {typedChar}
          </span>
        );
      }
    }

    return <span>{chars}</span>;
  };

  const untypedPortion = currentWord.slice(typed.length);
  const upcomingWords = words
    .slice(wordIndex + 1, wordIndex + 30)
    .join(" ");
  const remainingText =
    untypedPortion + (upcomingWords ? " " + upcomingWords : "");

  return (
    <>
      <style>{cursorKeyframes}</style>
      <Box sx={{ width: "100%", maxWidth: 800, px: { xs: 2, sm: 3 } }}>
        <Stack direction="column" spacing={3} alignItems="center">
          <Timer time={timer} />

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
              InputProps={{
                style: { fontSize: "inherit" },
              }}
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
          <Typography variant="h2" fontWeight="bold" sx={{ fontSize: { xs: "2.5rem", sm: "3.75rem" } }}>
            {score}
          </Typography>
          {!testRunning && timer === TEST_DURATION && (
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
        <DialogTitle sx={{ textAlign: "center" }}>Test Complete</DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: "center", py: 2 }}>
            <Typography variant="h1" fontWeight="bold" color="primary">
              {finalScoreRef.current}
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ mt: 1 }}>
              words per minute
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
                  mistake{finalMistakesRef.current !== 1 ? "s" : ""}
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
            {!userId && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 2 }}
              >
                Log in to save your scores!
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center", pb: 3 }}>
          <Button variant="contained" onClick={handleCloseModal}>
            Try Again
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default Test;
