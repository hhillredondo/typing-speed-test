import {
  Button,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import React, { useEffect, useState } from "react";
import { createScore } from "../../state/scoreServices";
import englishWords from "../../assets/words/en.json";
import Timer from "./components/Timer";
import { isAlphabetCharacter, shuffleArray } from "./utils";

const Test: React.FC<{
  theme: number;
  setTheme: React.Dispatch<React.SetStateAction<number>>;
}> = (props) => {
  const { theme, setTheme } = props;

  const loggedUser = localStorage.getItem("user");
  const user = loggedUser ? JSON.parse(loggedUser) : "";
  const userId = user._id || "";

  const processedWords = shuffleArray([...englishWords]).join(" ");

  const [selectedTime, setSelectedTime] = useState<number>(60);
  const [value, setValue] = useState<string>("");
  const [currentWords, setCurrentWords] = useState<string>(processedWords);
  const [currentDynamicWord, setCurrentDynamicWord] = useState<string>(
    currentWords.substring(0, currentWords.indexOf(" "))
  );
  const [currentWord, setCurrentWord] = useState<string>(
    currentWords.substring(0, currentWords.indexOf(" "))
  );
  const [reverseWord, setReverseWord] = useState<string>("");
  const [score, setScore] = useState<number>(0);
  const [timer, setTimer] = useState<number>(0);
  const [testRunning, setTestRunning] = useState<boolean>(false);
  const [keyboardType, setKeyboardType] = useState<string>("qwerty");

  const handleTimeChange = (event: any) => {
    setSelectedTime(event.target.value);
  };

  const handleTypeChange = (event: any) => {
    setKeyboardType(event.target.value);
  };

  const handleThemeChange = (event: any) => {
    const themeNumber = event.target.value;
    setTheme(themeNumber);
    const themeName = themeNumber === 0 ? "light" : "dark";
    localStorage.setItem("theme", themeName);
  };

  useEffect(() => {
    if (testRunning)
      timer > 0 ? setTimeout(() => setTimer(timer - 1), 1000) : finishTest();
  }, [timer]);

  const stopTest = () => {
    setTestRunning(false);
    document.getElementById("typing-box")?.blur();
  };

  const resetTest = () => {
    setTimer(0);
    setScore(0);
    stopTest();
  };

  const finishTest = () => {
    stopTest();
    nextWord();
    setValue("");
    const themeData = theme === 0 ? false : true;
    try {
      const data = {
        user: userId,
        type: keyboardType,
        score: score,
        theme: themeData,
      };
      createScore(data);
    } catch (error) {
      console.log(error);
    }
  };

  const nextWord = () => {
    const trimmedWords = currentWords.trim();
    const nextWords = trimmedWords.slice(currentWords.indexOf(" "));
    setCurrentWords(nextWords.trim());
    const trimtrim = nextWords.trim();
    setCurrentDynamicWord(trimtrim.slice(0, trimtrim.indexOf(" ")));
    setCurrentWord(trimtrim.slice(0, trimtrim.indexOf(" ")));
    setReverseWord("");
  };

  const startTest = () => {
    setScore(0);
    setTimer(selectedTime);
    setTestRunning(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!testRunning) startTest();
    if (e.keyCode === 32) {
      // SPACE
      if (value === currentWord) {
        setScore(score + 1);
      }
      nextWord();
      setValue("");
    } else if (e.keyCode === 8) {
      // BACKSPACE
      if (reverseWord.length > 0) {
        const currentChar = reverseWord.length - 1;
        const currentWordArray = currentWord.split("");
        const letterToAdd = currentWordArray[currentChar];
        if (value.length <= currentWord.length) {
          setCurrentWords(letterToAdd + currentWords);
          setCurrentDynamicWord(letterToAdd + currentDynamicWord);
          setReverseWord(reverseWord.slice(0, -1));
          setValue(value.slice(0, -1));
        }
        setValue(value.slice(0, -1));
      } else if (reverseWord.length === 0) {
        setValue("");
      }
    } else if (isAlphabetCharacter(e)) {
      setValue(value + e.key);
      if (currentDynamicWord.length > 0) {
        setCurrentDynamicWord(currentDynamicWord.slice(1));
        const letterGone = currentDynamicWord.slice(0, 1);
        setReverseWord(reverseWord + letterGone);
        setCurrentWords(currentWords.slice(1));
      }
    }
  };

  return (
      <Stack direction="column" spacing={5}>
        <Stack direction="row" spacing={4}>
          <Select
            value={selectedTime}
            onChange={handleTimeChange}
            style={{ width: "155px" }}
          >
            <MenuItem value={60}>One Minute</MenuItem>
            <MenuItem value={120}>Two Minutes</MenuItem>
            <MenuItem value={180}>Three Minutes</MenuItem>
          </Select>
          <Select
            value={keyboardType}
            onChange={handleTypeChange}
            style={{ width: "155px" }}
          >
            <MenuItem value={"qwerty"}>QWERTY</MenuItem>
            <MenuItem value={"dvorak"}>DVORAK</MenuItem>
            <MenuItem value={"colemark"}>COLEMARK</MenuItem>
          </Select>
          <Select
            value={theme}
            onChange={handleThemeChange}
            style={{ width: "155px" }}
          >
            <MenuItem value={0}>Light Theme</MenuItem>
            <MenuItem value={1}>Dark Theme</MenuItem>
          </Select>
          <Button
            variant="contained"
            onClick={(e) => (testRunning ? resetTest() : null)}
          >
            Reset Test
          </Button>
        </Stack>

        <Stack direction="row" spacing={4} justifyContent="center">
          <Timer time={testRunning ? timer : selectedTime} />
        </Stack>

        <Stack
          direction="row"
          style={{ color: "text.primary", backgroundColor: "primary" }}
        >
          <TextField
            id="typing-box"
            autoComplete="off"
            variant="standard"
            dir="rtl"
            style={{ maxWidth: "200px" }}
            InputProps={{ style: { fontSize: 40 } }}
            onKeyDown={(e) => handleKeyDown(e)}
            value={value}
          />
          <TextField
            disabled={true}
            variant="standard"
            InputProps={{ style: { fontSize: 40 } }}
            value={currentWords}
          />
        </Stack>

        <Stack direction="row" spacing={10}>
          <Typography>{"Score: " + score}</Typography>
        </Stack>
      </Stack>
  );
};

export default Test;
