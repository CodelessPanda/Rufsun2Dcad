import { LogIn, UserPlus } from "lucide-react";
import { useState } from "react";

interface Props {
  mode: "login" | "register";
  busy: boolean;
  error: string;
  onModeChange: (mode: "login" | "register") => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (name: string, email: string, password: string) => Promise<void>;
}

export function AuthScreen({ mode, busy, error, onModeChange, onLogin, onRegister }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async () => {
    if (mode === "register") await onRegister(name, email, password);
    else await onLogin(email, password);
  };

  return (
    <div className="auth-screen">
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="auth-brand">
          <span className="brand-mark">R</span>
          <strong>RufsunCAD</strong>
        </div>
        <h1>{mode === "register" ? "Create account" : "Login"}</h1>
        {mode === "register" && (
          <label className="field stacked">
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </label>
        )}
        <label className="field stacked">
          <span>Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus={mode === "login"} />
        </label>
        <label className="field stacked">
          <span>Password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <p className="warning">{error}</p>}
        <button className="auth-primary" disabled={busy || !email.trim() || !password.trim() || (mode === "register" && !name.trim())}>
          {mode === "register" ? <UserPlus /> : <LogIn />}
          {busy ? "Please wait..." : mode === "register" ? "Create Account" : "Login"}
        </button>
        <button
          type="button"
          className="auth-link"
          onClick={() => onModeChange(mode === "register" ? "login" : "register")}
        >
          {mode === "register" ? "Already have an account? Login" : "Need an account? Register"}
        </button>
      </form>
    </div>
  );
}
