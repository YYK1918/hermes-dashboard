"use client"

import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"

interface AuthState {
  token: string | null
  username: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthState>({
  token: null,
  username: null,
  login: async () => {},
  logout: () => {},
  isAuthenticated: false,
  isLoading: true,
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // Verify token on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("hermes_dashboard_token")
    if (savedToken) {
      fetch("/api/auth/verify", {
        headers: { Authorization: `Bearer ${savedToken}` },
      })
        .then((res) => {
          if (res.ok) {
            setToken(savedToken)
            setUsername(localStorage.getItem("hermes_dashboard_user"))
          } else {
            localStorage.removeItem("hermes_dashboard_token")
            localStorage.removeItem("hermes_dashboard_user")
          }
        })
        .catch(() => {})
        .finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [])

  const login = useCallback(async (user: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password }),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || "登录失败")
    }

    const data = await res.json()
    localStorage.setItem("hermes_dashboard_token", data.token)
    localStorage.setItem("hermes_dashboard_user", data.username)
    setToken(data.token)
    setUsername(data.username)
    router.push("/")
  }, [router])

  const logout = useCallback(() => {
    localStorage.removeItem("hermes_dashboard_token")
    localStorage.removeItem("hermes_dashboard_user")
    setToken(null)
    setUsername(null)
    router.push("/login")
  }, [router])

  return (
    <AuthContext.Provider
      value={{
        token,
        username,
        login,
        logout,
        isAuthenticated: !!token,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
