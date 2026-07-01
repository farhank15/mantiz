/**
 * Auth Context — provides authentication state throughout the app.
 * Uses TanStack Start server functions for secure server-side operations.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { getSession, logout as logoutFn, startLogin } from '../server/auth'

export interface AuthUser {
  login: string
  avatar: string
  name: string
  userId: number
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: () => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: () => {},
  logout: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  // Check session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const session = await getSession()
        setUser(session)
      } catch {
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }
    checkSession()
  }, [])

  const login = useCallback(async () => {
    try {
      const { url } = await startLogin()
      window.location.href = url
    } catch (err) {
      console.error('Failed to start OAuth:', err)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutFn()
      setUser(null)
      navigate({ to: '/' })
    } catch {
      setUser(null)
    }
  }, [navigate])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
