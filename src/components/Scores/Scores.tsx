import { Divider, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getScores } from "../../state/scoreServices";
import ScoreTable from "./components/ScoresTable";

const Scores: React.FC<{}> = () => {
  const [lightScores, setLightScores] = useState();
  const [darkScores, setDarkScores] = useState();

  useEffect(() => {
    try {
      const res = getScores();
      res.then((result) => {
        setLightScores(result.filter((score: any) => score.theme == false));
        setDarkScores(result.filter((score: any) => score.theme == true));
      });
    } catch (error) {
      console.log(error);
    }
  }, []);

  const navigate = useNavigate();

  return (
    <Stack textAlign={"center"} direction="column" spacing={3}>
      <Typography variant={"h3"}>Global Scores</Typography>
      <Typography variant={"h6"}>
        For personal scores check your{" "}
        <span
          style={{ cursor: "pointer" }}
          onClick={() => navigate("/profile")}
        >
          Profile
        </span>
      </Typography>
      <Stack
        direction="row"
        divider={<Divider orientation="vertical" flexItem />}
        spacing={2}
      >
        <Stack direction="column" textAlign={"center"} spacing={2}>
          <Typography variant={"h5"}>Light Theme</Typography>
          <ScoreTable data={lightScores}></ScoreTable>
        </Stack>
        <Stack direction="column" textAlign={"center"} spacing={2}>
          <Typography variant={"h5"}>Dark Theme</Typography>
          <ScoreTable data={darkScores}></ScoreTable>
        </Stack>
      </Stack>
    </Stack>
  );
};

export default Scores;
