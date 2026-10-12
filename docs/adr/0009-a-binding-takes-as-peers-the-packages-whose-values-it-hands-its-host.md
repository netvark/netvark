# ADR 0009: A binding takes as peers the packages whose values it hands its host

- Status: accepted
- Date: 2026-10-12

## Context

[ADR 0003](0003-package-naming.md) gives a binding its host as its only peer dependency, plus the
sibling binding it builds on, and
[ADR 0006](0006-a-binding-takes-the-packages-the-application-hands-it-values-from-as-peers.md) adds
each workspace package whose values the application makes and hands it. A third case arrived with
the intl family: a binding that makes values with one package and hands them to its host.
`@netvark/paraglide-intl` loads a project with the inlang SDK (`loadProjectFromDirectory()`) and
hands it to Paraglide's `compileProject()`, which reads it through the SDK's data model. Paraglide
depends on one SDK major per minor range (SDK 2 through 2.23, SDK 3 from 2.24, SDK 4 from 2.27), and
a project loaded by another major does not compile: measured on 2026-10-12, a project loaded by SDK
4.0.0 fails in Paraglide 2.26.0's `compileProject()` (the SDK 3 table `bundle` is not found), and
one loaded by SDK 3.1.0 fails in 2.27.0's with a `TypeError`. Only a peer dependency resolves to the
application's copy, the one Paraglide's own dependency is deduplicated to; a regular dependency
installs the binding its own.

## Decision

A binding takes as a peer dependency each package whose values it makes and hands to its host, as it
takes the host itself. Its own build and tests take that package through the pnpm catalog in
`devDependencies`, and its floor is tested with the host's floor (ADR 0007).

## Consequences

ADR 0003's single-peer rule now has two documented additions, this one and ADR 0006; the question
"Adding a package" asks a new binding grows by one: does it hand its host values made with another
package? An application installs that package itself, at the major its host requires, and a mismatch
fails at install.
