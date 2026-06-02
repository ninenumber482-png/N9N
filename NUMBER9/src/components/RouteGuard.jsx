import { Navigate } from 'react-router-dom'
import { useStore } from '../store/useStore'

// Protect routes that require authentication
export function ProtectedRoute({ children }) {
  const auth = useStore(s => s.auth)

  if (!auth) {
    return <Navigate to="/login" replace />
  }

  return children
}

export function UserOnlyRoute({ children }) {
  const auth = useStore(s => s.auth)

  if (!auth) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default { ProtectedRoute, UserOnlyRoute }
