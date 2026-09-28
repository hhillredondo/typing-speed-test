import {
  AppBar,
  Box,
  IconButton,
  Toolbar,
  Tooltip,
} from "@mui/material";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import BarChartIcon from "@mui/icons-material/BarChart";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import HomeIcon from "@mui/icons-material/Home";
import React from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../core/useSession";

const AppHeader: React.FC<{
  theme: number;
  onToggleTheme: () => void;
}> = ({ theme, onToggleTheme }) => {
  const navigate = useNavigate();
  const session = useSession();

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        background: "transparent",
        backdropFilter: "blur(12px)",
        px: { xs: 1, sm: 4, md: "200px" },
      }}
    >
      <Toolbar
        disableGutters
        sx={{
          "& .MuiSvgIcon-root": { fontSize: "2rem" },
          // Six padded 48px icons overflow phone widths
          "& .MuiIconButton-root": { p: { xs: 0, sm: 1 } },
        }}
      >
        <Box sx={{ display: "flex", gap: 0 }}>
          <Tooltip title="Home">
            <IconButton
              sx={{ color: "text.primary" }}
              onClick={() => navigate("/home")}
            >
              <HomeIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Scores">
            <IconButton
              sx={{ color: "text.primary" }}
              onClick={() => navigate("/scores")}
            >
              <EmojiEventsIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Analytics">
            <IconButton
              sx={{ color: "text.primary" }}
              onClick={() => navigate("/analytics")}
            >
              <BarChartIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Weakness Drill">
            <IconButton
              sx={{ color: "text.primary" }}
              onClick={() => navigate("/drill")}
            >
              <FitnessCenterIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title={theme === 0 ? "Dark mode" : "Light mode"}>
          <IconButton sx={{ color: "text.primary" }} onClick={onToggleTheme}>
            {theme === 0 ? <Brightness4Icon /> : <Brightness7Icon />}
          </IconButton>
        </Tooltip>

        <Tooltip title={session ? "Profile" : "Login / Register"}>
          <IconButton
            sx={{ color: "text.primary" }}
            onClick={() =>
              navigate(session ? "/profile" : "/account")
            }
          >
            <AccountCircleIcon />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
};

export default AppHeader;
