import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../core/useSession";
import { deleteAccount, logout } from "../state/userServices";

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const user = useSession();
  if (!user) return null;

  const onLogout = () => {
    logout();
    navigate("/account");
  };

  const onDeleteClose = () => {
    setDeleteOpen(false);
    setPassword("");
    setError("");
  };

  const onDeleteConfirm = async () => {
    setError("");
    if (!password) {
      setError("Enter your password to confirm");
      return;
    }
    setLoading(true);
    try {
      await deleteAccount(password);
      logout();
      onDeleteClose();
      navigate("/account");
    } catch (err: any) {
      setError(
        err.response?.data?.message || err.message || "Could not delete account"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
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
        <Button
          variant="text"
          color="error"
          size="small"
          onClick={() => setDeleteOpen(true)}
        >
          Delete account
        </Button>
      </Stack>

      <Dialog open={deleteOpen} onClose={loading ? undefined : onDeleteClose}>
        <DialogTitle>Delete account?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            This permanently removes your account, profile, scores, and analytics
            stored for this app. This cannot be undone.
          </DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            type="password"
            label="Confirm password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onDeleteClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={onDeleteConfirm}
            color="error"
            variant="contained"
            disabled={loading}
          >
            {loading ? "Deleting\u2026" : "Delete my account"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default Profile;
