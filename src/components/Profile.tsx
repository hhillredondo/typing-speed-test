import { Button, Stack, Typography } from "@mui/material";
import React from "react";
import { useNavigate } from "react-router-dom";
import { logout } from "../state/userServices";

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const stored = localStorage.getItem("user");
  if (!stored) return null;

  const user = JSON.parse(stored);

  const onLogout = () => {
    logout();
    navigate("/account");
  };

  return (
    <Stack direction="column" spacing={3} alignItems="center" sx={{ mt: 4 }}>
      <Typography variant="h5">Profile</Typography>
      <Typography variant="body1">
        <strong>Name:</strong> {user.name}
      </Typography>
      <Typography variant="body1">
        <strong>Email:</strong> {user.email}
      </Typography>
      <Button variant="outlined" color="error" onClick={onLogout}>
        Logout
      </Button>
    </Stack>
  );
};

export default Profile;
