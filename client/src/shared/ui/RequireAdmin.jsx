import { Navigate } from "react-router-dom";

export default function RequireAdmin({ user, children }) {
  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/home" replace />;
  }

  return children;
}
