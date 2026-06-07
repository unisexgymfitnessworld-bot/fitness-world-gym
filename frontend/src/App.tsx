import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { useAppStore } from "./store/useAppStore";

function App() {
  const trainer = useAppStore((state) => state.trainer);

  return <ErrorBoundary>{trainer ? <Dashboard /> : <Login />}</ErrorBoundary>;
}

export default App;
