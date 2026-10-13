/**
 * The call each action of a model makes (resource SPEC 21.4), from the
 * actions as the application gives them: `recordActions` and `bulkActions`
 * infer, by name, what each action gives as `remove`, so a model types an
 * update action's `variables` and `operations` as an update's and a
 * removal's as a removal's, while every action is still checked against its
 * init, unknown members included. Inferring the whole action instead would
 * lose that check, and TypeScript would fix it to its constraint while
 * typing a `can` written before the actions.
 * @packageDocumentation
 */

/** The client call an action makes (jsonapi SPEC 15.4). */
export type ActionCall = 'update' | 'remove';

/**
 * What each action gives as `remove`, by its name: `true` for a removal, and
 * nothing, which TypeScript infers as `unknown`, or `undefined` for an
 * update; an action typed as its init before it reached the function may
 * give either.
 */
export type GivenRemove = Readonly<Record<string, unknown>>;

/**
 * The actions as the functions take them: each one checked against `TInit`,
 * unknown members included, and what it gives as `remove` inferred by its
 * name. TypeScript infers `TRemove` from a homomorphic mapped type property
 * by property; `actions.test-d.ts` measures what it infers for each action.
 * @ref https://github.com/microsoft/TypeScript/pull/12528 (inference to a homomorphic mapped type, each property inferred for a synthetic `T[P]`)
 */
export type ActionInits<TInit, TRemove extends GivenRemove> = {
  readonly [K in keyof TRemove]: TInit & { readonly remove?: TRemove[K] };
};

/** The call of an action that gives `TRemove` as `remove`. */
type CallOf<TRemove> = unknown extends TRemove
  ? 'update'
  : [TRemove] extends [true]
    ? 'remove'
    : true extends TRemove
      ? ActionCall
      : 'update';

/** Each action's call by its name, from what it gives as `remove`. */
export type ActionCalls<TRemove extends GivenRemove> = {
  readonly [K in keyof TRemove & string]: CallOf<TRemove[K]>;
};
