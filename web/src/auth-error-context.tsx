/**
 * Global context for authentication error state.
 * Used to show auth errors from anywhere in the app.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

interface AuthErrorContextType {
  hasAuthError: boolean;
  setAuthError: (error: boolean) => void;
}

const AuthErrorContext = createContext<AuthErrorContextType | undefined>(undefined);

export function AuthErrorProvider({ children }: { children: React.ReactNode }) {
  const [hasAuthError, setHasAuthError] = useState(false);

  const setAuthError = useCallback((error: boolean) => {
    setHasAuthError(error);
  }, []);

  return (
    <AuthErrorContext.Provider value={{ hasAuthError, setAuthError }}>
      {children}
    </AuthErrorContext.Provider>
  );
}

export function useAuthError() {
  const context = useContext(AuthErrorContext);
  if (!context) {
    throw new Error('useAuthError must be used within AuthErrorProvider');
  }
  return context;
}
