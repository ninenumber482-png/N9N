import { Navigate } from 'react-router-dom'
import { useStore } from '../store/useStore'

// Protect routes that require authentication
export function ProtectedRoute({ children }) {
  const auth = useStore(s => s.auth)

  if (!auth) {
    return <Navigate to="/login" replace />
  }

  // Account status (login_status, account_status) is monitored via realtime
  // subscription in App.jsx. If user is suspended/locked, useStore.logout()
  // is triggered automatically, which clears auth and forces re-login.

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
