import {
  Box,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import React, { useEffect, useState } from "react";
import { getScores } from "../../state/scoreServices";
import { useSession } from "../../core/useSession";

interface Score {
  _id: string;
  /** Set by the API from the verified token; the leaderboard exposes no user ids. */
  isMine: boolean;
  userName: string;
  score: number;
  createdAt: string;
}

const medalColor = (idx: number) => {
  if (idx === 0) return "#FFD700";
  if (idx === 1) return "#C0C0C0";
  if (idx === 2) return "#CD7F32";
  return undefined;
};

const Scores: React.FC = () => {
  const [allScores, setAllScores] = useState<Score[]>([]);
  const [tab, setTab] = useState(0);

  const loggedIn = useSession() !== null;

  useEffect(() => {
    getScores()
      .then((data: Score[]) => setAllScores(data))
      .catch(console.error);
  }, [loggedIn]);

  const globalSorted = [...allScores].sort((a, b) => b.score - a.score);
  const personalSorted = loggedIn
    ? globalSorted.filter((s) => s.isMine)
    : [];

  const renderTable = (scores: Score[], showUser: boolean) => {
    if (scores.length === 0) {
      return (
        <Typography variant="body1" color="text.secondary" sx={{ py: 4 }}>
          No scores yet.
        </Typography>
      );
    }

    return (
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 500 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 60 }}>#</TableCell>
              {showUser && <TableCell>Player</TableCell>}
              <TableCell align="right">WPM</TableCell>
              <TableCell align="right">Date</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {scores.map((s, idx) => (
              <TableRow key={s._id}>
                <TableCell>
                  {medalColor(idx) ? (
                    <EmojiEventsIcon
                      sx={{ color: medalColor(idx), fontSize: 20, verticalAlign: "middle" }}
                    />
                  ) : (
                    idx + 1
                  )}
                </TableCell>
                {showUser && (
                  <TableCell>
                    {loggedIn && s.isMine ? (
                      <strong>{s.userName}</strong>
                    ) : (
                      s.userName
                    )}
                  </TableCell>
                )}
                <TableCell align="right">
                  <strong>{s.score}</strong>
                </TableCell>
                <TableCell align="right">
                  {new Date(s.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  return (
    <Box sx={{ width: "100%", maxWidth: 700, px: { xs: 2, sm: 3 } }}>
      <Typography variant="h4" textAlign="center" gutterBottom>
        Scores
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ mb: 3 }}>
        <Tab label="Leaderboard" />
        <Tab label="My Scores" disabled={!loggedIn} />
      </Tabs>

      {tab === 0 && renderTable(globalSorted, true)}
      {tab === 1 && renderTable(personalSorted, false)}

      {tab === 1 && !loggedIn && (
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 2 }}>
          Log in to see your personal scores.
        </Typography>
      )}
    </Box>
  );
};

export default Scores;
