import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../main.jsx";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      const j = await API.post("/auth/register", { name, email, password });
      if (j?.error) {
        setMsg(j.error);
        return;
      }
      setMsg("🎉 Account created successfully! Redirecting you to login...");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setMsg("⚠️ Something went wrong while registering. Please try again.");
    }
  };

  return (
    <div>
      <h1>Create an Account</h1>
      <form onSubmit={submit}>
        <div>
          <input
            type="text"
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit">Register</button>
      </form>
      {msg && <div style={{ marginTop: "10px", color: "red" }}>{msg}</div>}
    </div>
  );
}
