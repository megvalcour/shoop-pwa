import { createBrowserRouter, RouterProvider } from 'react-router';
import { PwaUpdateContext, usePwaUpdateController } from '@/hooks/usePwaUpdate';
import AppShell from '@/components/templates/AppShell';
import ShopRoute from '@/routes/ShopRoute';
import ShoppingListDetailRoute from '@/routes/ShoppingListDetailRoute';
import DefaultListRoute from '@/routes/DefaultListRoute';
import SettingsRoute from '@/routes/SettingsRoute';
import EatRoute from '@/routes/EatRoute';
import RecipeDetailRoute from '@/routes/RecipeDetailRoute';
import RecipeFormRoute from '@/routes/RecipeFormRoute';
import StoreDetailRoute from '@/routes/StoreDetailRoute';
import AddStoreRoute from '@/routes/AddStoreRoute';
import ImportRecipeRoute from '@/routes/ImportRecipeRoute';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <ShopRoute /> },
      { path: 'lists/:id', element: <ShoppingListDetailRoute /> },
      { path: 'default-list', element: <DefaultListRoute /> },
      { path: 'stores/new', element: <AddStoreRoute /> },
      { path: 'stores/:id', element: <StoreDetailRoute /> },
      { path: 'import', element: <ImportRecipeRoute /> },
      { path: 'eat', element: <EatRoute /> },
      { path: 'eat/recipes/new', element: <RecipeFormRoute /> },
      { path: 'eat/recipes/:id', element: <RecipeDetailRoute /> },
      { path: 'eat/recipes/:id/edit', element: <RecipeFormRoute /> },
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
