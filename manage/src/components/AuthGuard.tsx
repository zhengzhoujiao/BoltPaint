import React from 'react';
import { Navigate } from 'react-router-dom';

interface AuthGuardProps {
    children: React.ReactNode;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
    const token = localStorage.getItem('admin_token');
    const userStr = localStorage.getItem('admin_user');

    let isAdmin = false;
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            isAdmin = user.is_admin === true;
        } catch (e) {
            console.error('Error parsing admin user:', e);
        }
    }

    if (!token || !isAdmin) {
        // 清理无效状态
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};

export default AuthGuard;
