import { AuthProvider, useAuth } from './context/AuthContext';
import PassengerHome from './pages/Passenger/Home';
import Login from './pages/Auth/Login';
import RiderPortal from './pages/Auth/RiderPortal';
import AdminDashboard from './pages/Admin/Dashboard';
import TripShare from './pages/TripShare';

const AppContent = () => {
  const shareMatch = window.location.pathname.match(/^\/trip-share\/([^/]+)\/?$/);
  if (shareMatch) return <TripShare token={decodeURIComponent(shareMatch[1])} />;

  const { user, loading } = useAuth();

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
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;