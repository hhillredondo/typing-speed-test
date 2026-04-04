import { Alert, Button, Stack, TextField } from "@mui/material";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../state/userServices";

const Login: React.FC = () => {
  const navigate = useNavigate();

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const { email, password } = formData;

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login({ email, password });
      navigate("/home");
    } catch (err: any) {
      setError(err.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack
      component="form"
      direction="column"
      spacing={2}
      onSubmit={onSubmit}
    >
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        type="email"
        name="email"
        value={email}
        label="Email"
        onChange={onChange}
        autoComplete="email"
      />
      <TextField
        type="password"
        name="password"
        value={password}
        label="Password"
        onChange={onChange}
        autoComplete="current-password"
      />
      <Button type="submit" variant="contained" disabled={loading}>
        {loading ? "Logging in\u2026" : "Login"}
      </Button>
    </Stack>
  );
};

export default Login;
