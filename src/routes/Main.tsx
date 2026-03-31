import { createTheme, CssBaseline, Stack, ThemeProvider } from "@mui/material";
import React, { useState } from "react";
import AppHeader from "../components/AppHeader";
import Keyboards from "../components/Keyboards";
import Login from "../components/Login";
import Profile from "../components/Profile";
import Register from "../components/Register";
import Scores from "../components/Scores/Scores";
import Test from "../components/Test/Test";
import { isUserLoggedIn } from "../core/isUserLoggedIn";

const Main: React.FC<{ view: string }> = (props) => {
  const mode: number = localStorage.getItem("theme") === "dark" ? 1 : 0;

  const [theme, setTheme] = useState<number>(mode);

  const darkTheme = createTheme({
    palette: {
      mode: "dark",
    },
  });

  const lightTheme = createTheme({
    palette: {
      mode: "light",
    },
  });

  return (
    <>
      <ThemeProvider theme={theme === 1 ? darkTheme : lightTheme}>
        <CssBaseline />
        <AppHeader />

        {props.view === "" && (
          <Stack alignItems={"center"} sx={{ mt: 10 }}>
            <Test theme={theme} setTheme={setTheme}></Test>
          </Stack>
        )}

        {props.view === "scores" && (
          <Stack alignItems={"center"} sx={{ mt: 5 }}>
            <Scores></Scores>
          </Stack>
        )}

        {props.view === "profile" && isUserLoggedIn() && (
          <Stack alignItems={"center"} sx={{ mt: 5 }}>
            <Profile></Profile>
          </Stack>
        )}

        {props.view === "keyboards" && (
          <Stack alignItems={"center"} sx={{ mt: 5 }}>
            <Keyboards></Keyboards>
          </Stack>
        )}

        {props.view === "login" && !isUserLoggedIn() && (
          <Stack alignItems={"center"} sx={{ mt: 20 }}>
            <Login></Login>
          </Stack>
        )}

        {props.view === "register" && !isUserLoggedIn() && (
          <Stack alignItems={"center"} sx={{ mt: 20 }}>
            <Register></Register>
          </Stack>
        )}
      </ThemeProvider>
    </>
  );
};

export default Main;
