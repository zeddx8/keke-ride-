import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import apiClient from '../api/client';

export interface AuthUser {
  id: number;
  name: string | null;
  phone: string;
  role: 'passenger' | 'rider' | 'admin';
  admin_role: 'super_admin' | 'operations' | 'support' | null;
  admin_active: boolean | null;
  status: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  register: (data: {
    name: string;
    phone: string;
    role: 'passenger' | 'rider';
    password: string;
    password_confirmation: string;
  }) => Promise<void>;
  login: (phone: string, password: string) => Promise<void>;
  verifyRegistration: (phone: string, otp: string) => Promise<void>;
  resendRegistrationCode: (phone: string) => Promise<void>;
  requestPasswordReset: (phone: string) => Promise<void>;
  resetPassword: (phone: string, otp: string, password: string, passwordConfirmation: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('auth_token')));

  useEffect(() => {
    let isMounted = true;
    const token = localStorage.getItem('auth_token');

    if (!token) {
      return () => {
        isMounted = false;
      };
    }

    apiClient.get<AuthUser>('/user')
      .then(({ data }) => {
        if (isMounted) setUser(data);
      })
      .catch((error: unknown) => {
        console.error('Failed to restore authenticated session', error);
        localStorage.removeItem('auth_token');
        if (isMounted) setUser(null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const register: AuthContextValue['register'] = async (data) => {
    await apiClient.post('/auth/register', data);
  };

  const login = async (phone: string, password: string) => {
    const { data } = await apiClient.post<{ token: string }>('/auth/login', {
      phone,
      password,
      device_name: 'keke-ride-mobile',
    });

    await authenticateWithToken(data.token);
  };

  const verifyRegistration = async (phone: string, otp: string) => {
    const { data } = await apiClient.post<{ token: string }>('/auth/verify-registration', {
      phone,
      otp,
      device_name: 'keke-ride-mobile',
    });

    await authenticateWithToken(data.token);
  };

  const authenticateWithToken = async (token: string) => {
    localStorage.setItem('auth_token', token);

    try {
      const response = await apiClient.get<AuthUser>('/user');
      setUser(response.data);
    } catch (error) {
      localStorage.removeItem('auth_token');
      throw error;
    }
  };

  const resendRegistrationCode = async (phone: string) => {
    await apiClient.post('/auth/resend-registration-code', { phone });
  };

  const requestPasswordReset = async (phone: string) => {
    await apiClient.post('/auth/forgot-password', { phone });
  };

  const resetPassword = async (
    phone: string,
    otp: string,
    password: string,
    passwordConfirmation: string,
  ) => {
    await apiClient.post('/auth/reset-password', {
      phone,
      otp,
      password,
      password_confirmation: passwordConfirmation,
    });
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      register,
      login,
      verifyRegistration,
      resendRegistrationCode,
      requestPasswordReset,
      resetPassword,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// Keep the context hook beside its provider for a single public auth API.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
