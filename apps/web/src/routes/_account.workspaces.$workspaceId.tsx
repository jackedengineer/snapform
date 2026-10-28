import { createFileRoute, Outlet } from '@tanstack/react-router';
export const Route = createFileRoute('/_account/workspaces/$workspaceId')({
  component: Outlet,
});
