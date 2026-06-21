import { createBrowserRouter, RouterProvider } from 'react-router';
import { PwaUpdateContext, usePwaUpdateController } from '@/hooks/usePwaUpdate';
import AppShell from '@/components/templates/AppShell';
import ShopRoute from '@/routes/ShopRoute';
import ShoppingListDetailRoute from '@/routes/ShoppingListDetailRoute';
import DefaultListRoute from '@/routes/DefaultListRoute';
import SettingsRoute from '@/routes/SettingsRoute';
import StoreDetailRoute from '@/routes/StoreDetailRoute';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <ShopRoute /> },
      { path: 'lists/:id', element: <ShoppingListDetailRoute /> },
      { path: 'default-list', element: <DefaultListRoute /> },
      { path: 'stores/:id', element: <StoreDetailRoute /> },
      { path: 'settings', element: <SettingsRoute /> },
    ],
  },
]);

export default function App() {
  const pwaUpdate = usePwaUpdateController();
  return (
    <PwaUpdateContext.Provider value={pwaUpdate}>
      <RouterProvider router={router} />
    </PwaUpdateContext.Provider>
  );
}
