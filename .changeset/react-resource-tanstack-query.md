---
'@netvark/react-resource': minor
---

Add `@netvark/react-resource/query`, which turns a client into TanStack Query options, an optional
peer from 5.89. `resourceQueries(client)` gives `useQuery`, `useInfiniteQuery`, and `useMutation`
each read and write of a resource, keyed by the request it sends, so two queries that send one
request share one cache entry and invalidating the type reaches every list, page, and record of it.
Reads pass TanStack Query's signal, so a cancelled query aborts its request. An infinite list pages
both ways by the server's links from the query's own cursors. Each write invalidates its type, and
the other types its `invalidates` setting names, and stays pending until the reads it touched have
refetched; a removal first drops the record's own entries, so a screen still showing it does not
fetch a 404.
