import { Button, Stack, TextField } from "@mui/material";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { register } from "../state/userServices";

const Register: React.FC<{}> = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    password2: "",
  });

  const { name, email, password, password2 } = formData;

  const onChange = (e: any) => {
    setFormData((prevState) => ({
      ...prevState,
      [e.target.name]: e.target.value,
    }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password !== password2) {
      console.log("Passwords do not match!");
      return;
    }
    const userData = { name, email, password };
    try {
      register(userData).then(() => navigate("/home"));
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
        type="text"
        name="name"
        value={name}
        label="Name"
        onChange={onChange}
        autoComplete="name"
      />
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
        autoComplete="new-password"
      />
      <TextField
        type="password"
        name="password2"
        value={password2}
        label="Confirm Password"
        onChange={onChange}
        autoComplete="new-password"
      />
      <Button type="submit" variant="contained">
        Register
      </Button>
    </Stack>
  );
};

export default Register;
