import { useRoutes, Navigate } from 'react-router-dom';
import BasicLayout from '../layout/BasicLayout';
import Dashboard from '../pages/Dashboard';
import Users from '../pages/Users';
import Templates from '../pages/Templates';
import Tags from '../pages/Tags';
import Monitoring from '../pages/Monitoring';
import Orders from '../pages/Orders';
import Tickets from '../pages/Tickets';
import Settings from '../pages/Settings';
import Pricing from '../pages/Pricing';
import ImageModels from '../pages/ImageModels';
import ActivationCodes from '../pages/ActivationCodes';
import RechargePackages from '../pages/RechargePackages';
import Login from '../pages/Login';
import AuthGuard from '../components/AuthGuard';
import Works from '../pages/Works';

const AppRouter = () => {
  return useRoutes([
    {
      path: '/',
      element: (
        <AuthGuard>
          <BasicLayout />
        </AuthGuard>
      ),
      children: [
        { path: '/', element: <Dashboard /> },
        { path: '/users', element: <Users /> },
        { path: '/templates', element: <Templates /> },
        { path: '/works', element: <Works /> },
        { path: '/tags', element: <Tags /> },
        { path: '/monitoring', element: <Monitoring /> },
        { path: '/orders', element: <Orders /> },
        { path: '/tickets', element: <Tickets /> },
        { path: '/pricing', element: <Pricing /> },
        { path: '/image-models', element: <ImageModels /> },
        { path: '/recharge-packages', element: <RechargePackages /> },
        { path: '/activation-codes', element: <ActivationCodes /> },
        { path: '/settings', element: <Settings /> },
      ],
    },
    {
      path: '/login',
      element: <Login />,
    },
    {
      path: '*',
      element: <Navigate to="/" replace />,
    },
  ]);
};

export default AppRouter;
