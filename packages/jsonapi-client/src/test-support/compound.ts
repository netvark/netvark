/**
 * A compound document of the blog for the client's tests: an article
 * linking its author and two tags in a fixed order, and the resources a
 * request may include, one of them reached only through the author.
 * Never published.
 */
export const COMPOUND: unknown = {
  data: {
    type: 'articles',
    id: '1',
    attributes: { title: 'JSON:API' },
    relationships: {
      author: {
        links: { related: '/articles/1/author' },
        data: { type: 'people', id: '9', meta: { role: 'lead' } },
      },
      tags: {
        data: [
          { type: 'tags', id: 't2' },
          { type: 'tags', id: 't1' },
        ],
      },
    },
  },
  included: [
    {
      type: 'people',
      id: '9',
      attributes: { name: 'Ada' },
      relationships: {
        articles: {
          data: [
            { type: 'articles', id: '1' },
            { type: 'articles', id: '2' },
          ],
        },
      },
    },
    { type: 'tags', id: 't1', attributes: { name: 'json' } },
    { type: 'tags', id: 't2', attributes: { name: 'api' } },
    {
      type: 'articles',
      id: '2',
      attributes: { title: 'REST' },
      relationships: { author: { data: { type: 'people', id: '9' } } },
    },
  ],
};
