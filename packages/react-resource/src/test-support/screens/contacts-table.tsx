import type { ReactElement } from 'react';

/**
 * The list screen of the screen tests (resource SPEC 20.7, 20.8), as the
 * README writes it: the state in a TanStack Router route's search, read
 * back by `query`, the page TanStack Query reads for it, and TanStack
 * Table v9 rendering the model's sorting and column filters with its
 * stages manual, every change a navigation. The status filter is a
 * multiple choice writing `in`; the pages follow the result's links.
 * Not published with the package.
 * @ref https://tanstack.com/router/v1/docs/framework/react/guide/search-params
 * @ref https://tanstack.com/table/v9/docs/framework/react/guide/column-filtering
 * @packageDocumentation
 */
import type { ListState } from '../../list/list-types';
import type { ScreenQueries, ScreenRecord } from './screen-queries';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import {
  columnFilteringFeature,
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';

import { resourceList } from '../../list/resource-list';
import { messages } from '../messages';
import { Contacts } from '../resources';
import { contactField } from './contact-fields';

type State = ListState<typeof Contacts>;

const contactsList = resourceList(Contacts, messages);
const statusField = contactField('status');
const features = tableFeatures({ rowSortingFeature, columnFilteringFeature });
const column = createColumnHelper<typeof features, ScreenRecord>();
const member = (name: string) =>
  column.accessor((record) => record[name], {
    id: name,
    header: () => contactField(name).label(),
    cell: (cell) => {
      const value = cell.getValue();
      return typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';
    },
    enableSorting: contactField(name).sortable,
  });
const columns = column.columns(
  ['name', 'email', 'status', 'priority'].map((name) => member(name)),
);
const noContacts: ReadonlyArray<ScreenRecord> = [];
const sortOrders = { asc: 'ascending', desc: 'descending' } as const;

const rootRoute = createRootRouteWithContext<{ api: ScreenQueries }>()({
  component: Outlet,
});

const contactsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contacts',
  validateSearch: (search: Record<string, unknown>) =>
    contactsList.query(search),
  component: ContactsTable,
});

/** The statuses the filter holds; nothing but a list is a choice. */
function chosen(value: unknown): ReadonlyArray<string> {
  const { in: values } = (value ?? {}) as { readonly in?: unknown };
  return Array.isArray(values) ? (values as ReadonlyArray<string>) : [];
}

function ContactsTable(): ReactElement {
  const state: State = contactsRoute.useSearch();
  const navigate = contactsRoute.useNavigate();
  const { api }: { readonly api: ScreenQueries } =
    contactsRoute.useRouteContext();
  const go = (next: State) => void navigate({ search: next });
  const result = useQuery({
    ...api.contacts.list(state),
    placeholderData: keepPreviousData,
  });
  const table = useTable({
    features,
    columns,
    data: result.data?.data ?? noContacts,
    getRowId: (record) => record.id,
    manualSorting: true,
    manualFiltering: true,
    state: {
      sorting: contactsList.sorting(state),
      columnFilters: contactsList.columnFilters(state),
    },
    onSortingChange: (updater) => {
      go(contactsList.withSorting(state, updater));
    },
    onColumnFiltersChange: (updater) => {
      go(contactsList.withColumnFilters(state, updater));
    },
  });
  const status = table.getColumn('status');
  const statuses = chosen(status?.getFilterValue());
  const page = result.data;
  const next = page === undefined ? undefined : contactsList.next(state, page);
  const previous =
    page === undefined ? undefined : contactsList.previous(state, page);
  return (
    <>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const text = new FormData(event.currentTarget).get('search');
          go(
            contactsList.withSearch(
              state,
              typeof text === 'string' ? text : '',
            ),
          );
        }}
      >
        <input
          key={state.search}
          name="search"
          type="search"
          aria-label="Suche"
          defaultValue={state.search}
        />
      </form>
      <fieldset>
        <legend>{statusField.label()}</legend>
        {statusField.options?.map((option) => (
          <label key={option.value}>
            <input
              type="checkbox"
              checked={statuses.includes(option.value)}
              onChange={(event) => {
                status?.setFilterValue({
                  in: event.target.checked
                    ? [...statuses, option.value]
                    : statuses.filter((value) => value !== option.value),
                });
              }}
            />
            {option.label()}
          </label>
        ))}
      </fieldset>
      <table>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    aria-sort={
                      sorted === false ? undefined : sortOrders[sorted]
                    }
                  >
                    <button
                      type="button"
                      disabled={!header.column.getCanSort()}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <table.FlexRender header={header} />
                    </button>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getAllCells().map((cell) => (
                <td key={cell.id}>
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        disabled={previous === undefined}
        onClick={() => {
          if (previous !== undefined) {
            go(previous);
          }
        }}
      >
        Zurück
      </button>
      <button
        type="button"
        disabled={next === undefined}
        onClick={() => {
          if (next !== undefined) {
            go(next);
          }
        }}
      >
        Weiter
      </button>
    </>
  );
}

const routeTree = rootRoute.addChildren([contactsRoute]);

/**
 * The router over memory history. It is not registered, which
 * `isolatedDeclarations` cannot spell, so its hooks are untyped and the
 * screen states the search's type, the one `validateSearch` returns.
 */
function listRouter(api: ScreenQueries, entry: string) {
  return createRouter({
    routeTree,
    context: { api },
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
}

/** The list route mounted at `entry`, and where the router stands. */
export interface RoutedList {
  readonly element: ReactElement;
  /** The router's current search, as its URL holds it. */
  readonly search: () => string;
}

/** The list screen under a router over memory history that starts at `entry`. */
export function contactsTable(api: ScreenQueries, entry: string): RoutedList {
  const router = listRouter(api, entry);
  return {
    element: <RouterProvider router={router} />,
    search: () => decodeURIComponent(router.state.location.searchStr),
  };
}
