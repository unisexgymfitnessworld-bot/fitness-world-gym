import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { ResetPassword } from "./pages/ResetPassword";
import { useAppStore } from "./store/useAppStore";

function App() {
  const trainer = useAppStore((state) => state.trainer);
  const path = window.location.pathname;

  return <ErrorBoundary>{path === "/reset-password" ? <ResetPassword /> : trainer ? <Dashboard /> : <Login />}</ErrorBoundary>;
}

export default App;
