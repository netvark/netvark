---
'@netvark/react-resource': minor
---

Add `@netvark/react-resource/form`, which binds a form model to TanStack Form, an optional peer from
1.17. `resourceFormOptions(model)` gives `useForm`, or the `useAppForm` of `createFormHook`, the
model's values and its validator, run when the form is first submitted and on every change after.
`bindResponseErrors(formApi, model, error)` puts a refused write's texts on their fields and returns
them, with the ones no field holds for a banner. A refusal of one field stays on it until that field
changes or loses focus; a refusal of several fields together, such as a room booked twice for one
period, goes when any field changes, since changing either answers it. Either blocks a submit of the
same values.
