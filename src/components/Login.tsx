import { Button, Stack, TextField } from "@mui/material";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../state/userServices";

const Login: React.FC<{}> = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const { email, password } = formData;

  const onChange = (e: any) => {
    setFormData((prevState) => ({
      ...prevState,
      [e.target.name]: e.target.value,
    }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const userData = { email, password };
    try {
      login(userData).then(() => navigate("/home"));
    } catch (error: any) {
      console.log(error);
    }
  };

  return (
    <Stack
      component="form"
      direction="column"
      spacing={2}
      onSubmit={onSubmit}
    >
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
      <Button type="submit" variant="contained">
        Login
      </Button>
    </Stack>
  );
};

export default Login;
