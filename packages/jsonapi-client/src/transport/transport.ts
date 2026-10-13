/**
 * `createTransport(options)` (SPEC 15.2): where the clients reach the
 * server and what every request carries. `headers` and `language` are read
 * on every request, so a rotated session token and a changed locale apply
 * to the next call; `fetch` is looked up at request time, so a polyfill or
 * a test double installed later is used. A `Transport` is opaque: only
 * `createClients` reads it.
 * @ref https://fetch.spec.whatwg.org/#fetch-method
 * @ref https://www.rfc-editor.org/rfc/rfc9110#field.accept-language
 * @packageDocumentation
 */
import { assertOrigin } from './origin';

/** What the client reads of a response: its status, its headers, and its body, once, as text. */
interface FetchedResponse {
  readonly status: number;
  readonly headers: { readonly get: (name: string) => string | null };
  readonly text: () => Promise<string>;
}

export interface TransportOptions {
  /** Where the server is: an absolute `http:` or `https:` URL, kept as its origin. */
  readonly origin: string;
  /** Sent on every request, before the client's own; a function is called on each. */
  readonly headers?:
    | HeadersInit
    | (() => HeadersInit | Promise<HeadersInit>)
    | undefined;
  /** Called on every request; a non-empty result is sent as `Accept-Language`. */
  readonly language?: (() => string | undefined) | undefined;
  /** Sends a request; by default the global `fetch`, looked up per request. */
  readonly fetch?: ((request: Request) => Promise<FetchedResponse>) | undefined;
}

/** A transport's options, the origin checked. */
export interface TransportState {
  readonly origin: string;
  readonly headers: TransportOptions['headers'];
  readonly language: TransportOptions['language'];
  readonly fetch: TransportOptions['fetch'];
}

/** Where and how the clients reach the server; made by `createTransport`. */
export class Transport {
  readonly #state: TransportState;

  private constructor(state: TransportState) {
    this.#state = state;
  }

  /** A transport over checked options; `createTransport` is its one caller. */
  public static of(state: TransportState): Transport {
    return new Transport(state);
  }

  /** The state of a transport `createTransport` made; throws `TypeError`, starting with `caller`, for any other value. */
  public static stateOf(transport: unknown, caller: string): TransportState {
    if (
      typeof transport !== 'object' ||
      transport === null ||
      !(#state in transport)
    ) {
      throw new TypeError(
        `${caller}: transport must be made by createTransport`,
      );
    }
    return transport.#state;
  }
}

/** A transport to `options.origin`; throws `TypeError` when the origin is not one (SPEC 15.2). */
export function createTransport(options: TransportOptions): Transport {
  return Transport.of({
    origin: assertOrigin(options.origin),
    headers: options.headers,
    language: options.language,
    fetch: options.fetch,
  });
}
