import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { register, confirmSignUp, resendCode } from "../state/userServices";

const PASSWORD_MIN_LENGTH = 8;

function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter";
  }
  if (!/\d/.test(password)) {
    return "Password must contain at least one number";
  }
  return null;
}

const Register: React.FC = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState<"register" | "verify">("register");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    password2: "",
  });

  const { name, email, password, password2 } = formData;

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const onSubmitRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== password2) {
      setError("Passwords do not match");
      return;
    }

    const pwError = validatePassword(password);
    if (pwError) {
      setError(pwError);
      return;
    }

    setLoading(true);
    try {
      await register({ name, email, password });
      setStep("verify");
    } catch (err: any) {
      setError(err.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const onSubmitVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!verificationCode.trim()) {
      setError("Please enter the verification code");
      return;
    }

    setLoading(true);
    try {
      await confirmSignUp({
        email,
        password,
        code: verificationCode.trim(),
      });
      navigate("/home");
    } catch (err: any) {
      setError(err.response?.data?.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const onResendCode = async () => {
    setError("");
    setInfo("");
    try {
      await resendCode({ email });
      setInfo("Verification code resent!");
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to resend code");
    }
  };

  if (step === "verify") {
    return (
      <Stack
        component="form"
        direction="column"
        spacing={2}
        onSubmit={onSubmitVerify}
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          A verification code has been sent to <strong>{email}</strong>.
        </Typography>

        {error && <Alert severity="error">{error}</Alert>}
        {info && <Alert severity="success">{info}</Alert>}

        <TextField
          type="text"
          name="code"
          value={verificationCode}
          label="Verification Code"
          onChange={(e) => setVerificationCode(e.target.value)}
          autoComplete="one-time-code"
          autoFocus
        />

        <Button type="submit" variant="contained" disabled={loading}>
          {loading ? "Verifying\u2026" : "Verify"}
        </Button>
        <Button
          variant="text"
          size="small"
          onClick={onResendCode}
          disabled={loading}
        >
          Resend code
        </Button>
      </Stack>
    );
  }

  return (
    <Stack
      component="form"
      direction="column"
      spacing={2}
      onSubmit={onSubmitRegister}
    >
      {error && <Alert severity="error">{error}</Alert>}

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
        helperText="Min. 8 characters, at least one lowercase letter and one number"
      />
      <TextField
        type="password"
        name="password2"
        value={password2}
        label="Confirm Password"
        onChange={onChange}
        autoComplete="new-password"
      />
      <Button type="submit" variant="contained" disabled={loading}>
        {loading ? "Registering\u2026" : "Register"}
      </Button>
    </Stack>
  );
};

export default Register;
