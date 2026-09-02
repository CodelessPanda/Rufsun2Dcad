import { CheckCircle2, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api/client";

export function PasswordResetScreen({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setMessage("");
    try {
      await api.resetPassword(token, password);
      setMessage("Password reset. You can return to login now.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reset password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className="auth-brand"><span className="brand-mark">R</span><strong>RufsunCAD</strong></div>
        <h1>Reset Password</h1>
        <label className="field stacked">
          <span>New Password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
        </label>
        {message && <p className="form-note">{message}</p>}
        <button className="auth-primary" disabled={busy || password.length < 8}>
          <KeyRound /> Reset Password
        </button>
      </form>
    </div>
  );
}

export function VerifyEmailScreen({ token }: { token: string }) {
  const [message, setMessage] = useState("Verifying email...");

  useEffect(() => {
    void api.verifyEmail(token)
      .then(() => setMessage("Email verified. You can return to RufsunCAD."))
      .catch((error) => setMessage(error instanceof Error ? error.message : "Unable to verify email."));
  }, [token]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand"><span className="brand-mark">R</span><strong>RufsunCAD</strong></div>
        <h1>Email Verification</h1>
        <p className="form-note">{message}</p>
        <CheckCircle2 />
      </div>
    </div>
  );
}
