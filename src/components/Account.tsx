import { Box, Tab, Tabs } from "@mui/material";
import React, { useState } from "react";
import Login from "./Login";
import Register from "./Register";

const Account: React.FC = () => {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ width: "100%", maxWidth: 400, px: { xs: 3, sm: 0 } }}>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{ mb: 3 }}
      >
        <Tab label="Login" />
        <Tab label="Register" />
      </Tabs>

      {tab === 0 && <Login />}
      {tab === 1 && <Register />}
    </Box>
  );
};

export default Account;
