import { Typography } from "@mui/material";
import React from "react";

const Timer: React.FC<{ time: number }> = ({ time }) => {
  return (
    <Typography
      sx={{ fontSize: { xs: 48, sm: 60, md: 75 } }}
      fontWeight="bold"
    >
      {time}
    </Typography>
  );
};

export default Timer;
