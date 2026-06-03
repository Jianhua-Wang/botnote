import { Navigate, useParams } from "react-router-dom";

export function EntityDetailPage() {
  const { key, id } = useParams<{ key: string; id: string }>();
  if (!key || !id) return <Navigate to="/" replace />;
  return <Navigate to={`/p/${key}?d=${id}`} replace />;
}
