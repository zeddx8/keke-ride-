import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import PassengerHome from './pages/Passenger/Home';
import Login from './pages/Auth/Login';
import RiderPortal from './pages/Auth/RiderPortal';
import AdminDashboard from './pages/Admin/Dashboard';
import TripShare from './pages/TripShare';
import SettingsMenu from './components/SettingsMenu';

const AppContent = () => {
  const shareMatch = window.location.pathname.match(/^\/trip-share\/([^/]+)\/?$/);
  const [pathname, setPathname] = useState(window.location.pathname);
  const { user, loading } = useAuth();

  useEffect(() => {
    const handleNavigation = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);

  if (shareMatch) return <TripShare token={decodeURIComponent(shareMatch[1])} />;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-brand border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const accountMatch = pathname.match(/^\/account\/(passenger|rider)\/?$/);
  if (accountMatch) {
    const accountRole = accountMatch[1] === 'rider' ? 'rider' : 'passenger';
    if (accountRole !== user.role) {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
      return null;
    }
    return <SettingsMenu role={accountRole} standalone />;
  }

  // Route based on role
  if (user.role === 'rider') {
    return <RiderPortal />;
  }

  if (user.role === 'admin') {
    return <AdminDashboard />;
  }

  return <PassengerHome />;
};

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;