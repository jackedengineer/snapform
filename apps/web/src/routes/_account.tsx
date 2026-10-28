import { createFileRoute } from '@tanstack/react-router';
import { AccountLayout } from '../features/auth/AccountLayout';
export const Route = createFileRoute('/_account')({ component: AccountLayout });
