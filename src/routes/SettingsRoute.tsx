import { useState } from 'react';
import { useNavigate, NavLink } from 'react-router';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import ShoppingListCard from '@/components/molecules/ShoppingListCard';
import ConfirmDialog from '@/components/molecules/ConfirmDialog';
import { useShoppingLists, useDeleteShoppingList } from '@/hooks/useShoppingLists';
import { useCreateAndNavigateToList } from '@/hooks/useCreateAndNavigateToList';
import type { ShoppingList } from '@/db/schema';

export default function SettingsRoute() {
  const navigate = useNavigate();
  const { data: lists, isPending, isError } = useShoppingLists();
  const { createAndNavigate, isPending: isCreating, isError: isCreateError } = useCreateAndNavigateToList();
  const deleteList = useDeleteShoppingList();
  const [pendingDelete, setPendingDelete] = useState<ShoppingList | null>(null);

  function renderListsContent() {
    if (isPending) return <p className="text-text-muted text-sm">Loading…</p>;
    if (isError) return <p className="text-destructive text-sm">Failed to load lists.</p>;
    if (!lists || lists.length === 0) return <p className="text-text-muted text-sm">No lists yet.</p>;
    return (
      <div className="flex flex-col gap-3">
        {lists.map((list) => (
          <ShoppingListCard
            key={list.id}
            list={list}
            onClick={() => navigate(`/lists/${list.id}`)}
            onDelete={() => setPendingDelete(list)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col pb-24">
      <section className="px-4 pt-6">
        <h2 className="font-display font-bold text-text text-lg mb-3">Your Lists</h2>
        {renderListsContent()}
      </section>

      <section className="px-4 pt-6">
        <h2 className="font-display font-bold text-text text-lg mb-3">Default List</h2>
        <NavLink
          to="/default-list"
          className="flex items-center justify-between px-4 py-3 bg-surface rounded-xl text-text"
        >
          <span>Manage default items</span>
          <FontAwesomeIcon icon={faChevronRight} className="text-text-muted text-sm" />
        </NavLink>
      </section>

      {isCreateError && (
        <p className="px-4 text-destructive text-sm mt-2">Failed to create list. Please try again.</p>
      )}

      <button
        type="button"
        aria-label="New list"
        disabled={isCreating || isPending}
        onClick={createAndNavigate}
        className="fixed bottom-20 right-6 w-14 h-14 rounded-full bg-accent text-white shadow-lg flex items-center justify-center disabled:opacity-50"
      >
        <FontAwesomeIcon icon={faPlus} />
      </button>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete list?"
          message={`"${pendingDelete.name}" and all its items will be permanently deleted.`}
          isPending={deleteList.isPending}
          errorMessage={deleteList.isError ? 'Failed to delete. Please try again.' : undefined}
          onCancel={() => {
            deleteList.reset();
            setPendingDelete(null);
          }}
          onConfirm={() =>
            deleteList.mutate(pendingDelete.id, {
              onSuccess: () => setPendingDelete(null),
            })
          }
        />
      )}
    </div>
  );
}
