/**
 * The registered 4xx and 5xx status codes and their reason phrases. The
 * table is keyed by Hono's status unions so a `JsonApiError` carries a
 * status Hono's response helpers accept without assertions; an unregistered
 * code (such as 499) is rejected at construction rather than mapped silently.
 * @ref https://www.rfc-editor.org/rfc/rfc9110#section-15
 * @ref https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml
 * @packageDocumentation
 */
import type {
  ClientErrorStatusCode,
  ServerErrorStatusCode,
} from 'hono/utils/http-status';

/** A registered 4xx or 5xx status code. */
export type ErrorStatusCode = ClientErrorStatusCode | ServerErrorStatusCode;

/**
 * Reason phrases per the IANA registry. 418 is marked "(Unused)" there; the
 * RFC 2324 phrase is kept since Hono includes the code.
 */
const REASON_PHRASES: Readonly<Record<ErrorStatusCode, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Content Too Large',
  414: 'URI Too Long',
  415: 'Unsupported Media Type',
  416: 'Range Not Satisfiable',
  417: 'Expectation Failed',
  418: "I'm a teapot",
  421: 'Misdirected Request',
  422: 'Unprocessable Content',
  423: 'Locked',
  424: 'Failed Dependency',
  425: 'Too Early',
  426: 'Upgrade Required',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  505: 'HTTP Version Not Supported',
  506: 'Variant Also Negotiates',
  507: 'Insufficient Storage',
  508: 'Loop Detected',
  510: 'Not Extended',
  511: 'Network Authentication Required',
};

/** Whether `value` is a registered 4xx or 5xx status code. */
export function isErrorStatusCode(value: number): value is ErrorStatusCode {
  return Object.hasOwn(REASON_PHRASES, value);
}

/** The registry's reason phrase, the conventional `title` for a status. */
export function reasonPhrase(status: ErrorStatusCode): string {
  return REASON_PHRASES[status];
}
