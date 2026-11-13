import { useState } from "react";
import { auth } from "../lib/api.js";
import { Status } from "./common.jsx";

export function LoginScreen({ onLoggedIn }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await auth.login(password);
      onLoggedIn();
    } catch (err) {
      setError(err.reason || err.message);
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page login-page">
      <form className="panel auth-form" onSubmit={submit}>
        <div className="topline">
          <span className="brand-mark" aria-hidden="true">B</span>
          <span>登入</span>
        </div>
        <h1>登入</h1>
        <label>
          密碼
          <input type="password" autoComplete="current-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" className="primary" disabled={busy || !password}>{busy ? "登入中…" : "登入"}</button>
        <Status message={error} error />
      </form>
    </main>
  );
}

export function ChangePasswordForm({ onDone }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ message: "" });

  async function submit(e) {
    e.preventDefault();
    if (next !== confirm) {
      setStatus({ message: "兩次輸入的新密碼不一致", error: true });
      return;
    }
    setBusy(true);
    setStatus({ message: "" });
    try {
      await auth.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setStatus({ message: "密碼已更新；其他裝置需要用新密碼重新登入。" });
      onDone?.();
    } catch (err) {
      setStatus({ message: err.reason || err.message, error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {/* 給密碼管理員辨識帳號用 */}
      <input type="text" name="username" autoComplete="username" value="admin" readOnly hidden />
      <label>
        目前密碼
        <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label>
        新密碼（至少 8 個字元）
        <input type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label>
        再輸入一次新密碼
        <input type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <button type="submit" className="primary" disabled={busy || !current || !next || !confirm}>{busy ? "更新中…" : "更新密碼"}</button>
      <Status {...status} />
    </form>
  );
}
