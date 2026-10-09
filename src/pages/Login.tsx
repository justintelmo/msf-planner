import { login } from '../auth/auth';
import { startDemo } from '../data/store';

export default function Login() {
  return (
    <div className="login">
      <h1>MSF Planner</h1>
      <p>Connect your Marvel Strike Force account to see your roster and plan what to build next.</p>
      <button className="primary" onClick={() => void login()}>
        Log in with Scopely
      </button>
      <button className="ghost" onClick={startDemo}>
        Try with demo data
      </button>
      <p className="muted small">
        Read-only access. Your login and roster stay in this browser.
      </p>
    </div>
  );
}
