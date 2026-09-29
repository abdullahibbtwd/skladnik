import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { usePermissions, type Permission } from '../../lib/permissions';

/** Layout route that sends roles without `permission` back to the overview instead of showing a refused screen. */
export const RequirePermission: React.FC<{ permission: Permission; fallback?: string }> = ({ permission, fallback = '/app' }) => {
  const permissions = usePermissions();
  return permissions[permission] ? <Outlet /> : <Navigate to={fallback} replace />;
};
