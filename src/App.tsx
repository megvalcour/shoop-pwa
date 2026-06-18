import { createBrowserRouter, RouterProvider } from 'react-router';
import AppShell from '@/components/templates/AppShell';
import ShoppingListsRoute from '@/routes/ShoppingListsRoute';
import ShoppingListDetailRoute from '@/routes/ShoppingListDetailRoute';
import DefaultListRoute from '@/routes/DefaultListRoute';
import SettingsRoute from '@/routes/SettingsRoute';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <ShoppingListsRoute /> },
      { path: 'lists/:id', element: <ShoppingListDetailRoute /> },
      { path: 'default-list', element: <DefaultListRoute /> },
      { path: 'settings', element: <SettingsRoute /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
